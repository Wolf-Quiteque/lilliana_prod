import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { col, getDb, type UserDoc } from "./db";

// In production the __Host- prefix forces the cookie to be Secure, host-only and Path=/.
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-lilli_admin" : "lilli_admin";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days
const ISSUER = "lillis-productions";

export type SessionUser = { id: string; email: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or shorter than 32 characters");
  return new TextEncoder().encode(s);
}

export async function createSession(user: Pick<UserDoc, "_id" | "sessionVersion">) {
  const token = await new SignJWT({ sv: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(user._id.toHexString())
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  // Must repeat Secure/Path: browsers ignore any change to a __Host- cookie without them,
  // so a plain delete() would leave the visitor signed in.
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, algorithms: ["HS256"] });
    if (!payload.sub || !ObjectId.isValid(payload.sub)) return null;
    const user = await col.users(await getDb()).findOne({ _id: new ObjectId(payload.sub) });
    if (!user || user.sessionVersion !== payload.sv) return null;
    return { id: user._id.toHexString(), email: user.email };
  } catch {
    return null;
  }
}

/** For admin pages: sends visitors without a session to the login screen */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

export class AuthError extends Error {}

/** For admin API routes */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Please sign in again.");
  return user;
}

const DUMMY_HASH = "$2b$12$z3wZSbyb1ZZDNWD/NxMOH.wgqCpH79htjVWQ/60ED2Z3snfBOnsOO";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Fingerprint of the ADMIN_EMAIL / ADMIN_PASSWORD pair, so we can tell when someone sets a new one */
function envFingerprint(email: string, password: string) {
  return createHmac("sha256", secret()).update(`${email}\n${password}`).digest("hex");
}

/**
 * Checks a login.
 * - The very first login creates the account from ADMIN_EMAIL / ADMIN_PASSWORD.
 * - After that the password lives (hashed) in the database and is changed from the editor.
 * - Setting a NEW ADMIN_PASSWORD (in .env or on Vercel) works as a reset: the next sign-in with it
 *   replaces the stored password and signs out every other session. The old value never resets
 *   anything, so a password changed in the editor stays in force.
 */
export async function verifyLogin(email: string, password: string): Promise<UserDoc | null> {
  const db = await getDb();
  const users = col.users(db);
  const meta = col.meta(db);
  const normalized = email.trim().toLowerCase();
  const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const envPassword = process.env.ADMIN_PASSWORD;

  if (envEmail && envPassword && envPassword.length >= 10) {
    const fp = envFingerprint(envEmail, envPassword);
    const known = await meta.findOne({ _id: "admin-env" });
    const isEnvLogin = normalized === envEmail && timingSafeEqual(sha256(password), sha256(envPassword));
    const firstAccount = (await users.estimatedDocumentCount()) === 0;

    if (firstAccount || (known && known.fingerprint !== fp && isEnvLogin)) {
      await users.updateOne(
        { email: envEmail },
        {
          $set: { passwordHash: await bcrypt.hash(envPassword, 12) },
          $inc: { sessionVersion: 1 },
          $setOnInsert: { email: envEmail, createdAt: new Date() },
        },
        { upsert: true },
      );
    }
    if (!known || known.fingerprint !== fp) {
      // First run of this check just remembers the current value without changing anything
      if (!known || isEnvLogin || firstAccount) await meta.updateOne({ _id: "admin-env" }, { $set: { fingerprint: fp, at: new Date() } }, { upsert: true });
    }
  }

  const user = await users.findOne({ email: normalized });
  // Compare against a dummy hash when the user doesn't exist so timing doesn't reveal valid emails
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return user;
}

export async function changeCredentials(userId: string, currentPassword: string, next: { email?: string; password?: string }) {
  const db = await getDb();
  const users = col.users(db);
  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) return { ok: false as const, error: "Your current password is not correct." };
  if (next.password && (await bcrypt.compare(next.password, user.passwordHash))) {
    return { ok: false as const, error: "The new password is the same as the current one." };
  }
  const $set: Partial<UserDoc> = {};
  if (next.email) $set.email = next.email.trim().toLowerCase();
  if (next.password) $set.passwordHash = await bcrypt.hash(next.password, 12);
  try {
    // Bumping the version signs out every other browser; this one gets a fresh session below
    const updated = await users.findOneAndUpdate({ _id: user._id }, { $set, $inc: { sessionVersion: 1 } }, { returnDocument: "after" });
    if (updated) await createSession(updated);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { ok: false as const, error: "Another account already uses that email." };
    throw err;
  }
  return { ok: true as const };
}
