import type { Repeat } from './lib/domain';
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
  /** Woonplaats: where the household shops; the offers are looked up for this place every night. */
  place?: string;
  /** This week's supermarket offers for the place, found at night (or on request). */
  offers?: OfferResult | null;
  /** The supermarkets this household uses; offers are searched at each of them. Empty: Gemini finds them. */
  supermarkets?: string[];
}

export interface Shopper {
  by: string;
  at: number;
  /** The supermarkets this trip goes to; the list is then grouped per shop by where things are cheapest. */
  stores?: string[];
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

export interface PlanStep { text: string; due: string | null; /** One sentence on how to do this step. */ how?: string }
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
  /** Where it is bought when that is not the supermarket (Bouwmarkt, Drogist…); null or 'Supermarkt' = supermarket. */
  store?: string | null;
  plan?: Plan | null;
  planQ?: PlanQuestions | null;
  /** A task that comes back ("elke week"): ticking it off puts the next one on the list. */
  repeat?: Repeat | null;
  /** The next occurrence made when this one was ticked off (removed again if it is unticked). */
  nextId?: string | null;
  /** What it costs at the household's supermarkets (or other shops), looked up with Google; cheapest wins. */
  prices?: ItemPrice[] | null;
  pricesAt?: number | null;
}

/** One price for an item at one shop, as found online. */
export interface ItemPrice {
  store: string;
  /** The product that was priced ("AH Halfvolle melk 1 L"). */
  product: string;
  /** As shown: "€1,09", "2 voor €3,49". */
  price: string;
  /** Per piece in euros, for comparing; null when unknown. */
  amount: number | null;
  /** The offer, if this price is one ("1+1 gratis"). */
  deal: string;
  /** What is in the pack ("6 stuks", "1 l", "500 g"), to compare per kg, liter or piece. */
  size?: string;
  until: string | null;
}

/**
 * One thing the household's memory holds: a general preference or agreement (metadata),
 * never a single product or task. "Schoonmaakproducten moeten ecologisch zijn",
 * "Klusspullen horen op de lijst Klussen". Stored in the kb collection with kind 'rule'.
 */
export interface Memory {
  id: string;
  kind: 'rule';
  text: string;
  /** Short subject, 1 or 2 words: "Schoonmaak", "Klussen". */
  topic: string;
  /** The list the rule is about, if any. */
  list: string | null;
  /** 'zelf' = typed by someone, 'geleerd' = Gemini derived it from a correction or choice. */
  source: 'zelf' | 'geleerd';
  /** What the household did that taught it (for 'geleerd'). */
  from: string;
  at: number;
  by: string | null;
}

export type RouteWhy = 'hist' | 'rule' | 'ai' | 'user' | 'explicit' | 'dup' | 'only' | 'unknown' | 'nolists';

export interface Entry {
  pid: string;
  /** What was literally typed (without @lijst). */
  raw: string;
  qty: string;
  text: string;
  due: string | null;
  hasDate: boolean;
  key: string;
  explicit: string | null;
  note: string;
  cat: CatId | null;
  /** From the AI analysis: where you would normally buy it, and how sure. */
  store?: string | null;
  storeConf?: number;
  /** From the AI analysis: how often a task comes back, in words ("elke week"). */
  repeat?: string;
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

/** "Waar koop je dit?" for a grocery item when it is unclear whether it comes from the supermarket. */
export interface StoreAsk {
  aid: string;
  itemId: string;
  listId: string;
  text: string;
  guess: string | null;
  options: string[];
}

/** One supermarket offer Gemini found online for the household's place. */
export interface Offer {
  store: string;
  product: string;
  /** "1+1 gratis", "2e halve prijs", "25% korting". */
  deal: string;
  /** Offer price as shown, e.g. "€2,49"; empty when unknown. */
  price: string;
  /** Last day it is valid (JJJJ-MM-DD), or null. */
  until: string | null;
  /** The item on the shopping list it matches, or '' when it is a general offer. */
  match: string;
  cat: CatId | null;
}

export interface OfferResult {
  place: string;
  /** "20 t/m 26 oktober" as the folders say it. */
  week: string;
  stores: string[];
  offers: Offer[];
  /** Pages Gemini used (Google Search grounding). */
  sources: { title: string; uri: string }[];
  /** Google's search-suggestion chip (HTML), shown as required for grounded answers. */
  searchHtml: string;
  at: number;
}

/** "Is er nog hooi?": supplies a task uses up, asked when the task is added or comes back. */
export interface SupplyAsk {
  aid: string;
  taskId: string;
  task: string;
  items: { text: string; qty: string; cat: CatId | null; store: string; onList: boolean }[];
}
