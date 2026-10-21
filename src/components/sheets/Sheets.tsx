import { useEffect, type ReactNode } from 'react';
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
  return (
    <div className="backdrop" onClick={e => { if (e.target === e.currentTarget) closeSheet(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" />
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
