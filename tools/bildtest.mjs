// Echter Test der Bilderzeugung (läuft auf GitHub, nicht in der App).
import fs from "node:fs";
const cfg = JSON.parse(fs.readFileSync("tools/bildtest.config.json", "utf8"));
const H = "https://aihorde.net/api/v2";
const AGENT = "HeroComicStudio:test:github.com/h2myshf2dj-alt/hero-comic-studio";
const head = { "Content-Type": "application/json", apikey: "0000000000", "Client-Agent": AGENT };
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync("out", { recursive: true });
const log = [];
const say = (...a) => { const l = a.join(" "); console.log(l); log.push(l); };

if (cfg.listModels) {
  const r = await fetch(H + "/status/models?type=image&min_count=1", { headers: head });
  const list = (await r.json()).sort((a, b) => b.count - a.count);
  say("MODELS total", list.length);
  list.slice(0, 60).forEach(m => say(`  ${m.name} | workers ${m.count} | queued ${Math.round(m.queued)} | eta ${m.eta}`));
  const cors = await fetch(H + "/status/heartbeat", { headers: { Origin: "https://h2myshf2dj-alt.github.io" } });
  say("CORS allow-origin:", cors.headers.get("access-control-allow-origin"));
}

async function gen(job) {
  const body = {
    prompt: job.prompt + (job.negative ? " ### " + job.negative : ""),
    params: { sampler_name: job.sampler || "k_euler_a", cfg_scale: job.cfg ?? 7, width: job.w || 512, height: job.h || 512,
      steps: job.steps || 20, n: 1, seed: String(job.seed ?? 4242), karras: true, ...(job.params || {}) },
    nsfw: false, censor_nsfw: true, r2: false, shared: false, slow_workers: true, trusted_workers: false
  };
  if (job.model) body.models = [job.model];
  const t0 = Date.now();
  let id;
  for (let a = 0; a < 10 && !id; a++) {
    const r = await fetch(H + "/generate/async", { method: "POST", headers: head, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.id) { id = j.id; break; }
    say(`  [${job.name}] submit ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    if (r.status !== 429 && r.status !== 503) return;
    await sleep(8000);
  }
  if (!id) return;
  while (Date.now() - t0 < 600000) {
    await sleep(5000);
    const c = await (await fetch(H + "/generate/check/" + id, { headers: head })).json().catch(() => ({}));
    if (c.faulted || c.is_possible === false) { say(`  [${job.name}] faulted/impossible ${JSON.stringify(c)}`); return; }
    if (c.done) break;
  }
  const s = await (await fetch(H + "/generate/status/" + id, { headers: head })).json();
  const g = s.generations && s.generations[0];
  if (!g) { say(`  [${job.name}] no generation: ${JSON.stringify(s).slice(0, 300)}`); return; }
  fs.writeFileSync(`out/${job.name}.webp`, Buffer.from(g.img, "base64"));
  say(`  [${job.name}] OK ${Math.round((Date.now() - t0) / 1000)}s model=${g.model} censored=${g.censored} worker=${g.worker_name}`);
}

const queue = [...(cfg.jobs || [])];
const worker = async () => { while (queue.length) { const j = queue.shift(); try { await gen(j); } catch (e) { say(`  [${j.name}] ERROR ${e.message}`); } } };
await Promise.all(Array.from({ length: cfg.parallel || 3 }, worker));
fs.writeFileSync("out/log.txt", log.join("\n"));
