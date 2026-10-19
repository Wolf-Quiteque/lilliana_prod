import { adminRoute } from "@/lib/server/api";
import { changeCredentials } from "@/lib/server/auth";

export const GET = adminRoute(async (_req, user) => ({ email: user.email }));

export const POST = adminRoute(async (req, user) => {
  const body = (await req.json()) as { currentPassword?: string; email?: string; password?: string };
  if (typeof body.currentPassword !== "string" || !body.currentPassword) throw new Error("Enter your current password.");
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined;
  const password = typeof body.password === "string" && body.password ? body.password : undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right.");
  if (password && password.length < 10) throw new Error("Use at least 10 characters for the new password.");
  if (password && password.length > 200) throw new Error("That password is too long.");
  if (!email && !password) throw new Error("Nothing to change.");
  const result = await changeCredentials(user.id, body.currentPassword, { email, password });
  if (!result.ok) throw new Error(result.error);
  return { ok: true };
});
