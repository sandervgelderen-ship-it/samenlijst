import { useEffect } from 'react';
import { ChevronLeft, MoreHorizontal, Users } from 'lucide-react';
import { colorOf } from '../lib/domain';
import { go } from '../data/actions';
import { closeToast } from '../data/toast';
import { S, setS, useStore } from '../store/useStore';
import { Logo, useHousehold } from './bits';
import HomeView from './HomeView';
import ListView from './ListView';
import AddBar from './AddBar';
import Sheets from './sheets/Sheets';

export default function Shell() {
  const view = useStore(s => s.view);
  const list = useStore(s => s.lists.find(l => l.id === s.view));
  const listsLoaded = useStore(s => s.listsLoaded);
  const readOnly = useStore(s => s.readOnly);
  const household = useHousehold();
  const inList = !!list;
  const showBar = !readOnly && listsLoaded && (inList || view === 'home');

  // A list someone else deleted: go back home.
  useEffect(() => { if (view !== 'home' && listsLoaded && !list) setS({ view: 'home' }); }, [view, listsLoaded, list]);

  // Android back button and browser back: close a sheet first, then leave the list.
  useEffect(() => {
    const onPop = () => {
      if (S().sheet) { setS({ sheet: null }); if (S().view !== 'home') history.pushState({ sl: S().view }, ''); return; }
      setS({ view: 'home', onlyMine: false });
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  // Each list owns a colour that tints its screen.
  useEffect(() => {
    const c = list ? colorOf(list) : 'tomaat';
    document.body.style.setProperty('--lc-bg', `var(--c-${c}-bg)`);
    document.body.style.setProperty('--lc-fg', `var(--c-${c}-fg)`);
  }, [list?.id, list?.color]);

  return (
    <>
      <header className="top">
        <div className="wrap">
          {inList
            ? <button className="iconbtn" onClick={() => go('home')} aria-label="Terug naar alle lijsten"><ChevronLeft size={22} strokeWidth={2.4} /></button>
            : <Logo />}
          <h1>{inList ? list!.name : household?.name || 'Samenlijst'}</h1>
          {inList
            ? !readOnly && <button className="iconbtn" onClick={() => setS({ sheet: { kind: 'list', id: list!.id } })} aria-label="Lijstinstellingen"><MoreHorizontal size={20} /></button>
            : <button className="iconbtn" onClick={() => setS({ sheet: { kind: 'household' } })} aria-label="Huishouden en instellingen"><Users size={19} /></button>}
        </div>
      </header>
      <main className={showBar ? '' : 'home'}>
        <div className="wrap">
          {!listsLoaded
            ? <div className="state"><strong>Lijsten laden…</strong>Even geduld.</div>
            : inList ? <ListView list={list!} /> : <HomeView />}
        </div>
      </main>
      {showBar && <AddBar list={list} />}
      <Sheets />
      <ToastView low={!showBar} />
    </>
  );
}

function ToastView({ low }: { low: boolean }) {
  const t = useStore(s => s.toast);
  if (!t) return null;
  return (
    <div className={`toast ${low ? 'low' : ''}`} role="status" key={t.id}>
      <span>{t.msg}</span>
      {t.actionLabel && t.action && <button type="button" onClick={() => { const a = t.action!; closeToast(); a(); }}>{t.actionLabel}</button>}
    </div>
  );
}
