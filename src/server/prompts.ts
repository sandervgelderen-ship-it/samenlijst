/** All Gemini prompts in one place. The app sends data; the wording lives here. */
import { CATS } from '../lib/domain';

export const CAT_PROMPT = CATS.map(c => `"${c[0]}" = ${c[1]}`).join('; ');
const s = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v : []).slice(0, max).map(x => s(x, 140)).join(', ') || 'niets';

export function analyzePrompt(b: any) {
  const lists = (Array.isArray(b.lists) ? b.lists : []).slice(0, 20);
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 25);
  const fixed = lists.find((l: any) => l.id === b.fixedList);
  return `Je analyseert nieuwe items voor de gedeelde lijsten van een Nederlands huishouden. Vandaag is het ${s(b.today, 60)}.
Lijsten:
${lists.map((l: any) => `- id "${s(l.id, 60)}": "${s(l.name, 60)}" (${l.kind === 'shop' ? 'boodschappenlijst' : 'takenlijst'}). Staat er doorgaans op: ${list(l.examples, 18)}`).join('\n')}
${fixed ? `Alles komt op de lijst "${s(fixed.name, 60)}" (id "${s(fixed.id, 60)}"); kies dus die lijst.\n` : ''}Wat dit huishouden eerder koos (volg dit): ${list(b.learned, 40)}.

Ingetypte items (nummer: tekst):
${items.map((t: unknown, n: number) => `${n}: ${s(t, 200)}`).join('\n')}

Analyseer elk item:
- "text": nette Nederlandse naam met hoofdletter, spelfouten verbeterd, zonder aantal of datum. Bij taken kort en duidelijk wat er moet gebeuren.
- "qty": de hoeveelheid als die genoemd is (bijv. "2 pak", "500 g"), anders een lege string.
- "note": merk, winkel of ander detail dat genoemd werd, anders een lege string.
- "cat": bij boodschappen de afdeling-id (${CAT_PROMPT}); bij taken een lege string.
- "due": datum JJJJ-MM-DD als er een moment genoemd is, anders een lege string.
- "list": id van de lijst waar het hoort; "confidence" tussen 0 en 1, hoog alleen als het duidelijk is.
Noemt één regel meerdere dingen ("melk en eieren"), geef dan per ding een object met hetzelfde "i". Verzin niets wat niet genoemd is.`;
}

export function routePrompt(b: any) {
  const lists = (Array.isArray(b.lists) ? b.lists : []).slice(0, 20);
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 25);
  return `Je verdeelt nieuwe items over de gedeelde lijsten van een Nederlands huishouden. Vandaag is het ${s(b.today, 60)}.
Lijsten:
${lists.map((l: any) => `- id "${s(l.id, 60)}": "${s(l.name, 60)}" (${l.kind === 'shop' ? 'boodschappenlijst' : 'takenlijst'}). Staat er doorgaans op: ${list(l.examples, 18)}`).join('\n')}

Nieuwe items:
${items.map((p: any, n: number) => `${n}: ${s(p.text, 120)}${p.due ? ' (met datum ' + s(p.due, 10) + ')' : ''}`).join('\n')}

Kies per item de lijst waar het het best past, op basis van de naam van de lijst en wat er doorgaans op staat. Geef "confidence" tussen 0 en 1: hoog alleen als het duidelijk is, laag als het op meerdere lijsten kan of nergens goed past. Gebruik een lege string voor "list" als het nergens past.`;
}

export function smartAddPrompt(b: any, hasImage: boolean) {
  const txt = s(b.text, 6000) || '(geen tekst, zie de foto)';
  if (b.kind === 'shop') return `Je helpt een huishouden in Nederland met hun gedeelde boodschappenlijst.
Verzoek van de gebruiker: """${txt}"""
${hasImage ? 'Er is een foto bijgevoegd: bijvoorbeeld een handgeschreven boodschappenbriefje, een recept uit een kookboek of de inhoud van een koelkast. Haal daaruit de boodschappen die nodig zijn.\n' : ''}Staat al op de lijst (niet opnieuw noemen): ${list(b.existing, 80)}.

Geef de boodschappen die hiervoor nodig zijn. Gebruik Nederlandse productnamen en hoeveelheden zoals ze in een Nederlandse supermarkt verpakt zijn (bijv. "500 g", "1 pak", "2 st", "1 bos"). Tel hoeveelheden voor meerdere gerechten bij elkaar op. Maximaal 30 items.
Zet "pantry" op true voor wat de meeste mensen al in huis hebben (zout, peper, olie, bloem, suiker, gedroogde kruiden).
Afdelingen ("cat"): ${CAT_PROMPT}.`;
  return `Je helpt een huishouden met hun gedeelde takenlijst. Vandaag is het ${s(b.today, 60)}.
Verzoek van de gebruiker: """${txt}"""
${hasImage ? 'Er is een foto bijgevoegd (bijvoorbeeld een brief, uitnodiging of whiteboard). Haal daar de taken en datums uit.\n' : ''}Bestaande open taken (niet herhalen): ${list(b.existing, 80)}.

Maak hier concrete, afvinkbare taken van, in een logische volgorde, maximaal 15. Begin elke taak met een werkwoord en houd hem kort. Geef een datum ("due", JJJJ-MM-DD) alleen als het verzoek een moment noemt of als een deadline duidelijk volgt uit de planning; reken terug vanaf die deadline. Gebruik anders een lege string.`;
}

export function forgotPrompt(b: any) {
  return `Dit staat op een Nederlandse boodschappenlijst: ${list(b.open, 80)}.
Eerder gekocht door dit huishouden: ${list(b.recent, 30)}.

Noem maximaal 8 producten die waarschijnlijk vergeten zijn: dingen die logisch horen bij wat er al op staat (bijvoorbeeld wraps zonder vulling, pasta zonder saus) of vaste boodschappen uit de eerdere aankopen die nu ontbreken. Noem niets wat al op de lijst staat. Geef per product een korte reden van hooguit 8 woorden ("why").
Afdelingen ("cat"): ${CAT_PROMPT}.`;
}

export function sortPrompt(b: any) {
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60);
  return `Deel elk product van een Nederlandse boodschappenlijst in bij één supermarktafdeling.
Afdelingen: ${CAT_PROMPT}.
Producten (nummer: naam):
${items.map((t: unknown, n: number) => `${n}: ${s(t, 140)}`).join('\n')}

Geef voor elk nummer ("i") de afdeling-id ("cat").`;
}

function taskContext(b: any) {
  return `Je helpt een Nederlands huishouden met hun gedeelde takenlijst "${s(b.listName, 60)}". Vandaag is het ${s(b.today, 60)}.
Taak: "${s(b.task, 200)}"${b.note ? `\nToelichting: ${s(b.note, 300)}` : ''}${b.due ? `\nDeadline: ${s(b.due, 10)}` : ''}
Andere open taken op de lijst: ${list(b.others, 25)}.`;
}

export function questionsPrompt(b: any) {
  return `${taskContext(b)}

Voordat je deze taak uitwerkt: welke details moet je weten om een goed plan te maken dat bij dit huishouden past? Stel 0 tot 4 meerkeuzevragen.
- Alleen vragen waarvan het antwoord het plan echt verandert, zoals omvang, budget, wie er meedoet, timing of voorkeuren. Niets vragen wat al uit de taak blijkt.
- Per vraag 2 tot 5 korte antwoordopties die elkaar uitsluiten; voeg waar handig "Weet ik nog niet" toe.
- Zet "multi" op true als meerdere antwoorden tegelijk kunnen gelden.
- Is de taak één simpele handeling (bijv. "kapper bellen"), geef dan een lege lijst.`;
}

export function elaboratePrompt(b: any) {
  const answers = (Array.isArray(b.answers) ? b.answers : []).slice(0, 6).filter((x: any) => x && x.a);
  const known = answers.length || b.extra
    ? `\n\nDit vertelde het huishouden over de details (houd hier rekening mee):\n${answers.map((x: any) => `- ${s(x.q, 140)} ${s(x.a, 200)}`).join('\n')}${b.extra ? `\n- Verder: ${s(b.extra, 200)}` : ''}`
    : '';
  return `${taskContext(b)}${known}

Werk deze taak praktisch uit, toegespitst op Nederland en op wat het huishouden vertelde:
- "detail": één of twee zinnen over wat erbij komt kijken. Concreet, geen open deuren.
- "steps": 0 tot 8 afvinkbare stappen in logische volgorde, elk kort en beginnend met een werkwoord. Geef een datum ("due", JJJJ-MM-DD) alleen als er een deadline is, en plan dan terug vanaf die deadline; gebruik anders een lege string. Laat "steps" leeg als de taak één simpele handeling is. Herhaal geen andere open taken.
- "tips": 0 tot 4 nuttige suggesties: wat vaak vergeten wordt, slimme alternatieven, kosten of tijd, wie je erbij kunt betrekken.
- "buy": 0 tot 10 dingen die hiervoor gekocht moeten worden, met hoeveelheid ("qty"). Leeg als er niets te kopen is.`;
}

export function voicePrompt(b: any) {
  const lists = (Array.isArray(b.lists) ? b.lists : []).slice(0, 20);
  const target = b.target === 'shop' ? 'Alles gaat op één boodschappenlijst.' : b.target === 'todo' ? 'Alles gaat op één takenlijst.' : `Het huishouden heeft deze lijsten: ${lists.map((l: any) => `"${s(l.name, 60)}" (${l.kind === 'shop' ? 'boodschappen' : 'taken'})`).join(', ') || 'geen'}.`;
  return `Dit is een gesproken memo (Nederlands) van iemand die dingen op de gedeelde lijsten van het huishouden wil zetten. Vandaag is het ${s(b.today, 60)}.
${target}

1. Schrijf in "transcript" letterlijk uit wat er gezegd wordt.
2. Haal in "items" de losse dingen eruit die op een lijst moeten: boodschappen en taken. Eén item per product of taak.
   - "text": kort en duidelijk, met hoofdletter, zonder aantal of datum (bijv. "Melk", "Kapper bellen").
   - "qty": de hoeveelheid als die genoemd wordt (bijv. "2 pak", "500 g"), anders een lege string.
   - "due": een datum (JJJJ-MM-DD) als er een moment genoemd wordt ("morgen", "vrijdag"), anders een lege string.
   Laat opvulwoorden, twijfels en dingen die worden teruggenomen ("nee, toch geen kaas") weg.`;
}

/* ---------- Response schemas (Gemini structured output) ---------- */
const STR = { type: 'STRING' };
export const SHOP_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { text: STR, qty: STR, cat: STR, pantry: { type: 'BOOLEAN' }, why: STR }, required: ['text'] },
};
export const TODO_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { text: STR, due: STR, note: STR }, required: ['text'] },
};
export const ANALYZE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { i: { type: 'INTEGER' }, text: STR, qty: STR, note: STR, cat: STR, due: STR, list: STR, confidence: { type: 'NUMBER' } },
    required: ['i', 'text', 'list', 'confidence'],
  },
};
export const ROUTE_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, list: STR, confidence: { type: 'NUMBER' } }, required: ['i', 'list', 'confidence'] },
};
export const SORT_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, cat: STR }, required: ['i', 'cat'] },
};
export const VOICE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: STR,
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: STR, qty: STR, due: STR }, required: ['text'] } },
  },
  required: ['transcript', 'items'],
};
export const QUESTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { q: STR, options: { type: 'ARRAY', items: STR }, multi: { type: 'BOOLEAN' } }, required: ['q', 'options'] } },
  },
  required: ['questions'],
};
export const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    detail: STR,
    steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: STR, due: STR }, required: ['text'] } },
    tips: { type: 'ARRAY', items: STR },
    buy: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: STR, qty: STR }, required: ['text'] } },
  },
  required: ['detail', 'steps', 'tips', 'buy'],
};
