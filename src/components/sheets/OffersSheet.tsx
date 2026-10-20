import { useState } from 'react';
import { BadgePercent, Check, Plus, StickyNote } from 'lucide-react';
import { dueInfo, liveOffers, offerItem, todayISO } from '../../lib/domain';
import { addItem, findOffers, listItems, updateItem } from '../../data/actions';
import { setS, useStore } from '../../store/useStore';
import type { Offer } from '../../types';
import { useHousehold } from '../bits';
import { Sheet, closeSheet } from './Sheets';

/** "vannacht om 03:14", "gisteren om 03:12", "op maandag" */
function when(at: number) {
  const d = new Date(at), today = todayISO();
  const day = d.toLocaleDateString('sv-SE');
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (day === today) return d.getHours() < 7 ? `vannacht om ${time}` : `vandaag om ${time}`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (day === y.toLocaleDateString('sv-SE')) return `gisteren om ${time}`;
  return `op ${d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}`;
}

/**
 * This week's supermarket offers in the household's woonplaats. A job looks them up every night;
 * offers for things on the list (checked live) come first and can be noted on the item, others added.
 */
export default function OffersSheet({ listId }: { listId: string }) {
  const list = useStore(s => s.lists.find(l => l.id === listId));
  const household = useHousehold();
  const busy = useStore(s => s.offersBusy);
  const readOnly = useStore(s => s.readOnly);
  const aiOn = useStore(s => s.aiOn);
  useStore(s => s.items); // re-render when items change (added / noted)
  const [store, setStore] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  if (!list || !household) return null;

  const place = (household.place || '').trim();
  const result = household.offers && household.offers.place === place ? household.offers : null;
  const open = listItems(listId).filter(i => !i.done);
  const all = liveOffers(result?.offers);
  const shown = all.filter(o => !store || o.store === store);
  const forList = shown.filter(o => offerItem(o, open));
  const others = shown.filter(o => !offerItem(o, open));
  const stores = (result?.stores || []).filter(s => all.some(o => o.store === s));
  const keyOf = (o: Offer) => o.store + '|' + o.product;
  const label = (o: Offer) => `${o.deal || 'Aanbieding'}${o.price ? ` ${o.price}` : ''} bij ${o.store}`.slice(0, 140);

  function use(o: Offer) {
    const it = offerItem(o, open);
    if (it) updateItem(it.id, { note: label(o) });
    else addItem(listId, o.product, { note: label(o), cat: o.cat, quiet: true });
    setDone(new Set(done).add(keyOf(o)));
  }

  const row = (o: Offer) => {
    const it = offerItem(o, open), used = done.has(keyOf(o));
    const until = o.until ? dueInfo(o.until) : null;
    return (
      <div className="kbrow offer" key={keyOf(o)}>
        <span className="txt">
          <span className="t">{o.product}</span>
          <span className="sub">
            <span className="flag">{o.deal || 'Aanbieding'}</span>
            {o.price && <b>{o.price}</b>}
            <span>{o.store}</span>
            {until && <span>t/m {until.label.toLowerCase()}</span>}
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

      {!place ? (
        <>
          <p className="note">Vul jullie woonplaats in bij Huishouden. Elke nacht zoekt Samenlijst dan de folders van de supermarkten daar door, en hier staan 's ochtends de aanbiedingen klaar.</p>
          <div className="actions"><span /><button type="button" className="btn" onClick={() => setS({ sheet: { kind: 'household' } })}>Woonplaats invullen</button></div>
        </>
      ) : !result ? (
        <>
          <p className="note">Vannacht zoekt Samenlijst de aanbiedingen in {place}; morgenochtend staan ze hier.</p>
          {aiOn && !readOnly && !busy && <div className="actions"><span /><button type="button" className="btn ghost" onClick={() => void findOffers()}>Nu alvast zoeken</button></div>}
        </>
      ) : (
        <>
          <p className="note">
            {all.length
              ? <>{result.week ? <>{result.week} · </> : null}{all.length} aanbiedingen in {place}, bijgewerkt {when(result.at)}. Wat bij {list.name} past staat bovenaan.</>
              : <>Geen geldige aanbiedingen gevonden in {place} ({when(result.at)}). Vannacht kijkt Samenlijst opnieuw.</>}
          </p>
          {stores.length > 1 && (
            <div className="aiex" role="group" aria-label="Supermarkt">
              <button type="button" className="chip" aria-pressed={!store} onClick={() => setStore(null)}>Alle</button>
              {stores.map(s => <button key={s} type="button" className="chip" aria-pressed={store === s} onClick={() => setStore(store === s ? null : s)}>{s}</button>)}
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
      {busy && <div className="thinking"><span className="dots" aria-hidden="true" />Gemini bladert door de folders van {place}…</div>}
      <div className="actions"><span /><button type="button" className="btn ghost" onClick={closeSheet}>Sluiten</button></div>
    </Sheet>
  );
}
