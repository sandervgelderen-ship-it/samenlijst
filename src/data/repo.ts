/**
 * Firestore layout (same project as Moestuin, own collections):
 *   samenlijstHouseholds/{hid}            name, members[], memberInfo{uid: {name, photo}}, inviteCode, createdBy
 *   samenlijstHouseholds/{hid}/lists/{id}
 *   samenlijstHouseholds/{hid}/items/{id}
 *   samenlijstHouseholds/{hid}/kb/{id}     the shared knowledge base
 *   samenlijstInvites/{code}               { hid } so someone with the code can find the household
 */
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { S, setS } from '../store/useStore';
import type { Household, Item, KbEntry, List } from '../types';
import { toast } from './toast';

export const HH = 'samenlijstHouseholds';
export const INV = 'samenlijstInvites';

export const hRef = (hid = S().hid!) => doc(db, HH, hid);
export const col = (name: 'lists' | 'items' | 'kb', hid = S().hid!) => collection(db, HH, hid, name);
export const listRef = (id: string) => doc(col('lists'), id);
export const itemRef = (id: string) => doc(col('items'), id);
export const kbRef = (id: string) => doc(col('kb'), id);
export const newId = (name: 'lists' | 'items' | 'kb') => doc(col(name)).id;

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
    }, (e) => { console.warn(e); setS({ householdsLoaded: true }); });
  });
}

function stopData() {
  unsubData.forEach(u => u());
  unsubData = [];
}

export function selectHousehold(hid: string | null) {
  stopData();
  try { localStorage.setItem('samenlijst.hid', hid || ''); } catch { /* private mode */ }
  setS({ hid, lists: [], items: [], kb: new Map(), listsLoaded: false, view: 'home', pending: [], receipt: [], sheet: null });
  if (!hid) return;
  unsubData.push(onSnapshot(col('lists', hid), (snap) => {
    setS({ lists: snap.docs.map(d => ({ id: d.id, ...d.data() } as List)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), listsLoaded: true });
  }, (e) => { console.warn(e); setS({ listsLoaded: true }); }));
  unsubData.push(onSnapshot(col('items', hid), (snap) => {
    setS({ items: snap.docs.map(d => ({ id: d.id, ...d.data() } as Item)) });
  }, (e) => console.warn(e)));
  unsubData.push(onSnapshot(col('kb', hid), (snap) => {
    const kb = new Map<string, KbEntry>();
    snap.docs.forEach(d => { const v = d.data() as KbEntry; if (v && typeof v.key === 'string' && v.key) kb.set(v.key, { ...v, id: d.id }); });
    setS({ kb });
  }, (e) => console.warn(e)));
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
