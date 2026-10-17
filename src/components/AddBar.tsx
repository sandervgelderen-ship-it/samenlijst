import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Clock, Mic, Plus, Send, Sparkles, X } from 'lucide-react';
import { COMMON, kbKey, parseDue, parseEntry, splitEntries } from '../lib/domain';
import { addItem, listAdd, quickAdd, quickPick, voiceMemo } from '../data/actions';
import { toast } from '../data/toast';
import { setS, useStore } from '../store/useStore';
import type { List } from '../types';

const MAX_SECONDS = 60;

/** The capsule at the bottom: type, pick a suggestion, or speak a memo. */
export default function AddBar({ list }: { list?: List }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const aiOn = useStore(s => s.aiOn);
  const kb = useStore(s => s.kb);
  const lists = useStore(s => s.lists);
  const items = useStore(s => s.items);
  const recording = useStore(s => s.recording);
  const listening = useStore(s => s.listening);
  const home = !list;

  useEffect(() => { setValue(''); }, [list?.id]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim(); if (!v) return;
    setValue('');
    if (home) quickAdd(v); else listAdd(list!.id, v);
    inputRef.current?.focus();
  }

  /* ---- suggestions ---- */
  let chips: { label: string; text: string; to?: string; icon: 'clock' | 'plus' }[] = [];
  let lead = '';
  if (home) {
    const parts = splitEntries(value);
    const last = parts.length && !/[,;\n]\s*$/.test(value) ? parts[parts.length - 1] : '';
    const q = kbKey(parseDue(parseEntry(last).text).text);
    if (q && !last.includes('@')) {
      for (const e of [...kb.values()].sort((a, b) => (b.at || 0) - (a.at || 0))) {
        if (!(e.key.startsWith(q) || (q.length >= 3 && e.key.includes(q)))) continue;
        const best = Object.entries(e.lists || {}).filter(([id]) => lists.some(l => l.id === id)).sort((a, b) => b[1] - a[1])[0];
        if (!best) continue;
        if (items.some(i => i.listId === best[0] && !i.done && kbKey(i.text) === e.key)) continue;
        chips.push({ label: e.text, text: e.text, to: best[0], icon: 'plus' });
        if (chips.length >= 8) break;
      }
    }
  } else {
    const onList = new Set(items.filter(i => i.listId === list!.id && !i.done).map(i => kbKey(i.text)));
    const recent = (list!.recent || []).filter(t => !onList.has(kbKey(t)));
    const q = kbKey(parseEntry(value).text || '');
    if (!value.trim()) {
      if (list!.kind === 'shop') { chips = recent.slice(0, 14).map(t => ({ label: t, text: t, icon: 'clock' as const })); lead = chips.length ? 'Recent' : ''; }
    } else if (q) {
      const seen = new Set<string>();
      for (const t of [...recent, ...(list!.kind === 'shop' ? COMMON : [])]) {
        const k = kbKey(t);
        if (seen.has(k) || onList.has(k) || k === q) continue;
        if (k.startsWith(q) || (q.length >= 3 && k.includes(q))) { seen.add(k); chips.push({ label: t, text: t, icon: 'plus' }); }
        if (chips.length >= 8) break;
      }
    }
  }
  function pick(c: (typeof chips)[number]) {
    if (home) {
      const parts = splitEntries(value); const last = parts.pop() || '';
      quickPick(last, c.text, c.to!);
      setValue(parts.length ? parts.join(', ') + ', ' : '');
    } else {
      const qty = value.trim() ? parseEntry(value).qty : '';
      addItem(list!.id, (qty ? qty + ' ' : '') + c.text);
      setValue('');
    }
    inputRef.current?.focus();
  }

  return (
    <form className="addbar" onSubmit={submit} autoComplete="off">
      <div className="wrap">
        {!recording && chips.length > 0 && (
          <div className="sugg">
            {lead && <span className="lbl">{lead}</span>}
            {chips.map(c => (
              <button type="button" className="chip" key={c.label + (c.to || '')} onClick={() => pick(c)}>
                {c.icon === 'clock' ? <Clock /> : <Plus />}{c.label}
                {c.to && <span className="to">→ {lists.find(l => l.id === c.to)?.name}</span>}
              </button>
            ))}
          </div>
        )}
        {recording
          ? <Recorder listId={list?.id || null} />
          : (
            <div className="addrow">
              {aiOn && list && (
                <button className="sparkbtn" type="button" onClick={() => setS({ sheet: { kind: 'smart', mode: 'add', listId: list.id } })} aria-label="Slim toevoegen met Gemini" title="Slim toevoegen">
                  <Sparkles />
                </button>
              )}
              <input ref={inputRef} className="field" id="addinput" value={value} onChange={e => setValue(e.target.value)}
                placeholder={home ? 'Snel toevoegen: melk, tandarts bellen morgen' : list!.kind === 'shop' ? 'Toevoegen, bijv. 2 pak melk' : 'Taak, bijv. kozijnen verven vrijdag'}
                aria-label={home ? 'Snel toevoegen aan de juiste lijst' : 'Nieuw item'} enterKeyHint="done" />
              {aiOn && !value.trim()
                ? <button className="addbtn mic" type="button" onClick={() => startRecording()} disabled={listening} aria-label="Spraakmemo inspreken" title="Spraakmemo"><Mic /></button>
                : <button className="addbtn" type="submit" aria-label="Toevoegen"><Plus /></button>}
            </div>
          )}
      </div>
    </form>
  );
}

/* ---------- Voice memo ---------- */
/** The list the memo is for (null on the home screen: quick add picks the lists). */
let currentListId: string | null = null;
let session: { rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; cancelled: boolean; started: number } | null = null;

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Opnemen kan niet op dit apparaat.'); return; }
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { toast('Geef Samenlijst toegang tot de microfoon om een memo in te spreken.'); return; }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const s = { rec, stream, chunks: [] as Blob[], cancelled: false, started: Date.now() };
  session = s;
  rec.ondataavailable = e => { if (e.data.size) s.chunks.push(e.data); };
  rec.onstop = () => {
    s.stream.getTracks().forEach(t => t.stop());
    setS({ recording: false });
    if (session === s) session = null;
    const blob = new Blob(s.chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] });
    if (s.cancelled) return;
    if (Date.now() - s.started < 700 || blob.size < 1500) { toast('Die memo was te kort. Houd hem iets langer vast en spreek rustig.'); return; }
    const reader = new FileReader();
    reader.onload = () => voiceMemo(String(reader.result), currentListId);
    reader.readAsDataURL(blob);
  };
  rec.start(250);
  setS({ recording: true });
}

function Recorder({ listId }: { listId: string | null }) {
  const [secs, setSecs] = useState(0);
  currentListId = listId;
  useEffect(() => {
    const t = setInterval(() => {
      const s = session ? Math.floor((Date.now() - session.started) / 1000) : 0;
      setSecs(s);
      if (s >= MAX_SECONDS) stop(false);
    }, 250);
    return () => clearInterval(t);
  }, []);
  const stop = (cancel: boolean) => { if (session) { session.cancelled = cancel; if (session.rec.state !== 'inactive') session.rec.stop(); } else setS({ recording: false }); };
  return (
    <div className="addrow rec" role="group" aria-label="Spraakmemo opnemen">
      <button className="sparkbtn" type="button" onClick={() => stop(true)} aria-label="Opname annuleren"><X /></button>
      <span className="recinfo"><span className="recdot" aria-hidden="true" />Ik luister… <b>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</b><span className="rechint">{listId ? 'zeg wat erop moet' : 'noem boodschappen en taken door elkaar'}</span></span>
      <button className="addbtn" type="button" onClick={() => stop(false)} aria-label="Klaar, verwerk de memo"><Send /></button>
    </div>
  );
}

