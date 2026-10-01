// Conversational brain: answers ANY natural question about today's signals
// using an LLM (NVIDIA hosted trial first, regex fallback when unreachable).
// The model gets the user's ICP + fully analyzed signals, and must return
// JSON { spoken, full }: spoken <= 60 words for voice, full markdown for screen.
import type { IcpPreset } from "./presets.js";
import type { AnalyzedSignal } from "./intelligence.js";

const NV_KEY = process.env.NVIDIA_API_KEY ?? "";
const NV_CHAT_MODELS = [
  process.env.NVIDIA_CHAT_MODEL ?? "nvidia/mistral-nemo-minitron-8b-8k-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
];

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

function systemPrompt(preset: IcpPreset, analyzed: AnalyzedSignal[]): string {
  const sigs = analyzed
    .map(
      (a, i) =>
        `#${i + 1} [${a.signal_id}] score ${a.score} verdict ${a.verdict} intent ${a.intent_type}\n` +
        `Title: ${a.title}\nSource: ${a.source_label} (${a.thread_url})\n` +
        `Author: ${a.author}\nSaid: ${a.raw_text}\n` +
        `Evidence: ${(a.evidence ?? []).join(" / ")}\n` +
        `Why it matters: ${a.what_it_means}\nNext step: ${a.next_action}\n` +
        `Outreach draft: ${a.outreach}`
    )
    .join("\n\n");
  return (
    `You are Alexa Signal Brief, a senior GTM analyst reporting to the business owner by voice. ` +
    `Be warm, direct, and concrete. Never say you are an AI model.\n\n` +
    `THEIR BUSINESS:\n${preset.product_description}\nAudience: ${preset.target_audience}\nKeywords: ${preset.keywords}\n\n` +
    `TODAY'S RANKED SIGNALS:\n${sigs}\n\n` +
    `RULES:\n` +
    `- Answer the actual question using the signals above; cite signal numbers, scores, and exact quotes.\n` +
    `- When asked whether to pursue something, give a verdict (PURSUE/NURTURE/MONITOR) with 1-2 concrete reasons tied to their business.\n` +
    `- When asked what someone wants or how to reach them, quote their words and give the thread link plus a ready-to-send reply.\n` +
    `- If the question is outside these signals, say what you do and don't cover, then offer the closest useful action.\n` +
    `- "spoken" is read aloud: <= 60 words, conversational, ends with an offer (details on another signal, or push to Slack).\n` +
    `- "full" is the complete answer in short markdown (bullets, bold verdicts, links as plain URLs).\n` +
    `Reply with ONLY valid JSON: {"spoken": "...", "full": "..."}`
  );
}

function trimWords(s: string, n: number): string {
  const w = s.split(/\s+/);
  return w.length <= n ? s : w.slice(0, n).join(" ") + "…";
}

async function nvidiaChat(messages: { role: string; content: string }[]): Promise<string> {
  let last = "";
  for (const model of NV_CHAT_MODELS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${NV_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 900 }),
        signal: ctl.signal,
      }).finally(() => clearTimeout(t));
      if (!r.ok) {
        last = `NVIDIA ${r.status}: ${(await r.text()).slice(0, 160)}`;
        continue;
      }
      const j = (await r.json()) as any;
      const text = j?.choices?.[0]?.message?.content ?? "";
      if (text.trim()) return text;
      last = "empty completion";
    } catch (e) {
      last = String((e as Error)?.message ?? e).slice(0, 160);
    }
  }
  throw new Error(last || "NVIDIA chat unreachable");
}

export async function answerQuestion(
  message: string,
  preset: IcpPreset,
  analyzed: AnalyzedSignal[],
  history: Turn[]
): Promise<{ spoken: string; full: string; via: string }> {
  if (!NV_KEY) throw new Error("no LLM key configured");
  const messages = [
    { role: "system", content: systemPrompt(preset, analyzed) },
    ...history.slice(-6).map((t) => ({ role: t.role === "user" ? "user" : "assistant", content: t.text })),
    { role: "user", content: message },
  ];
  const raw = await nvidiaChat(messages);
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const full = String(parsed.full ?? parsed.answer ?? raw).trim();
    const spoken = String(parsed.spoken ?? "").trim() || trimWords(full.replace(/[#*`>\-]/g, ""), 60);
    return { spoken: trimWords(spoken, 70), full, via: "nvidia-llm" };
  } catch {
    const full = raw.trim();
    return { spoken: trimWords(full.replace(/[#*`>\-]/g, ""), 60), full, via: "nvidia-llm" };
  }
}
