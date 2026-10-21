# IsErNog

*Is er nog melk?* (Tot 21 oktober 2026 heette de app Samenlijst; de repo, de Firestore-collecties en de app-id heten nog zo.)

Gedeelde boodschappen- en takenlijsten voor het hele huishouden. Gebouwd op dezelfde manier als Moestuin: React + Vite + Tailwind, Firebase voor inloggen en opslag, een Express-server met Gemini voor de slimme functies, en Capacitor voor de Android-app.

## Wat het kan

- **Huishoudens**: iedereen in een huishouden ziet dezelfde lijsten, live. Nodig huisgenoten uit met een code van 6 tekens.
- **Snel toevoegen** op het beginscherm: typ alles door elkaar (`melk, batterijen, tandarts bellen vrijdag`) en elk item gaat naar de juiste lijst. Twijfelt de app, dan vraagt hij het.
- **Eerst AI-analyse**: elk nieuw item gaat eerst langs Gemini: nette naam (spelfouten verbeterd), aantal, merk of detail, afdeling, datum, en "melk en eieren" wordt twee items. De voorkeuren uit het geheugen gelden daarbij altijd. Zonder AI werkt toevoegen gewoon met de regels.
- **Spraakmemo**: tik op de microfoon, spreek in wat er nodig is; Gemini schrijft het uit en verdeelt het over de lijsten.
- **Geheugen**: algemene voorkeuren en afspraken van het huishouden, nooit losse producten ("Schoonmaakproducten moeten ecologisch zijn", "Klusspullen horen op de lijst Klussen"). Voeg ze zelf toe via *Geheugen* op het beginscherm of door `onthoud: …` te typen; uit keuzes en correcties leidt Gemini er zelf regels bij af. Elke AI-functie krijgt het geheugen mee. Gedeeld met het hele huishouden.
- **Aanbiedingen**: vul bij *Huishouden* jullie woonplaats in. Elke nacht zoekt Gemini met Google Search de folders van deze week bij supermarkten daar (`scripts/aanbiedingen.ts`, zie hieronder) en zet het resultaat op het huishouden. Op een boodschappenlijst toont de knop *Aanbiedingen* ze, met wat op de lijst staat bovenaan; items die in de aanbieding zijn krijgen een groen vlaggetje.
- **Boodschappen per afdeling**, met aantallen (`2 pak melk`), recente items en *Ik ga boodschappen doen*.
- **Taken met datums** in gewoon Nederlands (`morgen`, `vrijdag`, `12 nov`) en iemand die het doet.
- **Taken uitwerken**: Gemini stelt eerst een paar meerkeuzevragen over de details (omvang, budget, wie helpt) en maakt daarna van de taak een toelichting, stappen, tips en een lijst met wat je moet kopen. Met één tik zet je die op de lijsten.
- **Slim toevoegen**: een gerecht, recept of foto van een briefje wordt een boodschappenlijst; *Wat vergeet ik?* vult aan.
- Werkt offline (Firestore-cache) en heeft een lichte, speelse stijl met een eigen kleur per lijst.

## Webversie

Elke push naar `main` zet de app ook online als website: **https://sandervgelderen-ship-it.github.io/samenlijst/** (workflow *Webversie (GitHub Pages)*). Het is een installeerbare web-app (PWA): de app toont zelf een knop **Installeren** (Chrome, Brave, Edge op Android en desktop) of legt op iPhone uit hoe je hem via *Deel › Zet op beginscherm* toevoegt. Een service worker (`public/sw.js`) zorgt dat hij direct en ook offline opent.

De webversie heeft geen eigen server nodig: de AI loopt via **Firebase AI Logic** in hetzelfde Firebase-project, zodat er geen sleutel in de site staat. Eenmalig instellen:

1. Firebase-console › **AI Logic** › *Get started* › kies **Gemini Developer API**.
2. Authentication › Settings › *Authorized domains*: voeg `sandervgelderen-ship-it.github.io` toe (voor inloggen met Google).
3. Firestore-regels publiceren (zie hieronder).
4. Repo › Settings › Pages › *Source*: **GitHub Actions** (als de workflow dat niet zelf kon aanzetten).

## Lokaal draaien

**Nodig:** Node.js 22

1. `npm install`
2. Zet je Gemini-sleutel in `.env.local`: `GEMINI_API_KEY="..."` (zie `.env.example`)
3. `npm run dev` en open http://localhost:3000

Zonder `GEMINI_API_KEY` werkt alles behalve de slimme functies; de knoppen daarvoor verdwijnen dan vanzelf.

Overige scripts: `npm run lint` (types), `npm test` (lijstlogica), `npm run build` (web-app + `dist/server.cjs`), `npm start` (productieserver).

## Firebase

IsErNog gebruikt **hetzelfde Firebase-project als Moestuin** (`firebase-applet-config.json`, `.firebaserc`). Een Moestuin-account werkt dus ook hier. De data staat in eigen collecties:

| Pad | Inhoud |
|---|---|
| `samenlijstHouseholds/{id}` | naam, leden, uitnodigingscode |
| `samenlijstHouseholds/{id}/lists`, `/items`, `/kb` | lijsten, items en het geheugen (`kind: 'rule'`; oudere documenten zonder `kind` zijn losse items uit de vroegere kennisbank en worden niet meer gebruikt) |
| `samenlijstInvites/{code}` | welke code bij welk huishouden hoort |

**Let op bij de beveiligingsregels.** Een Firebase-project heeft één set regels. `firestore.rules` in deze repo bevat daarom de regels van Moestuin *plus* die van IsErNog. Zet je regels live, doe dat met dit bestand (`firebase deploy --only firestore:rules`), en neem het IsErNog-deel ook over in de Moestuin-repo, anders overschrijft een deploy vanuit Moestuin de IsErNog-regels.

In de Firebase-console moeten **E-mail/wachtwoord** en **Google** aan staan onder Authentication (bij Moestuin al zo). Voor inloggen met Google op het web moet het domein van je server bij *Authorized domains* staan.

## Server en slimme functies

`server.ts` is een Express-server die in ontwikkeling Vite als middleware draait en in productie `dist/` serveert, net als Moestuin. De routes staan in `src/server/routes/ai.ts`, de prompts in `src/server/prompts.ts`:

| Route | Doel |
|---|---|
| `GET /api/health` | staat Gemini aan? |
| `POST /api/analyze` | elk nieuw item eerst: nette naam, aantal, afdeling, datum, splitsen en welke lijst |
| `POST /api/route-items` | (oud) alleen de lijst kiezen |
| `POST /api/voice-memo` | spraakmemo uitschrijven en opsplitsen in items |
| `POST /api/smart-add` | gerecht, recept, plan of foto naar items |
| `POST /api/forgot` | wat vergeet ik? |
| `POST /api/sort-aisles` | items uit *Overig* bij de juiste afdeling zetten |
| `POST /api/questions` | meerkeuzevragen over de details van een taak |
| `POST /api/elaborate` | een taak uitwerken, met de antwoorden |
| `POST /api/learn` | uit een correctie of keuze een algemene regel voor het geheugen afleiden (of niets) |
| `POST /api/offers` | supermarktaanbiedingen in een plaats, met Google Search (grounding) |

Alle routes geven gestructureerde JSON terug (Gemini `responseSchema`), behalve `/offers`: zoeken met Google gaat niet samen met een schema, dus daar vraagt de prompt om JSON en geeft de route ook de bronnen en de zoeksuggestie van Google mee (die moet je tonen bij antwoorden met Google Search). De Gemini-sleutel blijft op de server.

Deploy zoals Moestuin: via AI Studio of naar Cloud Run met `npm run build && npm start` en `GEMINI_API_KEY` als secret.

## Aanbiedingen 's nachts

`scripts/aanbiedingen.ts` zoekt per huishouden met een woonplaats de aanbiedingen van deze week (Gemini met Google Search via Firebase AI Logic, dezelfde prompt als de app) en schrijft ze naar `samenlijstHouseholds/{id}.offers`. Het script heeft de deploysleutel van het Firebase-project nodig en draait daarom via de brug in de privé-repo (branch `samenlijst-meldingen`, actie `aanbiedingen`); een geplande taak van Claude start die elke nacht. Lokaal: `GOOGLE_APPLICATION_CREDENTIALS=sa.json npm run aanbiedingen -- <projectId>`.

## Android-app

Elke push naar `main` draait de workflow **Build en APK** (`.github/workflows/android.yml`). Die installeert, test, bouwt, maakt het Capacitor Android-project, voegt de microfoonrechten toe en bouwt de APK. De APK komt in de release **Laatste APK**; open die pagina op je telefoon om hem te installeren.

De Android-app heeft geen eigen server. Zet het adres van je server onder *Settings › Secrets and variables › Actions › Variables* als `SAMENLIJST_API_URL` (bijvoorbeeld `https://samenlijst-xyz.run.app/api`), of vul het in de app in bij *Huishouden › Server*.

### Inloggen met Google in de Android-app

De app gebruikt het Google-account van de telefoon (`@capacitor-firebase/authentication`) en logt daarna in bij Firebase. Daarvoor:

1. Firebase-console › Projectinstellingen › *App toevoegen* › Android, pakketnaam `com.samenlijst.app`, en de **SHA-1** van de ondertekensleutel.
2. Download `google-services.json` en zet de inhoud als repository secret `GOOGLE_SERVICES_JSON`.
3. Zet de base64-tekst van de keystore als secret `ANDROID_DEBUG_KEYSTORE`, zodat elke build dezelfde SHA-1 heeft.
4. Authentication › Sign-in method › **Google** aan.

Zelf bouwen kan ook (Android SDK nodig): `npx cap add android` (eenmalig), daarna `npm run android:apk`.

## Code-indeling

- `src/lib/domain.ts` – afdelingen, aantallen en datums herkennen, lijst kiezen, kennisbank (getest in `scripts/test-domain.ts`)
- `src/lib/aiClean.ts` – antwoorden van de server veilig maken voor opslag
- `src/data/repo.ts` – Firestore: inloggen, huishoudens, live data
- `src/data/actions.ts` – alles wat je met de lijsten kunt doen
- `src/store/useStore.ts` – Zustand-store
- `src/components/` – schermen en sheets
- `src/server/` – Express-routes, Gemini-service en prompts
