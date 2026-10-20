import { GoogleGenAI } from '@google/genai';

// ─── Model Name Constants ────────────────────────────────────────────────────
// Update in one place whenever Google releases new model versions (same as Moestuin).
/** Default text / multimodal model. */
export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';
// ─────────────────────────────────────────────────────────────────────────────

let aiClient: GoogleGenAI | null = null;

export const aiConfigured = () => !!process.env.GEMINI_API_KEY;

export function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      const err = new Error('GEMINI_API_KEY is niet ingesteld op de server.') as Error & { status?: number };
      err.status = 503;
      throw err;
    }
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return aiClient;
}

/** One structured call: Gemini answers in JSON that matches `schema`. */
export async function generateJSON(prompt: string, schema: object, image?: { mimeType: string; data: string } | null): Promise<unknown> {
  const ai = getAIClient();
  const parts: object[] = [{ text: prompt }];
  if (image) parts.push({ inlineData: image });
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json', responseSchema: schema },
  } as any);
  const text = response.text;
  if (!text) return {};
  try { return JSON.parse(text.trim()); } catch { return {}; }
}

/**
 * A call grounded in Google Search (for current information such as supermarket offers).
 * Search grounding and a response schema do not mix, so the prompt asks for JSON and we parse the text.
 * Returns the parsed JSON plus the pages used and Google's search-suggestion chip.
 */
export async function generateGrounded(prompt: string): Promise<{ data: unknown; sources: { title: string; uri: string }[]; searchHtml: string }> {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { tools: [{ googleSearch: {} }] },
  } as any);
  const meta = (response as any).candidates?.[0]?.groundingMetadata || {};
  return { data: parseLoose(response.text || ''), sources: groundingSources(meta), searchHtml: String(meta.searchEntryPoint?.renderedContent || '') };
}

/** JSON from a free-text answer: the whole text, a ```json block, or the first {...} / [...] in it. */
export function parseLoose(text: string): unknown {
  const out = String(text || '').trim();
  try { return JSON.parse(out); } catch { /* try a fragment */ }
  const m = out.match(/```(?:json)?\s*([\s\S]*?)```/) || out.match(/([\[{][\s\S]*[\]}])/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* give up */ } }
  return {};
}

export function groundingSources(meta: any): { title: string; uri: string }[] {
  const seen = new Set<string>();
  const out: { title: string; uri: string }[] = [];
  for (const c of Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : []) {
    const uri = String(c?.web?.uri || ''); if (!/^https?:\/\//.test(uri) || seen.has(uri)) continue;
    seen.add(uri);
    out.push({ title: String(c?.web?.title || c?.web?.domain || uri).slice(0, 80), uri });
    if (out.length >= 8) break;
  }
  return out;
}
