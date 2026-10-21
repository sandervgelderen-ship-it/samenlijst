import { useEffect, useRef, type ReactNode } from 'react';
import { BadgePercent, Check, ChevronRight, Plus, Repeat2, ShoppingCart, Sparkles, Store } from 'lucide-react';
import { AISLE_COLOR, CAT_LABEL, CAT_ORDER, dueInfo, isSuper, liveOffers, normStore, offerItem, repeatLabel } from '../lib/domain';
import { deleteItems, pickAnswer, planAddBuy, planAddSteps, queuePlan, removePlan, setExtra, setShopper, sortOverig, submitAnswers, togglePlanOpen, toggleItem } from '../data/actions';
import { setS, useStore } from '../store/useStore';
import type { CatId, Item, List, PlanQuestions } from '../types';
import { Avatar, Doodle, useHousehold, useNames } from './bits';
import StoreAsks from './StoreAsks';

const SHOPPING_FOR = 3 * 3600e3;

export default function ListView({ list: l }: { list: List }) {
  const all = useStore(s => s.items);
  const readOnly = useStore(s => s.readOnly);
  const aiOn = useStore(s => s.aiOn);
  const onlyMine = useStore(s => s.onlyMine);
  const analyzing = useStore(s => s.analyzing);
  const ghosts = analyzing.filter(g => g.listId === l.id);
  const me = useStore(s => s.user?.uid);
  const { first } = useNames();
  const household = useHousehold();

  const its = all.filter(i => i.listId === l.id);
  let open = its.filter(i => !i.done);
  // This week's offers (found at night) for things on this list.
  const offers = l.kind === 'shop' && household?.offers && household.offers.place === (household.place || '').trim() ? liveOffers(household.offers.offers) : [];
  const onSale = offers.filter(o => offerItem(o, open)).length;
  const done = its.filter(i => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (l.kind === 'todo' && onlyMine) open = open.filter(i => i.assignee === me);
  const shopper = l.shopper && l.shopper.by && Date.now() - l.shopper.at < SHOPPING_FOR ? l.shopper : null;
  const urgentFirst = (a: Item, b: Item) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0);

  return (
    <>
      {readOnly && <div className="banner warn">Alleen bekijken.</div>}
      {l.kind === 'shop' && shopper && (
        <div className="banner warn">
          <Avatar uid={shopper.by} />
          <span>{shopper.by === me ? 'Jij doet' : `${first(shopper.by)} doet`} nu boodschappen. Voeg snel toe wat nog mist.</span>
          {shopper.by === me && <button onClick={() => setShopper(l.id, false)}>Klaar</button>}
        </div>
      )}

      {its.length > 0 && (
        <div className="lhero">
          <div className="bar"><i style={{ width: `${Math.round(100 * done.length / its.length)}%` }} /></div>
          <span><b>{done.length}</b> van <b>{its.length}</b> {l.kind === 'shop' ? 'in het mandje' : 'gedaan'}</span>
        </div>
      )}

      <div className="toolbar">
        {l.kind === 'shop' && !readOnly && !(shopper && shopper.by === me) && (
          <button className="chip" onClick={() => setShopper(l.id, true)}><ShoppingCart size={15} /> Ik ga boodschappen doen</button>
        )}
        {l.kind === 'todo' && <button className="chip" aria-pressed={onlyMine} onClick={() => setS({ onlyMine: !onlyMine })}>Alleen voor mij</button>}
        {aiOn && !readOnly && l.kind === 'shop' && open.length >= 2 && (
          <button className="chip ai" onClick={() => setS({ sheet: { kind: 'smart', mode: 'forgot', listId: l.id } })}><Sparkles size={15} /> Wat vergeet ik?</button>
        )}
        {l.kind === 'shop' && (aiOn || offers.length > 0) && (
          <button className="chip ai" onClick={() => setS({ sheet: { kind: 'offers', listId: l.id } })}>
            <BadgePercent size={15} /> Aanbiedingen{onSale ? ` · ${onSale} voor je lijst` : offers.length ? ` · ${offers.length}` : ''}
          </button>
        )}
        {aiOn && !readOnly && l.kind === 'todo' && (
          <button className="chip ai" onClick={() => setS({ sheet: { kind: 'smart', mode: 'add', listId: l.id } })}><Sparkles size={15} /> Plan iets groots</button>
        )}
      </div>

      {l.kind === 'shop' && !readOnly && <StoreAsks listId={l.id} />}

      {ghosts.length > 0 && (
        <div className="items ghosts">
          {ghosts.map(g => (
            <div className="item ghost" key={g.pid}>
              <div className="toggle"><span className="box" /><span className="txt"><span className="t">{g.text}</span><span className="sub"><span className="dots" aria-hidden="true" />Gemini analyseert…</span></span></div>
            </div>
          ))}
        </div>
      )}

      {!its.length ? (
        <div className="empty">
          <Doodle kind={l.kind === 'shop' ? 'bag' : 'note'} />
          <strong>{l.kind === 'shop' ? 'De lijst is leeg' : 'Niets te doen'}</strong>
          {l.kind === 'shop'
            ? <>Typ hieronder wat er op moet. Begin met een aantal, zoals <em>2 pak melk</em>; het komt vanzelf bij de juiste afdeling.</>
            : <>Typ hieronder een taak, met een datum als je wilt: <em>kozijnen verven vrijdag</em>. Gemini werkt hem voor je uit.</>}
        </div>
      ) : l.kind === 'shop' ? (
        <>
          {groupByAisle(open.filter(i => isSuper(i.store))).map(([c, g]) => (
            <section className="group" key={c}>
              <h2>
                <span className="aisle"><i style={AISLE_COLOR[c] ? { background: `var(--c-${AISLE_COLOR[c]}-fg)` } : undefined} />{CAT_LABEL[c] || 'Overig'}</span>
                <span>
                  {c === 'overig' && aiOn && !readOnly && <><button className="grp-ai" onClick={() => sortOverig(l.id)}><Sparkles size={13} /> Sorteer</button> · </>}
                  {g.length}
                </span>
              </h2>
              <div className="items">{g.sort((a, b) => urgentFirst(a, b) || a.createdAt - b.createdAt).map(i => <ItemRow key={i.id} item={i} kind="shop" />)}</div>
            </section>
          ))}
          {groupByStore(open.filter(i => !isSuper(i.store))).map(([store, g]) => (
            <section className="group" key={'w-' + store}>
              <h2>
                <span className="aisle"><Store size={15} style={{ color: 'var(--c-druif-fg)' }} />Bij de {store.toLowerCase()}</span>
                <span>{g.length}</span>
              </h2>
              <div className="items">{g.sort((a, b) => urgentFirst(a, b) || a.createdAt - b.createdAt).map(i => <ItemRow key={i.id} item={i} kind="shop" />)}</div>
            </section>
          ))}
          {!open.length && <div className="empty"><Doodle kind="done" /><strong>Alles in het mandje</strong>Wis de afgevinkte items als je klaar bent; ze blijven als suggestie bewaard.</div>}
        </>
      ) : (
        <>
          {open.length ? (
            <section className="group">
              <h2><span>Te doen</span><span>{open.length}</span></h2>
              <div className="items">
                {open.sort((a, b) => urgentFirst(a, b) || (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt)
                  .map(i => <ItemRow key={i.id} item={i} kind="todo" />)}
              </div>
            </section>
          ) : (
            <div className="empty">
              <Doodle kind={onlyMine ? 'note' : 'done'} />
              <strong>{onlyMine ? 'Niets voor jou' : 'Alles gedaan'}</strong>
              {onlyMine ? 'Er staat nu geen taak op jouw naam.' : 'Mooi werk. Wis de afgeronde taken als je wilt.'}
            </div>
          )}
        </>
      )}

      {done.length > 0 && (
        <>
          <div className="donehead">
            <h2>{l.kind === 'shop' ? 'In het mandje' : 'Klaar'} · {done.length}</h2>
            {!readOnly && <button className="linkbtn" onClick={() => deleteItems(done.map(i => i.id), `${done.length} ${done.length === 1 ? 'item' : 'items'} gewist`)}>Wis afgevinkt</button>}
          </div>
          <div className="items">{done.map(i => <ItemRow key={i.id} item={i} kind={l.kind} />)}</div>
        </>
      )}
    </>
  );
}

/** Items that are not bought at the supermarket, per shop (Bouwmarkt, Drogist…), after the aisles. */
function groupByStore(items: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  items.forEach(i => { const s = normStore(i.store) || 'Overig'; groups.set(s, [...(groups.get(s) || []), i]); });
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'));
}

function groupByAisle(items: Item[]): [CatId, Item[]][] {
  const groups: Partial<Record<CatId, Item[]>> = {};
  items.forEach(i => { const c = (i.cat || 'overig') as CatId; (groups[c] ||= []).push(i); });
  return (Object.keys(groups) as CatId[]).sort((a, b) => CAT_ORDER[a] - CAT_ORDER[b]).map(c => [c, groups[c]!]);
}

const o2s = (o: { deal: string; price: string; store: string; product: string }) => `${o.product}: ${o.deal}${o.price ? ' ' + o.price : ''} bij ${o.store}`;

function ItemRow({ item: i, kind }: { item: Item; kind: 'shop' | 'todo' }) {
  const readOnly = useStore(s => s.readOnly);
  const popId = useStore(s => s.popId);
  const flashId = useStore(s => s.flashId);
  const me = useStore(s => s.user?.uid);
  const { first } = useNames();
  const household = useHousehold();
  const ref = useRef<HTMLDivElement>(null);
  // An offer this week for this item (unless it is already noted on it).
  const offer = kind === 'shop' && !i.done && household?.offers && household.offers.place === (household.place || '').trim()
    ? liveOffers(household.offers.offers).find(o => offerItem(o, [i]) && !(i.note || '').includes(o.store)) : undefined;

  useEffect(() => {
    if (popId === i.id) { const t = setTimeout(() => setS({ popId: null }), 600); return () => clearTimeout(t); }
  }, [popId, i.id]);
  useEffect(() => {
    if (flashId === i.id) {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const t = setTimeout(() => setS({ flashId: null }), 1300); return () => clearTimeout(t);
    }
  }, [flashId, i.id]);

  const subs: ReactNode[] = [];
  if (i.note) subs.push(<span key="n">{i.note}</span>);
  if (i.urgent && !i.done) subs.push(<span key="u" className="flag">Dringend</span>);
  if (offer) subs.push(<span key="o" className="flag offer-flag" title={`${o2s(offer)}`}>% {offer.deal || 'Aanbieding'} · {offer.store}</span>);
  if (kind === 'todo' && i.due && !i.done) { const d = dueInfo(i.due); subs.push(<span key="d" className={`flag ${d.late ? 'late' : d.soon ? '' : 'calm'}`}>{d.label}</span>); }
  if (kind === 'todo' && i.repeat) subs.push(<span key="r" className="flag calm"><Repeat2 size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{repeatLabel(i.repeat)}</span>);
  if (i.done && i.doneBy) subs.push(<span key="b">{first(i.doneBy)}{kind === 'shop' ? ' heeft het' : ' deed dit'}</span>);
  else if (i.addedBy && i.addedBy !== me && kind === 'shop') subs.push(<span key="a">van {first(i.addedBy)}</span>);

  return (
    <>
      <div ref={ref} className={`item ${i.done ? 'done' : ''} ${popId === i.id ? 'pop' : ''} ${flashId === i.id ? 'flash' : ''}`}>
        {/* The checkbox ticks it off; the item itself opens the details. */}
        <button className="check" disabled={readOnly} aria-pressed={i.done} aria-label={`${i.text} ${i.done ? 'terugzetten' : 'afvinken'}`}
          onClick={e => { const r = (e.currentTarget.querySelector('.box') as HTMLElement)?.getBoundingClientRect(); toggleItem(i.id, r ? { x: r.left + r.width / 2, y: r.top } : undefined); }}>
          <span className="box"><Check strokeWidth={3.4} /></span>
        </button>
        <button className="itxt" disabled={readOnly} onClick={() => setS({ sheet: { kind: 'item', id: i.id } })} aria-label={`${i.text}: details`}>
          <span className="txt">
            <span className="t">{i.qty && <span className="qty">{i.qty}</span>}{i.text}</span>
            {subs.length > 0 && <span className="sub">{subs}</span>}
          </span>
          {kind === 'todo' && i.assignee && <Avatar uid={i.assignee} className="who" />}
          {!readOnly && <ChevronRight className="chev" size={18} aria-hidden="true" />}
        </button>
      </div>
      {kind === 'todo' && !i.done && <PlanPart item={i} />}
    </>
  );
}

function planLabel(i: Item) {
  const pl = i.plan!; const bits: string[] = [];
  if (pl.steps?.length) bits.push(`${pl.steps.length} ${pl.steps.length === 1 ? 'stap' : 'stappen'}`);
  if (pl.buy?.length) bits.push(`${pl.buy.length} te kopen`);
  if (!bits.length && pl.detail) bits.push('details');
  return 'Uitgewerkt' + (bits.length ? ' · ' + bits.join(' · ') : '');
}

/** The worked-out version of a task: what it involves, steps, tips and what to buy. */
function PlanPart({ item: i }: { item: Item }) {
  const planning = useStore(s => s.planning.includes(i.id));
  const mode = useStore(s => s.planMode[i.id]);
  const open = useStore(s => s.planOpen.includes(i.id));
  const lists = useStore(s => s.lists);
  const readOnly = useStore(s => s.readOnly);
  const aiOn = useStore(s => s.aiOn);
  if (planning) return <div className="planline"><span className="dots" aria-hidden="true" />{mode === 'ask' ? 'Gemini bedenkt een paar vragen…' : 'Gemini werkt dit uit…'}</div>;
  const pq = i.planQ;
  if (pq?.questions?.length && (!i.plan || (pq.at || 0) > (i.plan.at || 0))) return <QuestionCard item={i} pq={pq} />;
  const pl = i.plan;
  if (!pl || typeof pl !== 'object') return null;
  const steps = pl.steps || [], buy = pl.buy || [];
  const shops = lists.filter(l => l.kind === 'shop').slice(0, 3);
  const added = pl.buyAdded ? lists.find(l => l.id === pl.buyAdded) : undefined;
  return (
    <>
      <div className="planline">
        <button className="planchip" aria-expanded={open} onClick={() => togglePlanOpen(i.id)}><Sparkles />{planLabel(i)}</button>
      </div>
      {open && (
        <div className="plan">
          {pl.detail && <p className="pdetail">{pl.detail}</p>}
          {!!pl.answers?.length && <p className="panswers">Op basis van: {pl.answers.map(a => a.a).join(' · ')}</p>}
          {steps.length > 0 && (
            <div className="psec">
              <h4>Stappen</h4>
              <ol className="psteps">{steps.map((st, n) => <li key={n}><span>{st.text}{st.how && <span className="phow">{st.how}</span>}</span>{st.due && <span className="flag calm">{dueInfo(st.due).label}</span>}</li>)}</ol>
              {!readOnly && (pl.stepsAdded
                ? <p className="note">Deze stappen staan als taken op de lijst.</p>
                : <div className="pacts"><button className="chip ai" onClick={() => planAddSteps(i.id)}><Plus size={14} /> Zet {steps.length === 1 ? 'deze stap' : `de ${steps.length} stappen`} op de lijst</button></div>)}
            </div>
          )}
          {buy.length > 0 && (
            <div className="psec">
              <h4>Nodig</h4>
              <div className="pbuy">{buy.map((b, n) => <span className="chip" key={n}>{b.qty && <b>{b.qty}</b>}{b.text}</span>)}</div>
              {!readOnly && (added
                ? <p className="note">Staat op {added.name}.</p>
                : shops.length
                  ? <div className="pacts">{shops.map(l => <button key={l.id} className="chip ai" onClick={() => planAddBuy(i.id, l.id)}><ShoppingCart size={14} /> Zet op {l.name}</button>)}</div>
                  : <p className="note">Maak een boodschappenlijst, dan zet je dit er met één tik op.</p>)}
            </div>
          )}
          <div className="pfoot">
            <span style={{ display: 'flex', gap: 12 }}>
              {!readOnly && aiOn && <button className="linkbtn" onClick={() => queuePlan(i.id, true)}>Opnieuw</button>}
              {!readOnly && <button className="linkbtn" onClick={() => removePlan(i.id)}>Weghalen</button>}
            </span>
            <button className="linkbtn" onClick={() => togglePlanOpen(i.id)}>Inklappen</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Multiple-choice questions about the details, before the plan is made. */
function QuestionCard({ item: i, pq }: { item: Item; pq: PlanQuestions }) {
  const sel = useStore(s => s.qaSel[i.id]);
  const picks = sel?.picks || {};
  const readOnly = useStore(s => s.readOnly);
  const answered = pq.questions.filter((_, qi) => (picks[qi] || []).length).length;
  return (
    <div className="plan pq">
      <p className="pdetail"><b>Een paar vragen</b>, zodat Gemini het plan op jullie kan afstemmen.</p>
      {pq.questions.map((q, qi) => (
        <div className="psec" key={qi}>
          <h4>{q.q}{q.multi && <span className="pqmulti">meerdere mogelijk</span>}</h4>
          <div className="pqopts">
            {q.options.map((o, oi) => (
              <button key={oi} className="chip pqo" disabled={readOnly} aria-pressed={(picks[qi] || []).includes(oi)} onClick={() => pickAnswer(i.id, qi, oi)}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      {!readOnly && (
        <>
          <label className="lbl2 pqextra">Nog iets dat Gemini moet weten? <span>(mag leeg)</span>
            <input className="field" id={`pq-extra-${i.id}`} maxLength={200} value={sel?.extra || ''} onChange={e => setExtra(i.id, e.target.value)} placeholder="Bijv. budget, voorkeur, wie er meehelpt" />
          </label>
          <div className="pfoot">
            <span style={{ display: 'flex', gap: 12 }}>
              <button className="linkbtn" onClick={() => submitAnswers(i.id, true)}>Sla vragen over</button>
              <button className="linkbtn" onClick={() => removePlan(i.id)}>Niet nodig</button>
            </span>
            <button className="btn" onClick={() => submitAnswers(i.id, false)}>{answered ? `Werk uit (${answered}/${pq.questions.length})` : 'Werk uit'}</button>
          </div>
        </>
      )}
    </div>
  );
}
