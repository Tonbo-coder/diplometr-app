import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// V produkci (Fly.io) DATA_DIR ukazuje na persistent volume `/data`.
// V dev je to složka serveru.
const DATA_DIR = process.env.DATA_DIR || __dirname;
// Instrukce vždy čteme přímo z image (aby deploy okamžitě projevil změny).
const INSTRUCTIONS_DIR = path.join(__dirname, "instructions");
const FEEDBACK_DIR = path.join(DATA_DIR, "feedback");
const FEEDBACK_LOG = path.join(FEEDBACK_DIR, "log.jsonl");

// Inicializace složek pro user data na persistent volume.
export function initDataDir() {
  if (DATA_DIR === __dirname) return;
  try {
    if (!fs.existsSync(FEEDBACK_DIR)) {
      fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
      console.log(`[init] Vytvořena složka feedback v ${FEEDBACK_DIR}`);
    }
  } catch (err) {
    console.warn("[init] Selhalo init data dir:", err?.message);
  }
}

function loadRecentExamples(maxN = 50) {
  try {
    if (!fs.existsSync(FEEDBACK_LOG)) return "";
    const lines = fs
      .readFileSync(FEEDBACK_LOG, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    const recent = lines
      .slice(-maxN)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (recent.length === 0) return "";
    return recent
      .map((r, i) => {
        const email = (r.clientEmail || "").trim();
        const answer = (r.finalAnswer || "").trim();
        if (!email || !answer) return null;
        const shortEmail = email.length > 600 ? email.slice(0, 600) + "…" : email;
        return `--- Příklad ${i + 1} ---\nKLIENT:\n${shortEmail}\n\nODPOVĚĎ:\n${answer}`;
      })
      .filter(Boolean)
      .join("\n\n");
  } catch (err) {
    console.warn("[parseEmail] Selhalo načtení examples:", err?.message);
    return "";
  }
}

export async function appendFeedback({ clientEmail, finalAnswer }) {
  if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  const entry = {
    clientEmail: String(clientEmail || "").trim(),
    finalAnswer: String(finalAnswer || "").trim(),
    timestamp: new Date().toISOString(),
  };
  fs.appendFileSync(FEEDBACK_LOG, JSON.stringify(entry) + "\n", "utf8");
}

function readAllFeedback() {
  if (!fs.existsSync(FEEDBACK_LOG)) return [];
  return fs
    .readFileSync(FEEDBACK_LOG, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeAllFeedback(entries) {
  if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
  fs.writeFileSync(FEEDBACK_LOG, content, "utf8");
}

export async function listFeedback() {
  // Vrátí všechny záznamy, nejnovější první.
  return readAllFeedback().reverse();
}

export async function deleteFeedbackAt(reverseIndex) {
  const all = readAllFeedback();
  // reverseIndex je index v opačném pořadí (jak ho posílá UI)
  const realIndex = all.length - 1 - reverseIndex;
  if (realIndex < 0 || realIndex >= all.length) {
    throw new Error("Záznam neexistuje");
  }
  all.splice(realIndex, 1);
  writeAllFeedback(all);
}

const PROMOTED_FILE = path.join(INSTRUCTIONS_DIR, "99-vzory-z-praxe.md");

export async function promoteFeedbackAt(reverseIndex) {
  const all = readAllFeedback();
  const realIndex = all.length - 1 - reverseIndex;
  if (realIndex < 0 || realIndex >= all.length) {
    throw new Error("Záznam neexistuje");
  }
  const entry = all[realIndex];

  // Připravit hlavičku souboru, pokud ještě neexistuje
  if (!fs.existsSync(PROMOTED_FILE)) {
    fs.writeFileSync(
      PROMOTED_FILE,
      "# Vzorové páry povýšené z log.jsonl\n\nKaždý záznam = klientův e-mail a tobou schválená odpověď. Tyto vzory mají vyšší váhu než auto-loadovaný log.\n\n",
      "utf8",
    );
  }

  const stamp = entry.timestamp || new Date().toISOString();
  const block =
    `## Vzor — ${stamp}\n\n**KLIENT:**\n\n${entry.clientEmail}\n\n**ODPOVĚĎ:**\n\n${entry.finalAnswer}\n\n---\n\n`;

  fs.appendFileSync(PROMOTED_FILE, block, "utf8");

  // Po povýšení odstraníme záznam z logu (aby se nedubloval).
  all.splice(realIndex, 1);
  writeAllFeedback(all);
}

function loadUserInstructions() {
  try {
    if (!fs.existsSync(INSTRUCTIONS_DIR)) return "";
    const files = fs
      .readdirSync(INSTRUCTIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .sort();
    if (files.length === 0) return "";
    return files
      .map((f) => {
        const content = fs.readFileSync(path.join(INSTRUCTIONS_DIR, f), "utf8").trim();
        return content ? `--- ${f} ---\n${content}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  } catch (err) {
    console.warn("[parseEmail] Selhalo načtení instructions:", err?.message);
    return "";
  }
}

let client = null;
function getClient() {
  if (client) return client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  client = new Anthropic({ apiKey: key });
  return client;
}

const SYSTEM_PROMPT = `Jsi parser českých e-mailů od klientů, kteří poptávají úpravu závěrečných (diplomových, bakalářských) prací.
Z textu e-mailu extrahuj strukturovaná data v JSON formátu.

Urči:

1. salutation — "pani" pokud klient je žena, "pane" pokud muž, jinak null.
   Pohlaví urči podle příjmení (Nováková=žena, Novák=muž), formulací nebo podpisu.

2. jmeno — křestní jméno klienta v 1. pádě (např. "Jana", "Petr"). Pokud najdeš jen příjmení, vrať null.
3. prijmeni — příjmení klienta v 1. pádě (např. "Nováková", "Novák"). Pokud najdeš jen křestní jméno, vrať null.
4. email — e-mailová adresa klienta (např. z podpisu nebo „Můj email je …"). Bez „mailto:". Pokud nic, null.
5. telefon — telefonní číslo klienta včetně předvolby ve formátu „+420 NNN NNN NNN" (pokud najdeš jen 9 cifer, doplň „+420 " a rozděl po trojicích). Pokud nic, null.
6. projekt — typ zakázky podle obsahu, vyber JEDNU z následujících hodnot nebo null pokud nelze určit:
   - "Profiformátování" — obecné formátování
   - "Formátování - BP" — bakalářská práce
   - "Formátování - DP" — diplomová / magisterská práce
   - "Formátování - ZP" — závěrečná práce (jiná než BP/DP/disertační), seminární, autoreferát
   - "Vazbičov" — tisk a vazba (převažující požadavek)
   - "Kontrola plagiátorství" — primárně poptávka kontroly plagiátu
   - "Korektura BP" — korektura bakalářské práce (převažuje nad formátováním)
   - "Korektura DP" — korektura diplomové práce (převažuje)
   - "Formátování - BP SK" — slovenská bakalářská
   - "Formátování - DP SK" — slovenská diplomová
   - "Ostatní" — jiný typ

7. services — true/false pro každou službu. Buď VELMI VOLNÝ při detekci. Pokud klient jakýmkoliv způsobem zmiňuje, poptává nebo má ve formulářové poptávce uvedeno danou službu, nastav true. Pouze pokud klient explicitně řekne, že službu nechce, nastav false:
   - formatting: formátování práce, úprava formátu. Cokoliv s „Formátování", „Termín: Formátování", „cena za formátování" atd. → true.
   - proofreading: korektura, jazyková nebo stylistická úprava
   - citations: úprava nebo tvorba citací, zdrojů, bibliografie
   - plagiarismCheck: kontrola plagiátorství / plagiátů
   - aiCheck: kontrola použití AI / strojového textu
   - abstractTranslation: překlad abstraktu (typicky do angličtiny)
   - presentation: tvorba prezentace (PowerPoint, slidy k obhajobě)
   - feedback: zpětná vazba, posudek, doporučení
   - printBinding: tisk a vazba práce
   - copy: copywriting, psaní textů (např. blogy, popisky), úprava SEO textů
   - prepis: přepis textu (např. z naskenovaného PDF, fotografie do Wordu, transkripce audio)

8. deadlineDays — 1, 2, 3, 4 nebo null. Za kolik dní má být práce hotová.
   Příklady: "do 2 dnů" → 2, "za 3 dny" → 3, "do týdne" → null, "co nejrychleji" → null.

9. weekday — "mon", "tue", "wed", "thu", "fri", "sat", "sun" nebo null. Pokud klient specifikuje konkrétní den v týdnu, kdy chce hotovo (např. "do pondělí" → "mon", "v úterý" → "tue", "do pátku" → "fri").

10. formattingPricePerPage — celé číslo (Kč za stránku) nebo null. Pokud klient zmiňuje konkrétní cenu za formátování jedné stránky (např. "máme dohodnuto 38 Kč/stránku", "Cena formátování: 42 Kč"), vrať to číslo. Celkové rozpočty (1500 Kč atd.) → null.

11. signature — který firemní podpis použít. Urči podle e-mailové ADRESY PŘÍJEMCE v e-mailu (typicky řádky „Komu:", „To:", nebo se zmiňuje v hlavičce přesměrování). Vrať JEDNU z hodnot, nebo null pokud nelze určit:
   - "antonin" — pokud přišlo na "jsem@antoninbouchal.cz"
   - "profi" — pokud přišlo na "a.bouchal@profiformatovani.cz" nebo doménu "profiformatovani.cz"
   - "profitasky" — "a.bouchal@profitasky.cz" / doména "profitasky.cz"
   - "bakalarske" — "info@formatovani-bakalarske-prace.cz" / "formatovani-bakalarske-prace.cz"
   - "diplomove" — "info@formatovani-diplomove-prace.cz" / "formatovani-diplomove-prace.cz"
   - "zaverecne" — "info@formatovani-zaverecnych-praci.cz" / "formatovani-zaverecnych-praci.cz"
   - "kontrolaPlagiatorstvi" — "info@kontrola-plagiatorstvi.cz" / "kontrola-plagiatorstvi.cz"
   - "prodocum" — "info@prodocum.cz" / "prodocum.cz"
   - "vazbicov" — "info@vazbicov.cz" / "vazbicov.cz"
   Pokud e-mail příjemce v textu nenajdeš, vrať null. NEHÁDEJ podle obsahu, jen podle adresy příjemce.

12. questionAnswer — string nebo null. Pokud klient položí v e-mailu otázku, vygeneruj stručnou (1-2 věty) profesionální českou odpověď, kterou autor (ProfiFormátování.cz) může zařadit do svojí odpovědi.
   Pro typické otázky o cenách použij ceník:
   - Formátování: 35–50 Kč/strana (35 pro 4 dny, 45 pro 2 dny, 50 pro 1 den)
   - Korektura a stylistika: 75 Kč/normostrana
   - Citace a zdroje: cca 2800 Kč
   - Kontrola plagiátorství: 390 Kč
   - Kontrola AI: 550 Kč
   - Překlad abstraktu: 590 Kč
   - Tvorba prezentace: 2700 Kč
   - Zpětná vazba: 1900 Kč
   - Tisk a vazba: 1050 Kč/ks (1 ks) nebo 950 Kč/ks (2–3 ks), případně 1150/1050 (variantu B)
   Pro otázky o termínech navrhni reálný termín (typicky do 4 dnů).
   Pokud žádná otázka v e-mailu není, vrať null.

Vrať POUZE validní JSON, žádný okolní text:
{
  "salutation": "pani" | "pane" | null,
  "jmeno": string | null,
  "prijmeni": string | null,
  "email": string | null,
  "telefon": string | null,
  "projekt": string | null,
  "services": {
    "formatting": boolean,
    "proofreading": boolean,
    "citations": boolean,
    "plagiarismCheck": boolean,
    "aiCheck": boolean,
    "abstractTranslation": boolean,
    "presentation": boolean,
    "feedback": boolean,
    "printBinding": boolean,
    "copy": boolean,
    "prepis": boolean
  },
  "deadlineDays": 1 | 2 | 3 | 4 | null,
  "weekday": "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null,
  "formattingPricePerPage": number | null,
  "signature": "antonin" | "profi" | "profitasky" | "bakalarske" | "diplomove" | "zaverecne" | "kontrolaPlagiatorstvi" | "prodocum" | "vazbicov" | null,
  "questionAnswer": string | null
}`;

const ALL_SERVICES = [
  "formatting",
  "proofreading",
  "citations",
  "plagiarismCheck",
  "aiCheck",
  "abstractTranslation",
  "presentation",
  "feedback",
  "printBinding",
  "copy",
  "prepis",
];

const VALID_WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const VALID_DEADLINE_DAYS = new Set([1, 2, 3, 4]);
const VALID_SIGNATURES = new Set([
  "antonin",
  "profi",
  "profitasky",
  "bakalarske",
  "diplomove",
  "zaverecne",
  "kontrolaPlagiatorstvi",
  "prodocum",
  "vazbicov",
]);
const VALID_PROJECTS = new Set([
  "Profiformátování",
  "Formátování - BP",
  "Formátování - DP",
  "Formátování - ZP",
  "Diplomka24",
  "Vazbičov",
  "Kontrola plagiátorství",
  "Ostatní",
  "Formátování - BP SK",
  "Formátování - DP SK",
  "Korektura BP",
  "Korektura DP",
]);

function cleanStr(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalize(parsed) {
  const services = {};
  for (const k of ALL_SERVICES) services[k] = Boolean(parsed?.services?.[k]);

  const formattingPricePerPage =
    typeof parsed?.formattingPricePerPage === "number" &&
    parsed.formattingPricePerPage > 0
      ? Math.round(parsed.formattingPricePerPage)
      : null;

  // Pokud klient zmínil cenu formátování, jednoznačně chce formátování.
  if (formattingPricePerPage != null) services.formatting = true;

  const deadlineDays =
    VALID_DEADLINE_DAYS.has(parsed?.deadlineDays) ? parsed.deadlineDays : null;

  const weekday =
    typeof parsed?.weekday === "string" && VALID_WEEKDAYS.has(parsed.weekday)
      ? parsed.weekday
      : null;

  const questionAnswer = cleanStr(parsed?.questionAnswer);

  const projekt =
    typeof parsed?.projekt === "string" && VALID_PROJECTS.has(parsed.projekt)
      ? parsed.projekt
      : null;

  const signature =
    typeof parsed?.signature === "string" && VALID_SIGNATURES.has(parsed.signature)
      ? parsed.signature
      : null;

  // Zpětná kompatibilita: starší prompt vracel `name` (= příjmení). Pokud nové
  // pole `prijmeni` chybí ale `name` je vyplněné, použijeme `name`.
  const legacyName = cleanStr(parsed?.name);

  return {
    salutation:
      parsed?.salutation === "pani" || parsed?.salutation === "pane"
        ? parsed.salutation
        : null,
    jmeno: cleanStr(parsed?.jmeno),
    prijmeni: cleanStr(parsed?.prijmeni) ?? legacyName,
    email: cleanStr(parsed?.email),
    telefon: cleanStr(parsed?.telefon),
    projekt,
    signature,
    services,
    deadlineDays,
    weekday,
    formattingPricePerPage,
    questionAnswer,
  };
}

function buildSystemPrompt(basePrompt) {
  const userInstructions = loadUserInstructions();
  const examples = loadRecentExamples();
  let full = basePrompt;
  if (userInstructions) {
    full += `\n\n=== DALŠÍ POKYNY OD UŽIVATELE APLIKACE ===\n${userInstructions}`;
  }
  if (examples) {
    full += `\n\n=== PŘEDCHOZÍ POVEDENÉ ODPOVĚDI (uč se z reálné komunikace uživatele) ===\n${examples}`;
  }
  return full;
}

const REFINE_PROMPT = `Jsi asistent, který přepisuje krátké české odpovědi na klientské e-maily.
Dostaneš:
1. Původní e-mail klienta.
2. Předchozí návrh odpovědi (může být prázdný).
3. Připomínku od uživatele aplikace, jak má být odpověď upravená.

Vytvoř NOVOU krátkou odpověď podle připomínky. Dodržuj všechna pravidla z DALŠÍCH POKYNŮ
(tón, vykání, stručnost, žádný podpis, žádné AI fráze).

Vrať POUZE samotný text odpovědi — žádný JSON, žádné okolní vysvětlení, žádné uvozovky.`;

export async function refineAnswerWithClaude(clientEmail, previousAnswer, hint) {
  const c = getClient();
  const fullSystem = buildSystemPrompt(REFINE_PROMPT);

  const userMessage = [
    "E-MAIL OD KLIENTA:",
    clientEmail.trim(),
    "",
    "PŘEDCHOZÍ NÁVRH ODPOVĚDI:",
    previousAnswer.trim() || "(žádný)",
    "",
    "PŘIPOMÍNKA OD UŽIVATELE:",
    hint.trim(),
  ].join("\n");

  const response = await c.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: fullSystem,
    messages: [{ role: "user", content: userMessage }],
  });

  return (response.content.find((b) => b.type === "text")?.text || "").trim();
}

export async function parseEmailWithClaude(text) {
  const c = getClient();
  const fullSystem = buildSystemPrompt(SYSTEM_PROMPT);

  const response = await c.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: fullSystem,
    messages: [{ role: "user", content: text }],
  });

  const content = response.content.find((b) => b.type === "text")?.text ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude nevrátil JSON. Odpověď: " + content.slice(0, 200));
  }
  return normalize(JSON.parse(jsonMatch[0]));
}
