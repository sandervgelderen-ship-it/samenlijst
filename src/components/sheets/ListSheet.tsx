import { useEffect, useRef, useState } from 'react';
import { COLOR_NAME, COLORS, colorOf } from '../../lib/domain';
import { deleteList, updateList } from '../../data/actions';
import { useStore } from '../../store/useStore';
import type { ColorName, ListKind } from '../../types';
import { Sheet, closeSheet } from './Sheets';

export default function ListSheet({ id }: { id: string }) {
  const l = useStore(s => s.lists.find(x => x.id === id));
  const count = useStore(s => s.items).filter(i => i.listId === id).length;
  const aiOn = useStore(s => s.aiOn);
  const [name, setName] = useState(l?.name || '');
  const [kind, setKind] = useState<ListKind>(l?.kind || 'shop');
  const [color, setColor] = useState<ColorName>(colorOf(l));
  const [autoPlan, setAutoPlan] = useState(l?.autoPlan !== false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!l) return null;

  function save() {
    updateList(id, { name: (name.trim() || l!.name).slice(0, 60), kind, color, autoPlan });
    closeSheet();
  }
  function del() {
    if (armed) { deleteList(id); return; }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 4000);
  }

  return (
    <Sheet label="Lijstinstellingen">
      <h3>Lijst</h3>
      <label>Naam<input className="field" id="l-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} /></label>
      <div style={{ display: 'grid', gap: 6 }}>
        <span className="lbl2">Soort</span>
        <div className="seg" role="group" style={{ width: 'fit-content' }}>
          <button type="button" aria-pressed={kind === 'shop'} onClick={() => setKind('shop')}>Boodschappen</button>
          <button type="button" aria-pressed={kind === 'todo'} onClick={() => setKind('todo')}>Taken</button>
        </div>
      </div>
      <p className="note">Boodschappenlijsten sorteren per afdeling en onthouden wat je eerder kocht. Takenlijsten hebben datums, iemand die het doet en een uitwerking door Gemini.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="lbl2">Kleur</span>
        <div className="swatches">
          {COLORS.map(c => (
            <button key={c} type="button" className="sw" aria-pressed={c === color} aria-label={COLOR_NAME[c]} onClick={() => setColor(c)}
              style={{ background: `var(--c-${c}-bg)`, color: `var(--c-${c}-fg)` }}><span /></button>
          ))}
        </div>
      </div>
      {aiOn && kind === 'todo' && (
        <label className="switch">Nieuwe taken laten uitwerken door Gemini<input type="checkbox" id="l-autoplan" checked={autoPlan} onChange={e => setAutoPlan(e.target.checked)} /></label>
      )}
      <div className="actions">
        <button type="button" className={`btn danger ${armed ? 'armed' : ''}`} onClick={del}>
          {armed ? (count ? `Tik nogmaals: lijst en ${count} items weg` : 'Tik nogmaals om te verwijderen') : 'Lijst verwijderen'}
        </button>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={closeSheet}>Annuleren</button>
          <button type="button" className="btn" onClick={save}>Bewaren</button>
        </span>
      </div>
    </Sheet>
  );
}
