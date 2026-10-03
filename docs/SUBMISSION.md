# Submission — ready to paste into Devpost

* Track: Alexa+ (simulated experience path — no gated Amazon tools required)
* Mini challenges: none (no AWS services used; single new OSS repo, no separate contribution)
* Repo: https://github.com/myesua/alexa-signal-brief (public, MIT)
* Video: https://youtu.be/3tvjsEwCEtQ (public/unlisted, <3 min, shows simulator working)

## Text description (paste)

Signal Brief for Alexa+ turns Sygnal buyer-intent signals into a spoken morning briefing. Pick what Alexa watches (e.g. home-services: urgent plumber/electrician requests), save the ICP, and ask for the brief. A deterministic analyst scores every signal PURSUE/NURTURE/MONITOR with verdict reasons, explains what each thread means for your business, reads back the asker's own words, drafts the outreach reply, and recommends the next step — then speaks a 60-word summary while the full analysis stays on screen.

Ask anything naturally — "should I pursue number 1, why?", "what is signal 2 looking for?", "how do I reach them?" — with conversation memory across turns, per-card analyst deep-dives, and one-tap push to Slack/CRM. Human voice via Fish Audio (free tier) with browser fallback; mic input via browser recognition with typed fallback, so the demo never dies.

Built Aug 31–Oct 23 in this repo: simulator UI, MCP 2025-11-25 proxy (alexa_signal_brief, alexa_next_action), analyst engine, voice loop, fixtures fallback for the upstream list_signals restriction.

## Existing-project note (paste into the significantly-updated field)

Sygnal's signal engine pre-existed and is used here strictly as an authorized third-party API (my own account). Everything submitted — simulator, MCP proxy, analyst verdicts, voice loop, onboarding — was newly created in this repo during the submission window. Before: dashboard-only signals. After: voice-first Alexa+ experience with session orchestration. All commits in this repo prove the window.

## Checklist

* [x] Public GitHub repo, MIT in About, run instructions in README
* [x] Video public/unlisted, <3 min, shows functioning app
* [x] Product feedback per tool (docs/PRODUCT_FEEDBACK.md)
* [x] Friction log with 3 entries (docs/FRICTION_LOG.md, +10% bonus path)
* [x] No secrets in repo (.env gitignored, placeholders rejected in code)
* [x] Runs keyless: npm install && npm run dev (fixtures + browser voice)
