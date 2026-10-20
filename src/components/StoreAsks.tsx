/** "Waar koop je stro?": asked when Gemini doubts whether something comes from the supermarket. */
import { useState, type FormEvent } from 'react';
import { Sparkles, Store } from 'lucide-react';
import { answerStore } from '../data/actions';
import { useStore } from '../store/useStore';

export default function StoreAsks({ listId }: { listId?: string }) {
  const asks = useStore(s => s.storeAsks);
  const items = useStore(s => s.items);
  const shown = asks.filter(a => (!listId || a.listId === listId) && items.some(i => i.id === a.itemId && !i.done));
  if (!shown.length) return null;
  return <div className="qa">{shown.map(a => <Ask key={a.aid} aid={a.aid} />)}</div>;
}

function Ask({ aid }: { aid: string }) {
  const a = useStore(s => s.storeAsks.find(x => x.aid === aid));
  const [other, setOther] = useState<string | null>(null);
  if (!a) return null;
  const submit = (e: FormEvent) => { e.preventDefault(); if (other?.trim()) answerStore(aid, other); };
  return (
    <div className="ask">
      <div className="q">
        <Store size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Waar koop je <strong>{a.text.toLowerCase()}</strong>?
        <span className="sub">{a.guess ? `Gemini denkt ${a.guess.toLowerCase()}, maar weet het niet zeker.` : 'Gemini weet het niet zeker.'} Je antwoord wordt onthouden.</span>
      </div>
      {other === null ? (
        <div className="opts">
          {a.options.map((o, n) => (
            <button key={o} type="button" className={`chip ${n === 0 && a.guess ? 'best' : ''}`} onClick={() => answerStore(aid, o)}>
              {n === 0 && a.guess && <Sparkles size={13} />}{o}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setOther('')}>Andere winkel…</button>
          <button type="button" className="linkbtn" onClick={() => answerStore(aid, null)}>Overslaan</button>
        </div>
      ) : (
        <form className="opts" onSubmit={submit}>
          <input className="field" autoFocus value={other} maxLength={30} onChange={e => setOther(e.target.value)} placeholder="Bijv. Action, Blokker, de markt" style={{ flex: '1 1 160px' }} />
          <button type="submit" className="chip best" disabled={!other.trim()}>Onthoud</button>
          <button type="button" className="linkbtn" onClick={() => setOther(null)}>Terug</button>
        </form>
      )}
    </div>
  );
}
