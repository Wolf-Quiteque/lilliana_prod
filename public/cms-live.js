"use strict";

(() => {
  const API = "/api";
  const SKIP = "#lillis-live-editor, #lillis-live-control, #lillis-live-modal";
  let content = null;
  let editing = false;
  let active = null;
  let observerTimer;

  const css = `
    .lillis-live-editable { outline: 1px dashed rgba(225,59,130,.68); outline-offset: 3px; cursor: pointer; }
    #lillis-live-editor { position:fixed;right:18px;bottom:18px;z-index:2147483645;border:0;border-radius:999px;padding:12px 16px;background:#e13b82;color:#fff;font:700 14px/1 Manrope,Arial,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.3);cursor:pointer; }
    #lillis-live-control { position:fixed;z-index:2147483646;display:none;border:0;border-radius:999px;padding:8px 11px;background:#171517;color:#fff;font:700 13px/1 Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer; }
    #lillis-live-modal { position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.64); }
    #lillis-live-modal.open { display:flex; }
    #lillis-live-modal .card { width:min(540px,100%);padding:22px;border-radius:16px;background:#171517;color:#f6f3f2;font:15px/1.45 Manrope,Arial,sans-serif;box-shadow:0 28px 70px rgba(0,0,0,.5); }
    #lillis-live-modal h2 { margin:0 0 12px;font-size:21px; } #lillis-live-modal textarea,#lillis-live-modal input { width:100%;box-sizing:border-box;margin:8px 0 16px;padding:11px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:#0d0c0d;color:#fff;font:inherit; }
    #lillis-live-modal textarea { min-height:160px;resize:vertical; } #lillis-live-modal .actions { display:flex;justify-content:flex-end;gap:9px; } #lillis-live-modal button { border:0;border-radius:999px;padding:10px 14px;font:700 14px/1 Arial,sans-serif;cursor:pointer; } #lillis-live-modal .cancel { background:transparent;color:#ddd;border:1px solid rgba(255,255,255,.22); } #lillis-live-modal .save { background:#e13b82;color:#fff; }
  `;

  document.addEventListener("DOMContentLoaded", boot);
  async function boot() {
    injectUi();
    content = await getContent();
    apply();
    observe();
    const user = await fetch(`${API}/auth/me`).then((response) => response.ok ? response.json() : null).catch(() => null);
    if (user) enableEditor();
  }

  async function getContent() { return fetch(`${API}/content/home`).then((response) => response.ok ? response.json() : null).catch(() => null); }
  function injectUi() {
    document.head.append(Object.assign(document.createElement("style"), { textContent: css }));
    const toggle = Object.assign(document.createElement("button"), { id: "lillis-live-editor", type: "button", textContent: "Edit live" });
    const control = Object.assign(document.createElement("button"), { id: "lillis-live-control", type: "button" });
    const modal = document.createElement("div"); modal.id = "lillis-live-modal";
    document.body.append(toggle, control, modal);
    toggle.hidden = true;
    toggle.addEventListener("click", () => setEditing(!editing));
    control.addEventListener("click", () => active && openModal(active));
    modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  }
  function enableEditor() { document.querySelector("#lillis-live-editor").hidden = false; if (new URLSearchParams(location.search).get("edit") === "1") setEditing(true); }
  function setEditing(next) {
    editing = next;
    document.querySelector("#lillis-live-editor").textContent = next ? "Done editing" : "Edit live";
    document.body.classList.toggle("lillis-live-editing", next);
    apply();
    if (!next) hideControl();
  }
  function apply() {
    if (!content) return;
    content.site ||= { text: {}, images: {} };
    content.site.text ||= {}; content.site.images ||= {};
    for (const element of editableText()) {
      const key = nodeKey(element, "text"); element.dataset.lillisTextKey = key;
      if (content.site.text[key] !== undefined) element.textContent = content.site.text[key];
      element.classList.toggle("lillis-live-editable", editing);
    }
    for (const image of editableImages()) {
      const key = nodeKey(image, "image"); image.dataset.lillisImageKey = key;
      if (content.site.images[key]) image.src = content.site.images[key];
      image.classList.toggle("lillis-live-editable", editing);
    }
  }
  function editableText() {
    return [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,figcaption")].filter((element) => !element.closest(SKIP) && element.children.length === 0 && element.textContent.trim().length > 0 && !element.matches("script,style"));
  }
  function editableImages() { return [...document.images].filter((image) => !image.closest(SKIP)); }
  function nodeKey(element, type) {
    const parts = []; let node = element;
    while (node && node !== document.body) { const parent = node.parentElement; if (!parent) break; const siblings = [...parent.children].filter((item) => item.tagName === node.tagName); parts.unshift(`${node.tagName.toLowerCase()}${siblings.indexOf(node)}`); node = parent; }
    return `${type}:${parts.join("/")}`;
  }
  function observe() {
    new MutationObserver(() => { clearTimeout(observerTimer); observerTimer = setTimeout(apply, 80); }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("mousemove", (event) => {
      if (!editing || document.querySelector("#lillis-live-modal").classList.contains("open")) return;
      const target = event.target.closest("[data-lillis-text-key],[data-lillis-image-key]");
      if (!target || target.closest(SKIP)) return hideControl();
      active = target; const control = document.querySelector("#lillis-live-control");
      control.textContent = target.dataset.lillisImageKey ? "📷 Change image" : "✎ Edit text";
      control.style.left = `${Math.min(window.innerWidth - 150, event.clientX + 12)}px`; control.style.top = `${Math.min(window.innerHeight - 42, event.clientY + 12)}px`; control.style.display = "block";
    });
  }
  function hideControl() { document.querySelector("#lillis-live-control").style.display = "none"; active = null; }
  function openModal(target) {
    const modal = document.querySelector("#lillis-live-modal"); const imageKey = target.dataset.lillisImageKey; const textKey = target.dataset.lillisTextKey;
    modal.innerHTML = imageKey ? `<div class="card"><h2>Change image</h2><p>Images are resized and converted to WebP before upload.</p><input id="lillis-file" type="file" accept="image/*"><div class="actions"><button class="cancel" type="button">Cancel</button><button class="save" type="button">Upload and use image</button></div></div>` : `<div class="card"><h2>Edit text</h2><textarea id="lillis-text">${escapeHtml(target.textContent)}</textarea><div class="actions"><button class="cancel" type="button">Cancel</button><button class="save" type="button">Save text</button></div></div>`;
    modal.classList.add("open"); modal.querySelector(".cancel").addEventListener("click", closeModal); modal.querySelector(".save").addEventListener("click", async () => {
      try { if (imageKey) await saveImage(imageKey); else await saveText(textKey); closeModal(); } catch (error) { alert(error.message || "Could not save this change."); }
    });
  }
  function closeModal() { document.querySelector("#lillis-live-modal").classList.remove("open"); hideControl(); }
  async function saveText(key) { content.site.text[key] = document.querySelector("#lillis-text").value.trim(); await saveContent(); apply(); }
  async function saveImage(key) {
    const file = document.querySelector("#lillis-file").files[0]; if (!file) throw new Error("Choose an image first.");
    const webp = await window.LillisImages.toWebp(file); const response = await fetch(`${API}/media`, { method: "POST", headers: { "Content-Type": "image/webp" }, body: webp }); const media = await response.json().catch(() => ({})); if (!response.ok) throw new Error(media.error || "Image upload failed.");
    content.site.images[key] = media.url; await saveContent(); apply();
  }
  async function saveContent() { const response = await fetch(`${API}/content/home`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(content) }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Save failed."); } content = await response.json(); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char])); }
})();
