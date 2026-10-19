import "server-only";
import { NextResponse } from "next/server";
import { assertAdmin, AuthError, type SessionUser } from "./auth";

/** Wraps an admin route: checks the session and turns thrown errors into JSON responses */
export function adminRoute<C = unknown>(handler: (req: Request, user: SessionUser, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      // Admin requests always come from our own pages; this blocks cross-site form posts.
      const origin = req.headers.get("origin");
      if (req.method !== "GET" && origin && new URL(origin).host !== req.headers.get("host")) {
        return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
      }
      const user = await assertAdmin();
      const data = await handler(req, user, ctx);
      return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
      console.error("[admin api]", err);
      const message = err instanceof Error ? err.message : "Something went wrong.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  };
}
