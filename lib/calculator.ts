import { formattingRate, pricing, printPerCopy } from "./pricing";
import type { Breakdown, LineItem, Metrics, Selections } from "./types";

const round = (n: number) => Math.round(n);

export function computeBreakdown(metrics: Metrics, sel: Selections): Breakdown {
  const lines: LineItem[] = [];

  if (sel.services.formatting) {
    const customRate = sel.formattingCustomPerPage;
    const standardRate = formattingRate(sel.deadline);
    const rate = customRate != null ? Math.max(0, customRate) : (standardRate ?? 0);
    const raw = round(rate * metrics.physicalPages);
    const FORMATTING_MIN = 1500;
    const isMinimum = raw < FORMATTING_MIN;
    const amount = isMinimum ? FORMATTING_MIN : raw;
    lines.push({
      key: "formatting",
      label: "Formátování",
      detail: isMinimum
        ? `minimální cena služby (sazba ${rate} Kč/strana)`
        : `${rate} Kč × cca ${metrics.physicalPages} stránek (počítá se finální počet stránek)`,
      amount,
    });
  }

  if (sel.services.proofreading) {
    const isCustom = sel.proofreadingCustomPerNS != null;
    const rate = isCustom
      ? Math.max(0, sel.proofreadingCustomPerNS!)
      : pricing.proofreading.perNormPage;
    const amount = round(rate * metrics.normostrany);
    lines.push({
      key: "proofreading",
      label: "Korektura a stylistika",
      detail: isCustom
        ? `individuální sazba: ${rate} Kč × ${metrics.normostrany} normostran`
        : `${rate} Kč × ${metrics.normostrany} normostran`,
      amount,
    });
  }

  if (sel.services.citations) {
    const isCustom = sel.citationsCustomTotal != null;
    const amount = isCustom
      ? Math.max(0, round(sel.citationsCustomTotal!))
      : pricing.citations.fixedOrApprox;
    lines.push({
      key: "citations",
      label: "Úprava a tvorba citací a zdrojů",
      detail: isCustom ? `individuální cena` : `cca ${pricing.citations.fixedOrApprox} Kč`,
      amount,
    });
  }

  if (sel.services.plagiarismCheck) {
    lines.push({
      key: "plagiarismCheck",
      label: "Kontrola plagiátorství",
      detail: `${pricing.plagiarismCheck} Kč`,
      amount: pricing.plagiarismCheck,
    });
  }

  if (sel.services.aiCheck) {
    lines.push({
      key: "aiCheck",
      label: "Kontrola použití AI (novinka)",
      detail: `${pricing.aiCheck} Kč`,
      amount: pricing.aiCheck,
    });
  }

  if (sel.services.abstractTranslation) {
    lines.push({
      key: "abstractTranslation",
      label: "Překlad abstraktu",
      detail: `${pricing.abstractTranslation} Kč`,
      amount: pricing.abstractTranslation,
    });
  }

  if (sel.services.presentation) {
    const isCustom = sel.presentationCustomTotal != null;
    const amount = isCustom
      ? Math.max(0, round(sel.presentationCustomTotal!))
      : pricing.presentation;
    lines.push({
      key: "presentation",
      label: "Tvorba prezentace",
      detail: isCustom ? `individuální cena` : `${pricing.presentation} Kč`,
      amount,
    });
  }

  if (sel.services.feedback) {
    const isCustom = sel.feedbackCustomTotal != null;
    const amount = isCustom
      ? Math.max(0, round(sel.feedbackCustomTotal!))
      : pricing.feedback;
    lines.push({
      key: "feedback",
      label: "Zpětná vazba a písemné doporučení",
      detail: isCustom ? `individuální cena` : `${pricing.feedback} Kč`,
      amount,
    });
  }

  if (sel.services.printBinding) {
    const isCustom = sel.printBindingCustomTotal != null;
    if (isCustom) {
      lines.push({
        key: "printBinding",
        label: "Tisk a vazba",
        detail: `individuální cena`,
        amount: Math.max(0, round(sel.printBindingCustomTotal!)),
      });
    } else {
      const perCopy = printPerCopy(sel.print.variant, sel.print.copies);
      const amount = round(perCopy * sel.print.copies);
      lines.push({
        key: "printBinding",
        label: "Tisk a vazba",
        detail: `${sel.print.copies} ks × ${perCopy} Kč/ks`,
        amount,
      });
    }
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, total };
}

export function metricsFromChars(charsWithSpaces: number, physicalPages: number): Metrics {
  return {
    charsWithSpaces,
    normostrany: Math.ceil(charsWithSpaces / 1800),
    physicalPages,
  };
}
