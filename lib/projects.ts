import type { SignatureKey } from "./types";

/** Hodnoty dropdownu „Projekt" v Tabidoo tabulce Objednávky. */
export const TABIDOO_PROJECTS = [
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
] as const;

export type TabidooProject = (typeof TABIDOO_PROJECTS)[number];

/** Výchozí přiřazení projektu na základě vybraného podpisu. */
export const PROJECT_BY_SIGNATURE: Record<SignatureKey, TabidooProject> = {
  profi: "Profiformátování",
  profitasky: "Diplomka24",
  bakalarske: "Formátování - BP",
  diplomove: "Formátování - DP",
  zaverecne: "Formátování - ZP",
  korekturaBP: "Korektura BP",
  korekturaDVP: "Korektura DP",
  kontrolaPlagiatorstvi: "Kontrola plagiátorství",
  vazbicov: "Vazbičov",
  prodocum: "Ostatní",
  antonin: "Ostatní",
};

/** Barva hlavičky dle Tabidoo projektu (hex). */
export const PROJECT_COLORS: Record<TabidooProject, string> = {
  "Profiformátování": "#2861FF",
  "Diplomka24": "#2e286d",
  "Formátování - BP": "#2c5699",
  "Formátování - DP": "#00826b",
  "Formátování - ZP": "#7ab317",
  "Vazbičov": "#ff9900",
  "Kontrola plagiátorství": "#e06666",
  "Ostatní": "#ec430f",
  "Formátování - BP SK": "#2766ff",
  "Formátování - DP SK": "#12ba55",
  "Korektura BP": "#001f3e",
  "Korektura DP": "#1a7a68",
};

/** Barva hlavičky detailu poptávky dle podpisu (hex) — shoduje se s accent barvou podpisu. */
export const SIGNATURE_COLORS: Record<SignatureKey, string> = {
  antonin: "#ec430f",
  profi: "#2861FF",
  profitasky: "#2e286d",
  bakalarske: "#2c5699",
  diplomove: "#00826b",
  zaverecne: "#7ab317",
  korekturaBP: "#001f3e",
  korekturaDVP: "#1a7a68",
  kontrolaPlagiatorstvi: "#e06666",
  vazbicov: "#ff9900",
  prodocum: "#5b5fef",
};
