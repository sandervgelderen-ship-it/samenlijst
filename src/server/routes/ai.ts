import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { aiConfigured, generateJSON } from '../services/genai';
import {
  analyzePrompt, elaboratePrompt, forgotPrompt, routePrompt, smartAddPrompt, sortPrompt, voicePrompt,
  ANALYZE_SCHEMA, PLAN_SCHEMA, VOICE_SCHEMA, ROUTE_SCHEMA, SHOP_SCHEMA, SORT_SCHEMA, TODO_SCHEMA,
} from '../prompts';

export const aiRouter = Router();

/** Is the AI configured? The app hides the smart buttons when it is not. */
aiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, ai: aiConfigured() });
});

/** Every new item first: clean name, amount, aisle, date, split, and which list. */
aiRouter.post('/analyze', asyncHandler(async (req, res) => {
  res.json(await generateJSON(analyzePrompt(req.body || {}), ANALYZE_SCHEMA));
}));

/** Older clients: which list does each unsure item belong on? */
aiRouter.post('/route-items', asyncHandler(async (req, res) => {
  res.json(await generateJSON(routePrompt(req.body || {}), ROUTE_SCHEMA));
}));

/** Slim toevoegen: a dish, recipe, plan or photo -> items for one list. */
aiRouter.post('/smart-add', asyncHandler(async (req, res) => {
  const b = req.body || {};
  let image: { mimeType: string; data: string } | null = null;
  if (typeof b.image === 'string' && b.image.startsWith('data:image/')) {
    const m = b.image.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
    if (m) image = { mimeType: m[1], data: m[2] };
  }
  const schema = b.kind === 'shop' ? SHOP_SCHEMA : TODO_SCHEMA;
  res.json(await generateJSON(smartAddPrompt(b, !!image), schema, image));
}));

/** Wat vergeet ik? */
aiRouter.post('/forgot', asyncHandler(async (req, res) => {
  res.json(await generateJSON(forgotPrompt(req.body || {}), SHOP_SCHEMA));
}));

/** Sort items from "Overig" into supermarket aisles. */
aiRouter.post('/sort-aisles', asyncHandler(async (req, res) => {
  res.json(await generateJSON(sortPrompt(req.body || {}), SORT_SCHEMA));
}));

/** Werk een taak uit: toelichting, stappen, tips en wat je moet kopen. */
aiRouter.post('/elaborate', asyncHandler(async (req, res) => {
  res.json(await generateJSON(elaboratePrompt(req.body || {}), PLAN_SCHEMA));
}));

/** Spraakmemo: audio -> transcript + items. */
aiRouter.post('/voice-memo', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const m = typeof b.audio === 'string' ? b.audio.match(/^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i) : null;
  if (!m) { res.status(400).json({ error: 'Er kwam geen opname mee. Probeer het opnieuw.' }); return; }
  res.json(await generateJSON(voicePrompt(b), VOICE_SCHEMA, { mimeType: m[1], data: m[2] }));
}));
