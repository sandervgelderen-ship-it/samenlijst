import { useState, type FormEvent } from 'react';
import { Brain } from 'lucide-react';
import { kbKey } from '../../lib/domain';
import { clearOldKb, forgetMemory, remember, rewordMemory } from '../../data/actions';
import { useStore } from '../../store/useStore';
import { useNames } from '../bits';
import { Sheet, closeSheet } from './Sheets';

const EXAMPLES = ['Schoonmaakproducten moeten ecologisch zijn', 'We eten vegetarisch', 'Klusspullen horen op de lijst Klussen', 'Koffie altijd fairtrade'];

/**
 * The household's memory: general preferences and agreements, never single products.
 * Add your own, change or forget them; Gemini adds what it learns from your corrections.
 */
export default function MemorySheet() {
  const memory = useStore(s => s.memory);
  const oldKb = useStore(s => s.oldKb);
  const lists = useStore(s => s.lists);
  const readOnly = useStore(s => s.readOnly);
  const aiOn = useStore(s => s.aiOn);
  const { first } = useNames();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const key = kbKey(q);
  const rows = memory.filter(m => !key || kbKey(m.text + ' ' + m.topic).includes(key));
  const own = memory.filter(m => m.source === 'zelf').length;
  const listName = (id: string | null) => (id ? lists.find(l => l.id === id)?.name : '') || '';

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    if (editing) rewordMemory(editing, t);
    else remember(t, { source: 'zelf' });
    setText(''); setEditing(null);
  }

  return (
    <Sheet label="Geheugen">
      <h3><span className="spk"><Brain /></span>Geheugen</h3>
      <p className="note">Wat IsErNog over jullie huishouden weet: voorkeuren en afspraken, geen losse boodschappen. Gemini houdt er rekening mee bij elk nieuw item, elk plan en elke suggestie.{aiOn ? ' Als je iets corrigeert, leidt Gemini er zelf een regel uit af.' : ''}</p>

      {!readOnly && (
        <form className="memadd" onSubmit={submit}>
          <input className="field" id="mem-text" value={text} maxLength={160} onChange={e => setText(e.target.value)}
            placeholder={editing ? 'Nieuwe tekst' : 'Bijv. schoonmaakproducten moeten ecologisch zijn'} aria-label={editing ? 'Regel wijzigen' : 'Iets om te onthouden'} />
          <button className="btn" type="submit" disabled={!text.trim()}>{editing ? 'Bewaar' : 'Onthoud'}</button>
          {editing && <button className="btn ghost" type="button" onClick={() => { setEditing(null); setText(''); }}>Annuleer</button>}
        </form>
      )}
      {!readOnly && !memory.length && (
        <div className="aiex">{EXAMPLES.map(x => <button key={x} type="button" className="chip" onClick={() => setText(x)}>{x}</button>)}</div>
      )}

      {memory.length > 0 && (
        <div className="kbstats">
          <div><b>{memory.length}</b><span>{memory.length === 1 ? 'voorkeur' : 'voorkeuren'}</span></div>
          <div><b>{own}</b><span>zelf toegevoegd</span></div>
          <div><b>{memory.length - own}</b><span>geleerd van Gemini</span></div>
        </div>
      )}
      {memory.length > 8 && <input className="field" id="mem-q" placeholder="Zoek in het geheugen" aria-label="Zoek in het geheugen" value={q} onChange={e => setQ(e.target.value)} />}

      {memory.length === 0
        ? <p className="note">Nog niets onthouden. Typ hierboven een voorkeur, of typ onderaan in de app <em>onthoud: …</em></p>
        : !rows.length ? <p className="note">Niets gevonden.</p>
        : <div className="kbrows">
          {rows.map(m => (
            <div className="kbrow" key={m.id}>
              <span className="txt">
                <span className="t">{m.text}</span>
                <span className="sub">
                  {[m.topic, listName(m.list) && `lijst ${listName(m.list)}`, m.source === 'geleerd' ? 'geleerd van Gemini' : m.by ? `door ${first(m.by)}` : 'zelf toegevoegd'].filter(Boolean).join(' · ')}
                </span>
                {m.source === 'geleerd' && m.from && <span className="sub mem-from">Uit: {m.from}</span>}
              </span>
              {!readOnly && (
                <span className="acts">
                  <button type="button" className="linkbtn" onClick={() => { setEditing(m.id); setText(m.text); document.getElementById('mem-text')?.focus(); }}>Wijzig</button>
                  <button type="button" className="linkbtn" onClick={() => forgetMemory(m.id)}>Vergeet</button>
                </span>
              )}
            </div>
          ))}
        </div>}

      {!readOnly && oldKb.length > 0 && (
        <div className="banner warn mem-old">
          <span>De oude kennisbank bewaarde nog {oldKb.length} losse {oldKb.length === 1 ? 'item' : 'items'}. Die gebruikt IsErNog niet meer.</span>
          <button type="button" onClick={clearOldKb}>Opruimen</button>
        </div>
      )}
      <div className="actions"><span /><button type="button" className="btn ghost" onClick={closeSheet}>Sluiten</button></div>
    </Sheet>
  );
}
