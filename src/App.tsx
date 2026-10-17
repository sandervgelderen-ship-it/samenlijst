import { useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './components/Login';
import HouseholdSetup from './components/HouseholdSetup';
import Shell from './components/Shell';
import { checkAi } from './api';
import { startAuth, syncMemberInfo } from './data/repo';
import { useStore } from './store/useStore';

let started = false;

export default function App() {
  const authReady = useStore(s => s.authReady);
  const user = useStore(s => s.user);
  const householdsLoaded = useStore(s => s.householdsLoaded);
  const hid = useStore(s => s.hid);
  const households = useStore(s => s.households);

  useEffect(() => {
    if (started) return;
    started = true;
    startAuth();
    checkAi();
  }, []);

  useEffect(() => { syncMemberInfo(); }, [user, households, hid]);

  let body;
  if (!authReady || (user && !householdsLoaded)) body = <div className="state"><strong>Samenlijst</strong>Even laden…</div>;
  else if (!user) body = <Login />;
  else if (!hid || !households.some(h => h.id === hid)) body = <HouseholdSetup />;
  else body = <Shell />;

  return <ErrorBoundary>{body}</ErrorBoundary>;
}
