// Costa Combat — the only Worker code on the site.
//
// Everything in public/ is still served straight from static assets without
// running this script. wrangler.jsonc sends only /api/* here
// (`run_worker_first`), so a bug in this file can never take the home page down.
//
// GET /api/instagram  -> the studio's latest Instagram posts as JSON, for the
//                        "Instagram" section on the home pages (assets/site.js).
//
// The access token never reaches the browser: it lives in a Worker secret
// (IG_ACCESS_TOKEN) or, once the weekly refresh has run, in the optional KV
// namespace IG_KV. See README → Instagram feed.

const POSTS = 6;
const CACHE_SECONDS = 60 * 60;            // Instagram is asked at most once an hour
const GRAPH = "https://graph.instagram.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/instagram" || url.pathname === "/api/instagram/") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }
      return instagram(request, env, ctx);
    }
    // Anything else under /api/ that matched run_worker_first: hand it to assets,
    // which answers with the normal 404 page.
    return env.ASSETS.fetch(request);
  },

  // Long-lived Instagram tokens last 60 days. The weekly cron in wrangler.jsonc
  // refreshes the token so the feed never expires, as long as IG_KV is bound.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshToken(env));
  },
};

async function token(env) {
  if (env.IG_KV) {
    const stored = await env.IG_KV.get("ig_access_token");
    if (stored) return stored;
  }
  return env.IG_ACCESS_TOKEN || "";
}

async function instagram(request, env, ctx) {
  const cache = caches.default;
  // A fixed key, so query strings can't be used to bypass the cache.
  const key = new Request(new URL("/api/instagram", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const access = await token(env);
  if (!access) return json({ posts: [] }, 60);   // not set up yet: the page shows the follow link only

  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  const api = `${GRAPH}/me/media?fields=${fields}&limit=${POSTS * 2}&access_token=${encodeURIComponent(access)}`;

  let data;
  try {
    const res = await fetch(api, { cf: { cacheTtl: 0 } });
    if (!res.ok) throw new Error(`Instagram answered ${res.status}`);
    data = await res.json();
  } catch (err) {
    // Log without the URL: it carries the token.
    console.error("instagram feed:", String(err && err.message || err));
    return json({ posts: [] }, 300);
  }

  const posts = (data.data || [])
    .map((m) => ({
      // Videos have no still in media_url; their cover is thumbnail_url.
      image: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url,
      link: m.permalink,
      caption: (m.caption || "").slice(0, 300),
      video: m.media_type === "VIDEO",
      date: m.timestamp,
    }))
    .filter((p) => p.image && p.link && /^https:\/\/(www\.)?instagram\.com\//.test(p.link))
    .slice(0, POSTS);

  const response = json({ posts }, CACHE_SECONDS);
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

async function refreshToken(env) {
  const access = await token(env);
  if (!access) return;
  const res = await fetch(
    `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(access)}`
  );
  if (!res.ok) {
    console.error("instagram token refresh failed:", res.status);
    return;
  }
  const body = await res.json();
  if (body.access_token && env.IG_KV) {
    await env.IG_KV.put("ig_access_token", body.access_token);
  }
  console.log("instagram token refreshed; expires in", body.expires_in, "s");
}

function json(body, maxAge) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
