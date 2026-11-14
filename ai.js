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

    const url = "https://text.pollinations.ai/" + encodeURIComponent(instruction) +
      "?model=openai&seed=" + Math.floor(Math.random() * 99999);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Text-KI antwortet nicht (" + res.status + ")");
    const raw = await res.text();
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
