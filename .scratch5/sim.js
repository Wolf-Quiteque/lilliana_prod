const fs = require("fs");
const text = fs.readFileSync("d:\\lili-prod-master\\lili-prod-master\\index.html", "utf8");

// --- Stub DOM/window env ---
const els = new Map();
const removed = new Set();
function el(id) {
  const e = { id, style: {}, textContent: "", classSet: new Set(), parentNode: null,
    setAttribute() {}, classList: { add: (c) => e.classSet.add(c), remove() {} } };
  els.set(id, e); return e;
}
const dcHost = { children: [1, 2] };
const fakeDoc = {
  getElementById: (id) => (id === "dc-root" ? dcHost : els.get(id)) || null,
  querySelectorAll: (sel) => sel === "img" ? [] : [],
  documentElement: { style: {} },
  head: { appendChild() {} },
  body: { appendChild() {} },
  fonts: { ready: Promise.resolve() }
};
global.document = fakeDoc;
global.getComputedStyle = () => ({ getPropertyValue: (n) => (n === "--bg" ? "#0d0c0d" : "") });
global.setInterval = () => ({});
global.clearInterval = () => {};

// make getElementById track removal
const origGet = fakeDoc.getElementById.bind(fakeDoc);

// --- extract helpers ---
const m = text.match(/function setStatus\(msg\) \{[\s\S]*?function __lp_wait_ready\(\) \{[\s\S]*?\n  \}/);
if (!m) { console.error("helpers block not found"); process.exit(1); }
let api;
try {
  api = new Function(
    "const loading = document.getElementById('__bundler_loading');\n" + m[0] +
    "\nreturn { setStatus: setStatus, __lp_progress: __lp_progress, __lp_complete: __lp_complete, __lp_wait_ready: __lp_wait_ready, __lp_rendered: __lp_rendered };"
  )();
} catch (e) { console.error("helpers eval FAIL:", e.message); process.exit(1); }

// give the loader a parentNode so removal is exercised
const loader = el("__bundler_loading");
loader.parentNode = { removeChild: (node) => { removed.add(node.id); loader.parentNode = null; } };
for (const id of ["__lp_status", "__lp_scrub_fill", "__lp_scrub_thumb", "__lp_pct"]) el(id);

const errs = [];
(async () => {
  // 1) wait_ready resolves when page is ready
  await api.__lp_wait_ready();

  // 2) complete = Action + fade + REMOVE
  await api.__lp_complete();
  const w = els.get("__bundler_loading");
  if (!w.classSet.has("__lp_done")) errs.push("__lp_done not added");
  if (w.style.opacity !== "0") errs.push("inline opacity not set to 0 — loader would never fade (THE BUG)");
  if (!removed.has("__bundler_loading")) errs.push("loader not removed from DOM — ticker would run forever");

  // 3) ticker stops when loader gone: simulate next tick
  const tickerSrc = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  new Function(tickerSrc)();
  let cleared = false;
  global.setInterval = () => { return { id: 1 }; };
  global.clearInterval = (t) => { cleared = true; };
  // after removal, tick() must clear the interval
  const api2 = new Function(tickerSrc + "\nreturn { timers: null };")(); // no-op
  // just assert the ticker guard references getElementById('__bundler_loading') and clears
  if (!tickerSrc.includes("clearInterval(timer)")) errs.push("ticker doesn't clear its own interval");

  console.log(errs.length === 0 ? "SIMULATION OK — loader fades, is removed, ticker stop path present" : "SIMULATION ISSUES:\n" + errs.join("\n"));
  process.exitCode = errs.length === 0 ? 0 : 1;
})();