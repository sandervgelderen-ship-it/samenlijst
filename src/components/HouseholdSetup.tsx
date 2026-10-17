import { useState, type FormEvent } from 'react';
import { logOut } from '../auth';
import { createHousehold, joinHousehold } from '../data/repo';
import { useStore } from '../store/useStore';
import { Logo } from './bits';

function explain(e: unknown, fallback: string) {
  const code = (e as { code?: string })?.code || '';
  if (code === 'permission-denied') return 'Firebase weigert het opslaan: de beveiligingsregels van Samenlijst staan nog niet in Firebase (Firestore › Rules).';
  if (code === 'unavailable') return 'Geen verbinding met Firebase. Controleer je internet.';
  return (e as Error)?.message && !code ? (e as Error).message : fallback;
}

/** First run after logging in: start a household or join one with a code. */
export default function HouseholdSetup() {
  const user = useStore(s => s.user);
  const [name, setName] = useState('Ons huis');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'' | 'new' | 'join'>('');
  const [err, setErr] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy('new');
    try { await createHousehold(name.trim() || 'Ons huis'); } catch (e2) { console.warn(e2); setErr(explain(e2, 'Aanmaken lukte niet. Probeer het opnieuw.')); } finally { setBusy(''); }
  }
  async function join(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy('join');
    try { await joinHousehold(code); } catch (e2) { console.warn(e2); setErr(explain(e2, 'Meedoen lukte niet. Probeer het opnieuw.')); } finally { setBusy(''); }
  }

  return (
    <div className="welcome wrap">
      <div className="card">
        <Logo />
        <h1>Hoi {user?.name.split(' ')[0]}!</h1>
        <p>Samenlijst werkt per huishouden: iedereen in het huishouden ziet dezelfde lijsten. Begin er een, of doe mee met de code die je van een huisgenoot kreeg.</p>
        {err && <div className="err" role="alert">{err}</div>}
        <form onSubmit={create}>
          <label className="lbl2" htmlFor="hh-name">Nieuw huishouden</label>
          <input className="field" id="hh-name" value={name} onChange={e => setName(e.target.value)} maxLength={60} />
          <button className="btn wide" type="submit" disabled={!!busy}>{busy === 'new' ? 'Bezig…' : 'Begin een huishouden'}</button>
        </form>
        <div className="or">of</div>
        <form onSubmit={join}>
          <label className="lbl2" htmlFor="hh-code">Code van een huisgenoot</label>
          <input className="field" id="hh-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Bijv. K7MP2Q" maxLength={8} autoCapitalize="characters" style={{ letterSpacing: '.15em', fontWeight: 700 }} />
          <button className="btn ghost wide" type="submit" disabled={!!busy || code.trim().length < 6}>{busy === 'join' ? 'Bezig…' : 'Doe mee'}</button>
        </form>
        <button className="linkbtn" type="button" onClick={() => logOut()}>Uitloggen ({user?.email})</button>
      </div>
    </div>
  );
}
