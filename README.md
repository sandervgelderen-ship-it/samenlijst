# Samenlijst

Gedeelde boodschappen- en takenlijsten voor het hele huishouden. Gebouwd op dezelfde manier als Moestuin: React + Vite + Tailwind, Firebase voor inloggen en opslag, een Express-server met Gemini voor de slimme functies, en Capacitor voor de Android-app.

## Wat het kan

- **Huishoudens**: iedereen in een huishouden ziet dezelfde lijsten, live. Nodig huisgenoten uit met een code van 6 tekens.
- **Snel toevoegen** op het beginscherm: typ alles door elkaar (`melk, batterijen, tandarts bellen vrijdag`) en elk item gaat naar de juiste lijst. Twijfelt de app, dan vraagt hij het.
- **Eerst AI-analyse**: elk nieuw item gaat eerst langs Gemini: nette naam (spelfouten verbeterd), aantal, merk of detail, afdeling, datum, en "melk en eieren" wordt twee items. Wat jullie de kennisbank leerden, beslist mee. Zonder AI werkt toevoegen gewoon met de regels.
- **Spraakmemo**: tik op de microfoon, spreek in wat er nodig is; Gemini schrijft het uit en verdeelt het over de lijsten.
- **Kennisbank**: elke keuze, verplaatsing en aangepaste afdeling wordt onthouden en gedeeld, zodat snel toevoegen steeds beter wordt.
- **Boodschappen per afdeling**, met aantallen (`2 pak melk`), recente items en *Ik ga boodschappen doen*.
- **Taken met datums** in gewoon Nederlands (`morgen`, `vrijdag`, `12 nov`) en iemand die het doet.
- **Taken uitwerken**: Gemini maakt van een nieuwe taak een toelichting, stappen, tips en een lijst met wat je moet kopen. Met één tik zet je die op de lijsten.
- **Slim toevoegen**: een gerecht, recept of foto van een briefje wordt een boodschappenlijst; *Wat vergeet ik?* vult aan.
- Werkt offline (Firestore-cache) en heeft een lichte, speelse stijl met een eigen kleur per lijst.

## Lokaal draaien

**Nodig:** Node.js 22

1. `npm install`
2. Zet je Gemini-sleutel in `.env.local`: `GEMINI_API_KEY="..."` (zie `.env.example`)
3. `npm run dev` en open http://localhost:3000

Zonder `GEMINI_API_KEY` werkt alles behalve de slimme functies; de knoppen daarvoor verdwijnen dan vanzelf.

Overige scripts: `npm run lint` (types), `npm test` (lijstlogica), `npm run build` (web-app + `dist/server.cjs`), `npm start` (productieserver).

## Firebase

Samenlijst gebruikt **hetzelfde Firebase-project als Moestuin** (`firebase-applet-config.json`, `.firebaserc`). Een Moestuin-account werkt dus ook hier. De data staat in eigen collecties:

| Pad | Inhoud |
|---|---|
| `samenlijstHouseholds/{id}` | naam, leden, uitnodigingscode |
| `samenlijstHouseholds/{id}/lists`, `/items`, `/kb` | lijsten, items en de kennisbank |
| `samenlijstInvites/{code}` | welke code bij welk huishouden hoort |

**Let op bij de beveiligingsregels.** Een Firebase-project heeft één set regels. `firestore.rules` in deze repo bevat daarom de regels van Moestuin *plus* die van Samenlijst. Zet je regels live, doe dat met dit bestand (`firebase deploy --only firestore:rules`), en neem het Samenlijst-deel ook over in de Moestuin-repo, anders overschrijft een deploy vanuit Moestuin de Samenlijst-regels.

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
| `POST /api/elaborate` | een taak uitwerken |

Alle routes geven gestructureerde JSON terug (Gemini `responseSchema`). De Gemini-sleutel blijft op de server.

Deploy zoals Moestuin: via AI Studio of naar Cloud Run met `npm run build && npm start` en `GEMINI_API_KEY` als secret.

## Android-app

Elke push naar `main` draait de workflow **Build en APK** (`.github/workflows/android.yml`). Die installeert, test, bouwt, maakt het Capacitor Android-project, voegt de microfoonrechten toe en bouwt de APK. De APK komt in de release **Laatste APK**; open die pagina op je telefoon om hem te installeren.

De Android-app heeft geen eigen server. Zet het adres van je server onder *Settings › Secrets and variables › Actions › Variables* als `SAMENLIJST_API_URL` (bijvoorbeeld `https://samenlijst-xyz.run.app/api`), of vul het in de app in bij *Huishouden › Server*.

Zelf bouwen kan ook (Android SDK nodig): `npx cap add android` (eenmalig), `node scripts/android-permissions.cjs`, daarna `npm run android:apk`.

## Code-indeling

- `src/lib/domain.ts` – afdelingen, aantallen en datums herkennen, lijst kiezen, kennisbank (getest in `scripts/test-domain.ts`)
- `src/lib/aiClean.ts` – antwoorden van de server veilig maken voor opslag
- `src/data/repo.ts` – Firestore: inloggen, huishoudens, live data
- `src/data/actions.ts` – alles wat je met de lijsten kunt doen
- `src/store/useStore.ts` – Zustand-store
- `src/components/` – schermen en sheets
- `src/server/` – Express-routes, Gemini-service en prompts
