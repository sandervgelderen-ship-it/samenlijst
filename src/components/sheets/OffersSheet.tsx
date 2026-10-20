import { useState, type FormEvent } from 'react';
import { BadgePercent, Check, Plus, StickyNote } from 'lucide-react';
import { dueInfo, kbKey } from '../../lib/domain';
import { addItem, findOffers, listItems, updateItem } from '../../data/actions';
import { useStore } from '../../store/useStore';
import type { Offer } from '../../types';
import { useHousehold } from '../bits';
import { Sheet, closeSheet } from './Sheets';

/**
 * Supermarket offers near the household's place. Gemini searches Google for this week's folders;
 * offers for things on the list come first and can be noted on the item, others can be added.
 */
export default function OffersSheet({ listId }: { listId: string }) {
  const list = useStore(s => s.lists.find(l => l.id === listId));
  const household = useHousehold();
  const result = useStore(s => s.offers);
  const busy = useStore(s => s.offersBusy);
  const readOnly = useStore(s => s.readOnly);
  useStore(s => s.items); // re-render when items change (added / noted)
  const [place, setPlace] = useState(() => result?.place || household?.place || '');
  const [store, setStore] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  if (!list) return null;

  const open = listItems(listId).filter(i => !i.done);
  const itemFor = (o: Offer) => (o.match ? open.find(i => kbKey(i.text) === kbKey(o.match)) : undefined);
  const shown = (result?.offers || []).filter(o => !store || o.store === store);
  const forList = shown.filter(o => itemFor(o));
  const others = shown.filter(o => !itemFor(o));
  const keyOf = (o: Offer) => o.store + '|' + o.product;
  const label = (o: Offer) => `${o.deal || 'Aanbieding'}${o.price ? ` ${o.price}` : ''} bij ${o.store}`.slice(0, 140);

  function search(e?: FormEvent) {
    e?.preventDefault();
    setStore(null); setDone(new Set());
    void findOffers(place, listId);
  }
  function use(o: Offer) {
    const it = itemFor(o);
    if (it) updateItem(it.id, { note: label(o) });
    else addItem(listId, o.product, { note: label(o), cat: o.cat, quiet: true });
    setDone(new Set(done).add(keyOf(o)));
  }

  const row = (o: Offer) => {
    const it = itemFor(o), used = done.has(keyOf(o));
    const until = o.until ? dueInfo(o.until) : null;
    return (
      <div className="kbrow offer" key={keyOf(o)}>
        <span className="txt">
          <span className="t">{o.product}</span>
          <span className="sub">
            <span className="flag">{o.deal || 'Aanbieding'}</span>
            {o.price && <b>{o.price}</b>}
            <span>{o.store}</span>
            {until && <span>{until.late ? 'verlopen' : `t/m ${until.label.toLowerCase()}`}</span>}
          </span>
          {it && <span className="sub">Voor <b>{it.text}</b> op je lijst</span>}
        </span>
        {!readOnly && (
          <button type="button" className="chip" disabled={used} onClick={() => use(o)} aria-label={it ? `Zet de aanbieding bij ${it.text}` : `Zet ${o.product} op de lijst`}>
            {used ? <><Check size={14} /> Gedaan</> : it ? <><StickyNote size={14} /> Noteer</> : <><Plus size={14} /> Op lijst</>}
          </button>
        )}
      </div>
    );
  };

  return (
    <Sheet label="Aanbiedingen">
      <h3><span className="spk"><BadgePercent /></span>Aanbiedingen</h3>
      <p className="note">Gemini zoekt op internet de folders van deze week bij supermarkten in jullie plaats. Aanbiedingen voor wat op {list.name} staat komen bovenaan.</p>
      <form className="memadd" onSubmit={search}>
        <input className="field" id="offer-place" value={place} maxLength={80} onChange={e => setPlace(e.target.value)}
          placeholder="Plaats of postcode, bijv. Utrecht" aria-label="Plaats" autoFocus={!place} enterKeyHint="search" />
        <button className="btn" type="submit" disabled={busy || !place.trim()}>{result ? 'Opnieuw' : 'Zoek'}</button>
      </form>

      {busy && <div className="thinking"><span className="dots" aria-hidden="true" />Gemini bladert door de folders van {place.trim() || 'de buurt'}…</div>}

      {!busy && result && (
        <>
          <p className="note">
            {result.offers.length
              ? <>{result.week ? <>{result.week} · </> : null}{result.offers.length} aanbiedingen in {result.place}</>
              : <>Geen aanbiedingen gevonden voor {result.place}.</>}
          </p>
          {result.stores.length > 1 && (
            <div className="aiex" role="group" aria-label="Supermarkt">
              <button type="button" className="chip" aria-pressed={!store} onClick={() => setStore(null)}>Alle</button>
              {result.stores.map(s => <button key={s} type="button" className="chip" aria-pressed={store === s} onClick={() => setStore(store === s ? null : s)}>{s}</button>)}
            </div>
          )}
          {forList.length > 0 && <><p className="lbl2">Voor je lijst</p><div className="kbrows">{forList.map(row)}</div></>}
          {others.length > 0 && <><p className="lbl2">{forList.length ? 'Meer aanbiedingen' : 'Aanbiedingen'}</p><div className="kbrows">{others.map(row)}</div></>}
          <p className="note">Gevonden door Gemini met Google; prijzen en voorwaarden kunnen afwijken, check de folder.</p>
          {result.sources.length > 0 && (
            <p className="note offer-src">Bronnen: {result.sources.map((x, n) => <span key={x.uri}>{n > 0 && ' · '}<a href={x.uri} target="_blank" rel="noopener noreferrer">{x.title}</a></span>)}</p>
          )}
          {result.searchHtml && (
            <iframe className="offer-search" title="Zoeksuggesties van Google" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={result.searchHtml} />
          )}
        </>
      )}
      <div className="actions"><span /><button type="button" className="btn ghost" onClick={closeSheet}>Sluiten</button></div>
    </Sheet>
  );
}
