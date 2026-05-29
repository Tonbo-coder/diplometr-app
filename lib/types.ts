import type { Deadline, PrintVariant } from "./pricing";

export type DeliveryDays = 1 | 2 | 3 | 4;
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
/** Znění termínu v emailu — buď „za N dnů", nebo konkrétní den v týdnu. */
export type Delivery =
  | { kind: "days"; days: DeliveryDays }
  | { kind: "weekday"; day: Weekday };

export type Metrics = {
  charsWithSpaces: number;
  normostrany: number;
  physicalPages: number;
  /** Varování pokud se nepodařilo extrahovat znaky (např. .doc formát). */
  charsWarning?: string | null;
};

export type Services = {
  formatting: boolean;
  proofreading: boolean;
  citations: boolean;
  plagiarismCheck: boolean;
  aiCheck: boolean;
  abstractTranslation: boolean;
  presentation: boolean;
  feedback: boolean;
  printBinding: boolean;
  /** Copywriting — tracking-only (nezahrnuje se do ceny ani emailu, jen pro Tabidoo). */
  copy: boolean;
  /** Přepis textu — tracking-only. */
  prepis: boolean;
};

export type PrintConfig = {
  variant: PrintVariant;
  copies: number;
};

export type Salutation = "pani" | "pane";
export type SignatureKey =
  | "antonin"
  | "profi"
  | "profitasky"
  | "bakalarske"
  | "diplomove"
  | "zaverecne"
  | "korekturaBP"
  | "korekturaDVP"
  | "kontrolaPlagiatorstvi"
  | "prodocum"
  | "vazbicov";

export type Selections = {
  /** Cenový tarif formátování (drží i ceny pro výpočet). */
  deadline: Deadline;
  /** Znění termínu v emailu (nezávislé na ceně). */
  delivery: Delivery;
  /** Individuální sazba formátování (Kč / fyzická strana). Použije se když deadline === "ind". */
  formattingCustomPerPage: number | null;
  /** Individuální sazba korektury (Kč / normostrana). Když null, použije se 75 Kč/NS. */
  proofreadingCustomPerNS: number | null;
  /** Individuální celkové ceny — přebijí standardní výpočet, pokud nejsou null. */
  citationsCustomTotal: number | null;
  feedbackCustomTotal: number | null;
  presentationCustomTotal: number | null;
  printBindingCustomTotal: number | null;
  services: Services;
  print: PrintConfig;
  /** Pohlaví — určuje "paní" / "pane" v oslovení emailu. */
  salutation: Salutation;
  /** Text v oslovení emailu (typicky příjmení, někdy jen křestní). */
  osloveni: string;
  /** Křestní jméno (plní AI parser, ručně doplníš v Poptávkách). */
  jmeno: string;
  /** Příjmení (plní AI parser, ručně doplníš v Poptávkách). */
  prijmeni: string;
  /** Klientův e-mail (povinné pro odeslání do Tabidoo). */
  email: string;
  telefon: string;
  /** Hodnota Tabidoo dropdownu „Projekt". */
  projekt: string;
  signature: SignatureKey;
  /** Dodatečný řádek (AI odpověď na klientovu otázku) za řádek o termínu v emailu. */
  extraNote: string;
  /** Zda zahrnout extraNote v generovaném emailu. */
  includeExtraNote: boolean;
  /** Text do pole „Poznámky" (karta Základní v Tabidoo). */
  poznamka: string;
  /** Text do pole „Poznámka (moje)" (karta Poznámka v Tabidoo). */
  poznamkaMoje: string;
  /** Čas odevzdání (hh:mm) → Tabidoo „Čas odevzdání" + „Čas vyhotovení". */
  casOdevzdani: string;
  /** Má klient složku s nahranými dokumenty? → Tabidoo „Složka". */
  slozka: boolean;
};

export type Inquiry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "sent_to_tabidoo";
  tabidooRecordId?: string;
  metrics: Metrics | null;
  selections: Selections;
  /** Originální text klientského emailu (pokud byl parsován). */
  clientEmailText: string;
  /** Snapshot celkové ceny v čase uložení. */
  totalPrice: number;
};

export type LineItem = {
  key: keyof Services;
  label: string;
  detail: string;
  amount: number;
};

export type Breakdown = {
  lines: LineItem[];
  total: number;
};
