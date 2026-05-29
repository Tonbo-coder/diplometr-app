# Diplometr

Mobilní aplikace pro cenovou nabídku formátování diplomových a bakalářských prací.
Klient nahraje `.docx`, aplikace spočítá znaky, normostrany a **skutečný počet
fyzických stran (jak je zobrazí Word)**, vybere služby a termín, a vygeneruje
hotový český email pro zákazníka.

## Stack

- **Klient:** Expo (managed) + Expo Router + TypeScript — běží jako web, iOS i Android
- **Server:** Node.js + Express. `.docx` → text + počet znaků parsuje lokálně (JSZip).
  Skutečný počet stran zjišťuje konverzí na PDF přes [CloudConvert](https://cloudconvert.com).

## Struktura

```
app/                Expo Router obrazovky
components/ui.tsx   Sdílené UI komponenty
lib/
  pricing.ts        Ceník (jediný zdroj pravdy)
  calculator.ts     Čistá kalkulace ceny
  emailTemplate.ts  Generátor českého emailu
  api.ts            Fetch wrapper k serveru
  types.ts
server/
  index.js          Express + multer endpoint /api/analyze
  docAnalyzer.js    Extrakce znaků z .docx
  cloudconvert.js   .docx → PDF → počet stran
```

## Rozjetí lokálně

### 1) Server (vyžaduje CloudConvert API klíč)

```bash
cd server
cp .env.example .env
# do .env vlož CLOUDCONVERT_API_KEY z https://cloudconvert.com/dashboard/api/v2/keys
npm install
npm run dev
```

Server běží na `http://localhost:4000`. Ověř `GET /health` → `{ ok: true, hasKey: true }`.

### 2) Klient

```bash
npm install
npx expo start --web   # nebo: npx expo start (QR kód → Expo Go)
```

Klient čte adresu serveru z `app.json` → `expo.extra.apiBaseUrl` (default
`http://localhost:4000`). Když testuješ na fyzickém telefonu, nahraď `localhost`
za IP počítače v lokální síti.

## Konfigurace ceníku

Ceník je v [lib/pricing.ts](lib/pricing.ts) — jediné místo, kde se mění čísla.
Hodnoty odpovídají zadání:

| Položka | Cena |
|---|---|
| Formátování | 35/35/40/45 Kč/strana (base / 4d / 2d / 1d) |
| Korektura a stylistika | 75 Kč / normostrana |
| Citace a zdroje | cca 2800 Kč |
| Kontrola plagiátorství | 390 Kč |
| Kontrola AI | 550 Kč |
| Překlad abstraktu | 590 Kč |
| Tvorba prezentace | 2700 Kč |
| Zpětná vazba | 1900 Kč |
| Tisk a vazba A | 1050 Kč (1 ks) / 950 Kč (2–3 ks) |
| Tisk a vazba B | 1150 Kč (1 ks) / 1050 Kč (2–3 ks) |

## Co bylo vytvořeno

- Expo Router aplikace s jednou obrazovkou (`app/index.tsx`) pokrývající celý flow:
  upload → metriky (editovatelné) → termín → služby → oslovení/podpis → rozpis → email.
- Server endpoint `POST /api/analyze` (multipart `file`) vrací `{ charsWithSpaces,
  normostrany, physicalPages }`.
- Čistá, testovatelná kalkulace ceny (`lib/calculator.ts`) a generátor emailu
  (`lib/emailTemplate.ts`).
- Tlačítka **Kopírovat email**, **Sdílet**, **Reset**.

## Co je potřeba zkonfigurovat

1. **CloudConvert API klíč** v `server/.env` (`CLOUDCONVERT_API_KEY=...`). Bez něj
   endpoint `/api/analyze` vrací 400 s jasnou hláškou. Free tier CloudConvertu
   stačí pro běžné testování (25 konverzí/den).
2. **`apiBaseUrl`** v `app.json` (sekce `expo.extra`) — když budeš testovat z
   telefonu, nastav IP počítače v LAN místo `localhost`.
3. **Reálná `.docx` ukázka** k ověření, že počet stran z CloudConvertu odpovídá
   Wordu — viz testovací postup níže.

## Ověření end-to-end

1. Spusť server i klienta podle návodu výše.
2. V aplikaci nahraj diplomku v `.docx`.
3. Porovnej:
   - **Znaky včetně mezer** — musí sedět s tím, co Word ukazuje v
     *Revize → Počet slov*.
   - **Normostrany** — `znaky / 1800`, na 2 desetinná místa.
   - **Fyzické strany** — musí sedět s tím, co Word zobrazí dole na stavovém řádku.
4. Přepni termín 4d → 2d → 1d; cena formátování se musí změnit 35 → 40 → 45 Kč/strana.
5. Zaškrtni / odškrtni libovolnou službu; v rozpisu i v emailu zmizí/objeví se její řádek.
6. Klikni **Kopírovat email**, vlož do mailového klienta — ověř, že text je správně.
