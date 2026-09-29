// Intelligence layer: turns raw signals into a senior GTM analyst briefing.
// No external LLM required — deterministic synthesis from score, intent,
// thread evidence + the user's ICP, shaped to read back in Bedrock later.
// Voice script sounds like a GTM engineer reporting, not a list reader.
import type { IcpPreset } from "./presets.js";

export interface AnalyzedSignal {
  signal_id: string;
  score: number;
  title: string;
  source_label: string;
  source_url: string;
  thread_url: string;
  posted_at: string | null;
  intent_type: string;
  author: string;
  raw_text: string;
  evidence: string[];
  outreach: string;
  verdict: "PURSUE" | "NURTURE" | "MONITOR";
  verdict_reason: string;
  what_it_means: string;
  thread_summary: string;
  next_action: string;
  speak: string;
}

function verdictFor(score: number, intent: string): AnalyzedSignal["verdict"] {
  const hot = ["switching", "urgent_need", "compliance"].includes(intent);
  if (score >= 8.2 || (hot && score >= 7.8)) return "PURSUE";
  if (score >= 7.2) return "NURTURE";
  return "MONITOR";
}

function businessLens(presetId: string): { you_sell: string; win: string } {
  if (presetId === "ai-cost")
    return {
      you_sell: "private, compliant AI inference that cuts spend",
      win: "every bill-spike or SOC2-blocked thread is a displacement opportunity against public APIs",
    };
  if (presetId === "home-services")
    return {
      you_sell: "same-day vetted pros with quotes in the hour",
      win: "every urgent help-request is bookable revenue if you respond first with a quote",
    };
  return {
    you_sell: "real-time problem-level signals pushed to Slack/CRM",
    win: "every stale-alert or webhook-delay complaint is a competitor displacement against Clay, Apollo and ZoomInfo",
  };
}

function summarizeThread(s: any): string {
  const quotes = (s.direct_evidence ?? []).slice(0, 2).join(" / ");
  const base = (s.raw_text ?? "").trim();
  // 2-sentence human summary, no jargon
  return `${s.author ? `${s.author} writes: ` : ""}“${base}”${quotes ? ` Key lines: ${quotes}.` : ""}`;
}

function actionFor(s: any, verdict: string): string {
  const id = s.signal_id;
  if (s.intent_type === "urgent_need")
    return `Respond in-thread within the hour with 2 time slots and a price range, then push ${id} to dispatch. Speed wins — don't nurture this one.`;
  if (verdict === "PURSUE")
    return `Reply in-thread within 4 hours referencing their exact pain, then push ${id} to Slack #signals with owner assigned. Use the outreach draft on the card — it's written from their words.`;
  if (verdict === "NURTURE")
    return `Save ${id} to a 7-day watchlist and reply with a useful teardown, not a pitch. Push to CRM as nurture; revisit if they post again.`;
  return `No action today — keep ${id} monitored. If score rises above 7.5 or they mention a competitor by name, escalate to nurture.`;
}

export function analyzeSignals(signals: any[], preset: IcpPreset): AnalyzedSignal[] {
  const lens = businessLens(preset.id);
  return signals.map((s) => {
    const verdict = verdictFor(Number(s.score ?? 0), String(s.intent_type ?? ""));
    const thread_summary = summarizeThread(s);
    const what_it_means =
      verdict === "PURSUE"
        ? `This is a buying window for you: they describe the exact pain your ${lens.you_sell} solves. ${lens.win[0].toUpperCase() + lens.win.slice(1)}.`
        : verdict === "NURTURE"
          ? `Relevant but not yet urgent: they feel the pain your ${lens.you_sell} solves, but haven't asked to switch. Stay helpful and visible.`
          : `Background noise for now: matches keywords but lacks urgency or ownership. Watch, don't chase.`;
    const verdict_reason =
      verdict === "PURSUE"
        ? `Score ${s.score} + intent “${s.intent_type}” + explicit help-request language.`
        : verdict === "NURTURE"
          ? `Score ${s.score} shows fit, but language is exploratory rather than ready-to-buy.`
          : `Score ${s.score} is below the action bar for ${preset.name}.`;
    const next_action = actionFor(s, verdict);
    const speak =
      `${s.title}. ` +
      `Verdict: ${verdict.toLowerCase()}. ${what_it_means} ` +
      `In their words: ${s.raw_text} ` +
      `Next step: ${next_action}`;
    return {
      signal_id: s.signal_id,
      score: s.score,
      title: s.title,
      source_label: s.source_label,
      source_url: s.source_url,
      thread_url: s.thread_url ?? s.source_url,
      posted_at: s.posted_at ?? null,
      intent_type: s.intent_type,
      author: s.author ?? "",
      raw_text: s.raw_text ?? "",
      evidence: s.direct_evidence ?? [],
      outreach: s.suggested_outreach ?? "",
      verdict,
      verdict_reason,
      what_it_means,
      thread_summary,
      next_action,
      speak,
    };
  });
}

export function buildVoiceScript(analyzed: AnalyzedSignal[], preset: IcpPreset, live: boolean): string {  const n = analyzed.length;
  const pursue = analyzed.filter((a) => a.verdict === "PURSUE");
  const who = preset.id === "home-services" ? "homeowner requests" : preset.id === "ai-cost" ? "infrastructure signals" : "buyer signals";
  const head =
    `Morning. I'm looking at your ${preset.name} watchlist${live ? "" : ", demo data"}. ` +
    `${n} ${who} came in. ` +
    (pursue.length
      ? `I'd pursue ${pursue.length} of them today${n - pursue.length ? `, nurture ${n - pursue.length}` : ""}. `
      : `Nothing I'd chase hard today — here's how I'd triage them. `);
  const body = analyzed
    .slice(0, 3)
    .map((a, i) => {
      const ord = ["First", "Second", "Third"][i] ?? `Number ${i + 1}`;
      return (
        `${ord}: ${a.title} Score ${a.score}. ` +
        `My take: ${a.what_it_means} ` +
        `They said: ${a.raw_text} ` +
        `Verdict ${a.verdict.toLowerCase()} — ${a.verdict_reason} ` +
        `Next: ${a.next_action}`
      );
    })
    .join(" ");
  const tail =
    pursue.length
      ? ` If you only do one thing: work the top pursue — reply in-thread today and push it to Slack with an owner. I put the exact reply draft on each card.`
      : ` If you only do one thing: leave one helpful reply on the top nurture and let the monitors sit.`;
  return `${head}${body}${tail}`;
}

// Short spoken opener (~60 words): what she SAYS aloud. The full script above
// stays on screen for reading. Never loses context: counts + top verdict +
// the one action + an explicit offer to go deeper.
export function buildSpokenSummary(analyzed: AnalyzedSignal[], preset: IcpPreset, live: boolean): string {
  const n = analyzed.length;
  if (!n) return `Nothing on your ${preset.name} watchlist right now. Try another watchlist, or run a sweep first.`;
  const pursue = analyzed.filter((a) => a.verdict === "PURSUE");
  const top = analyzed[0];
  const who = preset.id === "home-services" ? "urgent homeowner requests" : preset.id === "ai-cost" ? "infrastructure signals" : "buyer signals";
  const head =
    `Morning. ${n} ${who} on your ${preset.name} watchlist${live ? "" : ", demo data"}. ` +
    (pursue.length === n && n > 1
      ? `I'd pursue all ${n} today. `
      : pursue.length
        ? `I'd pursue ${pursue.length} of ${n} today. `
        : `Nothing I'd chase hard — one to nurture, rest to watch. `);
  const topLine =
    `Top one: ${top.title} Score ${top.score}, verdict ${top.verdict.toLowerCase()}. ` +
    `${top.next_action} `;
  const offer = `Say "tell me more on number one" for the full story, or "push number one" and I'll send it to Slack.`;
  return `${head}${topLine}${offer}`;
}
