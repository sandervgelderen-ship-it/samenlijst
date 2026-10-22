/** "Is er nog hooi, stro en houtkorrels?": the supplies a new or returning task uses up. Tap what has run out. */
import { useState, type FormEvent } from 'react';
import { Check, Package } from 'lucide-react';
import { answerSupplies } from '../data/actions';
import { useStore } from '../store/useStore';
import { andJoin } from '../lib/domain';

export default function SupplyAsks({ listId }: { listId?: string }) {
  const asks = useStore(s => s.supplyAsks);
  const items = useStore(s => s.items);
  const shown = asks.filter(a => items.some(i => i.id === a.taskId && !i.done && (!listId || i.listId === listId)));
  if (!shown.length) return null;
  return <div className="qa">{shown.map(a => <Ask key={a.aid} aid={a.aid} />)}</div>;
}

function Ask({ aid }: { aid: string }) {
  const a = useStore(s => s.supplyAsks.find(x => x.aid === aid));
  const shopName = useStore(s => (s.lists.find(l => l.kind === 'shop' && /boodschap/i.test(l.name)) || s.lists.find(l => l.kind === 'shop'))?.name || 'de lijst');
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState<string | null>(null);
  if (!a) return null;
  const toggle = (t: string) => setPicked(p => (p.includes(t) ? p.filter(x => x !== t) : [...p, t]));
  const n = picked.length + (other?.trim() ? 1 : 0);
  const submit = (e?: FormEvent) => { e?.preventDefault(); if (n) answerSupplies(aid, picked, other || ''); };
  return (
    <div className="ask supply">
      <div className="q">
        <Package size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Is er nog <strong>{andJoin(a.items.map(x => x.text.toLowerCase()))}</strong>?
        <span className="sub">Voor {a.task.charAt(0).toLowerCase() + a.task.slice(1)}. Tik aan wat op is, dan komt het op {shopName}.</span>
      </div>
      <div className="opts">
        {a.items.map(x => x.onList
          ? <span key={x.text} className="chip onlist"><Check size={13} />{x.text} staat erop</span>
          : <button key={x.text} type="button" className="chip" aria-pressed={picked.includes(x.text)} onClick={() => toggle(x.text)}>
              {picked.includes(x.text) && <Check size={13} />}{x.text}{x.qty && <small>{x.qty}</small>}
            </button>)}
        {other === null && <button type="button" className="chip" onClick={() => setOther('')}>Iets anders…</button>}
      </div>
      {other !== null && (
        <form className="opts" onSubmit={submit}>
          <input className="field" autoFocus value={other} maxLength={60} onChange={e => setOther(e.target.value)} placeholder="Bijv. zaagsel" style={{ flex: '1 1 160px' }} />
        </form>
      )}
      <div className="opts">
        <button type="button" className="chip best" disabled={!n} onClick={() => submit()}>{n ? `Zet ${n === 1 ? 'het' : `deze ${n}`} op ${shopName}` : 'Tik aan wat op is'}</button>
        <button type="button" className="linkbtn" onClick={() => answerSupplies(aid, [])}>Alles is er nog</button>
      </div>
    </div>
  );
}
