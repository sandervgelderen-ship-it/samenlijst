/**
 * Beheer (only for the admin): the reports from "Iets melden", newest first, with screenshot and the technical
 * details. "Naar Claude" (with an optional remark) sets a report to bij-claude; a scheduled Claude task picks those
 * up, makes the change, and marks them handled with a note that shows up here.
 */
import { useEffect, useState } from 'react';
import { Bot, Check, Copy, RefreshCw, RotateCcw, Send } from 'lucide-react';
import {
  feedbackAsText, isAdmin, loadFeedback, sendToClaude, setFeedbackStatus, type Feedback, type FeedbackStatus,
} from '../data/feedback';
import { toast } from '../data/toast';

type Filter = FeedbackStatus | 'alles';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'nieuw', label: 'Nieuw' }, { id: 'bij-claude', label: 'Bij Claude' }, { id: 'afgehandeld', label: 'Afgehandeld' }, { id: 'alles', label: 'Alles' },
];

function ago(iso?: string | null) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gisteren' : `${d} dagen geleden`;
}

export default function AdminView() {
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('nieuw');
  const [tick, setTick] = useState(0);
  const admin = isAdmin();

  useEffect(() => {
    if (!admin) return;
    let live = true;
    setProblem(null);
    loadFeedback().then(x => { if (live) setItems(x); }).catch(e => {
      console.warn('Meldingen laden', e);
      if (live) setProblem((e as { code?: string }).code === 'permission-denied'
        ? 'Firebase geeft geen toegang tot de meldingen. Staan de nieuwste Samenlijst-regels al in Firestore?'
        : 'De meldingen konden niet worden geladen. Controleer je verbinding.');
    });
    return () => { live = false; };
  }, [admin, tick]);

  if (!admin) return <div className="empty"><strong>Alleen voor de beheerder</strong>Deze pagina is er alleen voor wie Samenlijst beheert.</div>;

  const patch = (id: string, p: Partial<Feedback>) => setItems(xs => (xs || []).map(x => (x.id === id ? { ...x, ...p } : x)));
  const count = (s: FeedbackStatus) => (items || []).filter(f => f.status === s).length;
  const shown = (items || []).filter(f => filter === 'alles' || f.status === filter);
  const fresh = (items || []).filter(f => f.status === 'nieuw');

  const allToClaude = async () => {
    try {
      for (const f of fresh) patch(f.id, await sendToClaude(f.id, ''));
      toast(`${fresh.length} ${fresh.length === 1 ? 'melding' : 'meldingen'} klaargezet voor Claude`);
      setFilter('bij-claude');
    } catch (e) { console.warn(e); toast('Klaarzetten lukte niet.'); }
  };

  return (
    <div className="admin">
      <div className="lhero" style={{ marginBottom: 6 }}>
        <span><b>{count('nieuw')}</b> nieuw · <b>{count('bij-claude')}</b> bij Claude · <b>{count('afgehandeld')}</b> afgehandeld</span>
      </div>
      <p className="note" style={{ margin: '0 0 12px' }}>
        Zet een melding met <b>Naar Claude</b> klaar, eventueel met een opmerking. Claude kijkt elke twee uur (tussen 8 en 21 uur),
        voert de wijziging door in Samenlijst en zet de melding op afgehandeld met een notitie van wat er veranderde.
      </p>
      <div className="pacts" style={{ marginBottom: 14 }}>
        <div className="seg" role="group" aria-label="Welke meldingen">
          {FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
        <button type="button" className="linkbtn" onClick={() => setTick(t => t + 1)}><RefreshCw size={14} /> Vernieuwen</button>
        {fresh.length > 1 && filter === 'nieuw' && <button type="button" className="chip ai" onClick={() => void allToClaude()}><Bot size={14} /> Alle {fresh.length} naar Claude</button>}
      </div>
      {problem && <p className="fberr" style={{ marginBottom: 12 }}>{problem}</p>}
      {!items && !problem && <div className="state"><strong>Meldingen laden…</strong></div>}
      {items && !shown.length && <div className="empty"><strong>Niets hier</strong>{filter === 'nieuw' ? 'Geen nieuwe meldingen.' : filter === 'bij-claude' ? 'Claude heeft niets te doen.' : 'Nog geen meldingen.'}</div>}
      <div className="fblist">{shown.map(f => <Report key={f.id} f={f} onPatch={p => patch(f.id, p)} />)}</div>
    </div>
  );
}

function Report({ f, onPatch }: { f: Feedback; onPatch: (p: Partial<Feedback>) => void }) {
  const [big, setBig] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState(f.adminNote || '');
  const [busy, setBusy] = useState(false);
  const c = f.context || {};
  const errors = (f.logs || []).filter(l => l.level === 'error').length;

  const run = async (fn: () => Promise<Partial<Feedback> | void>, ok?: string) => {
    setBusy(true);
    try { const p = await fn(); if (p) onPatch(p); if (ok) toast(ok); }
    catch (e) { console.warn(e); toast('Opslaan lukte niet.'); }
    finally { setBusy(false); }
  };
  const status = (s: FeedbackStatus) => run(async () => { await setFeedbackStatus(f.id, s); return { status: s, handledAt: s === 'afgehandeld' ? new Date().toISOString() : null }; });
  const copy = async () => {
    try { await navigator.clipboard.writeText(feedbackAsText(f)); toast('Gekopieerd. Plak het in een gesprek met Claude.'); }
    catch { toast('Kopiëren lukte niet.'); }
  };

  return (
    <article className={`fbcard s-${f.status}`}>
      <div className="fbhead">
        {f.screenshot && (
          <button type="button" className="fbthumbbtn" onClick={() => setBig(true)} aria-label="Schermafbeelding groter">
            <img src={f.screenshot} alt="" />
          </button>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="fbwho">
            <b>{f.name || f.email || 'Onbekend'}</b>
            <span className={`fbstatus s-${f.status}`}>{f.status === 'bij-claude' ? 'Bij Claude' : f.status === 'afgehandeld' ? 'Afgehandeld' : 'Nieuw'}</span>
          </div>
          <span className="note">
            {ago(f.createdAt)} · {String(c.screen ?? '?')}{c.list ? ` · ${String(c.list)}` : ''} · {c.installed ? 'geïnstalleerd' : 'browser'} · versie {String(c.version ?? '?')}{c.online === false ? ' · offline' : ''}
          </span>
          <p className="fbtext">{f.text.trim() || <em className="note">Geen tekst, alleen een schermafbeelding.</em>}</p>
          {errors > 0 && <p className="fberr" style={{ fontSize: '.85rem' }}>{errors === 1 ? '1 recente fout' : `${errors} recente fouten`}</p>}
        </div>
      </div>

      {f.adminNote && <p className="fbnote"><b>Jouw opmerking:</b> {f.adminNote}</p>}
      {f.status === 'bij-claude' && <p className="note">Klaargezet {ago(f.sentToClaudeAt)}. Claude pakt hem bij de volgende ronde op.</p>}
      {f.claudeNote && <p className="fbnote claude"><Bot size={15} /> <span><b>Claude:</b> {f.claudeNote}</span></p>}

      {asking && (
        <div className="fbask">
          <label>Opmerking voor Claude (mag leeg)
            <textarea className="field" rows={3} autoFocus value={note} maxLength={2000} onChange={e => setNote(e.target.value)}
              placeholder="Bijvoorbeeld: maak de knop groter, of: alleen op de boodschappenlijst." />
          </label>
          <div className="pacts">
            <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { const p = await sendToClaude(f.id, note); setAsking(false); return p; }, 'Klaargezet voor Claude')}><Send size={15} /> Naar Claude</button>
            <button type="button" className="linkbtn" onClick={() => setAsking(false)}>Annuleren</button>
          </div>
        </div>
      )}

      <details className="fbtech">
        <summary>Technische gegevens</summary>
        <pre>{feedbackAsText(f)}</pre>
      </details>

      {!asking && (
        <div className="pacts">
          {f.status !== 'bij-claude' && <button type="button" className="chip ai" disabled={busy} onClick={() => setAsking(true)}><Bot size={14} /> {f.status === 'afgehandeld' ? 'Opnieuw naar Claude' : 'Naar Claude'}</button>}
          <button type="button" className="chip" onClick={() => void copy()}><Copy size={14} /> Kopieer</button>
          {f.status !== 'afgehandeld'
            ? <button type="button" className="chip" disabled={busy} onClick={() => void status('afgehandeld')}><Check size={14} /> Afgehandeld</button>
            : null}
          {f.status !== 'nieuw' && <button type="button" className="linkbtn" disabled={busy} onClick={() => void status('nieuw')}><RotateCcw size={13} /> Terug naar nieuw</button>}
        </div>
      )}

      {big && f.screenshot && <div className="backdrop fbbig" onClick={() => setBig(false)}><img src={f.screenshot} alt="Schermafbeelding van de melding" /></div>}
    </article>
  );
}
