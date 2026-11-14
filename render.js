// Zeichnet die Comicseite (6 Panels) auf ein Canvas – Vorschau = Export.
const Render = {
  W: 1200, H: 1800, M: 40, TITLE_H: 120, GAP: 24,

  panelRects() {
    const { W, H, M, TITLE_H, GAP } = this;
    const top = M + TITLE_H;
    const pw = (W - 2 * M - GAP) / 2;
    const ph = (H - top - M - 2 * GAP) / 3;
    const rects = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      rects.push({ x: M + c * (pw + GAP), y: top + r * (ph + GAP), w: pw, h: ph });
    }
    return rects;
  },

  draw(canvas, page, images, busyIndex) {
    const ctx = canvas.getContext("2d");
    const { W, H, M, TITLE_H } = this;
    canvas.width = W; canvas.height = H;

    // Papier
    ctx.fillStyle = "#fbf8f0";
    ctx.fillRect(0, 0, W, H);

    // Titel
    const title = (page.title || "Hero Comic").toUpperCase();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let size = 84;
    ctx.font = `${size}px Bangers, Impact, sans-serif`;
    while (ctx.measureText(title).width > W - 2 * M && size > 30) {
      size -= 4; ctx.font = `${size}px Bangers, Impact, sans-serif`;
    }
    const ty = M + TITLE_H / 2 - 4;
    ctx.lineJoin = "round";
    ctx.lineWidth = 10; ctx.strokeStyle = "#111";
    ctx.strokeText(title, W / 2 + 4, ty + 4);
    ctx.fillStyle = "#111"; ctx.fillText(title, W / 2 + 4, ty + 4);
    ctx.strokeText(title, W / 2, ty);
    ctx.fillStyle = "#d7262e"; ctx.fillText(title, W / 2, ty);

    // Panels
    this.panelRects().forEach((r, i) => {
      const scene = page.scenes[i];
      const img = images[i];
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      if (img) {
        const s = Math.max(r.w / img.width, r.h / img.height);
        const dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = "#e9e4d8"; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = "#b9b2a2";
        ctx.font = "56px Bangers, Impact, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(i === busyIndex ? "ZEICHNE..." : "SZENE " + (i + 1), r.x + r.w / 2, r.y + r.h / 2);
      }
      if (scene && scene.bubble && scene.bubble.trim()) this.bubble(ctx, r, scene);
      ctx.restore();

      ctx.lineWidth = 7; ctx.strokeStyle = "#111";
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    });
  },

  wrap(ctx, text, maxW) {
    const words = text.trim().split(/\s+/);
    const lines = []; let line = "";
    words.forEach(w => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines;
  },

  roundRect(ctx, x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  },

  bubble(ctx, r, scene) {
    const type = scene.bubbleType || "speech";
    const pos = scene.bubblePos || "tl";
    const fontSize = 28, lineH = 33, pad = 18;
    ctx.font = `700 ${fontSize}px "Comic Neue", "Comic Sans MS", sans-serif`;
    const text = type === "caption" ? scene.bubble : scene.bubble.toUpperCase();
    const lines = this.wrap(ctx, text, r.w * 0.62);
    const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
    const bw = Math.min(tw + pad * 2, r.w - 24);
    const bh = lines.length * lineH + pad * 2 - 6;
    const top = pos[0] === "t";
    const left = pos[1] === "l";

    let bx, by;
    if (type === "caption") {
      bx = left ? r.x : r.x + r.w - bw;
      by = top ? r.y : r.y + r.h - bh;
      ctx.fillStyle = "#ffe066"; ctx.fillRect(bx, by, bw, bh);
      ctx.lineWidth = 4; ctx.strokeStyle = "#111"; ctx.strokeRect(bx, by, bw, bh);
    } else {
      bx = left ? r.x + 16 : r.x + r.w - bw - 16;
      by = top ? r.y + 16 : r.y + r.h - bh - 16;
      ctx.lineWidth = 4; ctx.strokeStyle = "#111"; ctx.fillStyle = "#fff";
      const cx = bx + bw / 2;
      if (type === "speech") {
        // Zeiger Richtung Bildmitte
        const baseY = top ? by + bh - 8 : by + 8;
        const tipX = cx + (left ? 50 : -50);
        const tipY = top ? by + bh + 38 : by - 38;
        // 1. Zeiger mit Rand
        ctx.beginPath();
        ctx.moveTo(cx - 18, baseY); ctx.lineTo(tipX, tipY); ctx.lineTo(cx + 18, baseY);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // 2. Blase
        this.roundRect(ctx, bx, by, bw, bh, 26);
        ctx.fill(); ctx.stroke();
        // 3. Blasenrand am Zeiger-Ansatz weiß überdecken
        const ix = cx + (tipX - cx) * 0.8, iy = baseY + (tipY - baseY) * 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - 13, baseY); ctx.lineTo(ix, iy); ctx.lineTo(cx + 13, baseY);
        ctx.closePath(); ctx.fill();
      } else {
        // Gedankenblase
        this.roundRect(ctx, bx, by, bw, bh, Math.min(bh / 2, 50));
        ctx.fill(); ctx.stroke();
        const dir = top ? 1 : -1;
        const sx = cx + (left ? 30 : -30);
        [[0, 14, 14], [16, 32, 9], [28, 48, 6]].forEach(([dx, dy, rad]) => {
          ctx.beginPath();
          ctx.arc(sx + (left ? dx : -dx), (top ? by + bh : by) + dir * dy, rad, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        });
      }
    }

    ctx.fillStyle = "#111";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + pad - 2 + i * lineH));
  }
};
