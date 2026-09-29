# Friction log — optional but up to 10% bonus
# Format per entry: task, steps, expected vs actual, severity, workaround, suggestion

## 1. 2026-09-12 — list_signals RAW_QUERY_RESTRICTED
* Task: call list_signals sort=ranking via Sygnal MCP
* Steps: POST /mcp tools/call list_signals limit 3
* Expected: ranked signals. Actual: {"code":"RAW_QUERY_RESTRICTED", ... and not allowed}
* Severity: high (blocks live demo)
* Workaround: fixtures/signals.json + MOCK_SIGNALS=true
* Suggestion: allowlist `and` in workspace raw queries / version the fix

## 2. 2026-09-29 — Cloudflare free neuron quota exhausted mid-testing
* Task: POST voice worker /api/transcribe (Whisper) after a day of Aura-1 TTS tests
* Steps: record 109KB webm clip in simulator -> POST to worker
* Expected: {text}. Actual: HTTP 500 with no CORS headers, browser reported a misleading CORS error
* Severity: medium (blocked fallback STT path; browser STT + typed input still worked)
* Workaround: wrapped worker handler in try/catch returning CORS headers + error detail; capped TTS sends at 1500 chars; default rehearsals to browser/melotts voice, Aura-1 only for final takes (~650 neurons per short brief, ~15/day free)
* Suggestion: Workers AI free-tier errors should still carry CORS headers; dashboard quota meter should be visible pre-deploy

## 3. 2026-09-29 — MeloTTS REST returns base64 JSON, not raw audio
* Task: POST /api/speech model melotts via Worker AI binding
* Steps: env.AI.run melotts, returned response body as audio
* Expected: audio bytes. Actual: "[object Object]" then JSON {"audio": base64-wav}
* Severity: low. Workaround: decode base64 to bytes, serve as audio/wav
* Suggestion: docs example for non-raw TTS bindings

