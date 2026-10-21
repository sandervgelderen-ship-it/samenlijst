import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Copy, MessageSquareWarning, Users } from 'lucide-react';
import { logOut } from '../../auth';
import { setApiUrl } from '../../api';
import { createHousehold, joinHousehold, leaveHousehold, renameHousehold, renewInviteCode, selectHousehold, setHouseholdPlace } from '../../data/repo';
import { toast } from '../../data/toast';
import { useStore } from '../../store/useStore';
import { Avatar, useHousehold, useNames } from '../bits';
import { useInstall } from '../InstallPrompt';
import { Supermarkets } from './OffersSheet';
import { APP_VERSION } from '../../data/feedback';
import { isAdmin } from '../../data/feedback';
import { go } from '../../data/actions';
import { Sheet, closeSheet } from './Sheets';

export default function HouseholdSheet() {
  const h = useHousehold();
  const households = useStore(s => s.households);
  const user = useStore(s => s.user);
  const apiUrl = useStore(s => s.apiUrl);
  const aiOn = useStore(s => s.aiOn);
  const readOnly = useStore(s => s.readOnly);
  const { full } = useNames();
  const [name, setName] = useState(h?.name || '');
  const [place, setPlace] = useState(h?.place || '');
  const [code, setCode] = useState('');
  const [newName, setNewName] = useState('');
  const [server, setServer] = useState(apiUrl);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inst = useInstall();
  if (!h || !user) return null;

  async function copy() {
    const text = `Doe mee met "${h!.name}" in IsErNog. Log in en vul deze code in: ${h!.inviteCode}`;
    try { await navigator.clipboard.writeText(text); toast('Uitnodiging gekopieerd. Plak hem in een appje.'); }
    catch { toast(`De code is ${h!.inviteCode}`); }
  }
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); } catch (e) { toast((e as Error).message || 'Dat lukte niet. Controleer je verbinding.'); } finally { setBusy(false); }
  }

  return (
    <Sheet label="Huishouden">
      <h3><span className="spk"><Users /></span>Huishouden</h3>
      <label>Naam
        <input className="field" id="hh-rename" value={name} maxLength={60} onChange={e => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== h.name && run(() => renameHousehold(h, name.trim()))} />
      </label>
      <label>Woonplaats
        <input className="field" id="hh-place" value={place} maxLength={80} placeholder="Bijv. Castricum" autoComplete="address-level2"
          onChange={e => setPlace(e.target.value)}
          onBlur={() => place.trim() !== (h.place || '') && run(() => setHouseholdPlace(h, place), place.trim() ? 'Woonplaats bewaard. Vannacht zoekt IsErNog de aanbiedingen.' : undefined)} />
        <span className="note">Elke nacht zoekt IsErNog de supermarktaanbiedingen in deze plaats.</span>
      </label>
      {(h.place || '').trim() && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="lbl2">Supermarkten</span>
          <Supermarkets h={h} found={h.offers?.stores || []} canSearch={aiOn && !readOnly} />
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="lbl2">Wie doen er mee</span>
        <div className="members">
          {h.members.map(uid => <div className="member" key={uid}><Avatar uid={uid} size={34} />{full(uid)}{uid === user.uid && <span className="note">(jij)</span>}</div>)}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="lbl2">Huisgenoot uitnodigen</span>
        <p className="note">Laat je huisgenoot IsErNog openen, inloggen en deze code invullen.</p>
        <div className="code" aria-label="Uitnodigingscode">{h.inviteCode}</div>
        <div className="pacts">
          <button type="button" className="chip" onClick={copy}><Copy size={14} /> Kopieer uitnodiging</button>
          <button type="button" className="linkbtn" disabled={busy} onClick={() => run(() => renewInviteCode(h), 'Nieuwe code gemaakt. De oude werkt niet meer.')}>Nieuwe code</button>
        </div>
      </div>

      {households.length > 1 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="lbl2">Wissel van huishouden</span>
          <div className="hh-switch">
            {households.map(x => <button key={x.id} type="button" className="chip" aria-pressed={x.id === h.id} onClick={() => { selectHousehold(x.id); closeSheet(); }}>{x.name}</button>)}
          </div>
        </div>
      )}

      <details className="tip" style={{ marginTop: 0 }}>
        <summary>Ander huishouden</summary>
        <div style={{ display: 'grid', gap: 10, padding: '0 18px 16px' }}>
          <div className="row" style={{ display: 'flex', gap: 8 }}>
            <input className="field" id="hh-join" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Code" maxLength={8} style={{ letterSpacing: '.12em', fontWeight: 700 }} />
            <button type="button" className="btn ghost" disabled={busy || code.trim().length < 6} onClick={() => run(async () => { await joinHousehold(code); closeSheet(); })}>Doe mee</button>
          </div>
          <div className="row" style={{ display: 'flex', gap: 8 }}>
            <input className="field" id="hh-new" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Naam nieuw huishouden" maxLength={60} />
            <button type="button" className="btn ghost" disabled={busy || !newName.trim()} onClick={() => run(async () => { await createHousehold(newName.trim()); closeSheet(); })}>Maak</button>
          </div>
        </div>
      </details>

      {(Capacitor.isNativePlatform() || apiUrl) && (
        <details className="tip" style={{ marginTop: 0 }}>
          <summary>Server {aiOn ? '· slimme functies aan' : '· slimme functies uit'}</summary>
          <div style={{ display: 'grid', gap: 10, padding: '0 18px 16px' }}>
            <p className="note">De slimme functies lopen via jullie eigen server met Gemini. Vul het adres van de /api in, bijvoorbeeld https://samenlijst-xyz.run.app/api.</p>
            <div className="row" style={{ display: 'flex', gap: 8 }}>
              <input className="field" id="api-url" value={server} onChange={e => setServer(e.target.value)} placeholder="https://…/api" inputMode="url" />
              <button type="button" className="btn ghost" onClick={() => { setApiUrl(server); toast('Serveradres bewaard'); }}>Bewaar</button>
            </div>
          </div>
        </details>
      )}

      {!inst.installed && (inst.canPrompt || inst.ios) && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="lbl2">App</span>
          {inst.canPrompt
            ? <button type="button" className="chip" style={{ width: 'fit-content' }} onClick={() => inst.install()}>Installeer IsErNog op dit apparaat</button>
            : <p className="note">Op iPhone: tik in Safari op Deel en kies Zet op beginscherm.</p>}
        </div>
      )}

      {isAdmin() && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="lbl2">Beheer</span>
          <button type="button" className="chip" style={{ width: 'fit-content' }} onClick={() => go('beheer')}><MessageSquareWarning size={14} /> Naar de beheerpagina</button>
        </div>
      )}

      <p className="note">Ingelogd als {user.email || user.name}. Dit is hetzelfde account als in Moestuin. Versie {APP_VERSION}.</p>
      <div className="actions">
        <button type="button" className={`btn danger ${armed ? 'armed' : ''}`} disabled={busy}
          onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; } run(async () => { await leaveHousehold(h); closeSheet(); }); }}>
          {armed ? 'Tik nogmaals om te verlaten' : 'Huishouden verlaten'}
        </button>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={() => logOut()}>Uitloggen</button>
          <button type="button" className="btn" onClick={closeSheet}>Klaar</button>
        </span>
      </div>
    </Sheet>
  );
}
