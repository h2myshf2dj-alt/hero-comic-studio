// Speicherung auf dem Gerät (localStorage) + Stil-Liste
const STYLES = [
  { id: "retro95", name: "Comic der 90er (1995)",
    prompt: "1990s american comic book art, 1995 superhero comic style, bold black ink outlines, flat bright colors, crosshatching shading, halftone print, hand drawn" },
  { id: "classic", name: "Klassischer US-Superhelden-Comic",
    prompt: "classic american superhero comic book art, bold black ink lines, vibrant primary colors, halftone dots, dynamic action pose, dramatic lighting" },
  { id: "modern", name: "Moderner realistischer Superhelden-Comic",
    prompt: "modern realistic superhero comic art, detailed digital painting, cinematic lighting, detailed anatomy, rich colors, dynamic camera angle" },
  { id: "dark", name: "Düsterer Comic-Stil",
    prompt: "dark gritty noir comic art, heavy black shadows, high contrast, moody desaturated colors with red accents, rain, dramatic" },
  { id: "scifi", name: "Futuristischer Sci-Fi-Comic",
    prompt: "futuristic sci-fi comic art, neon lights, cyan and magenta glow, high-tech city, sleek armor, detailed ink lines" },
  { id: "anime", name: "Anime-Comic",
    prompt: "anime manga style comic panel, clean line art, cel shading, expressive eyes, speed lines, vibrant colors" },
  { id: "cartoon", name: "Cartoon-Comic",
    prompt: "fun cartoon comic style, thick outlines, bright flat colors, exaggerated expressions, playful" },
  { id: "novel", name: "Realistischer Graphic-Novel-Stil",
    prompt: "realistic graphic novel illustration, painterly, muted natural colors, detailed backgrounds, cinematic composition" }
];

const Store = {
  _get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  _set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },

  newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  emptyPage() {
    const scenes = [];
    for (let i = 0; i < 6; i++) {
      scenes.push({ text: "", bubble: "", bubbleType: "speech", bubblePos: i % 2 ? "tr" : "tl", img: null, variant: 0 });
    }
    return {
      id: this.newId(), title: "", style: "retro95",
      seed: Math.floor(Math.random() * 900000) + 1000,
      story: "", scenes, thumb: null, updated: Date.now()
    };
  },

  // --- Seiten ---
  pages() { return this._get("hcs_pages", []); },
  savePage(page) {
    page.updated = Date.now();
    const list = this.pages().filter(p => p.id !== page.id);
    list.unshift(page);
    let ok = this._set("hcs_pages", list);
    if (!ok) { // Speicher voll: Vorschaubilder entfernen und erneut versuchen
      list.forEach(p => { if (p.id !== page.id) p.thumb = null; });
      ok = this._set("hcs_pages", list);
    }
    this._set("hcs_current", page.id);
    return ok;
  },
  deletePage(id) { this._set("hcs_pages", this.pages().filter(p => p.id !== id)); },
  getPage(id) { return this.pages().find(p => p.id === id) || null; },
  currentId() { return this._get("hcs_current", null); },

  // --- Figuren ---
  chars() { return this._get("hcs_chars", []); },
  saveChars(list) { this._set("hcs_chars", list); }
};

// Bilder liegen in einer eigenen Geräte-Datenbank (IndexedDB), weil sie groß sind
const ImgDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("hcs_images", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("imgs");
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  async _run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("imgs", mode);
      const req = fn(tx.objectStore("imgs"));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  },
  put(pageId, i, dataUrl) { return this._run("readwrite", st => st.put(dataUrl, pageId + "_" + i)); },
  get(pageId, i) { return this._run("readonly", st => st.get(pageId + "_" + i)); },
  del(pageId, i) { return this._run("readwrite", st => st.delete(pageId + "_" + i)); },
  async delPage(pageId) { for (let i = 0; i < 6; i++) await this.del(pageId, i).catch(() => {}); },
  async copyPage(fromId, toId) {
    for (let i = 0; i < 6; i++) {
      const d = await this.get(fromId, i).catch(() => null);
      if (d) await this.put(toId, i, d);
    }
  }
};
