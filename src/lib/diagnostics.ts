/**
 * What happened in the app lately, only in this device's memory: recent errors and warnings and the screens you
 * opened. It is only sent along when someone uses "Iets melden"; otherwise it stays here and is gone on close.
 */
export type FeedbackLog = { at: string; level: 'error' | 'warn'; message: string };

const MAX_LOGS = 40, MAX_SCREENS = 15;
const logs: FeedbackLog[] = [];
const screens: { at: string; screen: string }[] = [];
let installed = false;

function describe(value: unknown): string {
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    const stack = value.stack ? value.stack.split('\n').slice(1, 4).map(l => l.trim()).join(' | ') : '';
    return `${typeof code === 'string' ? `[${code}] ` : ''}${value.name}: ${value.message}${stack ? ` (${stack})` : ''}`;
  }
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}

export function recordLog(level: FeedbackLog['level'], parts: readonly unknown[]) {
  const message = parts.map(describe).join(' ').slice(0, 700);
  if (!message) return;
  logs.push({ at: new Date().toISOString(), level, message });
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
}

/** Once at start-up: keep errors and warnings here too. */
export function installDiagnostics() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try { recordLog(level, args); } catch { /* never let tracking fail anything */ }
      original(...args);
    };
  }
  addEventListener('error', e => recordLog('error', [e.error ?? e.message ?? 'Onbekende fout']));
  addEventListener('unhandledrejection', e => recordLog('error', ['Niet afgehandeld:', e.reason]));
}

export function recordScreen(screen: string) {
  if (screens[screens.length - 1]?.screen === screen) return;
  screens.push({ at: new Date().toISOString(), screen });
  if (screens.length > MAX_SCREENS) screens.splice(0, screens.length - MAX_SCREENS);
}

export const currentScreen = () => screens[screens.length - 1]?.screen ?? 'onbekend';
export const diagnosticsSnapshot = () => ({ logs: [...logs], screens: [...screens] });
