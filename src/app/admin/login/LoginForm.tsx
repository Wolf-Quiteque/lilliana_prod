"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign-in failed.");
      window.location.href = "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <main className="ed-login">
      <form className="ed-login-card" onSubmit={submit}>
        <span className="ed-logo">LP</span>
        <h1>Edit your website</h1>
        <p>Sign in to change text, photos and videos on lillisproductions.com.</p>
        <label className="ed-field">
          <span className="ed-label">Email</span>
          <input className="ed-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="ed-field">
          <span className="ed-label">Password</span>
          <input className="ed-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="ed-error">{error}</p>}
        <button type="submit" className="ed-btn ed-btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <details className="ed-hint">
          <summary style={{ cursor: "pointer" }}>Forgot your password?</summary>
          <p style={{ marginTop: 8 }}>
            Ask whoever manages the website hosting to set a new <code>ADMIN_PASSWORD</code> in the Vercel project settings and redeploy. You can then sign in with that
            password, and change it to your own from Account.
          </p>
        </details>
      </form>
    </main>
  );
}
