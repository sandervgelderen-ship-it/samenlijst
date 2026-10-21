/**
 * Firestore layout (same project as Moestuin, own collections):
 *   samenlijstHouseholds/{hid}            name, members[], memberInfo{uid: {name, photo}}, inviteCode, createdBy
 *   samenlijstHouseholds/{hid}/lists/{id}
 *   samenlijstHouseholds/{hid}/items/{id}
 *   samenlijstHouseholds/{hid}/kb/{id}     the shared memory: general preferences (kind 'rule');
 *                                          older docs without a kind are single items from the former knowledge base
 *   samenlijstInvites/{code}               { hid } so someone with the code can find the household
 */
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion, collection, deleteDoc, doc, getDoc, getDocFromServer, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { S, setS } from '../store/useStore';
import type { Household, Item, List, Memory } from '../types';
import { toast } from './toast';

export const HH = 'samenlijstHouseholds';
export const INV = 'samenlijstInvites';

export const hRef = (hid = S().hid!) => doc(db, HH, hid);
export const col = (name: 'lists' | 'items' | 'kb', hid = S().hid!) => collection(db, HH, hid, name);
export const listRef = (id: string) => doc(col('lists'), id);
export const itemRef = (id: string) => doc(col('items'), id);
export const kbRef = (id: string) => doc(col('kb'), id);
export const newId = (name: 'lists' | 'items' | 'kb') => doc(col(name)).id;

const codeOf = (e: unknown) => (e as { code?: string })?.code || '';

/**
 * Run a write. When Firebase refuses it, refresh the login token and try once more
 * (an expired session looks the same as a refusal), then work out why and say so.
 */
export async function safeWrite(op: () => Promise<unknown>) {
  try { await op(); return; } catch (e) {
    if (codeOf(e) !== 'permission-denied') { failed(e); return; }
  }
  try { await auth.currentUser?.getIdToken(true); } catch { setS({ access: 'session' }); return; }
  try { await op(); setS({ access: null }); return; } catch (e) {
    if (codeOf(e) !== 'permission-denied') { failed(e); return; }
  }
  await diagnose();
}

let diagnosing = false;
/** Firebase said no: is the login stale, are we no longer a member, or are the rules missing? */
export async function diagnose() {
  const u = auth.currentUser, hid = S().hid;
  if (diagnosing || !u) return;
  diagnosing = true;
  try {
    try { await u.getIdToken(true); } catch { setS({ access: 'session' }); return; }
    if (!hid) return;
    try {
      const snap = await getDocFromServer(hRef(hid));
      const members = (snap.exists() && (snap.data().members as string[])) || [];
      if (!members.includes(u.uid)) { toast('Je hoort niet meer bij dit huishouden.'); return; }
      setS({ access: 'rules' });
    } catch (e) {
      if (codeOf(e) === 'permission-denied') setS({ access: 'rules' });
    }
  } finally { diagnosing = false; }
}
const onListenError = (e: unknown) => { console.warn(e); if (codeOf(e) === 'permission-denied') void diagnose(); };

/** Report a failed write in plain words. Firestore keeps unsent writes offline and retries them. */
export function failed(err: unknown) {
  console.warn(err);
  const code = (err as { code?: string })?.code || '';
  if (code === 'permission-denied') toast('Dat mag je in dit huishouden niet wijzigen.');
  else if (code === 'resource-exhausted') toast('De opslag is even vol. Probeer het zo opnieuw.');
  else toast('Opslaan lukte niet. Controleer je verbinding en probeer het opnieuw.');
}

/* ---------- Auth & households ---------- */
let unsubHouseholds: Unsubscribe | null = null;
let unsubData: Unsubscribe[] = [];

export function startAuth() {
  onAuthStateChanged(auth, (u) => {
    unsubHouseholds?.(); unsubHouseholds = null;
    stopData();
    if (!u) {
      setS({ authReady: true, user: null, households: [], householdsLoaded: false });
      return;
    }
    setS({
      authReady: true,
      user: { uid: u.uid, name: u.displayName || (u.email ? u.email.split('@')[0] : 'Ik'), email: u.email, photo: u.photoURL },
    });
    const q = query(collection(db, HH), where('members', 'array-contains', u.uid));
    unsubHouseholds = onSnapshot(q, (snap) => {
      const households = snap.docs.map(d => ({ id: d.id, ...d.data() } as Household)).sort((a, b) => a.createdAt - b.createdAt);
      let hid = S().hid;
      if (!hid || !households.some(h => h.id === hid)) hid = households[0]?.id || null;
      const changed = hid !== S().hid || !unsubData.length;
      setS({ households, householdsLoaded: true });
      if (changed) selectHousehold(hid);
    }, (e) => { setS({ householdsLoaded: true }); onListenError(e); });
  });
}

function stopData() {
  unsubData.forEach(u => u());
  unsubData = [];
}

export function selectHousehold(hid: string | null) {
  stopData();
  try { localStorage.setItem('samenlijst.hid', hid || ''); } catch { /* private mode */ }
  setS({ hid, lists: [], items: [], memory: [], oldKb: [], listsLoaded: false, view: 'home', pending: [], receipt: [], sheet: null });
  if (!hid) return;
  unsubData.push(onSnapshot(col('lists', hid), (snap) => {
    setS({ lists: snap.docs.map(d => ({ id: d.id, ...d.data() } as List)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), listsLoaded: true });
  }, (e) => { setS({ listsLoaded: true }); onListenError(e); }));
  unsubData.push(onSnapshot(col('items', hid), (snap) => {
    setS({ items: snap.docs.map(d => ({ id: d.id, ...d.data() } as Item)) });
    if (!snap.metadata.fromCache && S().access === 'rules') setS({ access: null });
  }, onListenError));
  unsubData.push(onSnapshot(col('kb', hid), (snap) => {
    const memory: Memory[] = [], oldKb: string[] = [];
    snap.docs.forEach(d => {
      const v = d.data() as Partial<Memory>;
      if (v && v.kind === 'rule' && typeof v.text === 'string' && v.text) memory.push({ ...(v as Memory), id: d.id });
      else oldKb.push(d.id);
    });
    memory.sort((a, b) => (b.at || 0) - (a.at || 0));
    setS({ memory, oldKb });
  }, onListenError));
}

/* ---------- Creating, joining and leaving ---------- */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode() {
  const a = new Uint32Array(6); crypto.getRandomValues(a);
  return Array.from(a, n => CODE_CHARS[n % CODE_CHARS.length]).join('');
}
async function freeCode() {
  for (let n = 0; n < 5; n++) {
    const code = randomCode();
    const snap = await getDoc(doc(db, INV, code));
    if (!snap.exists()) return code;
  }
  return randomCode() + randomCode().slice(0, 2);
}
function me() {
  const u = S().user!;
  return { uid: u.uid, info: { name: u.name, photo: u.photo || null } };
}

export async function createHousehold(name: string) {
  const { uid, info } = me();
  const code = await freeCode();
  const ref = doc(collection(db, HH));
  const body: Omit<Household, 'id'> = {
    name: name.slice(0, 60) || 'Ons huis', members: [uid], memberInfo: { [uid]: info },
    inviteCode: code, createdBy: uid, createdAt: Date.now(),
  };
  await setDoc(ref, body);
  const b = writeBatch(db);
  b.set(doc(db, INV, code), { hid: ref.id, code, createdBy: uid, createdAt: Date.now() });
  const now = Date.now();
  b.set(doc(collection(db, HH, ref.id, 'lists')), { name: 'Boodschappen', kind: 'shop', color: 'tomaat', recent: [], shopper: null, createdBy: uid, createdAt: now });
  b.set(doc(collection(db, HH, ref.id, 'lists')), { name: "Todo's", kind: 'todo', color: 'munt', recent: [], shopper: null, autoPlan: true, createdBy: uid, createdAt: now + 1 });
  await b.commit();
  selectHousehold(ref.id);
}

export async function joinHousehold(codeIn: string) {
  const code = codeIn.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new Error('Een code heeft 6 tekens.');
  const inv = await getDoc(doc(db, INV, code));
  if (!inv.exists()) throw new Error('Deze code kennen we niet. Controleer hem of vraag een nieuwe.');
  const hid = String(inv.data().hid || '');
  if (S().households.some(h => h.id === hid)) { selectHousehold(hid); return; }
  const { uid, info } = me();
  await updateDoc(doc(db, HH, hid), { members: arrayUnion(uid), [`memberInfo.${uid}`]: info, joinCode: code });
  selectHousehold(hid);
}

export async function renewInviteCode(h: Household) {
  const code = await freeCode();
  const b = writeBatch(db);
  b.set(doc(db, INV, code), { hid: h.id, code, createdBy: S().user!.uid, createdAt: Date.now() });
  b.update(doc(db, HH, h.id), { inviteCode: code });
  if (h.inviteCode) b.delete(doc(db, INV, h.inviteCode));
  await b.commit();
}

export async function renameHousehold(h: Household, name: string) {
  await updateDoc(doc(db, HH, h.id), { name: name.slice(0, 60) });
}

/** Woonplaats of the household: every night IsErNog looks up the supermarket offers there. */
export async function setHouseholdPlace(h: Household, place: string) {
  const p = place.trim().replace(/\s+/g, ' ').slice(0, 80);
  // A different place: last night's offers were for somewhere else.
  await updateDoc(doc(db, HH, h.id), p === (h.place || '') ? { place: p } : { place: p, offers: null });
}

/** The supermarkets whose offers this household wants to see. */
export async function setHouseholdSupermarkets(h: Household, stores: string[]) {
  const clean = [...new Set(stores.map(s => s.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean))].slice(0, 12);
  await updateDoc(doc(db, HH, h.id), { supermarkets: clean });
}

export async function leaveHousehold(h: Household) {
  const uid = S().user!.uid;
  const members = h.members.filter(m => m !== uid);
  if (!members.length && h.createdBy === uid) {
    if (h.inviteCode) await deleteDoc(doc(db, INV, h.inviteCode)).catch(() => {});
    await deleteDoc(doc(db, HH, h.id));
  } else {
    await updateDoc(doc(db, HH, h.id), { members });
  }
  selectHousehold(S().households.find(x => x.id !== h.id)?.id || null);
}

/** Keep my name and photo in the household current, so others see who did what. */
export function syncMemberInfo() {
  const s = S(); const u = s.user; const h = s.households.find(x => x.id === s.hid);
  if (!u || !h) return;
  const cur = h.memberInfo?.[u.uid];
  if (cur && cur.name === u.name && (cur.photo || null) === (u.photo || null)) return;
  updateDoc(doc(db, HH, h.id), { [`memberInfo.${u.uid}`]: { name: u.name, photo: u.photo || null } }).catch(() => {});
}
