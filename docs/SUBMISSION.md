# Submission draft — do not submit until video + repo public

* Track: Alexa+
* Mini challenges: none yet (add AWS Builder / Open Source only with documented integrations)
* Text description (150 words): Alexa+ Signal Brief turns Sygnal buyer-intent signals into a morning voice briefing. RevOps user asks for brief, backend orchestrates list_signals ranked → thread → contact → webhook payload across sessions, returns voice summary plus cards. Built Aug31-Oct23: new simulator UI, new MCP 2025-11-25 proxy (alexa_signal_brief, alexa_next_action), fixtures fallback for list_signals restriction.
* Repo: https://github.com/myesua/alexa-signal-brief (TODO: push, add MIT to About)
* Video: TODO <3min public YouTube/Vimeo link showing simulator functioning
* Product feedback: see docs/PRODUCT_FEEDBACK.md
* Friction log: see docs/FRICTION_LOG.md (aim for 3-5 entries, up to 10% bonus)
* Existing project note: Sygnal engine pre-existed; this repo is newly created in window. Sygnal used as authorized third-party API. Before/after: before = dashboard-only signals, after = voice brief + MCP proxy + session orchestration (all commits in this repo).
