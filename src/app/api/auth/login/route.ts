import { NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/content";
import { clientIp, isLimited, rateLimit } from "@/lib/server/ratelimit";

const MAX_FAILURES = 8;
const WINDOW = 15 * 60;

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    }
    // Only failed attempts count, so signing in and out normally never locks anyone out
    const key = `login:${clientIp(req)}`;
    if (await isLimited(key, MAX_FAILURES)) {
      return NextResponse.json({ error: "Too many wrong attempts. Wait 15 minutes and try again." }, { status: 429 });
    }
    const user = await verifyLogin(email.slice(0, 200), password.slice(0, 200));
    if (!user) {
      await rateLimit(key, MAX_FAILURES, WINDOW);
      return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
    }
    await createSession(user);
    await ensureSeeded();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json({ error: "Sign-in is unavailable right now. Please try again shortly." }, { status: 500 });
  }
}
