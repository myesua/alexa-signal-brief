# Product feedback — one block per tool/API/SDK used

## Sygnal MCP (https://api.trysygnal.com/mcp, own account, authorized third-party integration)
* Used for: ranked buyer-intent signal retrieval (`list_signals`), thread evidence (`get_signal_thread`), profile/sources/sweep onboarding (`set_profile`, `list_sources`, `sweep`), webhook payloads.
* Worked well: profile/sources/sweep round-trips are fast and well-shaped; tool schemas are precise; 18 tools cover the full signal lifecycle without extra plumbing.
* Needs work: (1) `list_signals` currently rejects with `RAW_QUERY_RESTRICTED` (raw-query allowlist blocks `and`) — all sort modes affected, verified Sep 12; (2) server reports MCP `2025-06-18` while the Alexa+ track requires `2025-11-25+`.
* Onboarding 0→hello world: good — `initialize` + `tools/list` + keyed `tools/call` worked first try from curl and from the opencode MCP client.
* Build again? Yes — it is the data engine of the project; the two issues above are fixable server-side and we shipped a fixtures fallback plus a 2025-11-25 proxy in front of it.

## Own MCP proxy (POST /mcp, spec 2025-11-25, Streamable HTTP)
* Used for: `alexa_signal_brief` and `alexa_next_action` tools consumed by the simulated Alexa+ experience.
* Worked well: `initialize`/`tools/list`/`tools/call` implemented in one small Express router; spec version asserted in responses; demo client exercises the full loop.
* Needs work: auth is a shared demo key model — per-user OAuth scoping would be needed for production multi-tenancy.
* Onboarding 0→hello world: trivial — `npm run dev`, POST /mcp, no Amazon-side access needed (gated Alexa+ tools are partner-only; the simulator path requires none).
* Build again? Yes — the proxy is what makes the Sygnal engine Alexa-shaped; it stays.

## Simulator + intelligence (Node + Express + static web UI, deterministic analyst)
* Used for: the Alexa+ simulated experience (per Official Rules alternate path): onboarding, voice loop, verdict cards, Slack push.
* Worked well: zero-build static UI deploys anywhere; `spoken` (≤60-word voice summary) vs `full` (on-screen analysis) split keeps voice snappy; regex intent fallback means the demo never dies when the LLM path is unreachable.
* Needs work: intent parser is keyword/fuzzy based — an LLM re-ranker over the same signal context would handle freer phrasing (planned, kept out to protect demo reliability).
* Onboarding 0→hello world: `npm install && npm run dev`, open localhost:3000, works with zero keys (fixtures + browser voice).
* Build again? Yes — fastest compliant route to a convincing Alexa+ demo.

## Cloudflare Workers AI + Fish Audio (voice in/out)
* Used for: human TTS (`/api/speech`: Fish s2.1-pro-free → Aura-1 → MeloTTS chain) and STT fallback (`/api/transcribe`: Fish ASR → Whisper).
* Worked well: Fish TTS verified live (MP3, first try); Workers AI binding + `wrangler deploy` loop is fast; per-provider `X-Voice-Model` header makes verification trivial.
* Needs work: (1) Workers AI free 10k neurons/day exhausts fast under TTS testing — quota errors arrive as bare 500s without CORS headers, which browsers misreport as CORS failures; (2) Fish free tier covers TTS but not ASR (402) — split free tiers are a trap; (3) NVIDIA trial keys expose no speech models at all.
* Onboarding 0→hello world: good docs, but quota/402 failure modes should be first-class documented with CORS-safe errors (we implemented that pattern ourselves).
* Build again? Yes for TTS via Fish; for STT we default to browser recognition + typed input and treat server transcription as enhancement.
