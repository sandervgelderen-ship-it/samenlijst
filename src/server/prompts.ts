/** All Gemini prompts in one place. The app sends data; the wording lives here. */
import { CATS } from '../lib/domain';

export const CAT_PROMPT = CATS.map(c => `"${c[0]}" = ${c[1]}`).join('; ');
const s = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v : []).slice(0, max).map(x => s(x, 140)).join(', ') || 'niets';
/** The household's memory: general preferences and agreements, one per line. */
const memory = (v: unknown, max = 40) => (Array.isArray(v) ? v : []).slice(0, max).map(x => `- ${s(x, 200)}`).join('\n') || '- nog niets bekend';

export function analyzePrompt(b: any) {
  const lists = (Array.isArray(b.lists) ? b.lists : []).slice(0, 20);
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 25);
  const fixed = lists.find((l: any) => l.id === b.fixedList);
  return `Je analyseert nieuwe items voor de gedeelde lijsten van een Nederlands huishouden. Vandaag is het ${s(b.today, 60)}.
Lijsten:
${lists.map((l: any) => `- id "${s(l.id, 60)}": "${s(l.name, 60)}" (${l.kind === 'shop' ? 'boodschappenlijst' : 'takenlijst'}). Staat er doorgaans op: ${list(l.examples, 18)}`).join('\n')}
${fixed ? `Alles komt op de lijst "${s(fixed.name, 60)}" (id "${s(fixed.id, 60)}"); kies dus die lijst.\n` : ''}Voorkeuren en afspraken van dit huishouden (volg ze altijd; noemt een regel een lijst of winkel, kies die):
${memory(b.memory)}
Winkels waar dit huishouden naast de supermarkt boodschappen doet: ${list(b.stores, 12)}.

Ingetypte items (nummer: tekst):
${items.map((t: unknown, n: number) => `${n}: ${s(t, 200)}`).join('\n')}

Analyseer elk item:
- "text": nette Nederlandse naam met hoofdletter, spelfouten verbeterd, zonder aantal of datum. Bij taken kort en duidelijk wat er moet gebeuren.
- "qty": de hoeveelheid als die genoemd is (bijv. "2 pak", "500 g"), anders een lege string.
- "note": merk of ander detail dat genoemd werd. Geldt een voorkeur van het huishouden voor dit item (bijv. ecologisch, biologisch, een vast merk), zet die hier kort neer. Anders een lege string.
- "cat": bij boodschappen de afdeling-id (${CAT_PROMPT}); bij taken een lege string.
- "due": datum JJJJ-MM-DD als er een moment genoemd is, anders een lege string.
- "repeat": bij taken die terugkomen hoe vaak, in woorden ("elke week", "elke 2 weken", "elke maandag", "elke maand"), ook als het in een bijzin staat ("het konijnenhok moet wekelijks"); anders een lege string. Haal het dan uit "text" en "note".
- "store": bij boodschappen waar je dit in Nederland normaal koopt: "Supermarkt" als een gewone supermarkt (Albert Heijn, Jumbo) het verkoopt, anders het soort winkel, zoals "Drogist", "Bouwmarkt", "Tuincentrum", "Dierenwinkel", "Apotheek", "Slager", "Bakker", "Markt" of "Online". Noemt de gebruiker zelf een winkel, gebruik die. Bij taken een lege string.
- "storeConfidence": tussen 0 en 1 hoe zeker die winkel is. Hoog (0.9) voor gewone boodschappen als melk of brood. Laag (0.6 of minder) als het zowel in de supermarkt als elders te koop is of als je twijfelt, bijvoorbeeld stro, hooi, batterijen, een lamp, potgrond of vogelzaad.
- "list": id van de lijst waar het hoort; "confidence" tussen 0 en 1, hoog alleen als het duidelijk is.
Noemt één regel meerdere dingen ("melk en eieren"), geef dan per ding een object met hetzelfde "i". Verzin niets wat niet genoemd is, behalve wat uit de voorkeuren van het huishouden volgt.`;
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
Voorkeuren van dit huishouden (houd er rekening mee; zet een voorkeur die voor een product geldt kort in "note"):
${memory(b.memory)}

Geef de boodschappen die hiervoor nodig zijn. Gebruik Nederlandse productnamen en hoeveelheden zoals ze in een Nederlandse supermarkt verpakt zijn (bijv. "500 g", "1 pak", "2 st", "1 bos"). Tel hoeveelheden voor meerdere gerechten bij elkaar op. Maximaal 30 items.
Zet "pantry" op true voor wat de meeste mensen al in huis hebben (zout, peper, olie, bloem, suiker, gedroogde kruiden).
Afdelingen ("cat"): ${CAT_PROMPT}.`;
  return `Je helpt een huishouden met hun gedeelde takenlijst. Vandaag is het ${s(b.today, 60)}.
Verzoek van de gebruiker: """${txt}"""
${hasImage ? 'Er is een foto bijgevoegd (bijvoorbeeld een brief, uitnodiging of whiteboard). Haal daar de taken en datums uit.\n' : ''}Bestaande open taken (niet herhalen): ${list(b.existing, 80)}.
Voorkeuren en afspraken van dit huishouden (houd er rekening mee):
${memory(b.memory)}

Maak hier concrete, afvinkbare taken van, in een logische volgorde, maximaal 15. Begin elke taak met een werkwoord en houd hem kort. Geef een datum ("due", JJJJ-MM-DD) alleen als het verzoek een moment noemt of als een deadline duidelijk volgt uit de planning; reken terug vanaf die deadline. Gebruik anders een lege string.`;
}

export function forgotPrompt(b: any) {
  return `Dit staat op een Nederlandse boodschappenlijst: ${list(b.open, 80)}.
Eerder gekocht door dit huishouden: ${list(b.recent, 30)}.
Voorkeuren van dit huishouden (houd er rekening mee; zet een voorkeur die voor een product geldt kort in "note"):
${memory(b.memory)}

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
Andere open taken op de lijst: ${list(b.others, 25)}.
Voorkeuren en afspraken van dit huishouden (houd er rekening mee en vraag er niet opnieuw naar):
${memory(b.memory)}`;
}

export function questionsPrompt(b: any) {
  return `${taskContext(b)}

Beoordeel eerst of het zin heeft deze taak uit te werken ("worth").
- "worth": false voor alledaagse klusjes en simpele handelingen die iedereen kan zonder plan, zoals stofzuigen, afwassen, vuilnis buitenzetten, was draaien, kapper bellen, boodschappen doen.
- "worth": true alleen als een plan echt helpt: iets met meerdere stappen, een deadline, kosten, regelwerk of andere mensen (verhuizen, feestje organiseren, paspoort verlengen, badkamer verbouwen).
${b.force ? 'De gebruiker vroeg zelf om uitwerking: zet "worth" op true.\n' : ''}
Als "worth" true is: stel 0 tot 3 meerkeuzevragen over details die het plan echt veranderen (omvang, budget, wie meedoet, timing). Niets vragen wat al uit de taak of de voorkeuren blijkt, of wat weinig uitmaakt. Per vraag 2 tot 4 korte opties; zet "multi" op true als meerdere antwoorden kunnen gelden.
Als "worth" false is: geef een lege lijst vragen.`;
}

export function elaboratePrompt(b: any) {
  const answers = (Array.isArray(b.answers) ? b.answers : []).slice(0, 6).filter((x: any) => x && x.a);
  const known = answers.length || b.extra
    ? `\n\nDit vertelde het huishouden over de details (houd hier rekening mee):\n${answers.map((x: any) => `- ${s(x.q, 140)} ${s(x.a, 200)}`).join('\n')}${b.extra ? `\n- Verder: ${s(b.extra, 200)}` : ''}`
    : '';
  return `${taskContext(b)}${known}

Werk de klus zelf concreet uit, toegespitst op Nederland en op wat het huishouden vertelde: wat er precies moet gebeuren en hoe. Geen tips of suggesties, geen open deuren; alleen de details van de klus.
- "detail": 2 tot 4 zinnen over de klus zelf: de aanpak, wat erbij komt kijken (materiaal, hoeveelheden, volgorde, droog- of wachttijden) en ongeveer hoeveel tijd het kost.
- "steps": 2 tot 6 stappen in logische volgorde, elk kort en beginnend met een werkwoord ("text"), met in "how" één zin hoe je die stap doet (hoeveel, waarmee, waar op letten). Geef een datum ("due", JJJJ-MM-DD) alleen als er een deadline is en plan dan terug; gebruik anders een lege string.
- "tips": altijd een lege lijst.
- "buy": 0 tot 8 dingen die hiervoor gekocht moeten worden, met hoeveelheid ("qty"). Leeg als er niets te kopen is of het al in huis is.`;
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

/** Turn what the household just did into general rules for its memory (metadata, never items). */
export function learnPrompt(b: any) {
  const lists = (Array.isArray(b.lists) ? b.lists : []).slice(0, 20);
  const events = (Array.isArray(b.events) ? b.events : []).slice(0, 6);
  return `Je beheert het geheugen van Samenlijst, de gedeelde lijsten-app van een Nederlands huishouden.
Het geheugen bevat alleen algemene voorkeuren en afspraken over het huishouden (metadata), nooit losse producten of taken.
Goed: "Schoonmaakproducten moeten ecologisch zijn", "Klusspullen horen op de lijst Klussen", "Dierenvoer kopen we bij de dierenwinkel", "Plantaardige melk hoort bij Zuivel & eieren", "Feestjes met een klein budget".
Fout: "Toiletreiniger", "Melk staat op Boodschappen", "Plinten plaatsen".
Lijsten: ${lists.map((l: any) => `"${s(l.id, 60)}" = ${s(l.name, 60)} (${l.kind === 'shop' ? 'boodschappen' : 'taken'})`).join('; ') || 'geen'}.
Al in het geheugen:
${memory(b.memory, 60)}

Dit deed het huishouden net:
${events.map((e: unknown, n: number) => `${n + 1}. ${s(e, 300)}`).join('\n')}

Leid hier alleen een regel uit af als er een blijvende voorkeur of afspraak uit spreekt die nog niet in het geheugen staat. Generaliseer van het product naar de soort of eigenschap (toiletreiniger wordt schoonmaakproducten, schroeven worden klusspullen). Een correctie van lijst, afdeling of winkel mag een regel worden als die voor een hele soort dingen geldt. Een eenmalige keuze zonder patroon is geen regel: twijfel je, geef dan niets.
Per regel: "text" is één korte Nederlandse zin van minstens drie woorden, "topic" een onderwerp van 1 of 2 woorden, "list" een lijst-id als de regel over een lijst gaat, anders een lege string. Hooguit 3 regels; meestal 0 of 1.`;
}

/** The JSON shape the offers prompt asks for (search grounding cannot use a response schema). */
export const OFFERS_SHAPE = '{"week":"20 t/m 26 oktober","stores":["Albert Heijn","Jumbo"],"offers":[{"store":"Albert Heijn","product":"Halfvolle melk","deal":"2e halve prijs","price":"€1,19","until":"2026-10-26","match":"Melk","cat":"zuivel"}]}';

/** Supermarket offers near a place, found with Google Search (grounding). */
export function offersPrompt(b: any) {
  const place = s(b.place, 80);
  const chosen = (Array.isArray(b.stores) ? b.stores : []).map((x: unknown) => s(x, 40)).filter(Boolean).slice(0, 12);
  const step1 = chosen.length
    ? `1. Zoek alleen bij ${chosen.length === 1 ? 'deze supermarkt' : 'deze supermarkten'}: ${chosen.join(', ')}. Het huishouden doet daar boodschappen; ga ervan uit dat ${chosen.length === 1 ? 'hij' : 'ze'} in of bij ${place} ${chosen.length === 1 ? 'zit' : 'zitten'}. Zoek op de eigen site en de folder van ${chosen.length === 1 ? 'die keten' : 'elke keten'} (bijv. "${chosen[0]} folder deze week").`
    : `1. Zoek uit welke supermarkten er in of bij ${place} zitten (bijvoorbeeld Albert Heijn, Jumbo, Lidl, Aldi, Plus, Dirk, Vomar, Hoogvliet, Coop, Spar, DekaMarkt, Poiesz, Boni, Nettorama, Ekoplaza). Zoek per keten na of er een vestiging is; neem alle ketens die daar een winkel hebben, ook discounters als Lidl, Aldi en Vomar.`;
  const max = chosen.length === 1 ? 12 : 25;
  return `Zoek met Google Search de supermarktaanbiedingen die nu geldig zijn in of vlak bij ${place} (Nederland). Vandaag is het ${s(b.today, 60)}.
${step1}
2. Zoek in hun actuele folders en bonuspagina's de aanbiedingen van deze week. Gebruik alleen aanbiedingen die je echt gevonden hebt; verzin niets en neem geen verlopen acties. Landelijke folderaanbiedingen van de keten gelden ook in ${place}.
3. Geef voorrang aan aanbiedingen voor wat er op de boodschappenlijst staat: ${list(b.open, 60)}. Zet bij zo'n aanbieding in "match" het item van de lijst waar hij bij past.
4. Vul aan met andere opvallende aanbiedingen van gewone boodschappen, tot hooguit ${max} in totaal${chosen.length > 1 ? ', verdeeld over de supermarkten' : ''}.
Voorkeuren van dit huishouden (houd er rekening mee):
${memory(b.memory)}

Per aanbieding: "store" (naam van de supermarkt), "product" (kort, Nederlands), "deal" (zoals "1+1 gratis", "2e halve prijs", "25% korting"), "price" (actieprijs zoals "€2,49", anders een lege string), "until" (laatste geldige dag JJJJ-MM-DD, anders een lege string), "match" (item van de lijst of een lege string), "cat" (afdeling-id: ${CAT_PROMPT}).
Zet in "week" de periode zoals de folders hem noemen (bijv. "20 t/m 26 oktober") en in "stores" de supermarkten die je in of bij ${place} vond.`;
}

/* ---------- Response schemas (Gemini structured output) ---------- */
const STR = { type: 'STRING' };
export const SHOP_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { text: STR, qty: STR, cat: STR, note: STR, pantry: { type: 'BOOLEAN' }, why: STR }, required: ['text'] },
};
export const TODO_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { text: STR, due: STR, note: STR }, required: ['text'] },
};
export const ANALYZE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { i: { type: 'INTEGER' }, text: STR, qty: STR, note: STR, cat: STR, due: STR, repeat: STR, store: STR, storeConfidence: { type: 'NUMBER' }, list: STR, confidence: { type: 'NUMBER' } },
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
export const LEARN_SCHEMA = {
  type: 'OBJECT',
  properties: { rules: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: STR, topic: STR, list: STR }, required: ['text'] } } },
  required: ['rules'],
};
export const QUESTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    worth: { type: 'BOOLEAN' },
    questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { q: STR, options: { type: 'ARRAY', items: STR }, multi: { type: 'BOOLEAN' } }, required: ['q', 'options'] } },
  },
  required: ['worth', 'questions'],
};
export const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    detail: STR,
    steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: STR, how: STR, due: STR }, required: ['text'] } },
    tips: { type: 'ARRAY', items: STR },
    buy: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: STR, qty: STR }, required: ['text'] } },
  },
  required: ['detail', 'steps', 'buy'],
};
