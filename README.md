# costacombat.com

Static site for Costa Combat, the studio's only brand since Brand Reference
v2.0. It moved here from bahiamovement.com, which now only redirects. No build
step — `public/` is served as-is by a static-assets Cloudflare Worker (not a
Pages project; see Deploy below). One small script, `src/worker.js`, answers
`/api/instagram` and nothing else. The Worker and repo keep their old
`bahiamovement` name; internal names may stay, per the guide.

Contents: the home page with the weekly schedule, the two launch campaign
landing pages, and the short links that the printed QR codes use.

```
wrangler.jsonc                          Cloudflare Worker config — assets.directory, /api/* route, cron
src/worker.js                           /api/instagram: latest posts, token kept server-side
public/
├── index.html                          home (Spanish): classes, schedule, coaches, Instagram, FAQ, contact
├── en/index.html                       home (English) — a full copy, see Editing
├── sitemap.xml                         the two home pages; submit in Search Console
├── robots.txt                          points crawlers at the sitemap (Cloudflare prepends its managed rules)
├── _redirects                          short links — costacombat.com/a1 and friends
├── 404.html                            shown for unknown paths
├── _headers                            cache + security headers
├── assets/
│   ├── costa-combat-mark.svg           mark-only lockup, extracted from the .ai master
│   ├── costa-combat-mark-white.svg     same, for dark grounds
│   ├── favicon.svg  apple-touch-icon.png  from BMC Brand Assets/Costa Combat Avatar + Favicon
│   ├── alan.jpg  ivan.jpg  paulina.jpg instructor portraits (+ .webp, used by the home pages)
│   ├── dojo.jpg                        the mat; Google's business image (+ .webp)
│   ├── dojo-rooftop.jpg                dojo + rooftop split, above the home schedule (+ .webp)
│   ├── og-costa-combat.png             1200x630 social preview (white mark on Costa Black)
│   ├── site.css                        brand tokens + page styles
│   └── site.js                         language toggle + WhatsApp prefill + Instagram grid
└── costa-combat/promos/
    ├── a/index.html                    variant A — with pricing
    └── b/index.html                    variant B — no pricing
```

## The campaign

Two printed flyers, A/B tested. Their QR codes point at short links on
costacombat.com, so the flyers never need to change again — only the line in
`_redirects` does.

```
flyer A (prices)     QR -> costacombat.com/a1 -> /costa-combat/promos/a/
flyer B (schedules)  QR -> costacombat.com/b1 -> /costa-combat/promos/b/
```

The two pages are deliberately identical except for one block. A shows the
prices; B replaces that block with the free trial class and pushes the
pricing conversation into WhatsApp. Everything else — layout, photos, schedule,
copy, CTA placement — is the same on purpose. If anything else differs, the
test stops measuring pricing and starts measuring layout.

### Deploy

This deploys as a **static-assets Worker**, not a Pages project. Workers have no
"build output directory" setting in the dashboard — `assets.directory` in
`wrangler.jsonc` does that job, which is why the config lives in the repo.

Cloudflare serves `public/` directly. `src/worker.js` runs only for `/api/*`
(`run_worker_first` in `wrangler.jsonc`), so every page is still a plain static
file and a broken script can't take them down. `_headers` is read from inside
the assets directory, the same as it would be under Pages; it doesn't apply to
`/api/*`, which sets its own headers.

Dashboard settings, which should already be correct:

| Setting | Value |
|---|---|
| Build command | None |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Production branch | `main` |

A push to `main` triggers a build. Nothing else needs configuring.

### Domains

The Worker serves `costacombat.com` and `www.costacombat.com` (Workers & Pages →
`bahiamovement` → Settings → Domains & Routes). Cloudflare writes those DNS
records itself — **do not create A, AAAA or CNAME records by hand**, they pin
you to IPs Cloudflare is free to change. Keep them proxied, and keep SSL/TLS on
**Full** or **Full (strict)**; Flexible gives a redirect loop.

Redirect Rules do the rest, so every old URL keeps working:

- `www.costacombat.com` → `costacombat.com`, same path, 301
- all of `bahiamovement.com` and `www.bahiamovement.com` → `costacombat.com`,
  same path, 301

Always Use HTTPS is on in both zones. Keep bahiamovement.com registered: old
links and its email forwarding depend on it.

### Short links

`public/_redirects` replaces short.io. One line per slug; the printed root QR
(`costacombat.com/`) simply loads the home page. Slugs are 302 so a re-pointed
slug takes effect immediately instead of sitting in someone's browser cache.

**Never delete a slug that has been printed.** Re-point it instead.

`utm_content` always equals the slug, and nothing else. The destination path
already says what the page is, so repeating it would only give the two a
chance to drift apart — if arm A stops being the priced one in a later round,
`a1` still reads correctly.

Name the slug for **where it was seen**, not for the test arm:

```
ig        Instagram bio (permanent — re-point it each campaign)
ig1 ig2   specific posts or stories
fb1       Meta ad
gbp       Google Business Profile
wa        WhatsApp Business profile (/WA works too)
a2 b2     second print run
p1        partner venue poster
```

`_redirects` cannot rotate one slug between two pages, so a digital A/B split
(one link, random arm) needs a few lines of Worker code. Print stays fixed
a1/b1, because the paper already decides the variant.

## How attribution works

The conversion happens inside WhatsApp, where page analytics cannot see it. Two things close that gap.

**The prefilled message differs per page**, worded so it reads naturally:

| Page | Prefill (ES) |
|---|---|
| A | Hola, vi el folleto de Costa Combat. Me interesa inscribirme en un plan. |
| B | Hola, vi el folleto de Costa Combat. Quiero información de horarios y planes. |

Whoever answers WhatsApp can tell the arms apart without asking. For a launch
this size, counting messages by wording is a perfectly good read.

**Home schedule entries book their own slot.** Each class in the weekly
schedule is a WhatsApp link (`data-wa-slot`) whose message names the class, day
and time in the language on screen: "Hola, quiero reservar una clase de prueba gratis: Jiu-Jitsu — Adultos,
lunes 8:30 – 9:30 a. m." Edit the schedule in `index.html`; the messages follow.

**"el folleto" is swapped from `utm_source`**, so digital traffic labels itself:
`utm_source=instagram` produces "vi el Instagram de Costa Combat" (and "Instagram
post" in English). Add new sources to the `SOURCE` map in `assets/site.js`.

**Visit counts** come from Cloudflare Web Analytics (cookieless, no consent
banner). The beacon is a `<script>` at the bottom of every page — add it to any
new page; automatic injection is off because it skips Worker responses. It reports paths but ignores query strings, so it counts visits per
page — per A/B arm — but not per `utm_source`. The WhatsApp prefill above is
what separates channels.

**Google Ads conversions** come from the Google tag (`AW-18515765135`) in the
`<head>` of every page. `assets/site.js` reports the "WhatsApp click" conversion
on any click on a `wa.me` link, so Performance Max optimises for WhatsApp
chats. The campaign's final URL suffix adds `utm_source=ads`, so ad leads
arrive saying "vi el anuncio de Costa Combat" (`google` is taken by the
Business Profile slug). Unlike the Cloudflare beacon, the Google tag sets cookies. Add the tag to
any new page; `404.html` has it but does not load `site.js`, so its WhatsApp
links are not counted.

## Instagram feed

The home pages have an "En Instagram" / "On Instagram" section between the
schedule and the FAQ. It always shows a follow link. When the Worker can reach
Instagram it also shows the six latest posts, each linking to the post.

```
browser  ->  /api/instagram  (src/worker.js, cached 1 h)  ->  graph.instagram.com
```

The access token lives only in Cloudflare, never in the page or in this repo.
Until it is set, `/api/instagram` returns no posts and the section is just the
follow link, so the site works the same either way.

**One-time setup** (needs the Instagram account to be a Professional account —
Business or Creator, switchable free in the Instagram app):

1. At developers.facebook.com, create an app of type *Business*, add the
   **Instagram** product, and choose *API setup with Instagram login*.
2. Under *Generate access tokens*, add the studio's Instagram account and
   generate a token. It is a long-lived token (60 days); permission needed is
   `instagram_business_basic`.
3. Store it as a Worker secret, from this repo:
   `npx wrangler secret put IG_ACCESS_TOKEN` (or Workers & Pages →
   `bahiamovement` → Settings → Variables and Secrets → add, type *Secret*).
4. Optional but recommended, so the token never expires: create a KV namespace
   (`npx wrangler kv namespace create IG_KV`) and uncomment the `kv_namespaces`
   line in `wrangler.jsonc` with its id. The weekly cron then refreshes the
   token and keeps the new one in KV. Without KV the token must be regenerated
   and re-entered every 60 days.

The handle shown is **@bahiamcenter**, the only account until the rename
(Brand Reference v2.3, Transition). When it changes, update it in both home
pages: the Instagram section, the contact block, and `sameAs` in the JSON-LD.
The feed itself follows the account the token belongs to, so it needs no change.

## Editing

**Home** is two real pages, `/` (Spanish) and `/en/` (English), linked with
`hreflang` so Google indexes each in its own language. A JS-swapped page only
ever gets indexed in one. Edit both files together — schedule, FAQ, prices,
address, and the JSON-LD business block in `<head>`, which must match the Google
Business Profile. The ES/EN toggle is a pair of links; once a visitor picks one,
`site.js` remembers it and sends them to that version (never by browser language,
which would redirect Googlebot). Keep the `data-i18n` on schedule entries: the
slot booking reads the class name from it.

**Promo pages** keep the in-page toggle: Spanish lives in the HTML, English in the
`window.EN_STRINGS` object at the
bottom of each page, keyed by `data-i18n`. To change a Spanish string, edit the
HTML; to change its English, edit the matching key. If the script fails to load,
the page still reads correctly in Spanish.

Colors and type follow Costa Combat Brand Reference v2.3: Costa Black, Paper,
Chalk (secondary on black), Concrete (secondary on Paper) and Costa Gold. Montserrat only — per the guide,
Costa headlines are set in Montserrat on the web rather than self-hosting the
URW print faces. Costa Gold appears only on the black offer panel, as the "+" in
the headline, and as short rules — never as text on the Paper background, where
it measures 1.95:1.

### When the launch ends

These pages are campaign pages and are marked `noindex`. When the offer is over,
either point them at an evergreen `/costa-combat/` page with `public/_redirects`:

```
/costa-combat/promos/a/  /costa-combat/  301
/costa-combat/promos/b/  /costa-combat/  301
```

…or strip the gold offer panel and keep them. The printed a1/b1 slugs then need
re-pointing in `_redirects` too — never delete them.

## Open items

- **Instagram token not set yet.** Until `IG_ACCESS_TOKEN` is added (see
  Instagram feed), the section shows only the follow link.

- **The `.ai` masters are the real logo source.** `assets/costa-combat-mark.svg`
  was extracted from `BMC Brand Assets/JJC/BAHIA COMBAT.ai` — the mark plus the
  wordmark, with the discipline line, rule and endorsement line dropped, per the
  guide's mark-only lockup. The wordmark is live Bank Gothic text in the master;
  the outlines were filled instead, so the SVG carries no font dependency. The
  `Costa-Combat-Logo-A-*` files elsewhere in the project are the JPEG traces the
  guide says not to use.
- **Prices (28 Oct 2026):** unlimited plans — $1,500 MXN one discipline (BJJ all
  5 days or Muay Thai all 3), $1,800 two, $1,500 Jiu-Jitsu kids; $500
  registration. The launch offer is over, so page A's panel carries no gold. The
  printed flyer A still shows the launch prices.
- **Photo framing not visually confirmed.** The portraits are square-cropped with
  `object-position: 50% 25%`. Eyeball both on a phone; if a face sits badly,
  adjust that one value in `.coach img`.
- **Image weight.** The home pages serve WebP (about half the size of the JPEGs, made
  with `cwebp -q 78 -m 6`, available via `nix shell nixpkgs#libwebp`). The promo pages
  do too. Re-run the conversion if a photo changes.
- **Address (owner, 28 Oct 2026):** text says `Calamar 12 (dentro de Torre N)
  · La Cruz de Huanacaxtle, Nayarit`, replacing guide v2.0.1's Calamar 9. The
  map link stays on the Google Maps entry listed as Calamar 9, which shows the
  building correctly.
- **The map link is a `maps.app.goo.gl` shortener.** It was set up to resolve to
  a place entry named "Torre M" at 20.7539361, -105.3775034. The guide now says
  the building is Torre N; check the pin still lands on the right door.
- **Google Business Profile pin is off by about 160 m (19 Nov 2026).** The
  profile (`sameAs`, cid 9936370006131875432, share link
  `maps.app.goo.gl/hVCxCUxu5QTfgbpY8`) sits at 20.7544076, -105.3760604, the
  spot Google geocodes for "Calamar 12". The building is the "Torre M" entry
  the site's map link uses. Once the pin is dragged onto the building in the
  profile and Google approves it, point the address link and `hasMap` at the
  profile share link instead.
