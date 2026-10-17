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
