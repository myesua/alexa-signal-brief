// Express-side voice router: human voice with automatic provider fallback.
// Chain: NVIDIA NIM (free trial) -> Cloudflare Aura-1 -> Cloudflare MeloTTS.
// Keys live in gitignored .env, never committed, never sent to the browser.
// Deployed worker/speech.ts (AI binding) remains the Cloudflare-native path.
import express from "express";

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";
const NV_KEY = process.env.NVIDIA_API_KEY ?? "";
const NV_MODEL = process.env.NVIDIA_TTS_MODEL ?? "nvidia/magpie-tts-multilingual";
const NV_VOICE = process.env.NVIDIA_TTS_VOICE ?? "Magpie-Multilingual.EN-US.Aria";

// NVIDIA NIM hosted TTS (OpenAI-compatible): POST /v1/audio/speech -> audio bytes.
// Free trial tier, no card; rate-limited per model. Throws on any non-2xx.
async function nvidiaTTS(text: string): Promise<{ buf: Buffer; ctype: string }> {
  const r = await fetch("https://integrate.api.nvidia.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${NV_KEY}`, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ model: NV_MODEL, input: text.slice(0, 1000), voice: NV_VOICE, response_format: "mp3" }),
  });
  if (!r.ok) throw new Error(`NVIDIA ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { buf: Buffer.from(await r.arrayBuffer()), ctype: r.headers.get("content-type") ?? "audio/mpeg" };
}

async function cfTTS(text: string, model: string): Promise<{ buf: Buffer; ctype: string; label: string }> {
  const m = model === "melotts" ? "@cf/myshell-ai/melotts" : "@cf/deepgram/aura-1";
  const input = m.includes("melotts") ? { prompt: text.slice(0, 1500), lang: "en" } : { text: text.slice(0, 1500) };
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${m}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const ctype = r.headers.get("content-type") ?? "";
  if (!r.ok) throw new Error(`Workers AI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if (ctype.includes("application/json")) {
    const j = (await r.json()) as any;
    const b64 = j?.result?.audio ?? j?.audio;
    if (!b64) throw new Error("Workers AI returned no audio");
    return { buf: Buffer.from(b64, "base64"), ctype: "audio/wav", label: m };
  }
  return { buf: Buffer.from(await r.arrayBuffer()), ctype: "audio/mpeg", label: m };
}

export function createSpeechRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "100kb" }));

  router.get("/api/speech-health", (_req, res) =>
    res.json({
      ok: true,
      nvidia: Boolean(NV_KEY),
      cloudflare: Boolean(ACCOUNT && TOKEN),
      chain: ["nvidia-nim", "@cf/deepgram/aura-1", "@cf/myshell-ai/melotts"],
    })
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
    const errors: string[] = [];

    // 1) NVIDIA NIM free trial (skipped without key)
    if (NV_KEY) {
      try {
        const out = await nvidiaTTS(text);
        res.setHeader("Content-Type", out.ctype);
        res.setHeader("X-Voice-Model", `nvidia:${NV_MODEL}`);
        return res.send(out.buf);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    // 2) Cloudflare Aura-1, 3) MeloTTS (skipped without credentials)
    if (ACCOUNT && TOKEN) {
      for (const m of req.body?.model === "melotts" ? ["melotts"] : ["aura-1", "melotts"]) {
        try {
          const out = await cfTTS(text, m);
          res.setHeader("Content-Type", out.ctype);
          res.setHeader("X-Voice-Model", out.label);
          return res.send(out.buf);
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
    }
    if (!NV_KEY && !(ACCOUNT && TOKEN)) {
      return res.status(501).json({
        error: "No voice provider configured. Set NVIDIA_API_KEY or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN in .env, or deploy worker/speech.ts.",
      });
    }
    return res.status(502).json({ error: `All voice providers failed: ${errors.join(" | ").slice(0, 400)}` });
  });
  return router;
}
