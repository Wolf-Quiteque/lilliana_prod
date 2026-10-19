"use client";

import { useEffect, useState } from "react";
import type { SiteContent } from "@/lib/content/types";
import { api } from "./media";

type Revision = { id: string; publishedAt: string; publishedBy: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function VersionsPanel({ onRestore }: { onRestore: (content: SiteContent, msg: string) => void }) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ revisions: Revision[] }>("/api/admin/revisions")
      .then((d) => setRevisions(d.revisions))
      .catch((e) => setError(e.message));
  }, []);

  const restore = async (r: Revision) => {
    if (!window.confirm(`Load the version published ${when(r.publishedAt)} into the editor? Your current draft will be replaced (you can still undo).`)) return;
    setBusy(true);
    try {
      const d = await api<{ content: SiteContent }>(`/api/admin/revisions/${r.id}`, { method: "POST" });
      onRestore(d.content, "Version loaded. Press Publish to put it live.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!window.confirm("Throw away all unpublished changes and go back to what's live now?")) return;
    setBusy(true);
    try {
      const d = await api<{ content: SiteContent }>("/api/admin/discard", { method: "POST" });
      onRestore(d.content, "Unpublished changes discarded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ed-stack">
      <p className="ed-hint">Every time you publish, a copy is kept here. Load an older one if you change your mind.</p>
      <button type="button" className="ed-btn" onClick={discard} disabled={busy}>
        Discard unpublished changes
      </button>
      {error && <p className="ed-error">{error}</p>}
      {revisions === null ? (
        <p className="ed-hint">Loading…</p>
      ) : revisions.length === 0 ? (
        <p className="ed-empty">No published versions yet.</p>
      ) : (
        revisions.map((r, i) => (
          <div key={r.id} className="ed-version">
            <div>
              <strong>{i === 0 ? "Live now" : when(r.publishedAt)}</strong>
              <span>{i === 0 ? when(r.publishedAt) : r.publishedBy}</span>
            </div>
            <button type="button" className="ed-btn ed-btn-quiet" disabled={busy} onClick={() => restore(r)}>
              Load
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export function AccountPanel({ email }: { email: string }) {
  const [currentEmail, setCurrentEmail] = useState(email);
  return (
    <div className="ed-stack">
      <p className="ed-hint">
        Signed in as <strong>{currentEmail}</strong>
      </p>
      <PasswordForm />
      <EmailForm onChanged={setCurrentEmail} />
      <button
        type="button"
        className="ed-btn"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/admin/login";
        }}
      >
        Sign out
      </button>
      <p className="ed-hint">
        Forgot the password? Whoever manages the hosting can set a new <code>ADMIN_PASSWORD</code> on Vercel and redeploy. The first sign-in with that new password replaces the old one.
      </p>
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 10) return setMsg({ ok: false, text: "Use at least 10 characters." });
    if (next !== confirm) return setMsg({ ok: false, text: "The two new passwords don't match." });
    setBusy(true);
    try {
      await api("/api/admin/account", { method: "POST", json: { currentPassword: current, password: next } });
      setMsg({ ok: true, text: "Password changed. Other devices have been signed out." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <form className="ed-card" onSubmit={submit} id="change-password">
      <div className="ed-group-title">Change password</div>
      <label className="ed-field">
        <span className="ed-label">Current password</span>
        <input className="ed-input" type={type} required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </label>
      <label className="ed-field">
        <span className="ed-label">New password</span>
        <input className="ed-input" type={type} required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <span className="ed-hint">At least 10 characters. A few random words work well.</span>
      </label>
      <label className="ed-field">
        <span className="ed-label">New password again</span>
        <input className="ed-input" type={type} required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        {mismatch && <span className="ed-error">Doesn&apos;t match yet.</span>}
      </label>
      <label className="ed-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
      </label>
      <button type="submit" className="ed-btn ed-btn-primary" disabled={busy || !current || !next || mismatch}>
        {busy ? "Saving…" : "Change password"}
      </button>
      {msg && <p className={msg.ok ? "ed-ok" : "ed-error"}>{msg.text}</p>}
    </form>
  );
}

function EmailForm({ onChanged }: { onChanged: (email: string) => void }) {
  const [newEmail, setNewEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/account", { method: "POST", json: { currentPassword: current, email: newEmail } });
      onChanged(newEmail.trim().toLowerCase());
      setMsg({ ok: true, text: "Saved. Use the new email next time you sign in." });
      setNewEmail("");
      setCurrent("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="ed-card">
      <summary className="ed-group-title" style={{ cursor: "pointer" }}>
        Change sign-in email
      </summary>
      <form className="ed-stack" onSubmit={submit}>
        <label className="ed-field">
          <span className="ed-label">New email</span>
          <input className="ed-input" type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="ed-field">
          <span className="ed-label">Current password</span>
          <input className="ed-input" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <button type="submit" className="ed-btn ed-btn-primary" disabled={busy}>
          Save email
        </button>
        {msg && <p className={msg.ok ? "ed-ok" : "ed-error"}>{msg.text}</p>}
      </form>
    </details>
  );
}
