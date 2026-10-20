import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { CAT_LABEL, isSuper, kbKey } from '../../lib/domain';
import { forget } from '../../data/actions';
import { useStore } from '../../store/useStore';
import { Sheet, closeSheet } from './Sheets';

/** What Samenlijst learned about where things go, with a way to make it forget. */
export default function KbSheet() {
  const kb = useStore(s => s.kb);
  const lists = useStore(s => s.lists);
  const [q, setQ] = useState('');
  const vals = [...kb.values()];
  const people = new Set(vals.map(e => e.by).filter(Boolean)).size;
  const key = kbKey(q);
  const rows = vals.filter(e => !key || e.key.includes(key)).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 150);
  const name = (id: string) => lists.find(l => l.id === id)?.name;

  return (
    <Sheet label="Kennisbank">
      <h3><span className="spk"><Sparkles /></span>Kennisbank</h3>
      <p className="note">Wat Samenlijst heeft geleerd over waar dingen horen. Elke keer dat iemand iets toevoegt, een vraag beantwoordt, iets verplaatst of een afdeling aanpast, wordt dit bijgewerkt. Snel toevoegen gebruikt het eerst; Gemini komt pas in actie als de kennisbank het niet weet.</p>
      <div className="kbstats">
        <div><b>{vals.length}</b><span>dingen geleerd</span></div>
        <div><b>{vals.filter(e => e.cat).length}</b><span>eigen afdelingen</span></div>
        <div><b>{people}</b><span>{people === 1 ? 'persoon' : 'personen'} droegen bij</span></div>
      </div>
      <input className="field" id="kb-q" placeholder="Zoek in de kennisbank" aria-label="Zoek in de kennisbank" value={q} onChange={e => setQ(e.target.value)} />
      {!rows.length
        ? <p className="note">{key ? 'Niets gevonden.' : 'Nog niets geleerd. Voeg iets toe, dan begint het vanzelf.'}</p>
        : <div className="kbrows">
          {rows.map(e => {
            const ls = Object.entries(e.lists || {}).filter(([id]) => name(id)).sort((a, b) => b[1] - a[1]);
            const where = ls.length ? ls.map(([id, n]) => `${name(id)}${ls.length > 1 ? ` (${n})` : ''}`).join(' · ') : 'geen lijst';
            return (
              <div className="kbrow" key={e.key}>
                <span className="txt"><span className="t">{e.text}</span><span className="sub">{where}{e.cat ? ' · ' + CAT_LABEL[e.cat] : ''}{e.store && !isSuper(e.store) ? ' · ' + e.store : ''}</span></span>
                <button type="button" className="linkbtn" onClick={() => forget(e.key)}>Vergeet</button>
              </div>
            );
          })}
        </div>}
      {!key && kb.size > rows.length && <p className="note">De 150 meest recente staan hier. Zoek om de rest te vinden.</p>}
      <div className="actions"><span /><button type="button" className="btn ghost" onClick={closeSheet}>Sluiten</button></div>
    </Sheet>
  );
}
