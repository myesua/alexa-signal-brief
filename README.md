# Alexa+ Signal Brief — voice buyer-intent briefing powered by Sygnal

Simulated Alexa+ experience (per Official Rules alternate path — no gated Amazon tools required).
New repo created for hackathon window Aug 31–Oct 23 2026. Primary track: Alexa+.

## Run (locally runnable = enough for judging per FAQ)

```bash
npm install
cp .env.example .env
npm run dev
# open http://localhost:3000
# MCP endpoint: POST http://localhost:3000/mcp (spec 2025-11-25, Streamable HTTP)
```

No hosting required. Judges can download, build, test. Demo video shows simulator working.

## What it does

1. `POST /api/brief` — orchestrates Sygnal `list_signals(sort=ranking)` → voice-ready brief + card/carousel payloads + session state.
2. Simulator UI — Ask “Alexa, what's my signal brief?” → voice text + 3 cards + session log.
3. `POST /mcp` — `initialize` / `tools/list` / `tools/call` for `alexa_signal_brief`, `alexa_next_action` (spec 2025-11-25).
4. Fallback fixtures in `fixtures/signals.json` when live Sygnal `list_signals` is restricted — video never blocks.

## Compliance map

* Track: Alexa+ simulated experience. Source in `simulator/index.html` + `src/server.ts`.
* Sygnal `https://api.trysygnal.com/mcp` used as authorized third-party integration (own account).
* License: MIT visible in About section when pushed public to GitHub.
* Private-repo path (if used): share with chris-trag, knmeiss, giolaq, anishamalde, mosesroth, emersonsklar + testing@devpost.com near deadline (invites expire 7 days).
* Video: <3min YouTube/Vimeo public, show simulator functioning, no copyrighted music/trademarks.
* See `docs/SUBMISSION.md`, `docs/PRODUCT_FEEDBACK.md`, `docs/FRICTION_LOG.md`.
