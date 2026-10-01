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
    // Fish ASR first (same free key), CF Whisper fallback. try/catch keeps CORS
    // headers on every path so the browser never reports a misleading CORS error.
    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      let fishErr = "";
      try {
        const ctype = request.headers.get("content-type") ?? "";
        const buf = await request.arrayBuffer();
        if (!buf.byteLength) return Response.json({ error: "empty audio" }, { status: 400, headers: CORS });
        if (buf.byteLength > 8 * 1024 * 1024) return Response.json({ error: "max 8MB per clip" }, { status: 400, headers: CORS });
        if (env.FISH_API_KEY) {
          try {
            const form = new FormData();
            form.append("audio", new Blob([buf as ArrayBuffer], { type: ctype.split(";")[0] || "audio/webm" }), "clip");
            form.append("language", "en");
            const fr = await fetch("https://api.fish.audio/v1/asr", {
              method: "POST",
              headers: { Authorization: `Bearer ${env.FISH_API_KEY}` },
              body: form,
            });
            const fj = (await fr.json()) as any;
            if (fr.ok && typeof fj?.text === "string") {
              return Response.json({ text: fj.text, via: "fish" }, { headers: CORS });
            }
            throw new Error(`fish-asr ${fr.status}: ${JSON.stringify(fj).slice(0, 160)}`);
          } catch (e) {
            fishErr = String((e as Error)?.message ?? e).slice(0, 200);
            console.warn("fish asr failed, falling back to whisper:", fishErr);
          }
        }
        const out = (await env.AI.run("@cf/openai/whisper", {
          audio: [...new Uint8Array(buf as ArrayBuffer)],
        })) as unknown as { text?: string };
        return Response.json({ text: out?.text ?? "", via: "whisper", content_type: ctype.split(";")[0] }, { headers: CORS });
      } catch (e) {
        const detail = String((e as Error)?.message ?? e).slice(0, 300);
        return Response.json(
          { error: "transcribe failed", detail, fish_note: fishErr || undefined },
          { status: 502, headers: CORS }
        );
      }
    }

    // Open conversation: ANY natural question about today's signals.
    // Frontend sends the already-fetched analyzed cards as context; llama answers.
    // ~18 neurons/question on fp8-fast (~500/day free). 502 -> client regex fallback.
    if (url.pathname === "/api/ask" && request.method === "POST") {
      try {
        const q = (await request.json()) as {
          message?: string;
          preset?: { id?: string; name?: string; product_description?: string; target_audience?: string; keywords?: string };
          signals?: any[];
          history?: { role?: string; text?: string }[];
        };
        const message = String(q.message ?? "").trim();
        if (!message) return Response.json({ error: "message required" }, { status: 400, headers: CORS });
        const sigs = Array.isArray(q.signals) ? q.signals.slice(0, 5) : [];
        if (!sigs.length) return Response.json({ error: "no signals in context — fetch /api/brief first" }, { status: 400, headers: CORS });
        const p = q.preset ?? {};
        const sigBlock = sigs
          .map(
            (s: any, i: number) =>
              `#${i + 1} [${s.signal_id}] score ${s.score} verdict ${s.verdict} intent ${s.intent_type}\n` +
              `Title: ${s.title}\nSource: ${s.source} (${s.url})\nSaid: ${String(s.raw_text ?? "").slice(0, 300)}\n` +
              `Why it matters: ${s.what_it_means ?? ""}\nNext: ${s.next_action ?? ""}\nOutreach: ${s.outreach ?? ""}`
          )
          .join("\n\n");
        const hist = (Array.isArray(q.history) ? q.history : []).slice(-4);
        const out = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8-fast", {
          messages: [
            {
              role: "system",
              content:
                `You are Alexa Signal Brief, a senior GTM analyst reporting by voice. Warm, direct, concrete. Never say you are AI.\n` +
                `BUSINESS: ${p.product_description ?? ""}\nAudience: ${p.target_audience ?? ""}\n\n` +
                `TODAY'S SIGNALS:\n${sigBlock}\n\n` +
                `Cite signal numbers, scores, exact quotes. Verdicts as PURSUE/NURTURE/MONITOR with reasons tied to their business. ` +
                `For "how do I reach them" give the thread link plus a ready reply. ` +
                `"spoken" <= 60 words, conversational, ends with an offer. "full" is complete markdown with bold verdicts and plain URLs.\n` +
                `Reply ONLY with valid JSON: {"spoken": "...", "full": "..."}`,
            },
            ...hist.map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: String(t.text ?? "").slice(0, 800) })),
            { role: "user", content: message.slice(0, 800) },
          ],
          temperature: 0.4,
          max_tokens: 600,
        })) as any;
        const respText =
          typeof out?.response === "string"
            ? out.response
            : typeof out?.choices?.[0]?.message?.content === "string"
              ? out.choices[0].message.content
              : typeof out === "string"
                ? out
                : "";
        if (!respText.trim()) throw new Error("empty completion: " + JSON.stringify(out).slice(0, 200));
        const raw = respText;
        let spoken = "", full = raw.trim();
        try {
          const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
          full = String(parsed.full ?? parsed.answer ?? raw).trim();
          spoken = String(parsed.spoken ?? "").trim();
        } catch { /* use raw */ }
        if (!spoken) {
          const words = full.replace(/[#*`>\-]/g, "").split(/\s+/);
          spoken = (words.length <= 60 ? full : words.slice(0, 60).join(" ") + "…").replace(/[#*`>\-]/g, "");
        }
        return Response.json({ spoken, full, via: "cf-llama" }, { headers: CORS });
      } catch (e) {
        return Response.json(
          { error: "ask failed", detail: String((e as Error)?.message ?? e).slice(0, 300) },
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
