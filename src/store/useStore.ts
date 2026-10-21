import { create } from 'zustand';
import type { Household, Item, List, ListKind, Memory, Pending, Receipt, StoreAsk } from '../types';

export interface AppUser {
  uid: string;
  name: string;
  email: string | null;
  photo: string | null;
}

export type Sheet =
  | { kind: 'item'; id: string }
  | { kind: 'list'; id: string }
  | { kind: 'smart'; mode: 'add' | 'forgot'; listId: string }
  | { kind: 'kb' }
  | { kind: 'offers'; listId: string }
  | { kind: 'shopping'; listId: string }
  | { kind: 'household' };

export interface QaSel {
  /** Per question index, the chosen option indexes. */
  picks: Record<number, number[]>;
  extra: string;
}

export interface Toast {
  id: number;
  msg: string;
  actionLabel?: string;
  action?: () => void;
}

interface State {
  // auth & household
  authReady: boolean;
  user: AppUser | null;
  households: Household[];
  householdsLoaded: boolean;
  hid: string | null;

  // shared data of the current household (live from Firestore)
  lists: List[];
  items: Item[];
  /** The household's memory: general preferences and agreements (newest first). */
  memory: Memory[];
  /** Ids of entries from the old knowledge base (single items), no longer used; can be cleared. */
  oldKb: string[];
  listsLoaded: boolean;
  readOnly: boolean;
  /** Firebase refuses access: the login expired ('session') or the security rules are missing ('rules'). */
  access: null | 'session' | 'rules';

  // AI server
  aiOn: boolean;
  apiUrl: string;

  // UI
  view: string; // 'home', 'beheer' or a list id
  sheet: Sheet | null;
  toast: Toast | null;
  pending: Pending[];
  /** "Waar koop je dit?" questions for groceries that may not come from the supermarket. */
  storeAsks: StoreAsk[];
  receipt: Receipt[];
  qaThinking: number;
  planning: string[];
  /** What the AI is doing for a task right now: thinking of questions, or making the plan. */
  planMode: Record<string, 'ask' | 'plan'>;
  /** This viewer's picks in the question cards: per task, per question the chosen option indexes; extra = free text. */
  qaSel: Record<string, QaSel>;
  planOpen: string[];
  popId: string | null;
  flashId: string | null;
  showNew: boolean;
  newKind: ListKind;
  onlyMine: boolean;
  tipOpen: boolean;
  recording: boolean;
  listening: boolean;
  /** Entries the AI is analysing right now (listId null = quick add on the home screen). */
  analyzing: { pid: string; text: string; listId: string | null }[];
  heard: string | null;
  /** Looking up supermarket offers right now (on request; normally it happens at night). */
  offersBusy: boolean;
  pricesBusy: boolean;
  /** The supermarket being searched right now. */
  offersBusyAt: string | null;

  set: (patch: Partial<State> | ((s: State) => Partial<State>)) => void;
}

const stored = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

export const useStore = create<State>()((set) => ({
  authReady: false,
  user: null,
  households: [],
  householdsLoaded: false,
  hid: stored('samenlijst.hid') || null,

  lists: [],
  items: [],
  memory: [],
  oldKb: [],
  listsLoaded: false,
  readOnly: false,
  access: null,

  aiOn: false,
  apiUrl: stored('samenlijst.apiUrl'),

  view: 'home',
  sheet: null,
  toast: null,
  pending: [],
  storeAsks: [],
  receipt: [],
  qaThinking: 0,
  planning: [],
  planMode: {},
  qaSel: {},
  planOpen: [],
  popId: null,
  flashId: null,
  showNew: false,
  newKind: 'shop',
  onlyMine: false,
  tipOpen: false,
  recording: false,
  listening: false,
  analyzing: [],
  heard: null,
  offersBusy: false,
  pricesBusy: false,
  offersBusyAt: null,

  set: (patch) => set(patch as any),
}));

export const S = () => useStore.getState();
export const setS = (patch: Partial<State> | ((s: State) => Partial<State>)) => useStore.getState().set(patch);
