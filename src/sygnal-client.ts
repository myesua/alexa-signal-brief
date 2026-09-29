// Sygnal MCP client with fixtures fallback.
// Live endpoint: https://api.trysygnal.com/mcp (JSON-RPC over Streamable HTTP)
// 2026-09-12: list_signals returns RAW_QUERY_RESTRICTED -> fixtures keep demo/judging unblocked.
// Profile/sources/sweep endpoints DO work live when an API key is supplied.
import fs from "node:fs";
import path from "node:path";
import { PRESETS } from "./presets.js";

const MCP_URL = process.env.SYGNAL_MCP_URL ?? "https://api.trysygnal.com/mcp";
const ENV_KEY = process.env.SYGNAL_API_KEY ?? "";
const MOCK_DEFAULT = (process.env.MOCK_SIGNALS ?? "true").toLowerCase() !== "false";

export function resolveKey(reqKey?: string) {
  return (reqKey ?? "").trim() || ENV_KEY;
}

async function mcpToolsCall(
  apiKey: string,
  tool: string,
  args: Record<string, unknown>,
  id = 1
) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  return (await res.json()) as any;
}

function readFixtures(preset = "gtm-switchers") {
  const candidates = [
    path.join(process.cwd(), "fixtures", `signals-${preset}.json`),
    path.join(process.cwd(), "fixtures", "signals.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8")) as any[];
    } catch { /* try next */ }
  }
  return [];
}

function readAllFixtures() {
  const files = ["signals-gtm-switchers.json", "signals-ai-cost.json", "signals-home-services.json", "signals.json"];
  const out: any[] = [];
  for (const f of files) {
    try {
      const p = path.join(process.cwd(), "fixtures", f);
      if (fs.existsSync(p)) out.push(...JSON.parse(fs.readFileSync(p, "utf-8")));
    } catch { /* ignore */ }
  }
  return out;
}

const SOURCES_BY_PRESET: Record<string, any[]> = {
  "gtm-switchers": [
    { source_id: "clay-community", name: "Clay Community", detail: "webhook & alerts threads", type: "forum", enabled: true, status: "watching", url: "https://community.clay.com/s/search?query=webhook%20alerts%20delayed" },
    { source_id: "revops", name: "RevOps Co-op", detail: "intent-to-CRM pain", type: "forum", enabled: true, status: "watching", url: "https://www.google.com/search?q=site%3Arevopscoop.com+buying+intent+webhook+CRM" },
    { source_id: "msp", name: "Modern Sales Pros", detail: "signal routing", type: "forum", enabled: true, status: "watching", url: "https://themodernsalespros.com/?s=buying+intent+sales+alerts" },
    { source_id: "r-sales", name: "r/sales", detail: "Clay / ZoomInfo complaints", type: "reddit", enabled: true, status: "watching", url: "https://www.reddit.com/r/sales/search?q=Clay+OR+ZoomInfo+intent&restrict_sr=1&sort=new" },
    { source_id: "x-gtm", name: "X Live Search", detail: "GTM missing signals", type: "social", enabled: false, status: "paused", url: "https://x.com/search?q=%22buying%20intent%22%20Clay%20webhook&f=live" },
  ],
  "ai-cost": [
    { source_id: "r-llama", name: "r/LocalLLaMA", detail: "self-hosted bill talk", type: "reddit", enabled: true, status: "watching", url: "https://www.reddit.com/r/LocalLLaMA/search?q=self+hosted+OpenAI+bill&restrict_sr=1&sort=new" },
    { source_id: "hn", name: "Hacker News", detail: "SOC2 + residency", type: "forum", enabled: true, status: "watching", url: "https://news.ycombinator.com/search?query=SOC2+AI+data+residency" },
    { source_id: "r-ml", name: "r/MachineLearning", detail: "Bedrock vs NIM prod", type: "reddit", enabled: true, status: "watching", url: "https://www.reddit.com/r/MachineLearning/search?q=Bedrock+NIM+prod&restrict_sr=1&sort=new" },
  ],
  "home-services": [
    { source_id: "r-home", name: "r/HomeImprovement", detail: "urgent repair asks", type: "reddit", enabled: true, status: "watching", url: "https://www.reddit.com/r/HomeImprovement/search?q=need+emergency+plumber&restrict_sr=1&sort=new" },
    { source_id: "nextdoor", name: "Nextdoor", detail: "quotes needed", type: "social", enabled: true, status: "watching", url: "https://nextdoor.com/search/?query=looking+for+cleaner+quotes" },
  ],
};

// --- Signals (live currently restricted -> per-preset fixtures, annotated) ---
export async function listSignalsRanked(limit = 3, apiKey = "", preset = "gtm-switchers") {
  const key = resolveKey(apiKey);
  if (!MOCK_DEFAULT && key) {
    try {
      const json = await mcpToolsCall(key, "list_signals", { limit, sort: "ranking", score_min: 5 }, 12);
      const text = json?.result?.content?.[0]?.text ?? "";
      if (!json?.result?.isError && !text.includes("RAW_QUERY_RESTRICTED")) {
        const parsed = JSON.parse(text);
        const signals = parsed.signals ?? parsed;
        if (Array.isArray(signals) && signals.length) return { signals: signals.slice(0, limit), live: true };
      }
      throw new Error("list_signals restricted, using fixtures");
    } catch (e) {
      console.warn("[sygnal] live signals failed:", (e as Error).message);
    }
  }
  return { signals: readFixtures(preset).slice(0, limit), live: false, preset };
}

export async function getSignalThread(signal_id: string) {
  const all = readAllFixtures();
  const found = all.find((s: any) => s.signal_id === signal_id) ?? all[0];
  return { ...found, live: false };
}

// --- Onboarding: profile / sources / sweep (work live with key, else local) ---
export async function getProfile(apiKey = "") {
  const key = resolveKey(apiKey);
  if (key) {
    try {
      const json = await mcpToolsCall(key, "get_profile", {}, 15);
      const text = json?.result?.content?.[0]?.text ?? "";
      if (!json?.result?.isError && text) return { profile: JSON.parse(text).profile, live: true };
    } catch (e) {
      console.warn("[sygnal] get_profile failed:", (e as Error).message);
    }
  }
  return { profile: { ...PRESETS[0], updated_at: null }, live: false };
}

export async function setProfile(
  profile: { product_description: string; keywords: string; target_audience: string },
  apiKey = ""
) {
  const key = resolveKey(apiKey);
  if (key) {
    try {
      const json = await mcpToolsCall(key, "set_profile", profile, 10);
      const text = json?.result?.content?.[0]?.text ?? "";
      if (!json?.result?.isError && text) return { profile: JSON.parse(text).profile, live: true };
    } catch (e) {
      console.warn("[sygnal] set_profile failed:", (e as Error).message);
    }
  }
  return { profile: { ...profile, updated_at: new Date().toISOString() }, live: false };
}

export async function listSources(apiKey = "", preset = "gtm-switchers") {
  const key = resolveKey(apiKey);
  if (key) {
    try {
      const json = await mcpToolsCall(key, "list_sources", {}, 16);
      const sc = json?.result?.structuredContent?.sources;
      if (Array.isArray(sc) && sc.length) {
        return {
          sources: sc.slice(0, 12).map((s: any) => ({
            source_id: String(s.source_id ?? s.identifier),
            name: s.name ?? s.identifier,
            type: s.type ?? "serp",
            identifier: s.identifier,
            enabled: s.enabled ?? true,
            status: s.status ?? "active",
          })),
          live: true,
        };
      }
    } catch (e) {
      console.warn("[sygnal] list_sources failed:", (e as Error).message);
    }
  }
  // Curated fallback with REAL deep thread/search URLs, per selected ICP
  return {
    live: false,
    preset,
    sources: SOURCES_BY_PRESET[preset] ?? SOURCES_BY_PRESET["gtm-switchers"],
  };
}

export async function sweepAll(apiKey = "") {
  const key = resolveKey(apiKey);
  if (key) {
    try {
      const json = await mcpToolsCall(key, "sweep", {}, 11);
      const text = json?.result?.content?.[0]?.text ?? "";
      if (!json?.result?.isError && text) return { ...JSON.parse(text), live: true };
    } catch (e) {
      console.warn("[sygnal] sweep failed:", (e as Error).message);
    }
  }
  return { queued: 5, source_id: null, live: false };
}
