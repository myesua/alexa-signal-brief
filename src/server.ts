import "dotenv/config";
import express from 'express';
import path from 'node:path';
import { createMcpRouter } from './mcp-server.js';
import { createSpeechRouter } from './cf-voice.js';
import { PRESETS } from './presets.js';
import {
  listSignalsRanked,
  getSignalThread,
  getProfile,
  setProfile,
  listSources,
  sweepAll,
} from './sygnal-client.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(createMcpRouter());
app.use(createSpeechRouter());

// Serve simulator static UI
app.use(express.static(path.join(process.cwd(), 'simulator')));

const reqKey = (req: express.Request) =>
  String(req.header('x-sygnal-key') ?? req.body?.apiKey ?? '');

// Simulator API: agentic orchestration across Sygnal tools (creative, not single Q&A)
app.get('/api/presets', (_req, res) => res.json({ presets: PRESETS }));

app.get('/api/profile', async (req, res) => {
  res.json(await getProfile(String(req.header('x-sygnal-key') ?? '')));
});

app.post('/api/profile', async (req, res) => {
  const { product_description, keywords, target_audience } = req.body ?? {};
  if (!product_description || !keywords || !target_audience) {
    return res
      .status(400)
      .json({
        error: 'product_description, keywords, target_audience required',
      });
  }
  res.json(
    await setProfile(
      { product_description, keywords, target_audience },
      reqKey(req),
    ),
  );
});

app.get('/api/sources', async (req, res) => {
  const preset = String(
    req.query.preset ?? req.body?.preset ?? 'gtm-switchers',
  );
  res.json(await listSources(String(req.header('x-sygnal-key') ?? ''), preset));
});

app.post('/api/sweep', async (req, res) => {
  res.json(await sweepAll(reqKey(req)));
});

app.post('/api/brief', async (req, res) => {
  const limit = Number(req.body?.limit ?? 3);
  const presetId = String(req.body?.preset ?? 'gtm-switchers');
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const { signals, live } = await listSignalsRanked(limit, reqKey(req), preset.id);
  const { analyzeSignals, buildVoiceScript, buildSpokenSummary } = await import('./intelligence.js');
  const analyzed = analyzeSignals(signals, preset);
  const voice = buildVoiceScript(analyzed, preset, live);
  const spoken = buildSpokenSummary(analyzed, preset, live);
  res.json({
    voice,
    spoken,
    live,
    preset: preset.id,
    pursue_count: analyzed.filter((a) => a.verdict === 'PURSUE').length,
    cards: analyzed.map((a) => ({
      title: a.title,
      score: a.score,
      source: a.source_label,
      url: a.thread_url,
      source_url: a.source_url,
      signal_id: a.signal_id,
      intent_type: a.intent_type,
      posted_at: a.posted_at,
      author: a.author,
      raw_text: a.raw_text,
      evidence: a.evidence,
      outreach: a.outreach,
      verdict: a.verdict,
      verdict_reason: a.verdict_reason,
      what_it_means: a.what_it_means,
      thread_summary: a.thread_summary,
      next_action: a.next_action,
      speak: a.speak,
    })),
    session: { state: 'brief_delivered', count: analyzed.length, preset: preset.id, live },
  });
});

app.post('/api/thread', async (req, res) => {
  const thread = await getSignalThread(String(req.body?.signal_id ?? ''));
  res.json(thread);
});

app.post('/api/webhook', async (req, res) => {
  const { signal_id, destination } = req.body ?? {};
  if (!signal_id) return res.status(400).json({ error: 'signal_id required' });
  // Mock delivery for demo; live path triggers Sygnal trigger_webhook when key present
  res.json({
    delivery: {
      signal_id,
      destination: destination ?? 'slack:#signals',
      status: 'queued',
      at: new Date().toISOString(),
    },
  });
});

// Open conversation: ANY natural question about today's signals.
// LLM first (NVIDIA hosted trial), 501 when unconfigured so the client
// falls back to its built-in intent parser (fully offline-capable).
app.post('/api/ask', async (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  const presetId = String(req.body?.preset ?? 'home-services');
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
  try {
    const { listSignalsRanked } = await import('./sygnal-client.js');
    const { analyzeSignals } = await import('./intelligence.js');
    const { answerQuestion } = await import('./brain.js');
    const { signals, live } = await listSignalsRanked(5, reqKey(req), preset.id);
    const analyzed = analyzeSignals(signals, preset);
    const ans = await answerQuestion(message, preset, analyzed, history);
    res.json({ ...ans, live, preset: preset.id });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/no LLM key/i.test(msg)) return res.status(501).json({ error: 'no LLM configured — use built-in intents' });
    return res.status(502).json({ error: `brain failed: ${msg.slice(0, 200)}` });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`alexa-signal-brief on :${PORT}`));
