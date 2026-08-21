# Lillis Productions — Admin, CMS and Lead CRM Upgrade

## Project baseline

This repository is a single-page Lillis Productions marketing site for a Houston-based social-media/content-production studio. The live page is exported as a **self-contained Design Component bundle** in `index.html`; it is not a normal collection of hand-authored HTML pages. The bundle runtime rebuilds the document from the embedded template at load time. `support.js` is generated runtime code and must not be edited.

Existing public-site content to preserve:

- Lillis Productions branding, dark/light theme, pink accent, Archivo and Manrope typography.
- Services: Content Strategy, Reels & Short-Form, Photography, Community Management, Local SEO & Hashtags, and Website & Maintenance.
- Packages: Presence ($350), Growth ($550), and Expansion ($1,000).
- Portfolio images in `assets/`, three local TikTok videos in `assets/videos/`, social links, Houston location, phone `832-605-6576`, and `hello@lillisproductions.com`.
- Testimonials and the single inquiry form (name, email, business, package, message).

The original form uses a `mailto:` link. That is not a reliable lead flow: it requires a visitor’s local mail app, does not retain a submission, and cannot be managed from an admin inbox.

## Delivered architecture

This implementation uses one Node.js service to serve both the static site and `/api/*` endpoints. It avoids a database and build tooling so it remains simple to deploy, while keeping private submissions outside the public site:

```
browser ──> Node host
              ├─ index.html + assets/          public site
              ├─ /admin/                       authenticated admin panel
              ├─ /api/content/home             editable collection content
              └─ /api/submissions              lead CRM
                    └─ data/                   server-only JSON records
```

The public bundle keeps its existing copy as the fallback. It fetches editable service, work, package, and testimonial collections after it renders. If the API is unavailable, the site stays usable and the inquiry form communicates a clear failure rather than opening `mailto:`. Uploaded images are stored in Cloudflare R2; the admin media library lists, uploads, copies URLs for, and deletes only its own `uploads/` objects.

## What is editable now

The admin panel is deliberately scoped to the actual content model of this one-page site:

- Services — number, title, and description.
- Portfolio/work tiles — label, image path, and alt text.
- Packages — name, badge, price, CTA, and included items.
- Testimonials — quote, person, and role.
- Leads — view inquiry details and move a lead between `new`, `contacted`, `qualified`, `won`, `lost`, and `archived`.

Site chrome, layout, theme behavior, local video files, and social links remain code-owned. The current generated bundle makes free-form on-page editing a poor fit; changes to structural markup must happen in the Design Component source/export workflow, then be re-applied to the small CMS bridge in `index.html`.

## Local setup and execution

1. Copy `.env.example` to `.env` and set strong, unique values for `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `AUTH_SECRET`.
2. Start with `node server.js` (or `npm.cmd run dev` on Windows PowerShell). The project intentionally has no `start` script so Vercel treats it as a static site plus `/api` functions, not as a long-running Node server.
3. Open `http://localhost:3000/` for the site and `http://localhost:3000/admin/` for the control panel.
4. Sign in using the bootstrap credentials from `.env`.

Without `DATABASE_URL`, first start creates the ignored `data/content-home.json` file from the tracked `data/default-content.json` seed and creates `data/submissions.json` after the first inquiry. When `DATABASE_URL` is set, local `server.js` uses the same Neon-backed API as Vercel instead.

For R2, place `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PUBLIC_URL` in `.env.local`. `R2_ENDPOINT` is optional: it is derived from the account ID when omitted. The public URL must be the bucket’s enabled `r2.dev` URL or a custom domain, not the S3 API endpoint.

## Security and operating rules

- Do not commit `.env`, generated `data/`, or a production password.
- The bootstrap password is hashed with Node’s `scrypt`; browser sessions are HMAC-signed, short-lived HTTP-only cookies.
- Public submissions are size-limited, validated, protected by a hidden honeypot field, and rate-limited by client IP.
- The public page and admin use same-origin API calls. If they are split across hosts later, add a deliberate CORS allowlist rather than `*`.
- The JSON store is suitable for a small studio and a single Node instance. Move to a managed database before multiple server instances, high submission volume, or team-wide concurrent editing.

## Deployment

For a traditional Node host (a small VPS, Render, Railway, or a container host), deploy `server.js` with a persistent disk mounted for `data/`. Static-only cPanel/FTP hosting cannot execute it.

For Vercel, `vercel.json` explicitly deploys the static home page, admin files, assets, and the `api/[...route].js` function. That function replaces the local server and persists the CMS/CRM in Neon Postgres. Add `DATABASE_URL`, the three admin variables, and the R2 variables in Vercel Project Settings for Production, Preview, and Development. Provision Neon through Vercel’s Marketplace, which injects a `DATABASE_URL`, then deploy; the function creates its two tables automatically. Do not copy `.env.local` into the repository or deployment.

Before production, set the three required environment variables, configure a persistent data volume and HTTPS, confirm `/api/health`, submit a test inquiry, confirm it appears in `/admin/`, and remove the test lead.

## Verification checklist

- `node --check server.js` and `node --check admin/app.js` pass; the bundle bridge in `index.html` is verified by loading the page.
- `GET /api/health` returns `{ "ok": true }`.
- An invalid login is rejected; a valid bootstrap login can read and update content.
- A public inquiry creates one lead; a honeypot submission is accepted but not stored.
- A changed lead status is visible after refresh.
- The home page preserves its original collections if `/api/content/home` fails.
