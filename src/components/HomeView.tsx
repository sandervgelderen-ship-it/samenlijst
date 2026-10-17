import { useState, type FormEvent } from 'react';
import { Check, Plus, ShoppingCart, ListChecks, Sparkles } from 'lucide-react';
import { colorOf, dueInfo, greetingPart, todayISO } from '../lib/domain';
import { answerPending, createList, go, moveItem } from '../data/actions';
import { setS, useStore } from '../store/useStore';
import type { List } from '../types';
import { Doodle, useNames } from './bits';

const WHY: Record<string, string> = { kb: 'geleerd', rule: 'herkend', ai: 'Gemini', user: 'jouw keuze', explicit: 'via @', dup: 'stond er al op', only: '' };
const lcVars = (l: List) => { const c = colorOf(l); return { ['--lc-bg' as string]: `var(--c-${c}-bg)`, ['--lc-fg' as string]: `var(--c-${c}-fg)` }; };
const SHOPPING_FOR = 3 * 3600e3;

export default function HomeView() {
  const lists = useStore(s => s.lists);
  const items = useStore(s => s.items);
  const kbSize = useStore(s => s.kb.size);
  const readOnly = useStore(s => s.readOnly);
  const user = useStore(s => s.user);
  const tipOpen = useStore(s => s.tipOpen);
  const { first } = useNames();

  const open = items.filter(i => !i.done && lists.some(l => l.id === i.listId));
  const forToday = open.filter(i => i.due && i.due <= todayISO()).length;
  const shopping = lists.find(l => l.shopper?.by && l.shopper.by !== user?.uid && Date.now() - l.shopper.at < SHOPPING_FOR);
  const hi = `${greetingPart()}${user?.name ? ', ' + user.name.split(' ')[0] : ''}!`;

  return (
    <>
      <div className="hello">
        <p className="hi">{hi}</p>
        <p className="sum">
          {!lists.length ? 'Zullen we een eerste lijst maken?'
            : open.length ? <>Nog <b>{open.length}</b> {open.length === 1 ? 'ding' : 'dingen'} open{forToday ? <>, waarvan <b>{forToday}</b> voor vandaag</> : null}.</>
            : 'Alles is af. Tijd voor koffie.'}
          {shopping && <> {first(shopping.shopper!.by)} doet nu boodschappen.</>}
        </p>
      </div>

      {!readOnly && <QuickPanel />}

      <div className="eyerow">
        <p className="eyebrow">Jullie lijsten</p>
        {kbSize > 0 && <button className="linkbtn" onClick={() => setS({ sheet: { kind: 'kb' } })}><Sparkles size={14} /> Kennisbank · {kbSize}</button>}
      </div>
      {!lists.length && <div className="empty"><Doodle kind="note" /><strong>Nog geen lijsten</strong>Maak hieronder je eerste lijst, bijvoorbeeld Boodschappen of Klusjes.</div>}
      <div className="lists">{lists.map(l => <ListCard key={l.id} list={l} />)}</div>
      {!readOnly && <NewList hasLists={lists.length > 0} />}

      <details className="tip" open={tipOpen} onToggle={e => setS({ tipOpen: (e.target as HTMLDetailsElement).open })}>
        <summary>Zo werkt Samenlijst</summary>
        <ol>
          <li>Typ onderaan alles door elkaar, gescheiden door komma's: <em>melk, batterijen, tandarts bellen vrijdag</em>. Gemini analyseert elk item eerst: nette naam, aantal, afdeling, datum en op welke lijst het hoort.</li>
          <li>Of tik op de microfoon en spreek een memo in. Gemini schrijft het uit en verdeelt het over de lijsten.</li>
          <li>Twijfelt hij, dan vraagt hij het. Elke keuze en elke verplaatsing komt in de kennisbank, dus hij hoeft het daarna niet meer te vragen.</li>
          <li>Wil je zelf kiezen? Zet <em>@lijstnaam</em> erachter, bijvoorbeeld <em>schroeven @klussen</em>.</li>
          <li>Nieuwe taken worden uitgewerkt: stappen, tips en wat je ervoor moet kopen. Tik op <em>Uitgewerkt</em> onder een taak.</li>
          <li>Nodig huisgenoten uit via het poppetje rechtsboven. De kennisbank is gedeeld: wat de één leert, helpt de ander.</li>
        </ol>
      </details>
    </>
  );
}

function ListCard({ list: l }: { list: List }) {
  const all = useStore(s => s.items);
  const its = all.filter(i => i.listId === l.id);
  const me = useStore(s => s.user?.uid);
  const { first } = useNames();
  const open = its.filter(i => !i.done).length, done = its.length - open;
  const frac = its.length ? done / its.length : 0, C = 2 * Math.PI * 21;
  const shopper = l.shopper && l.shopper.by && Date.now() - l.shopper.at < SHOPPING_FOR ? l.shopper : null;
  const meta = open ? `${open} open` : its.length ? (l.kind === 'shop' ? 'Alles in het mandje' : 'Alles af') : `Leeg · ${l.kind === 'shop' ? 'boodschappen' : 'taken'}`;
  return (
    <button className="listcard" style={lcVars(l)} onClick={() => go(l.id)}>
      <span className="kindmark">{l.kind === 'shop' ? <ShoppingCart size={24} /> : <ListChecks size={24} />}</span>
      <span style={{ minWidth: 0 }}>
        <span className="nm">{l.name}</span>
        <span className="meta">
          {meta}{done && open ? ` · ${done} ${l.kind === 'shop' ? 'in het mandje' : 'klaar'}` : ''}
          {shopper && ` · ${shopper.by === me ? 'Jij doet' : first(shopper.by) + ' doet'} nu boodschappen`}
        </span>
      </span>
      <span className="ring" aria-label={`${open} open van ${its.length}`}>
        <svg viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="21" style={{ fill: 'var(--surface)', stroke: 'color-mix(in srgb, var(--lc-fg) 18%, var(--surface))', strokeWidth: 6 }} />
          <circle cx="26" cy="26" r="21" style={{ fill: 'none', stroke: 'var(--lc-fg)', strokeWidth: 6, strokeLinecap: 'round', strokeDasharray: `${(C * frac).toFixed(1)} ${C.toFixed(1)}`, opacity: frac ? 1 : 0 }} />
        </svg>
        <b>{open || <Check size={22} strokeWidth={3} />}</b>
      </span>
    </button>
  );
}

function NewList({ hasLists }: { hasLists: boolean }) {
  const showNew = useStore(s => s.showNew);
  const kind = useStore(s => s.newKind);
  const [name, setName] = useState('');
  if (hasLists && !showNew) return <button className="newbtn" onClick={() => setS({ showNew: true })}><Plus size={20} /> Nieuwe lijst</button>;
  const submit = (e: FormEvent) => { e.preventDefault(); if (name.trim()) { createList(name.trim(), kind); setName(''); } };
  return (
    <form className="newlist" onSubmit={submit}>
      <div className="row"><input className="field" id="newname" autoFocus={hasLists} placeholder="Naam van een nieuwe lijst" maxLength={60} value={name} onChange={e => setName(e.target.value)} aria-label="Naam nieuwe lijst" /></div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="seg" role="group" aria-label="Soort lijst">
          <button type="button" aria-pressed={kind === 'shop'} onClick={() => setS({ newKind: 'shop' })}>Boodschappen</button>
          <button type="button" aria-pressed={kind === 'todo'} onClick={() => setS({ newKind: 'todo' })}>Taken</button>
        </div>
        <button className="btn" type="submit" disabled={!name.trim()}>Maak lijst</button>
      </div>
    </form>
  );
}

/** Questions ("Waar moet dit op?"), what was just added, and the last voice memo. */
function QuickPanel() {
  const pending = useStore(s => s.pending);
  const receipt = useStore(s => s.receipt);
  const analyzing = useStore(s => s.analyzing);
  const ghosts = analyzing.filter(g => !g.listId);
  const listening = useStore(s => s.listening);
  const heard = useStore(s => s.heard);
  const lists = useStore(s => s.lists);
  const items = useStore(s => s.items);
  const asks = pending.filter(p => p.ranking.some(id => lists.some(l => l.id === id)));
  const rec = receipt.filter(r => items.some(i => i.id === r.itemId) && lists.some(l => l.id === r.listId));
  if (!asks.length && !rec.length && !ghosts.length && !listening && !heard) return null;
  const nameOf = (id: string) => lists.find(l => l.id === id)?.name || '';
  return (
    <div className="qa">
      {asks.map(p => {
        const opts = p.ranking.filter(id => lists.some(l => l.id === id));
        return (
          <div className="ask" key={p.pid}>
            <div className="q">
              Waar moet <strong>{p.qty ? p.qty + ' ' : ''}{p.text}</strong> op?
              {p.due && <span className="sub">Met datum: {dueInfo(p.due).label}</span>}
              {p.guessBy === 'ai' && p.guess && <span className="sub">Gemini denkt {nameOf(p.guess)}, maar weet het niet zeker.</span>}
            </div>
            <div className="opts">
              {opts.map((id, n) => (
                <button key={id} className={`chip ${n === 0 && p.guess ? 'best' : ''}`} onClick={() => answerPending(p.pid, id)}>
                  {n === 0 && p.guessBy === 'ai' && <Sparkles size={13} />}{nameOf(id)}
                </button>
              ))}
              <button className="linkbtn" onClick={() => answerPending(p.pid, null)}>Overslaan</button>
            </div>
          </div>
        );
      })}
      {(rec.length > 0 || ghosts.length > 0 || listening || heard) && (
        <section className="receipt">
          <div className="rh">
            <span>{listening ? 'Ik luister naar je memo…' : 'Net toegevoegd'}</span>
            {(rec.length > 0 || heard) && <button className="linkbtn" onClick={() => setS({ receipt: [], heard: null })}>Klaar</button>}
          </div>
          {heard && <div className="rrow"><span className="txt"><span className="sub">Gehoord: “{heard}”</span></span></div>}
          {rec.map(r => {
            const it = items.find(i => i.id === r.itemId)!;
            const w = WHY[r.why] || '';
            return (
              <div className="rrow" key={r.itemId}>
                <span className="txt">
                  <span className="t">{it.qty && <span className="qty">{it.qty}</span>}{it.text}</span>
                  {w && <span className="src">{r.why === 'ai' && <Sparkles size={12} />}{w}</span>}
                </span>
                <select className="dest" value={r.listId} onChange={e => moveItem(r.itemId, e.target.value)} aria-label={`Lijst voor ${it.text}`}>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            );
          })}
          {ghosts.map(g => (
            <div className="rrow ghost" key={g.pid}>
              <span className="txt"><span className="t">{g.text}</span><span className="src"><span className="dots" aria-hidden="true" />Gemini analyseert…</span></span>
            </div>
          ))}
          {listening && <div className="thinkrow"><span className="dots" aria-hidden="true" />Gemini schrijft je memo uit…</div>}
        </section>
      )}
    </div>
  );
}
