import { formattingRate, pricing, printPerCopy } from "./pricing";
import type { Breakdown, Delivery, Metrics, Selections, SignatureKey } from "./types";

export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  /** Velikost písma v px (HTML použije pt, preview px). */
  sizePx?: number;
  /** Když pravdivý odkaz, řádek dostane <a href> v HTML. */
  href?: string;
  /** Nastav na první Run řádku — přidá nad řádek tenkou čáru této barvy (jen v šířce textu). */
  borderTopColor?: string;
  /** Pokud nastaveno, Run se vykreslí jako <img> (text = alt). */
  imageSrc?: string;
  imageWidth?: number;
  imageHeight?: number;
  /** Nastav na první Run řádku — užší line-height (menší mezera k dalšímu řádku). */
  tight?: boolean;
};
export type Line = Run[];
/** Speciální položka: logo vlevo + sloupec textových řádků vpravo (2-cellová tabulka). */
export type SplitRow = { splitRow: true; leftImage: Run; right: Line[] };
export type DocItem = Line | SplitRow;
export type EmailDoc = DocItem[];

export function isSplitRow(item: DocItem): item is SplitRow {
  return !Array.isArray(item) && (item as SplitRow).splitRow === true;
}

const weekdayGenitive: Record<string, string> = {
  mon: "pondělí",
  tue: "úterý",
  wed: "středy",
  thu: "čtvrtka",
  fri: "pátku",
  sat: "soboty",
  sun: "neděle",
};

function deliverySentence(d: Delivery): string {
  if (d.kind === "weekday") {
    return `Budete ji mít hotovou během ${weekdayGenitive[d.day]}.`;
  }
  if (d.days === 1) return "Budete ji mít hotovou během zítřka.";
  return `Budete ji mít hotovou do ${d.days} dnů.`;
}

// ============================================================================
// PODPISY — jednotná šablona, akcentová barva pro popisky a značku,
// neutrální barva pro hodnoty. Pořadí: pozdrav | tel | email | web | (IČO) | brand | tagline
// ============================================================================

type SignatureDef = {
  /** Hlavní (akcentová) barva pro popisky a značku. */
  accent: string;
  /** Barva hodnot a jména. Default #444444. */
  neutral?: string;
  /** Barva horní linky. Default = accent. */
  borderColor?: string;
  /** Jméno na prvním řádku. Default „Bc. Antonín Bouchal". */
  name?: string;
  tel?: string;
  email?: string;
  web?: string;
  ico?: string;
  /** Název značky pod kontakty (slightly larger, accent, bold). */
  brand?: string;
  /** Případná druhá značka (např. právnická osoba pod brand). */
  subbrand?: string;
  /** Italikový slogan na samém konci. */
  tagline?: string;
  /** Loga na úplném konci, řazená vedle sebe. */
  images?: { src: string; width: number; height: number; href?: string; alt?: string }[];
  /** Logo vlevo od textu (split layout, dvousloupcová tabulka). Vylučuje se s `images`. */
  imageLeft?: { src: string; width: number; height: number; href?: string; alt?: string };
  /** Když true, „S přátelským pozdravem" a jméno jsou na samostatných řádcích (kratší řádky, vhodné na mobil). */
  splitGreeting?: boolean;
};

const DEFAULT_NEUTRAL = "#444444";
const BRAND_SIZE_PX = 16;

export const SIGNATURE_LABELS: Record<SignatureKey, string> = {
  antonin: "Antonín Bouchal",
  profi: "ProfiFormátování.cz",
  profitasky: "Diplomka24.cz",
  bakalarske: "Formátování bakalářské práce.cz",
  diplomove: "Formátování diplomové práce.cz",
  zaverecne: "Formátování závěrečných prací.cz",
  korekturaBP: "Korektura bakalářské práce.cz",
  korekturaDVP: "Korektura diplomové práce.cz",
  kontrolaPlagiatorstvi: "Kontrola plagiátorství.cz",
  prodocum: "ProDocum, s.r.o.",
  vazbicov: "Vazbicov.cz",
};

const SIGNATURE_DEFS: Record<SignatureKey, SignatureDef> = {
  antonin: {
    accent: "#ec430f",
    tel: "+420 736 729 646",
    email: "jsem@antoninbouchal.cz",
    web: "https://www.antoninbouchal.cz/",
    splitGreeting: true,
    imageLeft: {
      src: "https://www.antoninbouchal.cz/images/logo-bouchal-antonin2.png",
      width: 96,
      height: 70,
      href: "https://www.antoninbouchal.cz/",
      alt: "Antonín Bouchal",
    },
  },
  profi: {
    accent: "#2861FF",
    neutral: "#000000",
    tel: "+420 736 729 646",
    email: "a.bouchal@profiformatovani.cz",
    web: "https://www.profiformatovani.cz",
    brand: "ProfiFormátování.cz",
    images: [
      {
        src: "https://www.profiformatovani.cz/LOGO-Profiformatovani.png",
        width: 200,
        height: 47,
        href: "https://www.profiformatovani.cz/",
        alt: "ProfiFormátování.cz",
      },
    ],
  },
  profitasky: {
    accent: "#2861FF",
    neutral: "#000000",
    tel: "+420 736 729 646",
    email: "a.bouchal@profiformatovani.cz",
    web: "https://www.profiformatovani.cz",
    brand: "ProfiFormátování.cz",
    images: [
      {
        src: "https://www.profiformatovani.cz/LOGO-Profiformatovani.png",
        width: 200,
        height: 47,
        href: "https://www.profiformatovani.cz/",
        alt: "ProfiFormátování.cz",
      },
    ],
  },
  bakalarske: {
    accent: "#2c5699",
    borderColor: "#0b5394",
    tel: "+420 736 729 646",
    email: "info@formatovani-bakalarske-prace.cz",
    brand: "Formátování bakalářské práce.cz",
  },
  diplomove: {
    accent: "#00826b",
    neutral: "#3b3838",
    tel: "+420 736 729 646",
    email: "info@formatovani-diplomove-prace.cz",
    brand: "Formátování diplomové práce.cz",
  },
  zaverecne: {
    accent: "#7ab317",
    tel: "+420 736 729 646",
    email: "info@formatovani-zaverecnych-praci.cz",
    brand: "Formátování závěrečných prací.cz",
    tagline: "Profesionálně, rychle a s osobním přístupem.",
  },
  kontrolaPlagiatorstvi: {
    accent: "#e06666",
    neutral: "#666666",
    tel: "+420 736 729 646",
    email: "info@kontrola-plagiatorstvi.cz",
    web: "https://kontrola-plagiatorstvi.cz",
    brand: "Kontrola plagiátorství.cz",
    images: [
      {
        src: "https://kontrola-plagiatorstvi.cz/images/kontrola-plagiatorstvi-logo.png",
        width: 96,
        height: 24,
        href: "https://kontrola-plagiatorstvi.cz/",
        alt: "Kontrola plagiátorství",
      },
      {
        src: "https://www.profiformatovani.cz/images/LOGO-R11.png",
        width: 96,
        height: 22,
        href: "https://www.profiformatovani.cz/",
        alt: "ProfiFormátování.cz",
      },
      {
        src: "https://www.profiformatovani.cz/images/vazbicov2.png",
        width: 96,
        height: 23,
        href: "https://vazbicov.cz/",
        alt: "Vazbicov.cz",
      },
    ],
  },
  korekturaBP: {
    accent: "#001f3e",
    tel: "+420 736 729 646",
    email: "info@korektura-bakalarske-prace.cz",
    brand: "Korektura bakalářské práce.cz",
  },
  korekturaDVP: {
    accent: "#1a7a68",
    tel: "+420 736 729 646",
    email: "info@korektura-diplomove-prace.cz",
    brand: "Korektura diplomové práce.cz",
  },
  prodocum: {
    accent: "#5b5fef",
    neutral: "#1f2937",
    name: "ProDocum, s.r.o.",
    tel: "+420 736 729 646",
    email: "info@prodocum.cz",
    web: "https://www.prodocum.cz",
    ico: "10745041",
    tagline: "Vše pro vaše dokumenty na jednom místě.",
  },
  vazbicov: {
    accent: "#ff9900",
    neutral: "#666666",
    tel: "+420 736 729 646",
    email: "info@vazbicov.cz",
    web: "https://vazbicov.cz",
    brand: "Vazbicov.cz",
    images: [
      {
        src: "https://www.profiformatovani.cz/images/vazbicov2.png",
        width: 96,
        height: 23,
        href: "https://vazbicov.cz/",
        alt: "Vazbicov.cz",
      },
    ],
  },
};

function makeSignature(def: SignatureDef): EmailDoc {
  const accent = def.accent;
  const neutral = def.neutral ?? DEFAULT_NEUTRAL;
  const border = def.borderColor ?? accent;
  const name = def.name ?? "Bc. Antonín Bouchal";

  const lines: EmailDoc = [];

  // Pozdrav + jméno (s horní linkou v šířce textu)
  if (def.splitGreeting) {
    lines.push([
      {
        text: "S přátelským pozdravem",
        bold: true,
        color: accent,
        borderTopColor: border,
        sizePx: 17,
        tight: true,
      },
    ]);
    lines.push([{ text: name, bold: true, color: neutral, sizePx: 17, tight: true }]);
  } else {
    lines.push([
      { text: "S přátelským pozdravem", bold: true, color: accent, borderTopColor: border },
      { text: " ", bold: true },
      { text: name, bold: true, color: neutral },
    ]);
  }

  if (def.tel) {
    const telHref = `tel:${def.tel.replace(/\s+/g, "")}`;
    lines.push([
      { text: "Tel.: ", bold: true, color: accent },
      { text: def.tel, bold: true, color: neutral, href: telHref },
    ]);
  }

  if (def.email) {
    lines.push([
      { text: "E-mail: ", bold: true, color: accent },
      { text: def.email, bold: true, color: neutral, href: `mailto:${def.email}` },
    ]);
  }

  if (def.web) {
    const display = def.web.replace(/^https?:\/\//, "").replace(/\/$/, "");
    lines.push([
      { text: "Web: ", bold: true, color: accent },
      { text: display, bold: true, color: neutral, href: def.web },
    ]);
  }

  if (def.ico) {
    lines.push([
      { text: "IČO: ", bold: true, color: accent },
      { text: def.ico, bold: true, color: neutral },
    ]);
  }

  if (def.brand) {
    lines.push([{ text: def.brand, bold: true, color: accent, sizePx: BRAND_SIZE_PX }]);
  }

  if (def.subbrand) {
    lines.push([{ text: def.subbrand, bold: true, color: accent, sizePx: BRAND_SIZE_PX }]);
  }

  if (def.tagline) {
    lines.push([{ text: def.tagline, italic: true, color: neutral }]);
  }

  if (def.images && def.images.length > 0) {
    lines.push(
      def.images.map((img) => ({
        text: img.alt ?? "",
        imageSrc: img.src,
        imageWidth: img.width,
        imageHeight: img.height,
        href: img.href,
      })),
    );
  }

  // Pokud je nastaveno imageLeft, vrátíme split layout místo flat lines.
  if (def.imageLeft) {
    const splitRow: SplitRow = {
      splitRow: true,
      leftImage: {
        text: def.imageLeft.alt ?? "",
        imageSrc: def.imageLeft.src,
        imageWidth: def.imageLeft.width,
        imageHeight: def.imageLeft.height,
        href: def.imageLeft.href,
      },
      right: lines,
    };
    return [splitRow];
  }

  return lines;
}

export const signatures: Record<SignatureKey, EmailDoc> = Object.fromEntries(
  (Object.keys(SIGNATURE_DEFS) as SignatureKey[]).map((k) => [k, makeSignature(SIGNATURE_DEFS[k])]),
) as Record<SignatureKey, EmailDoc>;

// ============================================================================

const T = (text: string): Line => [{ text }];
const EMPTY: Line = [];

export function generateEmail(
  metrics: Metrics,
  sel: Selections,
  breakdown: Breakdown,
): EmailDoc {
  const salutationWord = sel.salutation === "pani" ? "paní" : "pane";
  const name = sel.osloveni.trim() || "…";

  const doc: EmailDoc = [];
  doc.push(T(`Dobrý den ${salutationWord} ${name},`));
  doc.push(EMPTY);
  doc.push(T(`děkuji za zaslání Vaší práce. ${deliverySentence(sel.delivery)}`));
  if (sel.includeExtraNote && sel.extraNote.trim()) {
    doc.push(EMPTY);
    doc.push(T(sel.extraNote.trim()));
  }
  doc.push(EMPTY);
  doc.push(T("Cena Vaší práce je:"));

  if (sel.services.formatting) {
    const customRate = sel.formattingCustomPerPage;
    const standardRate = formattingRate(sel.deadline);
    const rate = customRate != null ? Math.max(0, customRate) : (standardRate ?? 0);
    const amount = breakdown.lines.find((l) => l.key === "formatting")?.amount ?? 0;
    const raw = Math.round(rate * metrics.physicalPages);
    if (raw < 1500) {
      // V italic řádku: individuální sazba (pokud zadaná), jinak tarifní sazba.
      const infoRate = customRate ?? standardRate ?? 0;
      doc.push(T(`Formátování: 1 500 Kč (minimální cena služby).`));
      doc.push([
        {
          text: `u většího rozsahu je cena počítána dle finálního počtu stran: ${infoRate} Kč / stránka`,
          italic: true,
          sizePx: 12,
          color: "#6b7280",
        },
      ]);
    } else {
      doc.push(
        T(
          `Formátování: ${rate} Kč × cca ${metrics.physicalPages} stránek (počítá se finální počet stránek) = ${amount} Kč`,
        ),
      );
    }
  }
  if (sel.services.proofreading) {
    const isCustom = sel.proofreadingCustomPerNS != null;
    const rate = isCustom
      ? Math.max(0, sel.proofreadingCustomPerNS!)
      : pricing.proofreading.perNormPage;
    const amount = breakdown.lines.find((l) => l.key === "proofreading")?.amount ?? 0;
    doc.push(T(`Korektura a stylistika: ${rate} Kč × ${metrics.normostrany} normostran = ${amount} Kč`));
  }
  if (sel.services.citations) {
    const amount =
      sel.citationsCustomTotal != null
        ? (breakdown.lines.find((l) => l.key === "citations")?.amount ?? 0)
        : pricing.citations.fixedOrApprox;
    doc.push(T(`Úprava a tvorba citací a zdrojů: cca ${amount} Kč`));
  }
  if (sel.services.plagiarismCheck) {
    doc.push(T(`Kontrola plagiátorství: ${pricing.plagiarismCheck} Kč`));
  }
  if (sel.services.aiCheck) {
    doc.push(T(`Kontrola použití AI (novinka): ${pricing.aiCheck} Kč`));
  }
  if (sel.services.abstractTranslation) {
    doc.push(T(`Překlad abstraktu: ${pricing.abstractTranslation} Kč`));
  }
  if (sel.services.presentation) {
    const amount =
      sel.presentationCustomTotal != null
        ? (breakdown.lines.find((l) => l.key === "presentation")?.amount ?? 0)
        : pricing.presentation;
    doc.push(T(`Tvorba prezentace: ${amount} Kč`));
  }
  if (sel.services.feedback) {
    const amount =
      sel.feedbackCustomTotal != null
        ? (breakdown.lines.find((l) => l.key === "feedback")?.amount ?? 0)
        : pricing.feedback;
    doc.push(T(`Zpětná vazba a písemné doporučení: ${amount} Kč`));
  }
  if (sel.services.printBinding) {
    if (sel.printBindingCustomTotal != null) {
      const amount = breakdown.lines.find((l) => l.key === "printBinding")?.amount ?? 0;
      doc.push(T(`Tisk a vazba: ${amount} Kč`));
    } else {
      if (sel.print.copies <= 1) {
        const v =
          sel.print.variant === "A"
            ? pricing.printBinding.variantA
            : pricing.printBinding.variantB;
        doc.push(
          T(`Tisk a vazba: 1 ks = ${v.oneCopy} Kč / ks | 2–3 ks = ${v.twoToThreeCopies} Kč / ks`),
        );
      } else {
        const perCopy = printPerCopy(sel.print.variant, sel.print.copies);
        doc.push(T(`Tisk a vazba: ${sel.print.copies} ks = ${perCopy} Kč / ks`));
      }
    }
  }

  const selectedCount = Object.values(sel.services).filter(Boolean).length;
  if (selectedCount > 1) {
    doc.push(EMPTY);
    doc.push(T("Samozřejmě si můžete vybrat všechny nebo jenom některé služby."));
  }
  doc.push(EMPTY);
  doc.push(T("Platební údaje zasíláme až s vyhotovenou prací, nemusíte tedy platit nic dopředu."));
  doc.push(EMPTY);
  doc.push([{ text: "Prosím o potvrzení a dáme se do práce. 🙂", bold: true }]);
  for (const line of signatures[sel.signature]) doc.push(line);

  return doc;
}

export function toPlainText(doc: EmailDoc): string {
  return doc
    .map((item) => {
      if (isSplitRow(item)) {
        // V plain textu logo vynecháme, vypíšeme jen pravý sloupec textu.
        return item.right.map((line) => line.map((r) => r.text).join("")).join("\n");
      }
      return item.map((r) => r.text).join("");
    })
    .join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function runHtml(r: Run): string {
  if (r.imageSrc) {
    const dim = [
      r.imageWidth ? `width="${r.imageWidth}"` : "",
      r.imageHeight ? `height="${r.imageHeight}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    let img = `<img src="${r.imageSrc}" alt="${escapeHtml(r.text)}" ${dim} style="margin-right:10px;vertical-align:middle">`;
    if (r.href) img = `<a href="${r.href}">${img}</a>`;
    return img;
  }
  let html = escapeHtml(r.text);
  if (r.href) html = `<a href="${r.href}">${html}</a>`;
  const styles: string[] = [];
  if (r.color) styles.push(`color:${r.color}`);
  if (r.sizePx) styles.push(`font-size:${r.sizePx}px`);
  if (styles.length > 0) html = `<span style="${styles.join(";")}">${html}</span>`;
  if (r.italic) html = `<i>${html}</i>`;
  if (r.bold) html = `<b>${html}</b>`;
  return html;
}

function renderLineHtml(line: Line, firstInBlock = false): string {
  if (line.length === 0) return "<div><br></div>";
  const inner = line.map(runHtml).join("");
  const borderColor = line[0]?.borderTopColor;
  const tight = line[0]?.tight;
  const lh = tight ? "line-height:1.15" : "";
  if (borderColor) {
    const mt = firstInBlock ? 0 : 24;
    const tdStyle = ["padding-top:2px", lh].filter(Boolean).join(";");
    return `<table cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${borderColor};margin-top:${mt}px"><tr><td style="${tdStyle}">${inner}</td></tr></table>`;
  }
  const hasImage = line.some((r) => r.imageSrc);
  const styles = [hasImage ? "margin-top:12px" : "", lh].filter(Boolean);
  const styleAttr = styles.length > 0 ? ` style="${styles.join(";")}"` : "";
  return `<div${styleAttr}>${inner}</div>`;
}

export function toHtml(doc: EmailDoc): string {
  return doc
    .map((item) => {
      if (isSplitRow(item)) {
        const leftHtml = runHtml(item.leftImage);
        const rightHtml = item.right
          .map((line, i) => renderLineHtml(line, i === 0))
          .join("");
        return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr><td valign="top" style="padding-right:6px">${leftHtml}</td><td valign="top">${rightHtml}</td></tr></table>`;
      }
      return renderLineHtml(item);
    })
    .join("");
}
