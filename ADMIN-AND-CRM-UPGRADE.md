# Admin Panel + CMS + CRM Upgrade for a Static HTML Site

**Purpose of this document:** a complete, battle-tested blueprint for retrofitting any static HTML website with a non-coder admin panel, a content management system (CMS), an inline "Wix-style" on-page editor, a blog engine, and a lightweight CRM (lead/submission inbox) — without rebuilding the site or changing how it's hosted. It was written after successfully building this exact system for a production site (Ranch Capital Lending), and it encodes every architectural decision, pitfall, and fix discovered along the way. Follow it phase by phase and verify each phase before moving on.

**Who this is for:** Claude (or any developer) starting from an existing static HTML/CSS/JS site on shared hosting (cPanel/FTP or similar), with no build step and no framework.

---

## 1. The End State You Are Building

1. **A REST API** (Node.js + Express + MongoDB Atlas + Cloudflare R2) deployed to Vercel — holds all editable content, uploaded images, blog posts, users, and form submissions.
2. **An admin panel** at `/admin/` on the same static host — a single `index.html` using Alpine.js + Tailwind CDN (no build step). Editors log in and manage everything: site text, images, nav menus, forms, blog posts, leads.
3. **A content loader** (`cms-loader.js`) included on every public page — fetches CMS content and patches it into the existing static HTML. The static HTML always keeps its hand-written content as a fallback, so if the API is down the site looks exactly as before. **Progressive enhancement, never a hard dependency.**
4. **An inline editor** (`cms-editor.js`) — completely inert for visitors; when an admin (who has logged into `/admin` in the same browser) visits the live site, hover pencil/camera icons appear on editable elements for in-place editing, including an image crop/reposition modal.
5. **A blog engine** — admin CRUD with a Quill rich-text editor, public listing page with tag filters, single-post pages, homepage "latest 3 / hand-picked 3" section.
6. **A CRM inbox** — public forms (contact, application/intake) POST to the API; admins see submissions in the panel with statuses (new/reviewed/archived) and get email notifications via configurable SMTP.
7. **SEO pack** — sitemap.xml generator, robots.txt, meta description/keywords/OG/Twitter tags, multi-size favicon set.

---

## 2. Architecture Rules (Non-Negotiable)

- **Two separate deployables.** The API is a git repo deployed to Vercel (auto-deploy on push to main). The static site + admin panel deploy via FTP to the existing host. Never merge them.
- **The static HTML is the source of truth for layout; the DB is the source of truth for content.** `cms-loader.js` only patches text/images/attributes into existing elements — it does not construct page layout (except for repeaters like card grids and blog cards, where it regenerates the items inside an existing container).
- **One MongoDB `Content` document per page/area**, schemaless: `{ key: 'home', data: { hero: {...}, about: {...} } }`. The shape of `data` is owned by the admin panel's field schema file (`cmsSchema.js`), NOT by the API. Adding an editable field = edit `cmsSchema.js` + patch `cms-loader.js` to apply it. The API never changes.
- **`PUT /content/:key` is full-document replace.** The admin always sends the whole page object. Simple, predictable — but it means any script updating content must FETCH-MERGE-PUT, never PUT a partial object (it would wipe other sections).
- **No build step anywhere.** Plain script files, CDN libraries (Alpine, Tailwind, Quill). This keeps the whole system editable and deployable by FTP-ing single files.
- **Local dev and production share the SAME MongoDB Atlas database.** This makes DB writes instantly live and testing realistic — but it is DANGEROUS (see Pitfalls §9). Decide this consciously; if you keep it, follow the test-data rules religiously.

---

## 3. What to Ask the User For (Before Writing Any Code)

Collect these up front; the build stalls without them:

| Item | Used for |
|---|---|
| MongoDB Atlas connection string | `MONGODB_URI` in API `.env` |
| Cloudflare R2 bucket + access key/secret + public base URL | Image uploads (`R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_PUBLIC_BASE_URL`) |
| GitHub repo for the API | Vercel auto-deploy |
| FTP host / user / password (from cPanel) and the remote web root (usually `/public_html/`) | Static site deploys |
| Production domain | CORS origins, sitemap URLs, OG tags |
| Initial admin email + password | Seed script (`SEED_ADMIN_EMAIL/PASSWORD`) |
| SMTP details (or "configure later in admin") | Form notification emails |
| Which sections/pages should be editable, and whether they want a blog | Scoping `cmsSchema.js` |

---

## 4. Build Order (Phases — verify each before the next)

### Phase 0 — Discovery (read-only)
Read the ENTIRE static site first. Produce an inventory:
- Every page, every section, every piece of text/image an editor might want to change.
- The theme's CSS conventions: design tokens (CSS variables like `--theme-primary`), existing components (cards, buttons), heading font.
- **Animation libraries in use** (GSAP, ScrollTrigger, SplitType, AOS, etc.) — these WILL fight dynamically-updated text. Note every class involved (e.g. `.reveal-item`, `.split-text`). See Pitfalls §1.
- The nav/menu structure (desktop + mobile duplicates), footer widgets, forms.
- Hosting: confirm FTP access works and whether an `.htaccess` (Apache) is honored.

### Phase 1 — API
Structure (all under an `api/` repo):
```
api/index.js                 -> require app, app.listen (local) / module.exports (Vercel)
src/app.js                   -> express app, CORS allowlist, JSON body, route mounting, connect-DB middleware
src/config/db.js             -> mongoose connect with cached connection (Vercel serverless-safe)
src/config/r2.js             -> S3Client pointed at R2
src/config/email.js          -> nodemailer transport built from Setting('email') doc; sendSubmissionNotification never throws
src/middleware/auth.js       -> requireAuth (JWT verify + user still exists in DB; role read from DB not token), requireAdmin
src/models/User.js           -> email, passwordHash (bcryptjs), name, role: 'admin'|'editor'; static hashPassword
src/models/Content.js        -> { key: unique String, data: Mixed, updatedBy }
src/models/Media.js          -> { key (R2 object key), url, fileName, mimeType, size, alt, uploadedBy }
src/models/Submission.js     -> { type: 'application'|'contact', data: Mixed, source, status: 'new'|'reviewed'|'archived' }
src/models/Setting.js        -> { key: unique, data: Mixed }  (e.g. key 'email' holds SMTP config)
src/models/BlogPost.js       -> title, slug (unique), excerpt, content (HTML), coverImage{url,alt}, tags[String],
                                status 'draft'|'published', publishedAt, author, seo{metaTitle,metaDescription,keywords}, createdBy
src/routes/auth.routes.js    -> POST /login, GET /me, POST /change-password
src/routes/content.routes.js -> GET / (all docs as map), GET /:key (public), PUT /:key (auth, upsert full replace)
src/routes/media.routes.js   -> GET / (auth), POST / (auth, multer memory, sharp -> WebP q82, max 2000px,
                                skip SVG/GIF conversion, key `uploads/{ts}-{rand}{ext}`), DELETE /:id (auth, also deletes from R2)
src/routes/submissions.routes.js -> POST / (public, honeypot field check, awaited email notify), GET/PATCH/DELETE (auth)
src/routes/settings.routes.js    -> GET/PUT /email (admin only; blank password = keep stored), POST /email/test
src/routes/users.routes.js   -> admin only; never demote/delete the last admin; no self-delete
src/routes/blog.routes.js    -> public: GET /posts (published, ?tag=&q=&page=&limit=), GET /tags (distinct),
                                GET /posts/by-ids (preserve requested order), GET /posts/:slug (published only)
                                auth: GET /admin/posts (incl. drafts), POST/PUT/DELETE /posts[/:id]
                                slug auto-generated (slugify), uniqueness enforced; publishedAt set once on first publish
src/seed/seed.js             -> creates admin user + upserts defaultContent (never overwrites existing content docs)
src/seed/defaultContent.js   -> faithful transcription of the CURRENT static site copy (a "factory reset" dataset)
src/seed/generateSitemap.js  -> writes sitemap.xml from fixed pages + published posts (run + FTP after content changes)
```
Key behaviors:
- CORS: allowlist from `CORS_ORIGINS` env (comma-separated), allow requests with no Origin header.
- DB middleware runs before all routes; health check `GET /api/health` before it.
- JWT: `{ sub, email, role }`, ~7-day expiry; `requireAuth` re-reads the user from DB so deletions/role changes apply immediately.
- Image pipeline: convert to WebP server-side with sharp (`.rotate()` first for EXIF), cap 2000px. R2 URLs are unique per upload → immune to browser caching problems.
- Verify locally with real HTTP calls before first deploy (`npm run dev`, curl every route).

### Phase 2 — Admin Panel (`/admin/index.html` + `js/` + `css/`)
- **Single HTML file, Alpine.js CDN + Tailwind CDN + Font Awesome.** One `adminApp()` in `js/app.js` holding all state. `js/config.js` sets `window.RANCH_API_BASE_DEFAULT`; a Settings field lets an admin override it via localStorage.
- **Schema-driven CMS forms**: `js/cmsSchema.js` exports `window.CMS_SCHEMA = { pageKey: { label, icon, sections: { sectionKey: { label, fields: [...] } } } }`. Field types to implement in the generic renderer: `text`, `textarea`, `number`, `select` (options), `image` (URL input + "Choose from Library" + "Upload New"), `list` (array of strings), `repeater` (array of objects with nested `fields`, with add/remove/reorder buttons), plus a special `favicon` type if wanted. Support a `hidden: true` flag on fields (filter them out when rendering) and `hint` text under labels. **Adding a field to this file is the entire admin-side work to make something editable.**
- Tabs: Content (CMS), Media Library, Blog, Submissions (the CRM), Users (admin-only), Settings (password change, SMTP config with "Send Test Email" that tests unsaved form values, API URL).
- Media picker modal is shared: CMS image fields use a `{page, section, field}` target; non-CMS consumers (blog cover) pass a callback (`openMediaPickerFor(onSelect)`).
- Blog tab: card grid (4 per row, paginate client-side after 16), status filter, "Feature on homepage" star toggle (max 3, persisted into the home content doc as `blogSection.selectedPostIds`), editor modal with: title → auto-slug (stop auto-syncing once slug manually touched or when editing an existing post), cover image picker + alt text, excerpt, **Quill rich text for content** (see Pitfalls §6), tag chips (keep hint text explicit: tags are 2–3 broad categories for the filter bar; long-tail SEO phrases belong in the Meta Keywords field — see Pitfalls §8), author, draft/publish, SEO fields (meta title, meta description ≤150 chars, keywords).
- Submissions (CRM) tab: list with type + status badges, expandable detail (render `data` as a key/value grid), Mark New/Reviewed/Archive, Delete. Filter by type.
- `<meta name="robots" content="noindex, nofollow">` on the admin page.

### Phase 3 — Frontend Loader (`assets/js/cms-config.js` + `cms-loader.js`)
- `cms-config.js`: `window.RANCH_API_BASE = 'https://<api>.vercel.app/api';`
- `cms-loader.js` (IIFE, loaded at end of `<body>` on EVERY page, after the theme's JS):
  - **Render hold**: inject `header,main,footer{opacity:0}` style immediately, remove after content applies OR after a 4s timeout OR on fetch error. Fails OPEN — a blank page must never be possible. Use `opacity`, NOT `visibility` (SplitType reads `innerText`, which returns `''` for visibility:hidden elements and would wipe headlines).
  - Fetch `GET /api/content` once, `Object.assign` into a single long-lived `content` object (mutated in place, never reassigned), then `reapply()`.
  - `reapply()` re-runs ALL DOM patching from the in-memory object — used on load and after every inline-editor save. One code path, no partial-update bugs.
  - Helper functions: `setText(sel, value, root, editMeta)` (textContent + tag editable), `setOwnText` (only the text node, preserving icon children; must clear SplitType debris first — see Pitfalls §1), `setImg`, `setHref`, `escapeHtml` (ALWAYS escape CMS strings interpolated into innerHTML).
  - `tagEditable(el, type, {page, path}, value)` sets `data-edit-page/path/type/value` (+ `data-edit-multiline`) attributes — this is the contract the inline editor reads.
  - Repeaters (nav menus, card grids, footer link lists, form fields) regenerate `innerHTML` of their existing container from the array.
  - Expose `window.RanchCMS = { apiBase, content, getPath, setPath, writeElementText, reapply }`.
  - **Support a `?ranch_api=` URL override** for pointing a page at a local API during testing without touching the production config file.
  - Site-wide fixes to bake in from day one (each was a real bug here): (a) rewrite bare `#anchor` hrefs to `index.html#anchor` on any page that doesn't contain that id; (b) compute the nav "active" class per page instead of hardcoding item 0; (c) close the Bootstrap offcanvas mobile menu on any link click inside it (delegated document listener, since nav innerHTML gets regenerated).
- **Local test servers**: API on `localhost:4000`, static via `npx http-server -p 5500 -c-1`.

### Phase 4 — Inline Editor (`assets/js/cms-editor.js`)
- First line of defense: `if (!localStorage.getItem('ranch_token')) return;` — the file is loaded by everyone but does literally nothing without a token. Validate the token against `/auth/me` before injecting any UI.
- Hover any `[data-edit-path]` element → floating pencil (text) or camera (image) button → popover with input/textarea prefilled from `data-edit-value` → Save does: `setPath(content[page], path, value)` → `reapply()` → `PUT /content/:page` with the whole page object → toast.
- Image flow: file pick → **crop modal** (viewport with the same aspect ratio as the target element, drag to reposition, zoom slider, "Use Full Image" bypass, canvas crop to JPEG/PNG) → upload via `/media` → set URL into content → save. Keep the crop math in a small pure object (`baseScale`, `clampOffset`, `zoomAroundCenter`, `sourceRect`) exposed on `window` for unit testing.
- Enter edit mode explicitly (e.g. `?ranch_edit=1` or a floating toggle) so admins can also browse normally.

### Phase 5 — Blog Public Pages
- `blog.html` (listing) and `blog-post.html?slug=...` — assembled from the SAME header/nav/footer markup as the homepage (copy the blocks; the loader keeps them in sync with CMS after load).
- `assets/js/blog.js`: fetch posts + tags, render cards **reusing the theme's existing card component classes**, tag filter pills (**cap the rendered pills at ~8**), pagination, reflect state in the URL (`?tag=&page=`) via `history.replaceState`.
- `assets/js/blog-post.js`: fetch by slug, render; set `document.title` + meta description/keywords + og:/twitter: tags from post SEO fields (post cover image overrides the site-wide share image); content field: if it starts with `<` treat as Quill HTML and inject as-is, else legacy plain text → escape + paragraph-split on blank lines. Not-found state with a link back.
- Homepage blog section: static section markup with an empty cards container; loader fetches featured-by-ids (or latest 3) and renders cards. **Hide the whole section when there are zero posts.**
- Blog CSS: check EVERY text element's color against its actual background — dark-theme sites have light global text that becomes invisible on white cards and vice versa (bit us twice; see Pitfalls §3).

### Phase 6 — SEO Pack
- Every public page: meta description (**≤150 chars**), meta keywords, `og:type`, **`og:site_name`** (Discord shows it), `og:title`, `og:description` (≤150), `og:url`, `og:image` (a dedicated **1200×630** share image — absolute URL) + `og:image:width/height`, `twitter:card=summary_large_image`, `twitter:title/description/image`.
- Multi-size favicon set in `assets/favicon/`: `favicon.ico`, 16/32/48/192/512 PNGs, `apple-touch-icon.png` — linked on every page INCLUDING the admin panel, all with a `?v=` cache-bust (see Pitfalls §4).
- `robots.txt`: allow all, `Disallow: /admin/`, `Sitemap:` line.
- `generateSitemap.js` in the API repo writes `sitemap.xml` (homepage/fixed pages + every published post URL); regenerate + FTP when posts change meaningfully.

### Phase 7 — Caching, Testing, Deployment
See §5–§7 below. Do not skip.

---

## 5. Caching Strategy (Solves "users see the old site")

Add/extend `.htaccess` at the web root:
```apache
<IfModule mod_headers.c>
  <FilesMatch "\.(html)$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  <FilesMatch "\.(js|css)$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  <FilesMatch "\.(png|jpe?g|webp|gif|svg|ico|woff|woff2|ttf|eot|webm|mp4)$">
    Header set Cache-Control "public, max-age=604800"
  </FilesMatch>
</IfModule>
```
- HTML/JS/CSS revalidate every load (cheap 304s) → every deploy is visible immediately.
- Images cache 7 days — fine for CMS uploads (unique R2 filenames) but **any same-name image you replace (favicon!) needs a `?v=` query bump in its referencing HTML**.
- ALSO version every script/style include (`cms-loader.js?v=20260712`) and bump on each change — belt and suspenders for browsers/proxies that ignore the headers.

---

## 6. Testing Methodology (The Reason This Worked)

**Standing rule: test everything locally against real servers before any deploy.** ("before pushing anything lets test it out first")

- **Puppeteer + real Chrome** (`executablePath` to the installed Chrome), scripts in a scratch folder outside the repo. Test against `http://localhost:5500` (static) + `http://localhost:4000/api` (API) using the `?ranch_api=` override.
- Structure every script as a checklist: `check(desc, cond)` counters, exit code 1 on any failure, print a `N passed, M failed` summary.
- What to cover per feature: renders on desktop (1400px) AND mobile (390px) viewports; correct text/links/visibility via `getComputedStyle` (not just DOM presence); inline-edit round trip (edit → save toast → DOM updated → value persisted in DB); auth rejection (401 without token); empty states; the not-found state.
- Take screenshots and actually LOOK at them — computed-style checks miss things like invisible white-on-white text; screenshots caught every visual bug in this build.
- **Flakiness lessons**: Bootstrap offcanvas/status transitions need `waitForFunction` on the final class, not fixed sleeps. Alpine re-renders detach NodeLists — re-query between destructive clicks (clicking stale delete buttons in a loop deleted the wrong things once).
- **Test-data discipline (CRITICAL, see Pitfalls §9)**: prefix all test records (`"Test: ..."`), snapshot-and-restore content docs (deep-copy before, PUT back after), delete created records by captured id in a `finally`, and NEVER bulk-click destructive UI buttons — target records by their test-prefixed title.

---

## 7. Deployment & Verification Ritual

**API:** `git push origin main` → Vercel auto-deploys (~30–60s). Then curl a new endpoint on the production URL to confirm.

**Static site:** FTP with curl over FTPS, then **hash-verify every uploaded file**:
```bash
curl -sS --ftp-ssl -u "$FTP_USER:$FTP_PASS" -T path/file "ftp://HOST/public_html/path/file"
# then:
localHash=$(sha1sum path/file);  remoteHash=$(curl -sS https://domain.com/path/file | sha1sum)
# must match byte-for-byte before you declare it deployed
```
Use `--ftp-create-dirs` for new folders. Uploads can silently time out mid-batch — verify each file, retry stragglers.

**After deploy:** run a small Puppeteer verification against the PRODUCTION URLs (not just localhost) for the changed behavior. Network flakes happen — re-run a failed live check once before investigating.

**DB-only changes** (content edits via API/scripts) need no deploy at all if local and prod share the database — but verify via the production API afterward.

---

## 8. Pitfalls Learned the Hard Way (Read Before Coding)

1. **Text-animation libraries corrupt dynamic text.** SplitType/GSAP split headlines into `.split-word`/`.split-char` spans at page load. Setting `textContent` on such an element later leaves debris or gets wiped. Fixes: a `clearSplitDebris(el)` helper before writing text; NEVER put reveal-animation classes (`.reveal-item`) on elements you insert after load — the one-time GSAP scan already ran and the element can end up permanently invisible (initial opacity state never animated away).
2. **The render hold must use `opacity`, not `visibility`** — SplitType reads `innerText` at DOMContentLoaded and `innerText` is empty for `visibility:hidden` subtrees → it would permanently wipe every headline.
3. **Theme color assumptions flip on you.** A dark-themed site sets global text to white — reusing a theme card component with a white background produced invisible white-on-white titles/excerpts (twice: blog cards, then pagination buttons and post meta). Always set explicit colors on both sides when reusing components across background contexts, and screenshot-check.
4. **Same-filename image replacement + long image cache = stale favicons/logos for a week.** Any replaced image keeping its filename needs a `?v=` bump everywhere it's referenced (including CMS-stored values).
5. **`PUT` full-replace will eat data in scripts.** Any maintenance script must GET the full doc, mutate, PUT back. Re-sending a blog post without its `content`/`seo` blanked them (a test did exactly this).
6. **Quill + Alpine**: don't initialize Quill on an Alpine-managed element directly — create a fresh child mount node each time the modal opens (`wrap.innerHTML=''; wrap.appendChild(div); new Quill(div, ...)`), destroy nothing on close (just drop the reference), and don't combine `x-ref` and `x-ignore` on the same element. Store Quill's `root.innerHTML` into the form on `text-change`. Detect legacy plain-text content (doesn't start with `<`) and convert paragraphs before loading into Quill.
7. **File inputs created for programmatic `.click()` must be appended to the document** (headless Chrome ignores clicks on detached inputs).
8. **Tags ≠ SEO keywords.** If the tag field hint says "and for SEO", editors will stuff 10–15 long-tail phrases per post and the public filter bar becomes 36 pills of noise. Separate fields, explicit hints, cap rendered filter pills (~8) as a safety net.
9. **Shared local/prod DB is a loaded gun.** A bulk-delete in a UI test wiped the user's real blog posts (unrecoverable — no soft delete). If you share the DB: no destructive bulk operations in tests, target test records by prefix, snapshot/restore, and consider seeding real content only after test suites stabilize. Better: use a separate test database if the user will tolerate the setup cost.
10. **Duplicated markup drifts.** Nav exists in desktop + mobile menus; header/footer are copy-pasted per page. Drive them all from CMS via the loader so they can't drift, and remember new pages need the SAME script includes at the bottom (`cms-config`, `cms-loader`, `cms-editor`, page-specific JS).
11. **Hash links only work on the page that has the sections.** `#contact` on blog.html goes nowhere. The loader's anchor-rewrite fix (Phase 3) handles this globally — include it from day one.
12. **Serverless (Vercel) kills post-response work.** `await` email sends before responding; cache the mongoose connection across invocations.
13. **Meta descriptions ≤150 chars, og:site_name present, share image exactly 1200×630** — validators and Discord/Google truncation flagged all three here.
14. **`nodemon`/`node_modules` can vanish** (interrupted installs, cleanups). If a dev server won't start, check `node_modules` exists before debugging anything else.

---

## 9. Security Checklist

- bcrypt password hashes; JWT secret in env only; tokens ~7-day expiry.
- `requireAuth` re-validates the user exists in the DB per request (instant revocation); role read from DB, not the token.
- Admin vs editor roles; user management/settings admin-only; never demote or delete the last admin; no self-delete.
- Escape ALL CMS/user strings interpolated into HTML (`escapeHtml`) — the only unescaped injection is Quill-authored blog HTML, which is admin-authored by design.
- Honeypot field on public forms (a hidden `website` input; silently accept-and-drop when filled).
- Upload constraints: images only (mimetype check), 10MB cap, server-side re-encode to WebP (strips metadata/EXIF).
- Admin page `noindex`; `robots.txt` disallows `/admin/`.
- Never commit `.env`; never put credentials in this doc's target repo; the FTP password lives only in the user's deploy config (e.g. `.vscode/sftp.json`, gitignored).

---

## 10. Suggested Delivery Order for a New Project

Work in vertical slices — deploy value early, expand coverage iteratively:

1. Phase 0 discovery → written inventory the user confirms.
2. API skeleton + auth + content + seed with the site's REAL current copy → deploy to Vercel → verify with curl.
3. Admin panel with CMS tab covering ONE page's sections + media library → user logs in and edits something for real.
4. `cms-loader.js` on the homepage → the edit shows up live. (This is the magic moment — get here fast.)
5. Expand schema/loader to every remaining page/section. Forms → submissions CRM + email notify.
6. Inline editor.
7. Blog (admin CRUD → public pages → homepage section → rich text).
8. SEO pack + favicon + caching headers.
9. Full Puppeteer regression suite; keep it runnable for future changes.

Each step: build → test locally with Puppeteer → deploy → hash-verify → live-verify → only then move on.
