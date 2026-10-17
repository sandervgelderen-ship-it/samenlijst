export type ListKind = 'shop' | 'todo';
export type ColorName = 'tomaat' | 'munt' | 'lucht' | 'zon' | 'druif' | 'roze';
export type CatId =
  | 'groente' | 'brood' | 'zuivel' | 'kaas' | 'vlees' | 'houdbaar'
  | 'diepvries' | 'drinken' | 'snacks' | 'huishouden' | 'verzorging' | 'overig';

export interface Member {
  name: string;
  photo?: string | null;
}

export interface Household {
  id: string;
  name: string;
  members: string[];
  memberInfo: Record<string, Member>;
  inviteCode: string;
  createdBy: string;
  createdAt: number;
}

export interface Shopper {
  by: string;
  at: number;
}

export interface List {
  id: string;
  name: string;
  kind: ListKind;
  color?: ColorName;
  recent?: string[];
  shopper?: Shopper | null;
  autoPlan?: boolean;
  createdBy?: string | null;
  createdAt: number;
}

export interface PlanStep { text: string; due: string | null }
export interface PlanBuy { text: string; qty: string }
export interface PlanQuestion { q: string; options: string[]; multi: boolean }
export interface PlanAnswer { q: string; a: string }
/** Multiple-choice questions about the details, asked before a task is worked out. */
export interface PlanQuestions { questions: PlanQuestion[]; at: number; by: string | null }

export interface Plan {
  detail: string;
  /** What the household answered; the plan was made with these. */
  answers?: PlanAnswer[];
  steps: PlanStep[];
  tips: string[];
  buy: PlanBuy[];
  at: number;
  by: string | null;
  stepsAdded: boolean;
  buyAdded: string | null;
}

export interface Item {
  id: string;
  listId: string;
  text: string;
  qty: string;
  note: string;
  cat: CatId | null;
  done: boolean;
  doneBy: string | null;
  doneAt: number | null;
  urgent: boolean;
  due: string | null;
  assignee: string | null;
  addedBy: string | null;
  createdAt: number;
  plan?: Plan | null;
  planQ?: PlanQuestions | null;
}

/** One knowledge-base entry: where an item tends to go, and its aisle if someone set it. */
export interface KbEntry {
  id: string;
  key: string;
  text: string;
  lists: Record<string, number>;
  cat: CatId | null;
  at: number;
  by: string | null;
}

export type RouteWhy = 'kb' | 'rule' | 'ai' | 'user' | 'explicit' | 'dup' | 'only' | 'unknown' | 'nolists';

export interface Entry {
  pid: string;
  /** What was literally typed (without @lijst), so the knowledge base can learn it too. */
  raw: string;
  qty: string;
  text: string;
  due: string | null;
  hasDate: boolean;
  key: string;
  explicit: string | null;
  note: string;
  cat: CatId | null;
}

export interface Pending extends Entry {
  ranking: string[];
  guess: string | null;
  guessBy: 'ai' | 'rule' | null;
}

export interface Receipt {
  itemId: string;
  listId: string;
  why: RouteWhy;
}
