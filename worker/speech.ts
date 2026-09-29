// Cloudflare Worker: /api/speech — human voice for the Alexa+ simulator.
// Aura-1 primary (context-aware, natural pacing), MeloTTS fallback (cheap).
// Free tier: 10,000 neurons/day. Aura-1 = 1,363 neurons/1k chars (~7k chars/day
// free). MeloTTS = 18.6 neurons/audio-min (effectively unlimited for demo).
// Deploy: wrangler deploy. Test: curl -X POST <url>/api/speech -d '{"text":"Morning..."}' --output brief.mp3

interface Env {
  AI: { run(model: string, input: Record<string, unknown>, opts?: Record<string, unknown>): Promise<Response> };
  NVIDIA_API_KEY?: string;
  NVIDIA_TTS_MODEL?: string;
  NVIDIA_TTS_VOICE?: string;
  FISH_API_KEY?: string;
}

// Free, no-card provider first (bypasses CF neuron quota):
// Fish Audio s2.1-pro-free — no hard cap.
async function fishTTS(text: string, key: string): Promise<Response> {
  return fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: "s2.1-pro-free" },
    body: JSON.stringify({ text: text.slice(0, 1000), format: "mp3", normalize: true }),
  });
}
function audioOrThrow(r: Response, label: string): Promise<Response> {
  if (r.ok && (r.headers.get("content-type") ?? "").includes("audio")) return Promise.resolve(r);
  return r.text().then((t) => {
    throw new Error(`${label} ${r.status}: ${t.slice(0, 160)}`);
  });
}

const MAX_CHARS = 1500;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (url.pathname === "/api/speech-health" && request.method === "GET") {
      return Response.json(
        { ok: true, fish: Boolean(env.FISH_API_KEY), nvidia: Boolean(env.NVIDIA_API_KEY), models: ["fish:s2.1-pro-free", "nvidia-nim", "@cf/deepgram/aura-1", "@cf/myshell-ai/melotts", "@cf/openai/whisper"] },
        { headers: CORS }
      );
    }

    // Speech-to-text: POST binary audio (webm/wav/mp3 from MediaRecorder) -> { text }
    // Wrapped in try/catch so failures always carry CORS headers (else the
    // browser reports a misleading CORS error instead of the real 500 cause).
    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      try {
        const ctype = request.headers.get("content-type") ?? "";
        const buf = await request.arrayBuffer();
        if (!buf.byteLength) return Response.json({ error: "empty audio" }, { status: 400, headers: CORS });
        if (buf.byteLength > 8 * 1024 * 1024) return Response.json({ error: "max 8MB per clip" }, { status: 400, headers: CORS });
        const out = (await env.AI.run("@cf/openai/whisper", {
          audio: [...new Uint8Array(buf)],
        })) as unknown as { text?: string };
        return Response.json({ text: out?.text ?? "", content_type: ctype.split(";")[0] }, { headers: CORS });
      } catch (e) {
        return Response.json(
          { error: "transcribe failed", detail: String((e as Error)?.message ?? e).slice(0, 300) },
          { status: 502, headers: CORS }
        );
      }
    }

    if (url.pathname !== "/api/speech" || request.method !== "POST") {
      return Response.json({ error: "POST /api/speech with {text}" }, { status: 404, headers: CORS });
    }

    let body: { text?: string; speaker?: string; model?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400, headers: CORS });
    }
    const text = (body.text ?? "").trim();
    if (!text) return Response.json({ error: "text required" }, { status: 400, headers: CORS });
    if (text.length > 4000) return Response.json({ error: "max 4000 chars per call — split the brief" }, { status: 400, headers: CORS });

    const want = body.model === "melotts" ? "melotts" : "auto";
    const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
    const failures: string[] = [];
    const passthrough = (r: Response, label: string) =>
      new Response(r.body, {
        headers: { ...CORS, "Content-Type": r.headers.get("content-type") ?? "audio/mpeg", "X-Voice-Model": label },
      });
    // 1) Fish Audio s2.1-pro-free (free, no hard cap) 2) ElevenLabs free tier
    // 1) Fish Audio s2.1-pro-free (free, no hard cap)
    if (want === "auto" && env.FISH_API_KEY) {
      try {
        return passthrough(await audioOrThrow(await fishTTS(text, env.FISH_API_KEY), "fish"), "fish:s2.1-pro-free");
      } catch (e) {
        failures.push(String((e as Error)?.message ?? e).slice(0, 160));
      }
    }
    if (want === "auto" && env.NVIDIA_API_KEY) {
      try {
        const r = await fetch("https://integrate.api.nvidia.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            model: env.NVIDIA_TTS_MODEL || "nvidia/magpie-tts-multilingual",
            input: clip(text, 1000),
            voice: env.NVIDIA_TTS_VOICE || "Magpie-Multilingual.EN-US.Aria",
            response_format: "mp3",
          }),
        });
        if (r.ok && (r.headers.get("content-type") ?? "").includes("audio")) {
          return new Response(r.body, {
            headers: { ...CORS, "Content-Type": r.headers.get("content-type") ?? "audio/mpeg", "X-Voice-Model": "nvidia-nim" },
          });
        }
        failures.push(`nvidia ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
      } catch (e) {
        console.warn("nvidia tts failed, falling back:", (e as Error).message);
      }
    }

    try {
      if (want !== "melotts") {
        const resp = await env.AI.run(
          "@cf/deepgram/aura-1",
          { text: clip(text, MAX_CHARS), speaker: body.speaker ?? "athena" },
          { returnRawResponse: true }
        );
        const ct = resp.headers.get("content-type") ?? "";
        if (!resp.ok || ct.includes("application/json")) {
          // Quota/model errors come back as JSON — fall through, don't serve as audio
          const t = await resp.text().catch(() => "");
          throw new Error(`aura-1 ${resp.status}: ${t.slice(0, 200)}`);
        }
        return new Response(resp.body, {
          headers: { ...CORS, "Content-Type": "audio/mpeg", "X-Voice-Model": "aura-1" },
        });
      }
    } catch (e) {
      failures.push(`aura-1: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
    }
    // Fallback: MeloTTS returns JSON { audio: base64 } — decode to bytes
    try {
      const melo = (await env.AI.run("@cf/myshell-ai/melotts", {
        prompt: clip(text, MAX_CHARS),
        lang: "en",
      })) as unknown as { audio?: string; error?: string };
      if (melo?.audio) {
        const bin = Uint8Array.from(atob(melo.audio), (c) => c.charCodeAt(0));
        return new Response(bin.buffer as ArrayBuffer, {
          headers: { ...CORS, "Content-Type": "audio/wav", "X-Voice-Model": "melotts" },
        });
      }
      throw new Error((melo as any)?.error ?? (melo as any)?.detail ?? "melotts returned no audio");
    } catch (e) {
      failures.push(`melotts: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
      return Response.json(
        { error: "all voice providers failed", detail: failures.join(" | ").slice(0, 500) },
        { status: 502, headers: CORS }
      );
    }
  },
} satisfies ExportedHandler<Env>;
