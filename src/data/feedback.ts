/**
 * "Iets melden": a screenshot of what you see now, your words, and the technical details, saved in
 * samenlijstFeedback/{id}. Only the admin can read them (see firestore.rules), on the Meldingen screen.
 */
import { collection, doc, getDocs, limit, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { currentScreen, diagnosticsSnapshot, type FeedbackLog } from '../lib/diagnostics';
import { S } from '../store/useStore';

export const FEEDBACK = 'samenlijstFeedback';
export const ADMIN_EMAIL = 'sandervgelderen@gmail.com';
export const FEEDBACK_TEXT_MAX = 4000;
/** Well under Firestore's 1 MB per document, with room for the rest. */
export const SCREENSHOT_MAX = 700_000;
/** Elements with this attribute (the report button itself) stay off the screenshot. */
export const NO_CAPTURE = 'data-niet-vastleggen';
export const APP_VERSION = String(import.meta.env.VITE_APP_VERSION || 'dev').slice(0, 7);

export type FeedbackStatus = 'nieuw' | 'bij-claude' | 'afgehandeld';
export type FeedbackContext = Record<string, string | number | boolean | null | { at: string; screen: string }[]>;
export type Feedback = {
  id: string; uid: string; email: string | null; name: string | null; createdAt: string;
  text: string; screenshot?: string | null; status: FeedbackStatus; handledAt?: string | null;
  /** The admin's remark when handing it to Claude, and Claude's note on what changed (or its question). */
  adminNote?: string | null; sentToClaudeAt?: string | null; claudeNote?: string | null;
  context: FeedbackContext; logs: FeedbackLog[];
};

export const isAdmin = () => auth.currentUser?.email === ADMIN_EMAIL && auth.currentUser?.emailVerified === true;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'te-laat'> {
  return Promise.race([p, new Promise<'te-laat'>(r => setTimeout(() => r('te-laat'), ms))]);
}

async function shrink(dataUrl: string, side: number, quality: number): Promise<string> {
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = dataUrl; });
  const f = Math.min(1, side / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/** A JPEG of the app as it is on screen now (without the report button). Null when that fails: then without. */
export async function captureScreen(): Promise<string | null> {
  try {
    const { domToJpeg } = await import('modern-screenshot');
    const width = innerWidth, height = innerHeight;
    const scale = Math.max(1, Math.min(devicePixelRatio || 1, 1400 / Math.max(width, height)));
    const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
    const shot = await withTimeout(domToJpeg(document.body, {
      width, height, scale, quality: 0.7, backgroundColor: bg, timeout: 8000,
      features: { restoreScrollPosition: true },
      filter: (node: Node) => !(node instanceof Element && node.hasAttribute(NO_CAPTURE)),
      fetch: { placeholderImage: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' },
    }), 12_000);
    if (shot === 'te-laat') { console.warn('Schermafbeelding duurde te lang'); return null; }
    if (shot.length <= SCREENSHOT_MAX) return shot;
    for (const [side, q] of [[1100, 0.6], [900, 0.55], [700, 0.5]] as const) {
      const smaller = await shrink(shot, side, q);
      if (smaller.length <= SCREENSHOT_MAX) return smaller;
    }
    return null;
  } catch (e) {
    console.warn('Schermafbeelding maken lukte niet', e);
    return null;
  }
}

/** What is open right now, taken before the screenshot (which takes a moment). */
export function captureContext(): FeedbackContext {
  const s = S();
  const list = s.lists.find(l => l.id === s.view);
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* fine */ }
  const open = s.items.filter(i => !i.done);
  return {
    version: APP_VERSION,
    host: location.host,
    screen: currentScreen(),
    list: list ? `${list.kind}: ${list.name}` : null,
    sheet: s.sheet?.kind ?? null,
    userAgent: navigator.userAgent.slice(0, 400),
    viewport: `${innerWidth}×${innerHeight}`,
    pixelRatio: devicePixelRatio || 1,
    installed: matchMedia?.('(display-mode: standalone)').matches === true,
    online: navigator.onLine,
    language: navigator.language,
    timeZone,
    aiOn: s.aiOn,
    access: s.access,
    readOnly: s.readOnly,
    household: s.hid,
    members: s.households.find(h => h.id === s.hid)?.members.length ?? 0,
    lists: s.lists.length,
    items: s.items.length,
    openItems: open.length,
    kb: s.memory.length,
    screens: diagnosticsSnapshot().screens,
  };
}

/** Saves a report. 'verstuurd' when the server has it; 'wachtrij' offline: it goes along once there is signal. */
export async function sendFeedback(text: string, screenshot: string | null, context: FeedbackContext): Promise<'verstuurd' | 'wachtrij'> {
  const u = auth.currentUser;
  if (!u) throw new Error('De app is nog niet klaar. Probeer het zo opnieuw.');
  const id = doc(collection(db, FEEDBACK)).id;
  const item: Feedback = {
    id, uid: u.uid, email: u.email ?? null, name: u.displayName ?? null, createdAt: new Date().toISOString(),
    text: text.trim().slice(0, FEEDBACK_TEXT_MAX), status: 'nieuw', context, logs: diagnosticsSnapshot().logs,
    ...(screenshot ? { screenshot } : {}),
  };
  const saved = await withTimeout(setDoc(doc(db, FEEDBACK, id), item), 10_000);
  return saved === 'te-laat' ? 'wachtrij' : 'verstuurd';
}

/** For the admin: the latest reports, newest first. */
export async function loadFeedback(): Promise<Feedback[]> {
  const snap = await getDocs(query(collection(db, FEEDBACK), orderBy('createdAt', 'desc'), limit(100)));
  return snap.docs.map(d => d.data() as Feedback);
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus) {
  await updateDoc(doc(db, FEEDBACK, id), { status, handledAt: status === 'afgehandeld' ? new Date().toISOString() : null });
}

/** "Naar Claude": the scheduled Claude task picks up everything with status bij-claude, with this remark. */
export async function sendToClaude(id: string, note: string) {
  const patch = { status: 'bij-claude' as const, adminNote: note.trim().slice(0, 2000) || null, sentToClaudeAt: new Date().toISOString(), handledAt: null };
  await updateDoc(doc(db, FEEDBACK, id), patch);
  return patch;
}

const time = (iso: string) => (iso.length >= 19 ? iso.slice(0, 19).replace('T', ' ') : iso);

/** A report as plain text, to paste into a chat with Claude (the screenshot goes separately). */
export function feedbackAsText(f: Feedback): string {
  const c = f.context || {};
  const screens = Array.isArray(c.screens) ? c.screens : [];
  const lines = [
    `Samenlijst-melding ${f.id} van ${f.email ?? f.name ?? f.uid} op ${time(f.createdAt)} (UTC)`,
    '',
    'Wat er geschreven werd:',
    f.text.trim() || '(niets ingevuld)',
    '',
    `Scherm: ${c.screen ?? '?'}${c.list ? ` (${c.list})` : ''}${c.sheet ? ` · venster: ${c.sheet}` : ''} · Versie: ${c.version ?? '?'} · Adres: ${c.host ?? '?'}`,
    `Toestel: ${c.viewport ?? '?'} @${c.pixelRatio ?? 1}x · ${c.installed ? 'geïnstalleerd' : 'in de browser'} · ${c.online === false ? 'offline' : 'online'} · ${c.language ?? '?'} · ${c.timeZone ?? '?'}`,
    `User agent: ${c.userAgent ?? '?'}`,
    `Huishouden: ${c.members ?? '?'} leden, ${c.lists ?? '?'} lijsten, ${c.openItems ?? '?'} van ${c.items ?? '?'} items open, geheugen ${c.kb ?? '?'} · AI ${c.aiOn ? 'aan' : 'uit'}${c.access ? ` · toegang: ${c.access}` : ''}`,
  ];
  if (screens.length) lines.push(`Laatste schermen: ${screens.map(s => `${s.screen} (${time(s.at).slice(11)})`).join(' → ')}`);
  lines.push('', f.logs?.length ? `Recente fouten en waarschuwingen (${f.logs.length}):` : 'Geen recente fouten of waarschuwingen.');
  for (const l of f.logs || []) lines.push(`- ${time(l.at).slice(11)} ${l.level === 'error' ? 'FOUT' : 'let op'}: ${l.message}`);
  if (f.adminNote) lines.push('', `Opmerking van de beheerder: ${f.adminNote}`);
  if (f.claudeNote) lines.push('', `Notitie van Claude: ${f.claudeNote}`);
  lines.push('', f.screenshot ? 'Er is een schermafbeelding bij.' : 'Geen schermafbeelding.');
  return lines.join('\n');
}
