/**
 * Calls to our own Express server, which talks to Gemini (the API key never reaches the app).
 * On the web the server is same-origin (/api). The Android app has no server of its own, so it
 * uses the URL from Instellingen or VITE_API_URL, the same idea as Moestuin's apiUrl.
 */
import { Capacitor } from '@capacitor/core';
import { S, setS } from './store/useStore';

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
