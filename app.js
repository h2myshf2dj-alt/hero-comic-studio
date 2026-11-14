// Hero Comic Studio – Bedienung
const APP_VERSION = "1.5";
const $ = (id) => document.getElementById(id);

const state = {
  page: null,
  chars: Store.chars(),
  images: [null, null, null, null, null, null],
  busy: false,
  busyIndex: -1,
  lastRequest: 0,
  lastError: ""
};

// ---------- Hilfen ----------
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}
function progress(msg) {
  const p = $("progress");
  if (!msg) { p.classList.add("hidden"); return; }
  p.textContent = msg; p.classList.remove("hidden");
}
function draw() { Render.draw($("comicCanvas"), state.page, state.images, state.busyIndex); }

let saveTimer;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}
function saveNow() {
  state.page.thumb = makeThumb();
  if (!Store.savePage(state.page)) toast("Speicher ist voll – bitte alte Seiten löschen.");
}
function makeThumb() {
  try {
    const c = document.createElement("canvas");
    const src = $("comicCanvas");
    c.width = 120; c.height = Math.round(120 * src.height / src.width);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.6);
  } catch (e) { return null; }
}
function setBusy(b) {
  state.busy = b;
  ["btnGenAll", "btnWriteScenes", "btnNewPage"].forEach(id => $(id).disabled = b);
  document.querySelectorAll(".gen-btn").forEach(btn => btn.disabled = b);
}

// ---------- Seite laden / anzeigen ----------
function openPage(page) {
  state.page = page;
  state.images = [null, null, null, null, null, null];
  $("pageTitle").value = page.title || "";
  $("pageStyle").value = page.style;
  if (!page.count) page.count = 6;
  $("pageCount").value = String(page.count);
  updateCountTexts();
  $("storyIdea").value = page.story || "";
  buildSceneCards();
  draw();
  reloadImages();
}

async function reloadImages() {
  const page = state.page;
  for (let i = 0; i < 6; i++) {
    const s = page.scenes[i];
    if (!s.img) continue;
    try {
      const data = await ImgDB.get(page.id, i);
      if (!data) throw new Error("fehlt");
      const img = await AI.loadImage(data);
      if (state.page !== page) return; // inzwischen andere Seite geöffnet
      state.images[i] = img;
      setStatus(i, "✔ Bild vorhanden");
      draw();
    } catch (e) {
      s.img = null;
      setStatus(i, "noch kein Bild");
    }
  }
}

// ---------- Szenen-Karten ----------
function buildSceneCards() {
  const box = $("scenes");
  box.innerHTML = "";
  state.page.scenes.slice(0, state.page.count).forEach((s, i) => {
    const card = document.createElement("div");
    card.className = "card scene"; card.id = "scene-" + i;

    const head = document.createElement("div"); head.className = "scene-head";
    const num = document.createElement("span"); num.className = "scene-num"; num.textContent = "Szene " + (i + 1);
    const status = document.createElement("span"); status.className = "scene-status"; status.id = "status-" + i;
    status.textContent = s.img ? "✔ Bild vorhanden" : "noch kein Bild";
    head.append(num, status);

    const l1 = document.createElement("label"); l1.textContent = "Was passiert im Bild? (kurze englische Stichworte klappen am besten)";
    const ta = document.createElement("textarea"); ta.rows = 3; ta.value = s.text;
    ta.placeholder = "z. B. blonde woman walking a husky dog in a park, sunny day";
    ta.oninput = () => { s.text = ta.value; saveSoon(); };

    const l2 = document.createElement("label"); l2.textContent = "Text in der Blase (leer = keine Blase)";
    const inp = document.createElement("input"); inp.type = "text"; inp.value = s.bubble;
    inp.placeholder = "z. B. Was passiert mit mir?!";
    inp.oninput = () => { s.bubble = inp.value; draw(); saveSoon(); };

    const row = document.createElement("div"); row.className = "row";
    const selType = makeSelect([["speech", "Sprechblase"], ["thought", "Gedankenblase"], ["caption", "Erzähler-Kasten"]], s.bubbleType);
    selType.onchange = () => { s.bubbleType = selType.value; draw(); saveSoon(); };
    const selPos = makeSelect([["tl", "oben links"], ["tr", "oben rechts"], ["bl", "unten links"], ["br", "unten rechts"]], s.bubblePos);
    selPos.onchange = () => { s.bubblePos = selPos.value; draw(); saveSoon(); };
    row.append(selType, selPos);

    const btn = document.createElement("button");
    btn.className = "btn small red gen-btn";
    btn.textContent = s.img ? "🔄 Neu erzeugen" : "🎨 Bild erzeugen";
    btn.onclick = () => generateOne(i);
    btn.disabled = state.busy;

    card.append(head, l1, ta, l2, inp, row, btn);
    box.appendChild(card);
  });
}
function makeSelect(options, value) {
  const sel = document.createElement("select");
  sel.style.marginTop = "8px";
  options.forEach(([v, t]) => {
    const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o);
  });
  sel.value = value;
  return sel;
}
function setStatus(i, text) { const el = $("status-" + i); if (el) el.textContent = text; }

// ---------- Bilder erzeugen ----------
function updateGenProgress(run) {
  const secs = Math.round((Date.now() - run.t0) / 1000);
  progress(`Bilder: ${run.done} von ${run.total} fertig · ${secs} s · bitte App offen lassen`);
}

async function makeImage(i, run) {
  const page = state.page, s = page.scenes[i];
  setStatus(i, "wird angemeldet…");
  try {
    const data = await AI.generateImage(s, i, page, state.chars, (txt) => setStatus(i, txt));
    const img = await AI.loadImage(data);
    await ImgDB.put(page.id, i, data).catch(() => {});
    s.img = "db";
    if (state.page === page) { state.images[i] = img; setStatus(i, "✔ Bild vorhanden"); draw(); }
    return true;
  } catch (e) {
    state.lastError = (e && e.message) || "unbekannter Fehler";
    setStatus(i, "✖ " + state.lastError);
    return false;
  } finally {
    run.done++; updateGenProgress(run);
  }
}

// Mehrere Bilder gleichzeitig in Auftrag geben (höchstens 3 auf einmal)
async function runJobs(todo) {
  const run = { total: todo.length, done: 0, t0: Date.now() };
  const timer = setInterval(() => updateGenProgress(run), 1000);
  updateGenProgress(run);
  todo.forEach(i => setStatus(i, "wartet…"));
  const queue = todo.slice();
  let ok = 0;
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      if (await makeImage(i, run)) ok++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  clearInterval(timer); progress(null);
  return ok;
}

async function generateOne(i) {
  if (state.busy) return;
  const s = state.page.scenes[i];
  if (!s.text.trim()) { toast("Bitte erst beschreiben, was im Bild passiert."); return; }
  if (s.img) s.variant = (s.variant || 0) + 1; // neue Variante
  setBusy(true);
  const ok = await runJobs([i]);
  setBusy(false); refreshSceneButtons(); saveNow();
  toast(ok ? "Bild fertig!" : "Hat nicht geklappt: " + state.lastError, ok ? 2600 : 6000);
}

async function generateAll() {
  if (state.busy) return;
  const filled = state.page.scenes.map((s, i) => i).filter(i => i < state.page.count && state.page.scenes[i].text.trim());
  if (!filled.length) { toast("Bitte erst die Szenen ausfüllen oder die KI schreiben lassen."); return; }
  let todo = filled.filter(i => !state.page.scenes[i].img);
  if (!todo.length) {
    if (!confirm("Alle Szenen haben schon ein Bild. Alle neu erzeugen?")) return;
    todo = filled;
    todo.forEach(i => { state.page.scenes[i].variant = (state.page.scenes[i].variant || 0) + 1; });
  }
  setBusy(true);
  const ok = await runJobs(todo);
  setBusy(false); refreshSceneButtons(); saveNow();
  toast(ok === todo.length ? "Alle Bilder fertig!"
    : `${ok} von ${todo.length} Bildern fertig. Grund: ${state.lastError}`, 6000);
}

function refreshSceneButtons() {
  document.querySelectorAll(".gen-btn").forEach((btn, i) => {
    btn.textContent = state.page.scenes[i].img ? "🔄 Neu erzeugen" : "🎨 Bild erzeugen";
  });
}

// ---------- KI schreibt Szenen ----------
async function writeScenes() {
  const story = $("storyIdea").value.trim();
  if (!story) { toast("Bitte erst eine Geschichte eingeben."); return; }
  const hasContent = state.page.scenes.slice(0, state.page.count).some(s => s.text.trim() || s.bubble.trim());
  if (hasContent && !confirm("Die vorhandenen Szenentexte werden ersetzt. Weiter?")) return;
  setBusy(true);
  const t0 = Date.now();
  const tick = setInterval(() => {
    progress(`Die KI schreibt … ${Math.round((Date.now() - t0) / 1000)} s (dauert bis zu 1–2 Minuten)`);
  }, 1000);
  progress("Die KI schreibt …");
  let res = null;
  try {
    res = await AI.writeScenes(story, state.chars, (txt) => { clearInterval(tick); progress(txt); }, state.page.count);
  } catch (e) {
    clearInterval(tick); progress(null);
    if (confirm("Die kostenlose Text-KI ist gerade nicht erreichbar.\n\nSoll ich stattdessen eine einfache Vorlage aus deiner Geschichte machen? Du kannst die Texte danach ändern.")) {
      res = AI.templateScenes(story, state.page.count);
    }
  }
  clearInterval(tick); progress(null); setBusy(false);
  if (!res) return;
  if (res.title && !state.page.title) { state.page.title = res.title; $("pageTitle").value = res.title; }
  res.scenes.slice(0, state.page.count).forEach((r, i) => {
    const s = state.page.scenes[i];
    s.text = r.text; s.bubble = r.bubble; s.bubbleType = r.bubbleType;
  });
  buildSceneCards(); draw(); saveNow();
  $("scenes").scrollIntoView({ behavior: "smooth" });
  toast("Szenen fertig! Jetzt „Alle Bilder erzeugen“ tippen.", 4000);
}

// ---------- Export ----------
function exportPage() {
  draw();
  const canvas = $("comicCanvas");
  const name = ((state.page.title || "comic").replace(/[^\wäöüÄÖÜß-]+/g, "_")) + ".png";
  try {
    canvas.toBlob(async (blob) => {
      if (!blob) { toast("Speichern hat nicht geklappt."); return; }
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: state.page.title || "Comic" }); }
        catch (e) { /* abgebrochen */ }
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        toast("Bild wird heruntergeladen.");
      }
    }, "image/png");
  } catch (e) {
    toast("Speichern blockiert: Bitte einen Screenshot der Seite machen.", 5000);
  }
}

// ---------- Figuren ----------
function renderChars() {
  const box = $("charList"); box.innerHTML = "";
  if (!state.chars.length) {
    box.innerHTML = '<p class="empty-note">Noch keine Figuren.</p>'; return;
  }
  state.chars.forEach((c, idx) => {
    const card = document.createElement("div"); card.className = "card";
    const h = document.createElement("h2"); h.textContent = c.name;
    const p = document.createElement("p"); p.textContent = c.look; p.style.margin = "0";
    const edit = document.createElement("button"); edit.className = "btn small ghost"; edit.textContent = "✏️ Bearbeiten";
    edit.onclick = () => { $("charName").value = c.name; $("charLook").value = c.look; window.scrollTo({ top: 0, behavior: "smooth" }); };
    const del = document.createElement("button"); del.className = "btn small ghost"; del.textContent = "🗑 Löschen";
    del.onclick = () => {
      if (!confirm(`„${c.name}“ wirklich löschen?`)) return;
      state.chars.splice(idx, 1); Store.saveChars(state.chars); renderChars();
    };
    card.append(h, p, edit, del); box.appendChild(card);
  });
}
function saveChar() {
  const name = $("charName").value.trim(), look = $("charLook").value.trim();
  if (!name || !look) { toast("Bitte Name und Aussehen eingeben."); return; }
  const i = state.chars.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) state.chars[i] = { name, look }; else state.chars.push({ name, look });
  Store.saveChars(state.chars);
  $("charName").value = ""; $("charLook").value = "";
  renderChars(); toast(`„${name}“ gespeichert!`);
}

// ---------- Bibliothek ----------
function renderLib() {
  saveNow();
  const box = $("libList"); box.innerHTML = "";
  const pages = Store.pages();
  if (!pages.length) { box.innerHTML = '<p class="empty-note">Noch keine Seiten gespeichert.</p>'; return; }
  pages.forEach(p => {
    const item = document.createElement("div"); item.className = "list-item";
    let thumb;
    if (p.thumb) { thumb = document.createElement("img"); thumb.src = p.thumb; thumb.className = "thumb"; }
    else { thumb = document.createElement("div"); thumb.className = "thumb empty"; thumb.textContent = "?"; }
    const main = document.createElement("div"); main.className = "list-main";
    const t = document.createElement("div"); t.className = "list-title"; t.textContent = p.title || "Ohne Titel";
    const sub = document.createElement("div"); sub.className = "list-sub";
    sub.textContent = new Date(p.updated).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) +
      (state.page && p.id === state.page.id ? " · geöffnet" : "");
    const open = document.createElement("button"); open.className = "btn small red"; open.textContent = "Öffnen";
    open.onclick = () => { openPage(Store.getPage(p.id)); showView("view-page"); };
    const dup = document.createElement("button"); dup.className = "btn small ghost"; dup.textContent = "Kopie";
    dup.onclick = () => {
      const copy = JSON.parse(JSON.stringify(Store.getPage(p.id)));
      copy.id = Store.newId(); copy.title = (copy.title || "Ohne Titel") + " (Kopie)";
      const fromId = p.id;
      ImgDB.copyPage(fromId, copy.id).catch(() => {});
      Store.savePage(copy); if (state.page) Store.savePage(state.page); renderLib(); toast("Kopie erstellt.");
    };
    const del = document.createElement("button"); del.className = "btn small ghost"; del.textContent = "🗑";
    del.onclick = () => {
      if (!confirm(`„${p.title || "Ohne Titel"}“ wirklich löschen?`)) return;
      Store.deletePage(p.id); ImgDB.delPage(p.id).catch(() => {});
      if (state.page && p.id === state.page.id) openPage(Store.emptyPage());
      renderLib();
    };
    main.append(t, sub, open, dup, del);
    item.append(thumb, main); box.appendChild(item);
  });
}

function updateCountTexts() {
  const n = state.page.count;
  $("btnWriteScenes").textContent = n === 1 ? "✨ KI schreibt die Szene" : `✨ KI schreibt die ${n} Szenen`;
  $("writeHint").textContent = n === 1 ? "Oder schreib die Szene unten selbst." : `Oder schreib die ${n} Szenen unten selbst.`;
}

// ---------- Navigation ----------
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  if (id === "view-lib") renderLib();
  if (id === "view-chars") renderChars();
  window.scrollTo(0, 0);
}

// ---------- Start ----------
function init() {
  $("version").textContent = "Version " + APP_VERSION;
  const sel = $("pageStyle");
  STYLES.forEach(s => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; sel.appendChild(o); });

  const cur = Store.getPage(Store.currentId());
  openPage(cur || Store.emptyPage());

  $("pageTitle").oninput = (e) => { state.page.title = e.target.value; draw(); saveSoon(); };
  $("pageStyle").onchange = (e) => { state.page.style = e.target.value; saveSoon(); toast("Neuer Stil gilt für neu erzeugte Bilder."); };
  $("pageCount").onchange = (e) => {
    state.page.count = parseInt(e.target.value, 10);
    updateCountTexts(); buildSceneCards(); draw(); saveSoon();
  };
  $("storyIdea").oninput = (e) => { state.page.story = e.target.value; saveSoon(); };
  $("btnWriteScenes").onclick = writeScenes;
  $("btnGenAll").onclick = generateAll;
  $("btnExport").onclick = exportPage;
  $("btnNewPage").onclick = () => { saveNow(); openPage(Store.emptyPage()); window.scrollTo(0, 0); toast("Neue Seite angelegt."); };
  $("btnSaveChar").onclick = saveChar;
  try { $("hordeKey").value = localStorage.getItem("hcs_hordekey") || ""; } catch (e) {}
  $("btnSaveKey").onclick = () => {
    try { localStorage.setItem("hcs_hordekey", $("hordeKey").value.trim()); } catch (e) {}
    toast($("hordeKey").value.trim() ? "Schlüssel gespeichert." : "Schlüssel entfernt (anonym).");
  };
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showView(b.dataset.view));

  // Tippen auf ein Panel -> zur Szene springen
  $("comicCanvas").addEventListener("click", (e) => {
    const c = e.currentTarget, rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (Render.W / rect.width);
    const y = (e.clientY - rect.top) * (c.height / rect.height);
    const i = Render.panelRects(state.page.count).findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (i < 0) return;
    const card = $("scene-" + i);
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1500);
  });

  // Schriften laden, dann neu zeichnen
  if (document.fonts) {
    Promise.all([
      document.fonts.load("40px Bangers"),
      document.fonts.load('700 28px "Comic Neue"')
    ]).then(draw).catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    // Neue Version gefunden -> App einmal automatisch neu laden
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded || state.busy) return;
      reloaded = true; location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
      .then(reg => reg.update()).catch(() => {});
  }
}

init();
