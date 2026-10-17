import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { CATS } from '../../lib/domain';
import { deleteItems, learn, moveItem, queuePlan, updateItem } from '../../data/actions';
import { setS, useStore } from '../../store/useStore';
import type { CatId, Item } from '../../types';
import { Avatar, useHousehold, useNames } from '../bits';
import { Sheet, closeSheet } from './Sheets';

export default function ItemSheet({ id }: { id: string }) {
  const item = useStore(s => s.items.find(i => i.id === id));
  const lists = useStore(s => s.lists);
  const aiOn = useStore(s => s.aiOn);
  const household = useHousehold();
  const { full } = useNames();
  const [f, setF] = useState(() => item ? { text: item.text, qty: item.qty || '', note: item.note || '', cat: (item.cat || 'overig') as CatId, due: item.due || '', urgent: !!item.urgent, assignee: item.assignee || null, listId: item.listId } : null);

  // Someone else deleted it while it was open.
  useEffect(() => { if (!item) { closeSheet(); } }, [item]);
  if (!item || !f) return null;
  const list = lists.find(l => l.id === item.listId);
  const shop = list?.kind === 'shop';
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  function save() {
    const patch: Partial<Item> = { text: (f!.text.trim() || item!.text).slice(0, 120), qty: f!.qty.trim().slice(0, 24), note: f!.note.trim().slice(0, 140), urgent: f!.urgent };
    if (shop) patch.cat = f!.cat; else { patch.due = f!.due || null; patch.assignee = f!.assignee; }
    updateItem(id, patch);
    if (shop && f!.cat !== (item!.cat || 'overig')) learn(patch.text!, null, { cat: f!.cat });
    if (f!.listId !== item!.listId) moveItem(id, f!.listId);
    closeSheet();
  }

  return (
    <Sheet label="Item bewerken">
      <h3>{shop ? 'Item bewerken' : 'Taak bewerken'}</h3>
      <label>Wat<input className="field" id="e-text" value={f.text} maxLength={120} onChange={e => set({ text: e.target.value })} onKeyDown={e => e.key === 'Enter' && save()} /></label>
      {lists.length > 1 && (
        <label>Lijst
          <select className="field" id="e-list" value={f.listId} onChange={e => set({ listId: e.target.value })}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      <div className="two">
        <label>{shop ? 'Hoeveel' : 'Aantal'}<input className="field" id="e-qty" value={f.qty} maxLength={24} placeholder={shop ? '2 pak' : '–'} onChange={e => set({ qty: e.target.value })} /></label>
        {shop
          ? <label>Afdeling<select className="field" id="e-cat" value={f.cat} onChange={e => set({ cat: e.target.value as CatId })}>{CATS.map(([c, label]) => <option key={c} value={c}>{label}</option>)}</select></label>
          : <label>Wanneer<input className="field" type="date" id="e-due" value={f.due} onChange={e => set({ due: e.target.value })} /></label>}
      </div>
      <label>Notitie<input className="field" id="e-note" value={f.note} maxLength={140} placeholder={shop ? 'Merk, bonus, alternatief…' : 'Details'} onChange={e => set({ note: e.target.value })} /></label>
      {!shop && household && (
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="lbl2">Wie doet het</span>
          <div className="people">
            <button type="button" className="chip" aria-pressed={!f.assignee} onClick={() => set({ assignee: null })}>Niemand</button>
            {household.members.map(uid => (
              <button type="button" key={uid} className="chip" aria-pressed={f.assignee === uid} onClick={() => set({ assignee: uid })}>
                <Avatar uid={uid} size={22} />{full(uid)}
              </button>
            ))}
          </div>
        </div>
      )}
      {!shop && aiOn && !item.done && (
        <button type="button" className="chip ai" style={{ width: 'fit-content' }}
          onClick={() => { closeSheet(); setS({ planOpen: [...useStore.getState().planOpen.filter(x => x !== id), id] }); queuePlan(id, true); }}>
          <Sparkles size={15} /> {item.plan ? 'Opnieuw uitwerken met Gemini' : 'Werk uit met Gemini'}
        </button>
      )}
      <label className="switch">Dringend<input type="checkbox" id="e-urgent" checked={f.urgent} onChange={e => set({ urgent: e.target.checked })} /></label>
      <p className="note">Toegevoegd door {full(item.addedBy)}{item.createdAt ? ' op ' + new Date(item.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : ''}.</p>
      <div className="actions">
        <button type="button" className="btn danger" onClick={() => { closeSheet(); deleteItems([id], `${item.text} verwijderd`); }}>Verwijderen</button>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={closeSheet}>Annuleren</button>
          <button type="button" className="btn" onClick={save}>Bewaren</button>
        </span>
      </div>
    </Sheet>
  );
}
