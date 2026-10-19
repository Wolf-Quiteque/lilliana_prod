import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0d0c0d", color: "#f6f3f2", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
      <div>
        <p style={{ letterSpacing: ".22em", textTransform: "uppercase", fontSize: 12, color: "#e13b82" }}>404</p>
        <h1 style={{ margin: "8px 0 18px", fontSize: 32 }}>This page doesn&apos;t exist.</h1>
        <Link href="/" style={{ color: "#fff", background: "#e13b82", padding: "12px 22px", borderRadius: 999, textDecoration: "none" }}>
          Back to Lillis Productions
        </Link>
      </div>
    </main>
  );
}
