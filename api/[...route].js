"use strict";

const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");
const { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const defaultContent = require("../data/default-content.json");

const statuses = ["new", "contacted", "qualified", "won", "lost", "archived"];
const rateLimit = new Map();
let schemaPromise;

module.exports = async (req, res) => {
  try {
    const path = new URL(req.url, "https://lillis.local").pathname;
    if (req.method === "GET" && path === "/api/health") return await withDatabase(res, async (sql) => { await sql`SELECT 1`; send(res, 200, { ok: true, storage: "neon", media: Boolean(r2Config().enabled) }); });
    if (req.method === "POST" && path === "/api/auth/login") return await login(req, res);
    if (req.method === "POST" && path === "/api/auth/logout") return logout(req, res);
    if (req.method === "GET" && path === "/api/auth/me") return requireAdmin(req, res, () => send(res, 200, { email: adminConfig().email }));
    if (req.method === "GET" && path === "/api/content/home") return await withDatabase(res, (sql) => getContent(sql, res));
    if (req.method === "PUT" && path === "/api/content/home") return await requireAdmin(req, res, () => withDatabase(res, (sql) => saveContent(req, sql, res)));
    if (req.method === "POST" && path === "/api/submissions") return await withDatabase(res, (sql) => createSubmission(req, sql, res));
    if (req.method === "GET" && path === "/api/submissions") return await requireAdmin(req, res, () => withDatabase(res, (sql) => listSubmissions(sql, res)));
    const lead = path.match(/^\/api\/submissions\/([a-f0-9-]+)$/i);
    if (req.method === "PATCH" && lead) return await requireAdmin(req, res, () => withDatabase(res, (sql) => updateSubmission(req, sql, res, lead[1])));
    if (req.method === "GET" && path === "/api/media") return await requireAdmin(req, res, () => listMedia(res));
    if (req.method === "POST" && path === "/api/media") return await requireAdmin(req, res, () => uploadMedia(req, res));
    const media = path.match(/^\/api\/media\/(.+)$/);
    if (req.method === "DELETE" && media) return await requireAdmin(req, res, () => deleteMedia(res, media[1]));
    send(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    send(res, error.message === "Database is not configured." ? 503 : 500, { error: error.message === "Database is not configured." ? "DATABASE_URL is not configured." : "Unexpected server error." });
  }
};

async function withDatabase(res, fn) {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  const sql = neon(process.env.DATABASE_URL);
  await ensureSchema(sql);
  return fn(sql, res);
}

async function ensureSchema(sql) {
  schemaPromise ||= Promise.all([
    sql`CREATE TABLE IF NOT EXISTS site_content (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    sql`CREATE TABLE IF NOT EXISTS submissions (id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, business TEXT NOT NULL DEFAULT '', package TEXT NOT NULL DEFAULT '', message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
  ]);
  return schemaPromise;
}

async function getContent(sql, res) {
  const rows = await sql`SELECT data FROM site_content WHERE key = 'home' LIMIT 1`;
  if (rows[0]) return send(res, 200, rows[0].data);
  await sql`INSERT INTO site_content (key, data) VALUES ('home', ${JSON.stringify(defaultContent)}::jsonb) ON CONFLICT (key) DO NOTHING`;
  send(res, 200, defaultContent);
}

async function saveContent(req, sql, res) {
  const content = await jsonBody(req);
  const invalid = validateContent(content);
  if (invalid) return send(res, 400, { error: invalid });
  await sql`INSERT INTO site_content (key, data, updated_at) VALUES ('home', ${JSON.stringify(content)}::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
  send(res, 200, content);
}

async function createSubmission(req, sql, res) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  if (!withinRateLimit(ip)) return send(res, 429, { error: "Please wait before submitting again." });
  const body = await jsonBody(req);
  if (String(body.website || "").trim()) return send(res, 202, { ok: true });
  const name = clean(body.name, 100), email = clean(body.email, 160).toLowerCase(), business = clean(body.business, 160), selectedPackage = clean(body.package, 100), message = clean(body.message, 4000);
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: "Please provide your name, a valid email, and a message." });
  await sql`INSERT INTO submissions (id, name, email, business, package, message) VALUES (${crypto.randomUUID()}, ${name}, ${email}, ${business}, ${selectedPackage}, ${message})`;
  send(res, 201, { ok: true });
}

async function listSubmissions(sql, res) {
  const rows = await sql`SELECT id, name, email, business, package, message, status, created_at, updated_at FROM submissions ORDER BY created_at DESC`;
  send(res, 200, rows.map(serialiseLead));
}

async function updateSubmission(req, sql, res, id) {
  const body = await jsonBody(req);
  if (!statuses.includes(body.status)) return send(res, 400, { error: "Invalid lead status." });
  const rows = await sql`UPDATE submissions SET status = ${body.status}, updated_at = NOW() WHERE id = ${id} RETURNING id, name, email, business, package, message, status, created_at, updated_at`;
  if (!rows[0]) return send(res, 404, { error: "Lead not found." });
  send(res, 200, serialiseLead(rows[0]));
}

async function listMedia(res) {
  const { enabled, client, bucket, publicBaseUrl } = r2Config();
  if (!enabled) return send(res, 503, { error: "R2 is not configured." });
  const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "uploads/", MaxKeys: 1000 }));
  const items = (result.Contents || []).filter((item) => item.Key).sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified)).map((item) => ({ key: item.Key, url: publicUrl(publicBaseUrl, item.Key), size: item.Size || 0, updatedAt: item.LastModified?.toISOString() || null }));
  send(res, 200, { items });
}

async function uploadMedia(req, res) {
  const { enabled, client, bucket, publicBaseUrl } = r2Config();
  if (!enabled) return send(res, 503, { error: "R2 is not configured." });
  const type = String(req.headers["content-type"] || "").split(";", 1)[0].toLowerCase();
  const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
  if (!extensions[type]) return send(res, 415, { error: "Use a JPG, PNG, WebP, or GIF image." });
  const bytes = await binaryBody(req, 10 * 1024 * 1024);
  if (!bytes.length) return send(res, 400, { error: "Choose an image to upload." });
  const key = `uploads/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}${extensions[type]}`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: type, CacheControl: "public, max-age=31536000, immutable" }));
  send(res, 201, { key, url: publicUrl(publicBaseUrl, key), size: bytes.length, updatedAt: new Date().toISOString() });
}

async function deleteMedia(res, encodedKey) {
  const { enabled, client, bucket } = r2Config();
  if (!enabled) return send(res, 503, { error: "R2 is not configured." });
  let key; try { key = decodeURIComponent(encodedKey); } catch { return send(res, 400, { error: "Invalid media key." }); }
  if (!key.startsWith("uploads/") || key.includes("..") || key.length > 512) return send(res, 400, { error: "That media item cannot be deleted." });
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  send(res, 204);
}

async function login(req, res) {
  const body = await jsonBody(req), admin = adminConfig();
  if (clean(body.email, 160).toLowerCase() !== admin.email || !verifyPassword(String(body.password || ""), admin.hash)) return send(res, 401, { error: "Invalid email or password." });
  res.setHeader("Set-Cookie", `lp_admin=${signToken({ sub: admin.email, exp: Date.now() + 12 * 60 * 60 * 1000 })}; Path=/; HttpOnly;${secureCookie(req)} SameSite=Strict; Max-Age=43200`);
  send(res, 200, { email: admin.email });
}
function logout(req, res) { res.setHeader("Set-Cookie", `lp_admin=; Path=/; HttpOnly;${secureCookie(req)} SameSite=Strict; Max-Age=0`); send(res, 204); }
function requireAdmin(req, res, next) { const token = parseCookies(req.headers.cookie || "").lp_admin; const claims = token && verifyToken(token), admin = adminConfig(); return claims?.sub === admin.email ? next() : send(res, 401, { error: "Sign in required." }); }
function adminConfig() { if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("Admin authentication is not configured."); const salt = crypto.createHash("sha256").update(process.env.AUTH_SECRET).digest("hex").slice(0, 32); return { email: process.env.ADMIN_EMAIL.trim().toLowerCase(), hash: `${salt}:${crypto.scryptSync(process.env.ADMIN_PASSWORD, salt, 64).toString("hex")}` }; }
function r2Config() { const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID; const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""); const bucket = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET; const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID; const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY; const publicBaseUrl = String(process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_BASE_URL || process.env.R2_BUCKET_PUBLIC_URL || "").replace(/\/+$/, ""); const enabled = Boolean(endpoint && bucket && accessKeyId && secretAccessKey && publicBaseUrl); return { enabled, bucket, publicBaseUrl, client: enabled ? new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } }) : null }; }
function validateContent(content) { if (!content || typeof content !== "object" || Array.isArray(content)) return "Content must be an object."; for (const key of ["services", "gallery", "packages", "quotes"]) { if (!Array.isArray(content[key])) return `Content is missing ${key}.`; if (content[key].length > 20) return `${key} has too many items.`; } return null; }
function serialiseLead(lead) { return { ...lead, createdAt: new Date(lead.created_at).toISOString(), updatedAt: new Date(lead.updated_at).toISOString(), created_at: undefined, updated_at: undefined }; }
async function jsonBody(req) { const value = await rawBody(req, 512 * 1024); if (value && typeof value === "object" && !Buffer.isBuffer(value)) return value; try { return JSON.parse(Buffer.from(value || "").toString("utf8") || "{}"); } catch { throw new Error("Invalid JSON body."); } }
async function binaryBody(req, max) { const value = await rawBody(req, max); return Buffer.isBuffer(value) ? value : Buffer.from(value || ""); }
async function rawBody(req, max) { if (req.body !== undefined) { const value = req.body; const size = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value)); if (size > max) throw new Error("Request body too large."); return value; } const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error("Request body too large."); chunks.push(chunk); } return Buffer.concat(chunks); }
function clean(value, max) { return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max); }
function withinRateLimit(ip) { const now = Date.now(), item = rateLimit.get(ip) || { since: now, count: 0 }; if (now - item.since > 600000) { item.since = now; item.count = 0; } item.count += 1; rateLimit.set(ip, item); return item.count <= 10; }
function publicUrl(base, key) { return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`; }
function signToken(payload) { const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url"), signature = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(encoded).digest("base64url"); return `${encoded}.${signature}`; }
function verifyToken(token) { const [encoded, signature] = token.split("."); if (!encoded || !signature) return null; const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(encoded).digest(), actual = Buffer.from(signature, "base64url"); if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null; try { const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); return claims.exp > Date.now() ? claims : null; } catch { return null; } }
function verifyPassword(password, stored) { const [salt, hash] = stored.split(":"), actual = crypto.scryptSync(password, salt, 64); return crypto.timingSafeEqual(actual, Buffer.from(hash, "hex")); }
function parseCookies(header) { return Object.fromEntries(header.split(";").map((item) => item.trim().split(/=(.*)/s)).filter(([key]) => key).map(([key, value]) => [key, decodeURIComponent(value || "")])); }
function secureCookie(req) { return process.env.VERCEL || req.headers["x-forwarded-proto"] === "https" ? " Secure;" : ""; }
function send(res, status, body) { if (res.writableEnded) return; res.statusCode = status; if (status === 204) return res.end(); res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.end(JSON.stringify(body)); }
