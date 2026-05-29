import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Metrics } from "./types";

// V produkci (web build hostovaný stejným serverem jako API) chceme relativní
// URL → fetch jde na stejný origin. V dev (nebo když je apiBaseUrl explicitně
// nastavený) použijeme tu adresu. Na nativu (Expo Go) potřebujeme absolutní URL.
function resolveBaseUrl(): string {
  if (Platform.OS === "web") {
    // V prohlížeči: pokud běžíme přes Expo Metro (localhost), backend je na :4000.
    // Jinak (produkce na Fly.io) → relativní URL na stejný origin.
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      const isDev = host === "localhost" || host === "127.0.0.1";
      if (isDev) {
        const fromConfig = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
        return fromConfig || "http://localhost:4000";
      }
      return ""; // produkce: stejný origin
    }
    return "";
  }
  // Nativní (Expo Go) — vyžaduje absolutní URL z config nebo localhost
  return (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "http://localhost:4000";
}

const baseUrl = resolveBaseUrl();

export type PickedFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
  file?: File | Blob | null;
};

export type ConverterKind = "cloudconvert" | "convertapi" | "metadata" | "test";

export async function analyzeDocx(
  picked: PickedFile,
  opts: { converter?: ConverterKind } = {},
): Promise<Metrics> {
  const form = new FormData();
  const filename = picked.name || "document.docx";
  const mime =
    picked.mimeType ||
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (Platform.OS === "web") {
    let blob: Blob | null = picked.file ?? null;
    if (!blob) {
      const res = await fetch(picked.uri);
      blob = await res.blob();
    }
    form.append("file", blob, filename);
  } else {
    // @ts-expect-error RN-specific file shape
    form.append("file", { uri: picked.uri, name: filename, type: mime });
  }

  const converter = opts.converter ?? "cloudconvert";
  const url = `${baseUrl}/api/analyze?converter=${encodeURIComponent(converter)}`;
  const res = await fetch(url, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Chyba serveru (${res.status})`);
  }

  return (await res.json()) as Metrics;
}

export type ParsedEmail = {
  salutation: "pani" | "pane" | null;
  jmeno: string | null;
  prijmeni: string | null;
  email: string | null;
  telefon: string | null;
  projekt: string | null;
  signature:
    | "antonin"
    | "profi"
    | "profitasky"
    | "bakalarske"
    | "diplomove"
    | "zaverecne"
    | "kontrolaPlagiatorstvi"
    | "prodocum"
    | "vazbicov"
    | null;
  services: {
    formatting: boolean;
    proofreading: boolean;
    citations: boolean;
    plagiarismCheck: boolean;
    aiCheck: boolean;
    abstractTranslation: boolean;
    presentation: boolean;
    feedback: boolean;
    printBinding: boolean;
    copy: boolean;
    prepis: boolean;
  };
  deadlineDays: 1 | 2 | 3 | 4 | null;
  weekday: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null;
  formattingPricePerPage: number | null;
  questionAnswer: string | null;
};

export async function parseClientEmail(text: string): Promise<ParsedEmail> {
  const res = await fetch(`${baseUrl}/api/parse-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Parse failed (${res.status}): ${body || res.statusText}`);
  }
  return (await res.json()) as ParsedEmail;
}

export async function refineAnswer(args: {
  clientEmail: string;
  previousAnswer: string;
  hint: string;
}): Promise<string> {
  const res = await fetch(`${baseUrl}/api/refine-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Refine failed (${res.status}): ${body || res.statusText}`);
  }
  const data = (await res.json()) as { answer: string };
  return data.answer;
}

export async function saveFeedback(args: {
  clientEmail: string;
  finalAnswer: string;
}): Promise<void> {
  const res = await fetch(`${baseUrl}/api/save-feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Save failed (${res.status}): ${body || res.statusText}`);
  }
}

export type FeedbackEntry = {
  clientEmail: string;
  finalAnswer: string;
  timestamp: string;
};

export async function listFeedback(): Promise<FeedbackEntry[]> {
  const res = await fetch(`${baseUrl}/api/feedback`);
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  const data = (await res.json()) as { items: FeedbackEntry[] };
  return data.items;
}

export async function deleteFeedback(index: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/feedback/${index}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

export async function promoteFeedback(index: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/feedback/${index}/promote`, { method: "POST" });
  if (!res.ok) throw new Error(`Promote failed (${res.status})`);
}

// ============================================================================
// Poptávky (inquiries)
// ============================================================================
import type { Inquiry, Metrics, Selections } from "./types";

export async function listInquiries(): Promise<Inquiry[]> {
  const res = await fetch(`${baseUrl}/api/inquiries`);
  if (!res.ok) throw new Error(`List inquiries failed (${res.status})`);
  const data = (await res.json()) as { items: Inquiry[] };
  return data.items;
}

export async function getInquiry(id: string): Promise<Inquiry> {
  const res = await fetch(`${baseUrl}/api/inquiries/${id}`);
  if (!res.ok) throw new Error(`Get inquiry failed (${res.status})`);
  return (await res.json()) as Inquiry;
}

export async function createInquiry(payload: {
  metrics: Metrics | null;
  selections: Selections;
  clientEmailText: string;
  totalPrice: number;
}): Promise<Inquiry> {
  const res = await fetch(`${baseUrl}/api/inquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create inquiry failed (${res.status})`);
  return (await res.json()) as Inquiry;
}

export async function updateInquiry(id: string, patch: Partial<Inquiry>): Promise<Inquiry> {
  const res = await fetch(`${baseUrl}/api/inquiries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update inquiry failed (${res.status})`);
  return (await res.json()) as Inquiry;
}

export async function deleteInquiry(id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/inquiries/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete inquiry failed (${res.status})`);
}

export async function sendInquiryToTabidoo(
  id: string,
): Promise<{ inquiry: Inquiry; tabidooRecordId: string }> {
  const res = await fetch(`${baseUrl}/api/inquiries/${id}/send-to-tabidoo`, {
    method: "POST",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Tabidoo POST failed (${res.status})`);
  }
  return body as { inquiry: Inquiry; tabidooRecordId: string };
}
