import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { setS, useStore } from '../../store/useStore';
import ItemSheet from './ItemSheet';
import ListSheet from './ListSheet';
import SmartSheet from './SmartSheet';
import MemorySheet from './MemorySheet';
import ShoppingSheet from './ShoppingSheet';
import OffersSheet from './OffersSheet';
import HouseholdSheet from './HouseholdSheet';

export const closeSheet = () => setS({ sheet: null });

export function Sheet({ children, label }: { children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  // The handle on top: tap it, or drag the sheet down, to close.
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const down = (e: PointerEvent<HTMLButtonElement>) => { drag.current = { y: e.clientY, dy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    ref.current.style.transform = d.dy ? `translateY(${d.dy}px)` : '';
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.dy > 70 || d.dy < 6) { closeSheet(); return; }
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <div className="backdrop" onClick={e => { if (e.target === e.currentTarget) closeSheet(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <button type="button" className="grab" aria-label="Sluiten" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; if (ref.current) ref.current.style.transform = ''; }} />
        {children}
      </div>
    </div>
  );
}

export default function Sheets() {
  const sheet = useStore(s => s.sheet);
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'item': return <ItemSheet key={sheet.id} id={sheet.id} />;
    case 'list': return <ListSheet key={sheet.id} id={sheet.id} />;
    case 'smart': return <SmartSheet key={sheet.mode + sheet.listId} mode={sheet.mode} listId={sheet.listId} />;
    case 'kb': return <MemorySheet />;
    case 'offers': return <OffersSheet key={sheet.listId} listId={sheet.listId} />;
    case 'shopping': return <ShoppingSheet key={sheet.listId} listId={sheet.listId} />;
    case 'household': return <HouseholdSheet />;
  }
}
