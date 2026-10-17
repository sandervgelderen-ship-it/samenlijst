import { create } from 'zustand';
import type { Household, Item, KbEntry, List, ListKind, Pending, Receipt } from '../types';

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
  | { kind: 'household' };

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
  kb: Map<string, KbEntry>;
  listsLoaded: boolean;
  readOnly: boolean;

  // AI server
  aiOn: boolean;
  apiUrl: string;

  // UI
  view: string; // 'home' or a list id
  sheet: Sheet | null;
  toast: Toast | null;
  pending: Pending[];
  receipt: Receipt[];
  qaThinking: number;
  planning: string[];
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
  kb: new Map(),
  listsLoaded: false,
  readOnly: false,

  aiOn: false,
  apiUrl: stored('samenlijst.apiUrl'),

  view: 'home',
  sheet: null,
  toast: null,
  pending: [],
  receipt: [],
  qaThinking: 0,
  planning: [],
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

  set: (patch) => set(patch as any),
}));

export const S = () => useStore.getState();
export const setS = (patch: Partial<State> | ((s: State) => Partial<State>)) => useStore.getState().set(patch);
