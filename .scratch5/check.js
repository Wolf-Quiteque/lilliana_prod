const fs = require("fs");
const path = "d:\\lili-prod-master\\lili-prod-master\\index.html";
const text = fs.readFileSync(path, "utf8");

let failures = 0;
const check = (cond, msg) => { console.log((cond ? "PASS" : "FAIL") + "  " + msg); if (!cond) failures++; };
const count = (s, needle) => s.split(needle).length - 1;

// --- Template untouched & decodable ---
const tm = text.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
check(tm, "template script present");
if (tm) {
  const decoded = JSON.parse(tm[1].trim());
  check(typeof decoded === "string" && decoded.length === 55247, "template length 55247, got " + decoded.length);
  check(!decoded.includes("__lp_"), "template contains NO preloader refs");
  check(!tm[1].includes("</script>"), "no unescaped </script> in template JSON");
}

// --- The REGRESSION: inline opacity trap must be gone ---
check(count(text, "__lp_shellNode.style.opacity = '1'") === 0, "REGRESSION FIXED: no inline opacity '1' on re-attach");
check(count(text, "__lp_shellNode.style.opacity = ''") === 1, "re-attach clears inline opacity ('' ) instead");
check(count(text, "wrap.style.opacity = '0'") === 1, "__lp_complete sets inline opacity 0 (guaranteed fade)");
check(count(text, "parentNode.removeChild(wrap)") === 1, "__lp_complete removes loader node after fade");
check(count(text, "__lp_rescue.style.opacity = '0'") === 1, "error rescue also forces fade");

// --- Both shell scripts compile ---
const scripts = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
check(scripts.length === 2, "2 bare shell scripts, got " + scripts.length);
scripts.forEach((src, i) => {
  try { new Function(src); check(true, "script #" + (i + 1) + " compiles"); }
  catch (e) { check(false, "script #" + (i + 1) + " SYNTAX ERROR: " + e.message); }
});

// --- Flow integrity ---
check(count(text, "await __lp_wait_ready();") === 1, "wait_ready invoked once");
check(count(text, "await __lp_complete();") === 1, "complete invoked once");
check(count(text, "document.documentElement.replaceWith") === 1, "swap happens once");
const swapIdx = text.indexOf("document.documentElement.replaceWith");
const waitIdx = text.indexOf("await __lp_wait_ready();");
check(swapIdx !== -1 && waitIdx !== -1 && waitIdx > swapIdx, "wait_ready AFTER swap");

// --- Loader ids ---
for (const id of ["__bundler_loading", "__lp_status", "__lp_pct", "__lp_tc", "__lp_scrub_fill", "__lp_scrub_thumb"]) {
  check(count(text, 'id="' + id + '"') === 1, "id #" + id + " exactly once");
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : "\n" + failures + " CHECK(S) FAILED");
process.exitCode = failures === 0 ? 0 : 1;