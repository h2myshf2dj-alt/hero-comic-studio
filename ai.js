// Kostenlose KI-Anbindung. Modular: Wer später einen anderen Gratis-Dienst
// nutzen will, ändert nur diese Datei.
//  - Bilder: AI Horde (aihorde.net) – gemeinschaftlich betrieben, dauerhaft kostenlos,
//    ohne Konto nutzbar (anonym = hinten in der Warteschlange).
//  - Szenentexte: Pollinations Text (ohne Konto, 1 Anfrage pro 30 Sekunden).
const AI = {
  HORDE: "https://aihorde.net/api/v2",
  AGENT: "HeroComicStudio:1.4:github.com/h2myshf2dj-alt/hero-comic-studio",
  SIZE: 512,
  NEGATIVE: "text, letters, words, speech bubble, caption, watermark, signature, logo, photo, photorealistic, 3d render, blurry, deformed hands, extra fingers, extra limbs, ugly",
  // SD-1.5-Modelle, die gut zu Comics passen (das mit den meisten Rechnern wird genommen)
  MODELS: ["Dreamshaper", "Deliberate", "Comic-Diffusion", "ToonYou", "Anything Diffusion", "stable_diffusion"],
  _model: undefined,

  key() {
    try { return (localStorage.getItem("hcs_hordekey") || "").trim() || "0000000000"; }
    catch (e) { return "0000000000"; }
  },
  headers() {
    return { "Content-Type": "application/json", "apikey": this.key(), "Client-Agent": this.AGENT };
  },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  async fetchTimeout(url, opts = {}, ms = 45000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
    finally { clearTimeout(t); }
  },

  // Figuren-Beschreibungen anhängen, deren Name in der Szene vorkommt
  charactersIn(text, chars) {
    const t = (text || "").toLowerCase();
    return chars.filter(c => c.name && t.includes(c.name.toLowerCase()));
  },

  buildPrompt(scene, page, chars) {
    const style = STYLES.find(s => s.id === page.style) || STYLES[0];
    const found = this.charactersIn(scene.text + " " + scene.bubble, chars);
    const charText = found.map(c => c.look).join(", ");
    let p = `${scene.text}`;
    if (charText) p += `, ${charText}`;
    p += `, ${style.prompt}, comic book panel`;
    return p.slice(0, 900) + " ### " + this.NEGATIVE;
  },

  // Verfügbares Modell mit den meisten Rechnern suchen (einmal pro Sitzung)
  async pickModel() {
    if (this._model !== undefined) return this._model;
    this._model = null;
    try {
      const r = await this.fetchTimeout(this.HORDE + "/status/models?type=image&min_count=1",
        { headers: { "Client-Agent": this.AGENT } }, 15000);
      const list = await r.json();
      let best = null;
      list.forEach(m => {
        if (this.MODELS.includes(m.name) && (!best || m.count > best.count)) best = m;
      });
      if (best) this._model = best.name;
    } catch (e) { /* ohne Modellwahl weiter */ }
    return this._model;
  },

  // Ein Bild erzeugen. Gibt ein JPEG als Data-URL zurück.
  // onStatus(text) meldet den Fortschritt.
  async generateImage(scene, index, page, chars, onStatus = () => {}) {
    const model = await this.pickModel();
    const seed = page.seed + index * 101 + (scene.variant || 0) * 7919;
    const body = {
      prompt: this.buildPrompt(scene, page, chars),
      params: { sampler_name: "k_euler_a", cfg_scale: 7, width: this.SIZE, height: this.SIZE,
        steps: 20, n: 1, seed: String(seed), karras: true },
      nsfw: false, censor_nsfw: true, r2: false, shared: false,
      slow_workers: true, trusted_workers: false
    };
    if (model) body.models = [model];

    // 1. Auftrag abschicken (bei "zu viele Anfragen" kurz warten und nochmal)
    let id = null, lastErr = "";
    for (let attempt = 0; attempt < 8 && !id; attempt++) {
      onStatus("wird angemeldet…");
      let r;
      try {
        r = await this.fetchTimeout(this.HORDE + "/generate/async",
          { method: "POST", headers: this.headers(), body: JSON.stringify(body) }, 30000);
      } catch (e) { lastErr = "keine Verbindung"; await this.sleep(4000); continue; }
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.id) { id = j.id; break; }
      lastErr = j.message || ("Fehler " + r.status);
      if (r.status === 429 || r.status === 503) { onStatus("Dienst ausgelastet, warte…"); await this.sleep(6000); continue; }
      if (body.models && attempt === 0) { delete body.models; continue; } // ohne Modellwunsch probieren
      break;
    }
    if (!id) throw new Error(lastErr || "Auftrag abgelehnt");

    // 2. Warten, bis das Bild fertig ist (höchstens 6 Minuten)
    const start = Date.now();
    while (true) {
      await this.sleep(4000);
      if (Date.now() - start > 360000) {
        fetch(this.HORDE + "/generate/status/" + id, { method: "DELETE", headers: this.headers() }).catch(() => {});
        throw new Error("Zeit abgelaufen (Warteschlange zu lang)");
      }
      let c;
      try {
        const r = await this.fetchTimeout(this.HORDE + "/generate/check/" + id,
          { headers: { "Client-Agent": this.AGENT } }, 15000);
        if (!r.ok) continue;
        c = await r.json();
      } catch (e) { continue; }
      if (c.faulted) throw new Error("Rechner hat abgebrochen");
      if (c.is_possible === false) throw new Error("kein Rechner verfügbar");
      if (c.done) break;
      if (c.processing > 0) onStatus("wird gezeichnet…");
      else onStatus(`Warteschlange Platz ${c.queue_position || "?"}, ca. ${c.wait_time || "?"} s`);
    }

    // 3. Ergebnis abholen
    const r = await this.fetchTimeout(this.HORDE + "/generate/status/" + id,
      { headers: { "Client-Agent": this.AGENT } }, 30000);
    const j = await r.json();
    const g = j.generations && j.generations[0];
    if (!g || !g.img) throw new Error("kein Bild erhalten");
    if (g.censored) throw new Error("vom Jugendschutz-Filter blockiert – Szene anders beschreiben");
    const src = g.img.startsWith("http") ? g.img : "data:image/webp;base64," + g.img;
    return this.toJpeg(src);
  },

  // In JPEG umwandeln (kleiner, überall lesbar)
  async toJpeg(src) {
    let url = src;
    if (src.startsWith("http")) { // Datei laden, damit das Bild exportierbar bleibt
      const blob = await (await fetch(src)).blob();
      url = URL.createObjectURL(blob);
    }
    const img = await this.loadImage(url);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/jpeg", 0.88);
  },

  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Bild nicht lesbar"));
      img.src = url;
    });
  },

  // Text-KI: ein Versuch, bei Limit 32 Sekunden warten und noch einmal
  async askText(prompt, onStatus = () => {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await this.fetchTimeout("https://text.pollinations.ai/" + encodeURIComponent(prompt), {}, 60000);
        if (r.ok) {
          const txt = await r.text();
          if (txt && txt.includes("{")) return txt;
        }
      } catch (e) { /* nochmal */ }
      if (attempt === 0) {
        for (let s = 32; s > 0; s--) { onStatus(`Text-KI ist besetzt, neuer Versuch in ${s} s`); await this.sleep(1000); }
        onStatus("Die KI schreibt …");
      }
    }
    throw new Error("Text-KI nicht erreichbar");
  },

  // Ersatz ohne KI: einfache Vorlage aus der Geschichte
  templateScenes(story, count = 6) {
    const parts = [
      ["establishing wide shot, peaceful beginning", "Es war ein ganz normaler Tag ...", "caption"],
      ["medium shot, calm moment, characters introduced", "Was für ein schöner Tag!", "speech"],
      ["close-up of surprised faces, something strange appears", "Moment mal ... was ist das?!", "speech"],
      ["dynamic action scene, dramatic low angle, motion lines", "Oh nein!", "speech"],
      ["intense climax, dramatic lighting, high tension", "Ich muss etwas tun ...", "thought"],
      ["final panel, surprising ending, cinematic wide shot", "Doch dann geschah das Unerwartete ...", "caption"]
    ];
    // passende Auswahl: Anfang ... Höhepunkt ... Schluss
    const pick = { 1: [3], 2: [0, 5], 3: [0, 3, 5], 4: [0, 2, 3, 5] }[count];
    const use = pick ? pick.map(k => parts[k]) : parts;
    return {
      title: "",
      scenes: use.map(([shot, bubble, type]) => ({ text: `${shot}: ${story}`, bubble, bubbleType: type }))
    };
  },

  // Geschichte -> 6 Szenen (kostenlose Text-KI)
  async writeScenes(story, chars, onStatus, count = 6) {
    const charList = chars.length
      ? "Figuren: " + chars.map(c => `${c.name} (${c.look})`).join("; ") + ". "
      : "";
    const instruction =
      "Du bist Comic-Autor. " + (count === 1 ? "Mache aus dieser Geschichte genau 1 Comic-Szene (ein einzelnes Bild), " : `Teile diese Geschichte in genau ${count} aufeinanderfolgende Comic-Szenen fuer EINE Comicseite auf, `) +
      "mit spannendem Ablauf und starkem Schluss. " + charList +
      "Antworte NUR mit JSON ohne weitere Worte, genau in diesem Format: " +
      '{"titel":"kurzer deutscher Titel","szenen":[{"bild":"kurze englische Bildbeschreibung in Stichworten, hoechstens 25 Woerter: wer (Name und Aussehen), was passiert, wo, Kameraperspektive","text":"kurzer deutscher Dialog oder Erzaehltext, hoechstens 12 Woerter","art":"sprechblase oder gedanke oder erzaehler"}]}. ' +
      "Geschichte: " + story;

    const raw = await this.askText(instruction, onStatus);
    const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("Antwort nicht lesbar");
    const data = JSON.parse(raw.slice(start, end + 1));
    const list = data.szenen || data.scenes || [];
    if (!list.length) throw new Error("Keine Szenen erhalten");
    const typeMap = { sprechblase: "speech", gedanke: "thought", erzaehler: "caption", "erzähler": "caption" };
    return {
      title: data.titel || data.title || "",
      scenes: list.slice(0, count).map(s => ({
        text: s.bild || s.image || "",
        bubble: s.text || "",
        bubbleType: typeMap[(s.art || "").toLowerCase()] || "speech"
      }))
    };
  }
};
