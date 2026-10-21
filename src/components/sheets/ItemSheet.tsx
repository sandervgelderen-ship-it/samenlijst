import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { CAT_LABEL, CATS, normStore, STORES, SUPERMARKT, kbKey, parseRepeat, repeatLabel, sortPrices, unitLabel, unitPrice, type Repeat } from '../../lib/domain';
import { deleteItems, learnFrom, lookupPrices, moveItem, queuePlan, setStore, updateItem, usedStores } from '../../data/actions';
import { setS, useStore } from '../../store/useStore';
import type { CatId, Item } from '../../types';
import { Avatar, useHousehold, useNames } from '../bits';
import { Sheet, closeSheet } from './Sheets';

const REPEATS: { key: string; value: Repeat | null }[] = [
  { key: '', value: null }, { key: 'day1', value: { unit: 'day', n: 1 } }, { key: 'week1', value: { unit: 'week', n: 1 } },
  { key: 'week2', value: { unit: 'week', n: 2 } }, { key: 'month1', value: { unit: 'month', n: 1 } }, { key: 'year1', value: { unit: 'year', n: 1 } },
];
const repeatKey = (r: Repeat | null | undefined) => (r ? `${r.unit}${r.n}` : '');

export default function ItemSheet({ id }: { id: string }) {
  const item = useStore(s => s.items.find(i => i.id === id));
  const lists = useStore(s => s.lists);
  const aiOn = useStore(s => s.aiOn);
  const household = useHousehold();
  const { full } = useNames();
  const [f, setF] = useState(() => item ? { text: item.text, qty: item.qty || '', note: item.note || '', cat: (item.cat || 'overig') as CatId, due: item.due || '', store: normStore(item.store) || SUPERMARKT, repeat: repeatKey(item.repeat || parseRepeat(item.note || '').repeat), urgent: !!item.urgent, assignee: item.assignee || null, listId: item.listId } : null);

  // Someone else deleted it while it was open.
  useEffect(() => { if (!item) { closeSheet(); } }, [item]);
  if (!item || !f) return null;
  const list = lists.find(l => l.id === item.listId);
  const shop = list?.kind === 'shop';
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  function save() {
    const patch: Partial<Item> = { text: (f!.text.trim() || item!.text).slice(0, 120), qty: f!.qty.trim().slice(0, 24), note: f!.note.trim().slice(0, 140), urgent: f!.urgent };
    if (shop) patch.cat = f!.cat; else { patch.due = f!.due || null; patch.assignee = f!.assignee; patch.repeat = REPEATS.find(r => r.key === f!.repeat)?.value ?? null;
      // "Elke week" as the whole note: that is now the repeat setting.
      const pn = parseRepeat(patch.note || ''); if (pn.repeat && !kbKey(pn.text.replace(/^Elke.*$/i, ''))) patch.note = ''; }
    updateItem(id, patch);
    // Corrections may teach a general preference ("Schoonmaakproducten ecologisch"); Gemini decides.
    const changed: string[] = [];
    if (patch.text !== item!.text) changed.push(`naam "${item!.text}" werd "${patch.text}"`);
    if (patch.note && patch.note !== (item!.note || '')) changed.push(`notitie "${patch.note}"`);
    if (shop && f!.cat !== (item!.cat || 'overig')) changed.push(`afdeling ${CAT_LABEL[item!.cat || 'overig']} werd ${CAT_LABEL[f!.cat]}`);
    if (changed.length) learnFrom(`Item "${patch.text}" op de lijst "${list?.name || ''}" aangepast: ${changed.join('; ')}.`);
    if (shop && (normStore(f!.store) || SUPERMARKT) !== (normStore(item!.store) || SUPERMARKT)) setStore(id, f!.store);
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
      {!shop && (
        <label>Herhalen
          <select className="field" id="e-repeat" value={f.repeat} onChange={e => set({ repeat: e.target.value })}>
            {REPEATS.map(r => <option key={r.key} value={r.key}>{r.value ? repeatLabel(r.value) : 'Niet'}</option>)}
          </select>
        </label>
      )}
      {shop && (
        <label>Waar koop je het
          <input className="field" id="e-store" list="e-stores" value={f.store} maxLength={30} onChange={e => set({ store: e.target.value })} onFocus={e => e.target.select()} />
          <datalist id="e-stores">{[...new Set([...STORES, ...usedStores().map(s => normStore(s) || '')])].filter(Boolean).map(s => <option key={s} value={s} />)}</datalist>
        </label>
      )}
      {shop && !item.done && <Prices item={item} />}
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

/** What it costs where, cheapest first, as Gemini found it online. */
function Prices({ item }: { item: Item }) {
  const busy = useStore(s => s.pricesBusy);
  const aiOn = useStore(s => s.aiOn);
  const readOnly = useStore(s => s.readOnly);
  const place = useHousehold()?.place?.trim();
  const prices = sortPrices((item.prices || []).filter(p => p.amount != null));
  if (!place) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span className="lbl2">Prijzen{item.pricesAt ? ` · ${new Date(item.pricesAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}` : ''}</span>
      {prices.length ? (
        <div className="prices">
          {prices.map((p, n) => (
            <div className={`prow ${n === 0 ? 'best' : ''}`} key={p.store}>
              <b>{p.price}</b>
              <span>{p.store}{p.deal ? ` · ${p.deal}` : ''}{unitPrice(p) && <span className="per">{unitLabel(unitPrice(p)!)}</span>}</span>
              <span className="note">{p.product}</span>
            </div>
          ))}
        </div>
      ) : <p className="note">{busy ? 'Gemini zoekt de prijzen…' : 'Nog geen prijzen bekend.'}</p>}
      {aiOn && !readOnly && (
        <button type="button" className="linkbtn" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => void lookupPrices([item.id])}>
          <RefreshCw size={13} /> {busy ? 'Zoeken…' : prices.length ? 'Prijzen opnieuw zoeken' : 'Zoek prijzen'}
        </button>
      )}
      <p className="note">Vergeleken per kilo, liter of stuk waar de verpakking dat zegt. Gevonden door Gemini met Google; check de prijs in de winkel.</p>
    </div>
  );
}
