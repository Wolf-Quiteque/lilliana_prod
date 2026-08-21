"use strict";

const app = document.getElementById("app");
const state = { user: null, tab: "content", content: null, leads: [], media: [], message: "", error: "" };
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type":"application/json", ...(options.headers || {}) } });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

function render() {
  app.innerHTML = state.user ? dashboard() : loginView();
  bind();
}

function loginView() {
  return `<section class="login"><p class="eyebrow">Lillis Productions</p><h1>Admin sign in</h1><p class="muted">Manage the public collections and incoming inquiries.</p><form id="login-form" class="stack"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button class="button" type="submit">Sign in</button></form>${notice()}</section>`;
}

function dashboard() {
  const view = state.tab === "content" ? contentView() : state.tab === "media" ? mediaView() : leadsView();
  return `<div class="shell"><header class="topbar"><div><p class="eyebrow">Lillis Productions</p><h1>Studio control room</h1><span class="muted">Signed in as ${esc(state.user.email)}</span></div><div class="header-actions"><a class="button" href="/?edit=1" target="_blank" rel="noopener">Open live editor ↗</a><button id="logout" class="button secondary">Sign out</button></div></header><nav class="nav"><button data-tab="content" class="${state.tab === "content" ? "active" : ""}">Site content</button><button data-tab="media" class="${state.tab === "media" ? "active" : ""}">Media library</button><button data-tab="leads" class="${state.tab === "leads" ? "active" : ""}">Leads${state.leads.filter((lead) => lead.status === "new").length ? ` (${state.leads.filter((lead) => lead.status === "new").length})` : ""}</button></nav>${view}${notice()}</div>`;
}

function notice() { return `<p class="notice ${state.error ? "error" : ""}">${esc(state.error || state.message)}</p>`; }
function contentView() {
  if (!state.content) return `<section class="panel"><p class="empty">Loading content…</p></section>`;
  return `<div class="stack"><section class="panel"><div class="section-head"><div><h2>Services</h2><p class="muted">The six service cards on the home page.</p></div><button class="button secondary small" data-add="services">Add service</button></div><div class="collection">${state.content.services.map((item,index) => serviceEditor(item,index)).join("")}</div></section><section class="panel"><div class="section-head"><div><h2>Portfolio</h2><p class="muted">Paths are relative to the website root, for example <code>assets/photo.png</code>.</p></div><button class="button secondary small" data-add="gallery">Add work item</button></div><div class="collection">${state.content.gallery.map((item,index) => galleryEditor(item,index)).join("")}</div></section><section class="panel"><div class="section-head"><div><h2>Packages</h2><p class="muted">Pricing cards and included items.</p></div><button class="button secondary small" data-add="packages">Add package</button></div><div class="collection">${state.content.packages.map((item,index) => packageEditor(item,index)).join("")}</div></section><section class="panel"><div class="section-head"><div><h2>Testimonials</h2><p class="muted">The rotating client quotes.</p></div><button class="button secondary small" data-add="quotes">Add testimonial</button></div><div class="collection">${state.content.quotes.map((item,index) => quoteEditor(item,index)).join("")}</div></section><button id="save-content" class="button">Publish changes</button></div>`;
}
function field(collection, index, key, label, value, multiline = false) { return `<label>${label}${multiline ? `<textarea data-field="${collection}" data-index="${index}" data-key="${key}">${esc(value)}</textarea>` : `<input data-field="${collection}" data-index="${index}" data-key="${key}" value="${esc(value)}">`}</label>`; }
function removeButton(collection,index) { return `<div class="item-actions"><button class="button secondary danger small" data-remove="${collection}" data-index="${index}">Remove</button></div>`; }
function serviceEditor(item,index) { return `<article class="item"><div class="grid"><div>${field("services",index,"num","Number",item.num)}</div><div style="grid-column:span 2">${field("services",index,"title","Title",item.title)}</div></div>${field("services",index,"body","Description",item.body,true)}${removeButton("services",index)}</article>`; }
function galleryEditor(item,index) { return `<article class="item"><div class="grid">${field("gallery",index,"label","Label",item.label)}${field("gallery",index,"image","Image path",item.image)}${field("gallery",index,"alt","Alt text",item.alt,true)}</div>${removeButton("gallery",index)}</article>`; }
function packageEditor(item,index) { return `<article class="item"><div class="grid">${field("packages",index,"name","Name",item.name)}${field("packages",index,"tag","Badge",item.tag)}${field("packages",index,"price","Price",item.price)}${field("packages",index,"cta","CTA label",item.cta)}</div><label>Included items<textarea data-items="packages" data-index="${index}">${esc((item.items || []).join("\n"))}</textarea></label>${removeButton("packages",index)}</article>`; }
function quoteEditor(item,index) { return `<article class="item">${field("quotes",index,"text","Quote",item.text,true)}<div class="grid two">${field("quotes",index,"name","Name",item.name)}${field("quotes",index,"role","Role",item.role)}</div>${removeButton("quotes",index)}</article>`; }
function mediaView() {
  return `<section class="panel"><div class="section-head"><div><h2>R2 media library</h2><p class="muted">Upload images to Cloudflare R2, then copy their URL into a portfolio item.</p></div><button id="refresh-media" class="button secondary small">Refresh</button></div><form id="upload-media" class="item"><label>Image file<input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label><div class="item-actions"><button class="button" type="submit">Upload to R2</button></div></form><div class="media-grid">${state.media.length ? state.media.map((item) => `<article class="item media-item"><img src="${esc(item.url)}" alt=""><div><strong>${esc(item.key.split("/").pop())}</strong><p class="muted">${Math.ceil(item.size / 1024)} KB · ${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ""}</p></div><div class="item-actions"><button class="button secondary small" data-copy-media="${esc(item.url)}">Copy URL</button><button class="button secondary danger small" data-delete-media="${esc(item.key)}">Delete</button></div></article>`).join("") : `<p class="empty">No uploaded images yet. If this remains empty after refresh, verify the R2 public URL and bucket permissions.</p>`}</div></section>`;
}
function leadsView() {
  return `<section class="panel"><div class="section-head"><div><h2>Inquiry inbox</h2><p class="muted">Newest first. A lead is never emailed automatically by this starter implementation.</p></div><button id="refresh-leads" class="button secondary small">Refresh</button></div>${state.leads.length ? state.leads.map((lead) => `<article class="lead"><div><h3>${esc(lead.name)} <span class="muted">· ${esc(lead.business || "No business supplied")}</span></h3><div class="meta"><a href="mailto:${encodeURIComponent(lead.email)}">${esc(lead.email)}</a><span>${esc(lead.package || "No package selected")}</span><span>${new Date(lead.createdAt).toLocaleString()}</span></div><p class="lead-message">${esc(lead.message)}</p></div><label>Status<select data-status="${lead.id}">${["new","contacted","qualified","won","lost","archived"].map((status) => `<option ${lead.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></article>`).join("") : `<p class="empty">No inquiries yet.</p>`}</section>`;
}

function bind() {
  document.querySelector("#login-form")?.addEventListener("submit", login);
  document.querySelector("#logout")?.addEventListener("click", logout);
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", async () => { state.tab = button.dataset.tab; if (state.tab === "media") await loadMedia(); else render(); }));
  document.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", changeField));
  document.querySelectorAll("[data-items]").forEach((input) => input.addEventListener("input", changeItems));
  document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", addItem));
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", removeItem));
  document.querySelector("#save-content")?.addEventListener("click", saveContent);
  document.querySelector("#refresh-leads")?.addEventListener("click", loadLeads);
  document.querySelectorAll("[data-status]").forEach((select) => select.addEventListener("change", updateStatus));
  document.querySelector("#upload-media")?.addEventListener("submit", uploadMedia);
  document.querySelector("#refresh-media")?.addEventListener("click", loadMedia);
  document.querySelectorAll("[data-delete-media]").forEach((button) => button.addEventListener("click", deleteMedia));
  document.querySelectorAll("[data-copy-media]").forEach((button) => button.addEventListener("click", copyMediaUrl));
}
function changeField(event) { const { field, index, key } = event.target.dataset; state.content[field][Number(index)][key] = event.target.value; }
function changeItems(event) { state.content.packages[Number(event.target.dataset.index)].items = event.target.value.split("\n").map((item) => item.trim()).filter(Boolean); }
function addItem(event) { const key = event.currentTarget.dataset.add; const defaults = { services:{num:String(state.content.services.length + 1).padStart(2,"0"),title:"New service",body:""}, gallery:{label:"new work",image:"assets/",alt:""}, packages:{name:"New package",tag:"",price:"",cta:"Choose package",bg:"var(--surface)",border:"var(--line)",tagColor:"var(--muted)",ctaBg:"transparent",ctaColor:"var(--text)",items:[]}, quotes:{text:"",name:"",role:""} }; state.content[key].push(defaults[key]); render(); }
function removeItem(event) { const { remove, index } = event.currentTarget.dataset; state.content[remove].splice(Number(index),1); render(); }
async function login(event) { event.preventDefault(); const form = new FormData(event.currentTarget); try { state.user = await request("/api/auth/login", { method:"POST", body:JSON.stringify(Object.fromEntries(form)) }); state.error = ""; state.message = "Signed in."; await loadData(); } catch (error) { state.error = error.message; render(); } }
async function logout() { await request("/api/auth/logout", { method:"POST" }); state.user = null; state.content = null; state.leads = []; state.message = ""; render(); }
async function loadData() { try { state.content = await request("/api/content/home"); await loadLeads(false); } catch (error) { state.error = error.message; render(); } }
async function loadLeads(redraw = true) { try { state.leads = await request("/api/submissions"); state.error = ""; if (redraw) render(); else render(); } catch (error) { state.error = error.message; render(); } }
async function saveContent() { try { state.content = await request("/api/content/home", { method:"PUT", body:JSON.stringify(state.content) }); state.message = "Published. Refresh the home page to confirm."; state.error = ""; render(); } catch (error) { state.error = error.message; render(); } }
async function updateStatus(event) { try { const updated = await request(`/api/submissions/${event.target.dataset.status}`, { method:"PATCH", body:JSON.stringify({status:event.target.value}) }); state.leads = state.leads.map((lead) => lead.id === updated.id ? updated : lead); state.message = "Lead status updated."; state.error = ""; render(); } catch (error) { state.error = error.message; render(); } }
async function loadMedia() { try { state.media = (await request("/api/media")).items; state.error = ""; render(); } catch (error) { state.error = error.message; render(); } }
async function uploadMedia(event) { event.preventDefault(); const file = event.currentTarget.elements.file.files[0]; if (!file) return; try { const webp = await window.LillisImages.toWebp(file); const response = await fetch("/api/media", { method:"POST", headers:{ "Content-Type": "image/webp" }, body:webp }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Upload failed."); state.media.unshift(body); state.message = "Image optimized and uploaded as WebP. Copy its URL into a portfolio item."; state.error = ""; render(); } catch (error) { state.error = error.message; render(); } }
async function deleteMedia(event) { if (!confirm("Delete this image from R2? This cannot be undone.")) return; try { await request(`/api/media/${encodeURIComponent(event.currentTarget.dataset.deleteMedia)}`, { method:"DELETE" }); state.media = state.media.filter((item) => item.key !== event.currentTarget.dataset.deleteMedia); state.message = "Image deleted."; state.error = ""; render(); } catch (error) { state.error = error.message; render(); } }
async function copyMediaUrl(event) { try { await navigator.clipboard.writeText(event.currentTarget.dataset.copyMedia); state.message = "Image URL copied."; state.error = ""; render(); } catch { state.error = "Could not copy the URL. Select it from the media preview instead."; render(); } }

(async () => { try { state.user = await request("/api/auth/me"); await loadData(); } catch { render(); } })();
