# Lillis Productions

The lillisproductions.com website plus a visual editor at `/admin`.

- **Public site** (`/`): a Next.js page rendered from the published content in MongoDB. It is cached and refreshed the moment the editor publishes. If the database can't be reached, it falls back to the built-in content in `src/lib/content/defaults.ts`.
- **Editor** (`/admin`): shows the real site in a preview frame. Click any text to type over it, click images, videos and cards for options, and hover cards to move, duplicate, add or delete them. Edits save as a draft automatically; **Publish** puts them live, and every publish is kept under **Versions**.
- **Videos**: TikTok, Instagram, Facebook and YouTube links are turned into embeds. Uploaded videos are re-encoded in the browser (H.264/AAC MP4, 720p or 1080p) before going straight to Cloudflare R2, so a 15 MB phone clip ends up around 2–3 MB.
- **Images**: shrunk in the browser, then converted to WebP on the server.

## Run locally

```bash
cp .env.example .env   # fill in the values
npm install
npm run dev            # http://localhost:3000 and http://localhost:3000/admin
```

## Where things live

| Path | What |
| --- | --- |
| `src/components/site/` | The public page. The same components render in the editor with editing turned on. |
| `src/lib/content/` | Content types, defaults, validation (`schema.ts`) and video link parsing (`embeds.ts`). |
| `src/editor/` | The editor: shell, side panels, canvas, uploads. |
| `src/app/api/` | Login, draft/publish/versions, media and link-checking routes (all admin-only). |
| `src/lib/server/` | MongoDB, R2, auth, image optimisation, sanitising. |

Adding an editable field: add it to `SiteContent` (`types.ts`) and `DEFAULT_CONTENT`, render it with `<T p="section.field" />`, and the editor picks it up automatically (labels live in `src/editor/labels.ts`).

Direct video uploads need a CORS rule on the R2 bucket that allows `PUT` from the site's domains (already set on the current bucket).
