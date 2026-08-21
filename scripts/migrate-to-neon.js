"use strict";

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const ROOT = path.resolve(__dirname, "..");
const env = { ...readEnv(path.join(ROOT, ".env")), ...readEnv(path.join(ROOT, ".env.local")), ...process.env };
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required in .env.local or the environment.");

const sql = neon(env.DATABASE_URL);
const defaultContent = require(path.join(ROOT, "data", "default-content.json"));

async function migrate() {
  await sql`CREATE TABLE IF NOT EXISTS site_content (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS submissions (id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, business TEXT NOT NULL DEFAULT '', package TEXT NOT NULL DEFAULT '', message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;

  const localContent = readJson(path.join(ROOT, "data", "content-home.json"), defaultContent);
  await sql`INSERT INTO site_content (key, data) VALUES ('home', ${JSON.stringify(localContent)}::jsonb) ON CONFLICT (key) DO NOTHING`;

  const localLeads = readJson(path.join(ROOT, "data", "submissions.json"), []);
  let migratedLeads = 0;
  for (const lead of localLeads) {
    if (!lead?.id || !lead.name || !lead.email || !lead.message) continue;
    const status = ["new", "contacted", "qualified", "won", "lost", "archived"].includes(lead.status) ? lead.status : "new";
    const createdAt = validDate(lead.createdAt) || new Date();
    const updatedAt = validDate(lead.updatedAt) || createdAt;
    const rows = await sql`INSERT INTO submissions (id, name, email, business, package, message, status, created_at, updated_at) VALUES (${lead.id}, ${String(lead.name)}, ${String(lead.email)}, ${String(lead.business || "")}, ${String(lead.package || "")}, ${String(lead.message)}, ${status}, ${createdAt.toISOString()}, ${updatedAt.toISOString()}) ON CONFLICT (id) DO NOTHING RETURNING id`;
    migratedLeads += rows.length;
  }
  const contentRows = await sql`SELECT key FROM site_content WHERE key = 'home'`;
  console.log(`Neon migration complete: ${contentRows.length} home content record ready; ${migratedLeads} local lead(s) migrated.`);
}

function readEnv(file) {
  try { return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; })); } catch { return {}; }
}
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } }
function validDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }

migrate().catch((error) => { console.error(error.message); process.exit(1); });
