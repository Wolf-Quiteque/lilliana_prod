import { NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/content";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    }
    if (!(await rateLimit(`login:${clientIp(req)}`, 8, 15 * 60))) {
      return NextResponse.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });
    }
    const user = await verifyLogin(email.slice(0, 200), password.slice(0, 200));
    if (!user) return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
    await createSession(user);
    await ensureSeeded();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json({ error: "Sign-in is unavailable right now. Please try again shortly." }, { status: 500 });
  }
}
