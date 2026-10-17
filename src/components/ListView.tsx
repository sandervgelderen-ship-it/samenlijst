import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Pencil, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import { AISLE_COLOR, CAT_LABEL, CAT_ORDER, dueInfo } from '../lib/domain';
import { deleteItems, planAddBuy, planAddSteps, queuePlan, setShopper, sortOverig, togglePlanOpen, toggleItem } from '../data/actions';
import { setS, useStore } from '../store/useStore';
import type { CatId, Item, List } from '../types';
import { Avatar, Doodle, useNames } from './bits';

const SHOPPING_FOR = 3 * 3600e3;

export default function ListView({ list: l }: { list: List }) {
  const all = useStore(s => s.items);
  const readOnly = useStore(s => s.readOnly);
  const aiOn = useStore(s => s.aiOn);
  const onlyMine = useStore(s => s.onlyMine);
  const me = useStore(s => s.user?.uid);
  const { first } = useNames();

  const its = all.filter(i => i.listId === l.id);
  let open = its.filter(i => !i.done);
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
        {aiOn && !readOnly && l.kind === 'todo' && (
          <button className="chip ai" onClick={() => setS({ sheet: { kind: 'smart', mode: 'add', listId: l.id } })}><Sparkles size={15} /> Plan iets groots</button>
        )}
      </div>

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
          {groupByAisle(open).map(([c, g]) => (
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

function groupByAisle(items: Item[]): [CatId, Item[]][] {
  const groups: Partial<Record<CatId, Item[]>> = {};
  items.forEach(i => { const c = (i.cat || 'overig') as CatId; (groups[c] ||= []).push(i); });
  return (Object.keys(groups) as CatId[]).sort((a, b) => CAT_ORDER[a] - CAT_ORDER[b]).map(c => [c, groups[c]!]);
}

function ItemRow({ item: i, kind }: { item: Item; kind: 'shop' | 'todo' }) {
  const readOnly = useStore(s => s.readOnly);
  const popId = useStore(s => s.popId);
  const flashId = useStore(s => s.flashId);
  const me = useStore(s => s.user?.uid);
  const { first } = useNames();
  const ref = useRef<HTMLDivElement>(null);

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
  if (kind === 'todo' && i.due && !i.done) { const d = dueInfo(i.due); subs.push(<span key="d" className={`flag ${d.late ? 'late' : d.soon ? '' : 'calm'}`}>{d.label}</span>); }
  if (i.done && i.doneBy) subs.push(<span key="b">{first(i.doneBy)}{kind === 'shop' ? ' heeft het' : ' deed dit'}</span>);
  else if (i.addedBy && i.addedBy !== me && kind === 'shop') subs.push(<span key="a">van {first(i.addedBy)}</span>);

  return (
    <>
      <div ref={ref} className={`item ${i.done ? 'done' : ''} ${popId === i.id ? 'pop' : ''} ${flashId === i.id ? 'flash' : ''}`}>
        <button className="toggle" disabled={readOnly} aria-pressed={i.done}
          onClick={e => { const r = (e.currentTarget.querySelector('.box') as HTMLElement)?.getBoundingClientRect(); toggleItem(i.id, r ? { x: r.left + r.width / 2, y: r.top } : undefined); }}>
          <span className="box"><Check strokeWidth={3.4} /></span>
          <span className="txt">
            <span className="t">{i.qty && <span className="qty">{i.qty}</span>}{i.text}</span>
            {subs.length > 0 && <span className="sub">{subs}</span>}
          </span>
        </button>
        {kind === 'todo' && i.assignee && <Avatar uid={i.assignee} className="who" />}
        {!readOnly && <button className="edit" onClick={() => setS({ sheet: { kind: 'item', id: i.id } })} aria-label={`${i.text} bewerken`}><Pencil /></button>}
      </div>
      {kind === 'todo' && !i.done && <PlanPart item={i} />}
    </>
  );
}

function planLabel(i: Item) {
  const pl = i.plan!; const bits: string[] = [];
  if (pl.steps?.length) bits.push(`${pl.steps.length} ${pl.steps.length === 1 ? 'stap' : 'stappen'}`);
  if (pl.tips?.length) bits.push(`${pl.tips.length} ${pl.tips.length === 1 ? 'tip' : 'tips'}`);
  if (pl.buy?.length) bits.push(`${pl.buy.length} te kopen`);
  return 'Uitgewerkt' + (bits.length ? ' · ' + bits.join(' · ') : '');
}

/** The worked-out version of a task: what it involves, steps, tips and what to buy. */
function PlanPart({ item: i }: { item: Item }) {
  const planning = useStore(s => s.planning.includes(i.id));
  const open = useStore(s => s.planOpen.includes(i.id));
  const lists = useStore(s => s.lists);
  const readOnly = useStore(s => s.readOnly);
  const aiOn = useStore(s => s.aiOn);
  if (planning) return <div className="planline"><span className="dots" aria-hidden="true" />Gemini werkt dit uit…</div>;
  const pl = i.plan;
  if (!pl || typeof pl !== 'object') return null;
  const steps = pl.steps || [], tips = pl.tips || [], buy = pl.buy || [];
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
          {steps.length > 0 && (
            <div className="psec">
              <h4>Stappen</h4>
              <ol className="psteps">{steps.map((st, n) => <li key={n}><span>{st.text}</span>{st.due && <span className="flag calm">{dueInfo(st.due).label}</span>}</li>)}</ol>
              {!readOnly && (pl.stepsAdded
                ? <p className="note">Deze stappen staan als taken op de lijst.</p>
                : <div className="pacts"><button className="chip ai" onClick={() => planAddSteps(i.id)}><Plus size={14} /> Zet {steps.length === 1 ? 'deze stap' : `de ${steps.length} stappen`} op de lijst</button></div>)}
            </div>
          )}
          {tips.length > 0 && <div className="psec"><h4>Suggesties</h4><ul className="ptips">{tips.map((t, n) => <li key={n}>{t}</li>)}</ul></div>}
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
            {readOnly || !aiOn ? <span /> : <button className="linkbtn" onClick={() => queuePlan(i.id, true)}>Opnieuw uitwerken</button>}
            <button className="linkbtn" onClick={() => togglePlanOpen(i.id)}>Inklappen</button>
          </div>
        </div>
      )}
    </>
  );
}
