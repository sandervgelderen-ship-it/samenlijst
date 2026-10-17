import { useEffect, useRef, useState } from 'react';
import { Camera, Sparkles } from 'lucide-react';
import { CAT_LABEL, dueInfo } from '../../lib/domain';
import type { Suggestion } from '../../lib/aiClean';
import { addMany, smartSuggest } from '../../data/actions';
import { useStore } from '../../store/useStore';
import { Sheet, closeSheet } from './Sheets';

const EXAMPLES = {
  shop: ['Lasagne voor 4', 'Weekmenu voor 2, gezond en snel', 'Ontbijt voor een weekend met gasten', 'Barbecue voor 8 personen'],
  todo: ['Verhuizing over 3 weken voorbereiden', 'Kinderfeestje zaterdag', 'Grote schoonmaak dit weekend', 'Vakantie naar Frankrijk inpakken'],
};

/** Shrink a photo before it travels: the model reads ~1.5 MP fine and phones shoot 12 MP. */
async function photoToDataUrl(file: File): Promise<string> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export default function SmartSheet({ mode, listId }: { mode: 'add' | 'forgot'; listId: string }) {
  const list = useStore(s => s.lists.find(l => l.id === listId));
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ name: string; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState<Suggestion[] | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const shop = list?.kind === 'shop';

  useEffect(() => { if (mode === 'forgot') run(); return () => ctl.current?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return null;

  async function run(t = text) {
    if (mode === 'add' && !t.trim() && !photo) return;
    ctl.current?.abort(); ctl.current = new AbortController();
    setBusy(true); setErr(''); setResults(null);
    try { setResults(await smartSuggest(mode, listId, t, photo?.data || null, ctl.current.signal)); }
    catch (e) { if ((e as Error).name !== 'AbortError') setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  const chosen = results?.filter(r => r.on) || [];
  const toggle = (n: number) => setResults(results!.map((r, k) => (k === n ? { ...r, on: !r.on } : r)));

  return (
    <Sheet label={mode === 'forgot' ? 'Wat vergeet ik?' : 'Slim toevoegen'}>
      <h3><span className="spk"><Sparkles /></span>{mode === 'forgot' ? 'Wat vergeet ik?' : shop ? 'Slim toevoegen' : 'Plan iets groots'}</h3>
      {mode === 'forgot'
        ? <p className="note">Gemini kijkt naar wat er op de lijst staat en wat jullie vaak kopen.</p>
        : <>
          <p className="note">{shop ? 'Noem een gerecht of weekmenu, plak een recept, of maak een foto van een briefje of recept. Gemini zet de boodschappen per afdeling klaar.' : 'Omschrijf wat er moet gebeuren. Gemini maakt er losse taken van, met datums als dat logisch is.'}</p>
          <textarea className="field" id="ai-text" rows={3} value={text} onChange={e => setText(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
            placeholder={shop ? 'Bijv. nasi voor 6 personen, of plak hier een recept' : 'Bijv. verjaardag van oma op 2 november organiseren'} />
          <div className="aiex">{EXAMPLES[list.kind].map(x => <button key={x} type="button" className="chip" onClick={() => { setText(x); run(x); }}>{x}</button>)}</div>
          <label className="photo"><Camera /><span>{photo ? `Foto: ${photo.name}` : 'Foto toevoegen'}</span>
            <input type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; setPhoto(f ? { name: f.name, data: await photoToDataUrl(f) } : null); }} />
          </label>
          <div className="actions"><button type="button" className="btn ghost" onClick={closeSheet}>Annuleren</button><button type="button" className="btn" disabled={busy || (!text.trim() && !photo)} onClick={() => run()}>Bedenk het</button></div>
        </>}
      {busy && <div className="thinking"><span className="dots" aria-hidden="true" />Gemini denkt na…<button type="button" className="linkbtn" onClick={() => { ctl.current?.abort(); setBusy(false); }}>Stop</button></div>}
      {err && <><p className="aierr">{err}</p><div className="actions"><span /><button type="button" className="btn ghost" onClick={() => run()}>Opnieuw</button></div></>}
      {results && (results.length === 0
        ? <p className="note">{mode === 'forgot' ? 'Niets te melden: je lijst lijkt compleet.' : 'Niets nieuws gevonden. Misschien staat alles er al op, of omschrijf het iets anders.'}</p>
        : <>
          <div className="aires">
            {results.map((r, n) => {
              const sub = shop ? [r.cat ? CAT_LABEL[r.cat] : '', r.pantry ? 'heb je vaak al in huis' : '', r.why].filter(Boolean) : [r.due ? dueInfo(r.due).label : '', r.note].filter(Boolean);
              return (
                <label className="airow" key={n}>
                  <input type="checkbox" checked={r.on} onChange={() => toggle(n)} />
                  <span className="txt"><span className="t">{r.qty && <span className="qty">{r.qty}</span>}{r.text}</span>{sub.length > 0 && <span className="sub">{sub.join(' · ')}</span>}</span>
                </label>
              );
            })}
          </div>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => run()}>Opnieuw</button>
            <button type="button" className="btn" disabled={!chosen.length} onClick={() => { closeSheet(); addMany(listId, chosen); }}>{chosen.length ? `Voeg ${chosen.length} toe` : 'Niets gekozen'}</button>
          </div>
        </>)}
    </Sheet>
  );
}
