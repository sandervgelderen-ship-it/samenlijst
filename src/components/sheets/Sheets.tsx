import { useEffect, type ReactNode } from 'react';
import { setS, useStore } from '../../store/useStore';
import ItemSheet from './ItemSheet';
import ListSheet from './ListSheet';
import SmartSheet from './SmartSheet';
import KbSheet from './KbSheet';
import HouseholdSheet from './HouseholdSheet';
import { ReportsSheet } from '../Feedback';

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
    case 'kb': return <KbSheet />;
    case 'household': return <HouseholdSheet />;
    case 'reports': return <ReportsSheet onClose={closeSheet} />;
  }
}
