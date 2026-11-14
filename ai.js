// Kostenlose KI über Pollinations.ai (ohne Konto, ohne Schlüssel).
// Modular: Wer später einen anderen Gratis-Dienst nutzen will, ändert nur diese Datei.
const AI = {
  IMG_W: 768,
  IMG_H: 720,
  WAIT_MS: 16000, // Gratis-Limit: ca. 1 Bild pro 15 Sekunden

  // Figuren-Beschreibungen anhängen, deren Name in der Szene vorkommt
  charactersIn(text, chars) {
    const t = (text || "").toLowerCase();
    return chars.filter(c => c.name && t.includes(c.name.toLowerCase()));
  },

  buildPrompt(scene, page, chars) {
    const style = STYLES.find(s => s.id === page.style) || STYLES[0];
    const found = this.charactersIn(scene.text + " " + scene.bubble, chars);
    const charText = found.map(c => `${c.name}: ${c.look}`).join("; ");
    let p = `${style.prompt}, single comic book panel, ${scene.text}`;
    if (charText) p += `. Characters: ${charText}`;
    p += ". No text, no letters, no speech bubbles, no captions, no watermark";
    return p.slice(0, 1400);
  },

  imageUrl(scene, index, page, chars) {
    const prompt = this.buildPrompt(scene, page, chars);
    const seed = page.seed + index * 101 + (scene.variant || 0) * 7919;
    return "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) +
      `?width=${this.IMG_W}&height=${this.IMG_H}&seed=${seed}&model=flux&nologo=true`;
  },

  // Bild laden; erst mit CORS (für Export), sonst ohne
  loadImage(url, timeoutMs = 150000) {
    const tryLoad = (cors) => new Promise((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = "anonymous";
      const timer = setTimeout(() => { img.src = ""; reject(new Error("timeout")); }, timeoutMs);
      img.onload = () => { clearTimeout(timer); img._cors = cors; resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error("load")); };
      img.src = url;
    });
    return tryLoad(true).catch(() => tryLoad(false));
  },

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  // Anfrage mit Zeitlimit
  async fetchTimeout(url, opts = {}, ms = 45000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
    finally { clearTimeout(t); }
  },

  // Mehrere kostenlose Wege nacheinander probieren
  async askText(prompt) {
    const tries = [
      async () => {
        const r = await this.fetchTimeout("https://text.pollinations.ai/openai", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "openai", messages: [{ role: "user", content: prompt }],
            seed: Math.floor(Math.random() * 99999) })
        });
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        return j.choices[0].message.content;
      },
      async () => {
        const r = await this.fetchTimeout("https://text.pollinations.ai/" + encodeURIComponent(prompt));
        if (!r.ok) throw new Error(r.status);
        return r.text();
      },
      async () => {
        const r = await this.fetchTimeout("https://text.pollinations.ai/" + encodeURIComponent(prompt) + "?model=mistral");
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }
    ];
    for (const t of tries) {
      try {
        const txt = await t();
        if (txt && txt.includes("{")) return txt;
      } catch (e) { /* nächsten Weg probieren */ }
    }
    throw new Error("Text-KI nicht erreichbar");
  },

  // Ersatz ohne KI: einfache Vorlage aus der Geschichte
  templateScenes(story) {
    const parts = [
      ["establishing wide shot, peaceful beginning", "Es war ein ganz normaler Tag ...", "caption"],
      ["medium shot, calm moment, characters introduced", "Was für ein schöner Tag!", "speech"],
      ["close-up of surprised faces, something strange appears", "Moment mal ... was ist das?!", "speech"],
      ["dynamic action scene, dramatic low angle, motion lines", "Oh nein!", "speech"],
      ["intense climax, dramatic lighting, high tension", "Ich muss etwas tun ...", "thought"],
      ["final panel, surprising ending, cinematic wide shot", "Doch dann geschah das Unerwartete ...", "caption"]
    ];
    return {
      title: "",
      scenes: parts.map(([shot, bubble, type]) => ({ text: `${shot}: ${story}`, bubble, bubbleType: type }))
    };
  },

  // Geschichte -> 6 Szenen (kostenlose Text-KI)
  async writeScenes(story, chars) {
    const charList = chars.length
      ? "Figuren: " + chars.map(c => `${c.name} (${c.look})`).join("; ") + ". "
      : "";
    const instruction =
      "Du bist Comic-Autor. Teile diese Geschichte in genau 6 aufeinanderfolgende Comic-Szenen fuer EINE Comicseite auf, " +
      "mit spannendem Ablauf und starkem Schluss. " + charList +
      "Antworte NUR mit JSON ohne weitere Worte, genau in diesem Format: " +
      '{"titel":"kurzer deutscher Titel","szenen":[{"bild":"genaue englische Bildbeschreibung mit Ort, Figuren mit Namen, Handlung, Kameraperspektive","text":"kurzer deutscher Dialog oder Erzaehltext, hoechstens 12 Woerter","art":"sprechblase oder gedanke oder erzaehler"}]}. ' +
      "Geschichte: " + story;

    const raw = await this.askText(instruction);
    const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("Antwort nicht lesbar");
    const data = JSON.parse(raw.slice(start, end + 1));
    const list = data.szenen || data.scenes || [];
    if (!list.length) throw new Error("Keine Szenen erhalten");
    const typeMap = { sprechblase: "speech", gedanke: "thought", erzaehler: "caption", "erzähler": "caption" };
    return {
      title: data.titel || data.title || "",
      scenes: list.slice(0, 6).map(s => ({
        text: s.bild || s.image || "",
        bubble: s.text || "",
        bubbleType: typeMap[(s.art || "").toLowerCase()] || "speech"
      }))
    };
  }
};
