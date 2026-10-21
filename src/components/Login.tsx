import { useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase';
import { signInWithGoogle } from '../auth';
import { Logo } from './bits';

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Dit e-mailadres en wachtwoord passen niet bij elkaar.',
  'auth/invalid-email': 'Dit is geen geldig e-mailadres.',
  'auth/email-already-in-use': 'Er is al een account met dit e-mailadres. Log in.',
  'auth/weak-password': 'Kies een wachtwoord van minstens 6 tekens.',
  'auth/too-many-requests': 'Te veel pogingen. Wacht even en probeer het opnieuw.',
  'auth/network-request-failed': 'Geen verbinding. Controleer je internet.',
  'auth/popup-closed-by-user': 'Het inlogvenster werd gesloten.',
  'auth/account-exists-with-different-credential': 'Dit e-mailadres gebruikt al een wachtwoord. Log daarmee in.',
  'auth/no-id-token': 'Google gaf geen inlogbewijs terug. Probeer het opnieuw.',
};
const say = (e: unknown) => {
  const code = (e as { code?: string })?.code || '';
  const msg = String((e as { message?: string })?.message || '');
  // Native Google sign-in: the person closed the account picker.
  if (/cancel/i.test(code + msg)) return '';
  if (/developer_error|10:|DEVELOPER/i.test(msg)) return 'Inloggen met Google is in deze app nog niet ingesteld (SHA-1 ontbreekt in Firebase). Log in met e-mail of probeer het later.';
  return MESSAGES[code] || 'Inloggen lukte niet. Probeer het opnieuw.';
};

/** Same Firebase login as Moestuin: an existing Moestuin account works here too. */
export default function Login() {
  const [mode, setMode] = useState<'in' | 'new'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'in') await signInWithEmailAndPassword(auth, email.trim(), password);
      else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      }
    } catch (e2) { setErr(say(e2)); } finally { setBusy(false); }
  }
  async function google() {
    setErr(''); setBusy(true);
    try { await signInWithGoogle(); } catch (e2) { console.warn(e2); setErr(say(e2)); } finally { setBusy(false); }
  }
  async function reset() {
    setErr(''); setInfo('');
    if (!email.trim()) { setErr('Vul eerst je e-mailadres in.'); return; }
    try { await sendPasswordResetEmail(auth, email.trim()); setInfo('Je krijgt een mail om een nieuw wachtwoord te kiezen.'); } catch (e2) { setErr(say(e2)); }
  }

  return (
    <div className="welcome wrap">
      <div className="card">
        <Logo />
        <h1>{mode === 'in' ? 'Welkom bij IsErNog' : 'Maak een account'}</h1>
        <p>Boodschappen en klusjes, samen bijgehouden. Heb je een Moestuin-account? Dan log je daarmee in.</p>
        {err && <div className="err" role="alert">{err}</div>}
        {info && <p className="note">{info}</p>}
        {(
          <>
            <button className="btn google wide" type="button" onClick={google} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
              Doorgaan met Google
            </button>
            <div className="or">of met e-mail</div>
          </>
        )}
        <form onSubmit={submit}>
          {mode === 'new' && <input className="field" id="login-name" placeholder="Je voornaam" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" />}
          <input className="field" id="login-email" type="email" placeholder="E-mailadres" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          <input className="field" id="login-password" type="password" placeholder="Wachtwoord" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} />
          <button className="btn wide" type="submit" disabled={busy}>{busy ? 'Even geduld…' : mode === 'in' ? 'Inloggen' : 'Account maken'}</button>
        </form>
        <div className="pfoot">
          <button className="linkbtn" type="button" onClick={() => { setMode(mode === 'in' ? 'new' : 'in'); setErr(''); }}>
            {mode === 'in' ? 'Nog geen account? Maak er een' : 'Ik heb al een account'}
          </button>
          {mode === 'in' && <button className="linkbtn" type="button" onClick={reset}>Wachtwoord vergeten</button>}
        </div>
      </div>
    </div>
  );
}
