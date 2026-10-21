/** "Ik ga boodschappen doen": which supermarkets this trip goes to. The list is then split per shop by price. */
import { useState } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { priceStores, setShopper, startShopping } from '../../data/actions';
import { Sheet, closeSheet } from './Sheets';

const KEY = 'samenlijst.trip';

export default function ShoppingSheet({ listId }: { listId: string }) {
  const stores = priceStores();
  const [picked, setPicked] = useState<string[]>(() => {
    try { const last = JSON.parse(localStorage.getItem(KEY) || '[]') as string[]; const ok = last.filter(s => stores.includes(s)); if (ok.length) return ok; } catch { /* first trip */ }
    return stores.slice(0, 2);
  });
  const toggle = (s: string) => setPicked(p => (p.includes(s) ? p.filter(x => x !== s) : [...p, s]));
  const go = () => {
    try { localStorage.setItem(KEY, JSON.stringify(picked)); } catch { /* private mode */ }
    startShopping(listId, stores.filter(s => picked.includes(s)));
    closeSheet();
  };
  return (
    <Sheet label="Boodschappen doen">
      <h3><span className="spk"><ShoppingCart /></span>Waar ga je heen?</h3>
      <p className="note">Kies de supermarkten van deze ronde. De lijst wordt dan per winkel gezet: elk product bij de winkel waar het het goedkoopst is.</p>
      <div className="aiex">
        {stores.map(s => <button key={s} type="button" className="chip" aria-pressed={picked.includes(s)} onClick={() => toggle(s)}>{picked.includes(s) && <Check size={13} />}{s}</button>)}
      </div>
      <div className="actions">
        <button type="button" className="linkbtn" onClick={() => { setShopper(listId, true); closeSheet(); }}>Zonder winkels kiezen</button>
        <button type="button" className="btn" disabled={!picked.length} onClick={go}>{picked.length ? `Ga naar ${picked.length === 1 ? picked[0] : `${picked.length} winkels`}` : 'Kies een winkel'}</button>
      </div>
    </Sheet>
  );
}
