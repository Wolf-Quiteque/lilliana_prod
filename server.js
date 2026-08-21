"use strict";

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const HOME_FILE = path.join(DATA_DIR, "content-home.json");
const DEFAULT_HOME_FILE = path.join(DATA_DIR, "default-content.json");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const env = { ...loadEnv(path.join(ROOT, ".env")), ...loadEnv(path.join(ROOT, ".env.local")) };
Object.assign(process.env, env);
const vercelApi = process.env.DATABASE_URL ? require("./api/[...route].js") : null;
const PORT = Number(env.PORT || process.env.PORT || 3000);
const ADMIN_EMAIL = env.ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const AUTH_SECRET = env.AUTH_SECRET || process.env.AUTH_SECRET;
const RATE_LIMIT = new Map();
const R2 = getR2Config(env, process.env);
const r2Client = R2.enabled ? new S3Client({ region: "auto", endpoint: R2.endpoint, credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey } }) : null;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !AUTH_SECRET || AUTH_SECRET.length < 32) {
  console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD, and an AUTH_SECRET of at least 32 characters in .env.");
  process.exit(1);
}

const admin = {
  email: ADMIN_EMAIL.trim().toLowerCase(),
  passwordHash: hashPassword(ADMIN_PASSWORD)
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".mp4": "video/mp4",
  ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"
};

async function main() {
  if (!vercelApi) await ensureData();
  http.createServer(route).listen(PORT, () => {
    console.log(`Lillis Productions is running at http://localhost:${PORT}`);
  });
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (vercelApi && url.pathname.startsWith("/api/")) return await vercelApi(req, res);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Unexpected server error." });
  }
}

async function api(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { ok: true });
  if (req.method === "POST" && url.pathname === "/api/auth/login") return login(req, res);
  if (req.method === "POST" && url.pathname === "/api/auth/logout") return logout(res);
  if (req.method === "GET" && url.pathname === "/api/auth/me") return requireAdmin(req, res, () => sendJson(res, 200, { email: admin.email }));
  if (req.method === "GET" && url.pathname === "/api/content/home") return sendJson(res, 200, await readJson(HOME_FILE));
  if (req.method === "PUT" && url.pathname === "/api/content/home") {
    return requireAdmin(req, res, async () => {
      const content = await readBody(req);
      const validation = validateContent(content);
      if (validation) return sendJson(res, 400, { error: validation });
      await writeJson(HOME_FILE, content);
      sendJson(res, 200, content);
    });
  }
  if (req.method === "POST" && url.pathname === "/api/submissions") return createSubmission(req, res);
  if (req.method === "GET" && url.pathname === "/api/media") return requireAdmin(req, res, () => listMedia(res));
  if (req.method === "POST" && url.pathname === "/api/media") return requireAdmin(req, res, () => uploadMedia(req, res));
  const mediaMatch = url.pathname.match(/^\/api\/media\/(.+)$/);
  if (req.method === "DELETE" && mediaMatch) return requireAdmin(req, res, () => deleteMedia(res, mediaMatch[1]));
  if (req.method === "GET" && url.pathname === "/api/submissions") {
    return requireAdmin(req, res, async () => sendJson(res, 200, await readJson(SUBMISSIONS_FILE, [])));
  }
  const statusMatch = url.pathname.match(/^\/api\/submissions\/([a-f0-9-]+)$/i);
  if (req.method === "PATCH" && statusMatch) {
    return requireAdmin(req, res, async () => {
      const update = await readBody(req);
      const allowed = ["new", "contacted", "qualified", "won", "lost", "archived"];
      if (!allowed.includes(update.status)) return sendJson(res, 400, { error: "Invalid lead status." });
      const leads = await readJson(SUBMISSIONS_FILE, []);
      const lead = leads.find((item) => item.id === statusMatch[1]);
      if (!lead) return sendJson(res, 404, { error: "Lead not found." });
      lead.status = update.status;
      lead.updatedAt = new Date().toISOString();
      await writeJson(SUBMISSIONS_FILE, leads);
      sendJson(res, 200, lead);
    });
  }
  sendJson(res, 404, { error: "Not found." });
}

async function login(req, res) {
  const body = await readBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  if (email !== admin.email || !verifyPassword(String(body.password || ""), admin.passwordHash)) {
    return sendJson(res, 401, { error: "Invalid email or password." });
  }
  const token = signToken({ sub: admin.email, exp: Date.now() + 12 * 60 * 60 * 1000 });
  res.setHeader("Set-Cookie", `lp_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`);
  sendJson(res, 200, { email: admin.email });
}

function logout(res) {
  res.setHeader("Set-Cookie", "lp_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  sendJson(res, 204);
}

async function createSubmission(req, res) {
  const ip = req.socket.remoteAddress || "unknown";
  if (!takeRateLimit(ip)) return sendJson(res, 429, { error: "Please wait before submitting again." });
  const body = await readBody(req);
  if (String(body.website || "").trim()) return sendJson(res, 202, { ok: true });
  const name = clean(body.name, 100);
  const email = clean(body.email, 160).toLowerCase();
  const business = clean(body.business, 160);
  const selectedPackage = clean(body.package, 100);
  const message = clean(body.message, 4000);
  if (!name || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: "Please provide your name, a valid email, and a message." });
  }
  const leads = await readJson(SUBMISSIONS_FILE, []);
  const now = new Date().toISOString();
  const lead = { id: crypto.randomUUID(), name, email, business, package: selectedPackage, message, status: "new", createdAt: now, updatedAt: now };
  leads.unshift(lead);
  await writeJson(SUBMISSIONS_FILE, leads);
  sendJson(res, 201, { ok: true });
}

async function listMedia(res) {
  if (!R2.enabled) return sendJson(res, 503, { error: "R2 is not configured. Add the R2 variables to .env.local and restart the server." });
  const result = await r2Client.send(new ListObjectsV2Command({ Bucket: R2.bucket, Prefix: "uploads/", MaxKeys: 1000 }));
  const items = (result.Contents || []).filter((object) => object.Key).sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified)).map((object) => ({ key: object.Key, url: `${R2.publicBaseUrl}/${object.Key.split("/").map(encodeURIComponent).join("/")}`, size: object.Size || 0, updatedAt: object.LastModified ? object.LastModified.toISOString() : null }));
  sendJson(res, 200, { items });
}

async function uploadMedia(req, res) {
  if (!R2.enabled) return sendJson(res, 503, { error: "R2 is not configured. Add the R2 variables to .env.local and restart the server." });
  const type = String(req.headers["content-type"] || "").split(";", 1)[0].toLowerCase();
  const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
  if (!extensions[type]) return sendJson(res, 415, { error: "Use a JPG, PNG, WebP, or GIF image." });
  const bytes = await readBuffer(req, 10 * 1024 * 1024);
  if (!bytes.length) return sendJson(res, 400, { error: "Choose an image to upload." });
  const key = `uploads/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}${extensions[type]}`;
  await r2Client.send(new PutObjectCommand({ Bucket: R2.bucket, Key: key, Body: bytes, ContentType: type, CacheControl: "public, max-age=31536000, immutable" }));
  sendJson(res, 201, { key, url: `${R2.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`, size: bytes.length, updatedAt: new Date().toISOString() });
}

async function deleteMedia(res, encodedKey) {
  if (!R2.enabled) return sendJson(res, 503, { error: "R2 is not configured. Add the R2 variables to .env.local and restart the server." });
  let key;
  try { key = decodeURIComponent(encodedKey); } catch { return sendJson(res, 400, { error: "Invalid media key." }); }
  if (!key.startsWith("uploads/") || key.includes("..") || key.length > 512) return sendJson(res, 400, { error: "That media item cannot be deleted." });
  await r2Client.send(new DeleteObjectCommand({ Bucket: R2.bucket, Key: key }));
  sendJson(res, 204);
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.lp_admin;
  const claims = token && verifyToken(token);
  if (!claims || claims.sub !== admin.email) return sendJson(res, 401, { error: "Sign in required." });
  return next();
}

async function serveStatic(req, res, requestPath) {
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Method not allowed." });
  const pathname = requestPath === "/" ? "/index.html" : requestPath === "/admin" ? "/admin/" : requestPath;
  const file = pathname === "/admin/" ? path.join(ROOT, "admin", "index.html") : path.resolve(ROOT, `.${pathname}`);
  const allowed = file === path.join(ROOT, "index.html") || file === path.join(ROOT, "support.js") || file.startsWith(path.join(ROOT, "assets") + path.sep) || file.startsWith(path.join(ROOT, "admin") + path.sep) || file.startsWith(path.join(ROOT, "public") + path.sep);
  if (!allowed || !file.startsWith(ROOT + path.sep)) return sendJson(res, 404, { error: "Not found." });
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error("Not a file");
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=3600", "X-Content-Type-Options": "nosniff" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

function validateContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "Content must be an object.";
  for (const key of ["services", "gallery", "packages", "quotes"]) {
    if (!Array.isArray(content[key])) return `Content is missing ${key}.`;
    if (content[key].length > 20) return `${key} has too many items.`;
  }
  return null;
}

async function ensureData() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try { await fsp.access(HOME_FILE); } catch { await fsp.copyFile(DEFAULT_HOME_FILE, HOME_FILE); }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 512 * 1024) throw new Error("Request body too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw new Error("Invalid JSON body."); }
}

async function readBuffer(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Upload is larger than 10 MB.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, "utf8")); } catch (error) { if (fallback !== undefined && error.code === "ENOENT") return fallback; throw error; }
}

async function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fsp.rename(temporary, file);
}

function sendJson(res, status, body) {
  if (res.writableEnded) return;
  if (status === 204) return res.writeHead(status).end();
  const output = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(output);
}

function clean(value, max) { return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max); }
function takeRateLimit(ip) {
  const now = Date.now(); const record = RATE_LIMIT.get(ip) || { since: now, count: 0 };
  if (now - record.since > 10 * 60 * 1000) { record.since = now; record.count = 0; }
  record.count += 1; RATE_LIMIT.set(ip, record);
  return record.count <= 10;
}
function hashPassword(password) { const salt = crypto.randomBytes(16).toString("hex"); return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`; }
function verifyPassword(password, stored) { const [salt, hash] = stored.split(":"); const actual = crypto.scryptSync(password, salt, 64); return crypto.timingSafeEqual(actual, Buffer.from(hash, "hex")); }
function signToken(payload) { const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url"); const signature = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url"); return `${encoded}.${signature}`; }
function verifyToken(token) {
  const [encoded, signature] = token.split("."); if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest(); const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try { const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); return payload.exp > Date.now() ? payload : null; } catch { return null; }
}
function parseCookies(header) { return Object.fromEntries(header.split(";").map((item) => item.trim().split(/=(.*)/s)).filter(([key]) => key).map(([key, value]) => [key, decodeURIComponent(value || "")])); }
function loadEnv(file) {
  try { return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; })); } catch { return {}; }
}
function getR2Config(fileEnv, processEnv) {
  const value = (...names) => names.map((name) => fileEnv[name] || processEnv[name]).find((item) => item && String(item).trim());
  const accountId = value("R2_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID");
  const endpoint = value("R2_ENDPOINT", "S3_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const bucket = value("R2_BUCKET_NAME", "R2_BUCKET");
  const accessKeyId = value("R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = value("R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  const publicBaseUrl = String(value("R2_PUBLIC_BASE_URL", "R2_PUBLIC_URL", "R2_BUCKET_PUBLIC_URL") || "").replace(/\/+$/, "");
  return { enabled: Boolean(endpoint && bucket && accessKeyId && secretAccessKey && publicBaseUrl), endpoint, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
}

// Vercel serves `api/[...route].js` as request-scoped functions. This local
// development server must never start there: Vercel's deployed filesystem is
// read-only and persistent state belongs in Neon instead.
if (!process.env.VERCEL) main();
