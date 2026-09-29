// Express-side /api/speech: proxies to Workers AI REST when Cloudflare
// credentials are present (local dev / Vercel). Deployed Worker (worker/speech.ts)
// with AI binding is preferred on Cloudflare — no token needed there.
// Env (gitignored .env, never committed):
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (Workers AI read+write)
import express from "express";

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";

export function createSpeechRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "100kb" }));

  router.get("/api/speech-health", (_req, res) =>
    res.json({ ok: true, cloudflare: Boolean(ACCOUNT && TOKEN), models: ["@cf/deepgram/aura-1", "@cf/myshell-ai/melotts", "@cf/openai/whisper"] })
  );

  router.post("/api/transcribe", express.raw({ type: "audio/*", limit: "8mb" }), async (req, res) => {
    if (!ACCOUNT || !TOKEN) {
      return res.status(501).json({
        error: "Cloudflare credentials not configured. Use the deployed worker/speech.ts /api/transcribe instead.",
      });
    }
    const buf = req.body as Buffer;
    if (!buf?.length) return res.status(400).json({ error: "empty audio" });
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/openai/whisper`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "audio/webm" },
        body: buf as unknown as BodyInit,
      });
      if (!r.ok) return res.status(502).json({ error: `Whisper ${r.status}: ${(await r.text()).slice(0, 200)}` });
      const j = (await r.json()) as any;
      return res.json({ text: j?.result?.text ?? j?.text ?? "" });
    } catch (e) {
      return res.status(502).json({ error: `transcribe failed: ${(e as Error).message}` });
    }
  });

  router.post("/api/speech", async (req, res) => {
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ error: "text required" });
    if (text.length > 4000) return res.status(400).json({ error: "max 4000 chars — split the brief" });
    if (!ACCOUNT || !TOKEN) {
      return res.status(501).json({
        error: "Cloudflare credentials not configured. Deploy worker/speech.ts (wrangler deploy) or set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.",
      });
    }
    const model = req.body?.model === "melotts" ? "@cf/myshell-ai/melotts" : "@cf/deepgram/aura-1";
    const input = model.includes("melotts") ? { prompt: text.slice(0, 1500), lang: "en" } : { text: text.slice(0, 1500) };
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const ctype = r.headers.get("content-type") ?? "";
      if (!r.ok) {
        const t = await r.text();
        return res.status(502).json({ error: `Workers AI ${r.status}: ${t.slice(0, 200)}` });
      }
      if (ctype.includes("application/json")) {
        // MeloTTS via REST returns { result: { audio: base64 } } or { audio: base64 }
        const j = (await r.json()) as any;
        const b64 = j?.result?.audio ?? j?.audio;
        if (!b64) return res.status(502).json({ error: "Workers AI returned no audio" });
        const buf = Buffer.from(b64, "base64");
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("X-Voice-Model", model);
        return res.send(buf);
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-Voice-Model", model);
      return res.send(buf);
    } catch (e) {
      return res.status(502).json({ error: `Workers AI call failed: ${(e as Error).message}` });
    }
  });
  return router;
}
