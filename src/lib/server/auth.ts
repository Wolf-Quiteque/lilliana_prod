import "server-only";
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
  (await cookies()).delete(COOKIE);
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

/**
 * Checks a login. The very first login creates the account from ADMIN_EMAIL / ADMIN_PASSWORD;
 * after that the password lives (hashed) in the database and can be changed from the editor.
 */
export async function verifyLogin(email: string, password: string): Promise<UserDoc | null> {
  const db = await getDb();
  const users = col.users(db);
  const normalized = email.trim().toLowerCase();

  if ((await users.estimatedDocumentCount()) === 0) {
    const seedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const seedPassword = process.env.ADMIN_PASSWORD;
    if (seedEmail && seedPassword && seedPassword.length >= 10) {
      await users.updateOne(
        { email: seedEmail },
        { $setOnInsert: { email: seedEmail, passwordHash: await bcrypt.hash(seedPassword, 12), sessionVersion: 0, createdAt: new Date() } },
        { upsert: true },
      );
    }
  }

  const user = await users.findOne({ email: normalized });
  // Compare against a dummy hash when the user doesn't exist so timing doesn't reveal valid emails
  const ok = await bcrypt.compare(password, user?.passwordHash ?? "$2b$12$z3wZSbyb1ZZDNWD/NxMOH.wgqCpH79htjVWQ/60ED2Z3snfBOnsOO");
  if (!user || !ok) return null;
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return user;
}

export async function changeCredentials(userId: string, currentPassword: string, next: { email?: string; password?: string }) {
  const db = await getDb();
  const users = col.users(db);
  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) return { ok: false as const, error: "Your current password is not correct." };
  const $set: Partial<UserDoc> = {};
  if (next.email) $set.email = next.email.trim().toLowerCase();
  if (next.password) $set.passwordHash = await bcrypt.hash(next.password, 12);
  const updated = await users.findOneAndUpdate({ _id: user._id }, { $set, $inc: { sessionVersion: 1 } }, { returnDocument: "after" });
  if (updated) await createSession(updated);
  return { ok: true as const };
}
