/**
 * Calls to our own Express server, which talks to Gemini (the API key never reaches the app).
 * On the web the server is same-origin (/api). The Android app has no server of its own, so it
 * uses the URL from Instellingen or VITE_API_URL, the same idea as Moestuin's apiUrl.
 */
import { Capacitor } from '@capacitor/core';
import { S, setS } from './store/useStore';

/** Web version without a server: AI goes through Firebase AI Logic instead of /api. */
export const AI_VIA_FIREBASE = import.meta.env.VITE_AI_MODE === 'firebase';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function apiBase(): string {
  const custom = S().apiUrl.trim();
  if (custom) return custom.replace(/\/+$/, '');
  if (Capacitor.isNativePlatform()) return (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  return '/api';
}

export async function post<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (AI_VIA_FIREBASE && !S().apiUrl.trim()) {
    try {
      const { runLocal } = await import('./ai/firebaseAi');
      const out = await runLocal(path, body);
      if (signal?.aborted) throw new DOMException('Gestopt', 'AbortError');
      return out as T;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      console.warn(e);
      const msg = String((e as Error).message || '');
      if (/429|quota|exhaust/i.test(msg)) throw new ApiError('Even te veel verzoeken. Probeer het over een minuut opnieuw.', 429);
      if (/not.*enabled|has not been used|PERMISSION_DENIED|api-not-enabled|403/i.test(msg)) throw new ApiError('Firebase AI Logic staat nog niet aan voor dit project. Zet het aan in de Firebase-console.', 403);
      throw new ApiError('De AI gaf geen antwoord. Probeer het opnieuw.', 0);
    }
  }
  const base = apiBase();
  if (!base) throw new ApiError('Er is geen server ingesteld. Vul het serveradres in bij Huishouden › Server.', 0);
  let res: Response;
  try {
    res = await fetch(`${base}/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('De server is niet bereikbaar. Controleer je verbinding.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = res.status === 429 ? 'Even te veel verzoeken. Probeer het over een minuut opnieuw.'
      : (data && (data as { error?: string }).error) || 'Er ging iets mis op de server.';
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

/** Ask the server whether AI is configured; the smart buttons only show when it is. */
export async function checkAi() {
  if (AI_VIA_FIREBASE && !S().apiUrl.trim()) { setS({ aiOn: true }); return; }
  const base = apiBase();
  if (!base) { setS({ aiOn: false }); return; }
  try {
    const res = await fetch(`${base}/health`);
    const data = await res.json();
    setS({ aiOn: !!data?.ai });
  } catch {
    setS({ aiOn: false });
  }
}

export function setApiUrl(url: string) {
  try { localStorage.setItem('samenlijst.apiUrl', url.trim()); } catch { /* private mode */ }
  setS({ apiUrl: url.trim() });
  checkAi();
}
