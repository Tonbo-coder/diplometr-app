import JSZip from "jszip";

const SKIP_TAGS = new Set([
  "w:del", // smazaný text v režimu sledování změn
  "w:instrText", // kódy polí (např. TOC), nezobrazený text
]);
// Pozn.: textová pole (w:txbxContent), poznámky pod čarou (footnotes.xml)
// a vysvětlivky (endnotes.xml) zahrnujeme — odpovídá zaškrtnutému poli
// „Zahrnout textová pole, poznámky pod čarou a vysvětlivky" v dialogu Wordu.

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Spočítá znaky včetně mezer v document.xml stejnou logikou jako MS Word:
 *  - Sčítá obsah pouze elementů <w:t> (viditelný text).
 *  - Přeskakuje obsah <w:del>, <w:txbxContent>, <w:instrText>.
 *  - Hlavičky/patičky/poznámky pod čarou jsou v jiných XML částech a tato
 *    funkce je ignoruje (Word je standardně do hlavního čísla také nezahrnuje).
 *  - <w:tab/> se počítá jako 1 znak (jak to dělá Word).
 *
 * Vrací počet UTF-16 code units (`text.length`). Pro účely českého textu to
 * odpovídá tomu, co Word zobrazuje v dialogu „Počet slov → Znaky včetně mezer".
 */
function countCharsFromDocumentXml(xml) {
  let pos = 0;
  let count = 0;
  let skipDepth = 0;
  const len = xml.length;

  while (pos < len) {
    const lt = xml.indexOf("<", pos);
    if (lt === -1) break;
    const gt = xml.indexOf(">", lt + 1);
    if (gt === -1) break;

    const raw = xml.substring(lt + 1, gt);
    const isClose = raw.startsWith("/");
    const isSelfClose = raw.endsWith("/");
    const nameMatch = (isClose ? raw.slice(1) : raw).match(/^[\w:.-]+/);
    const tagName = nameMatch ? nameMatch[0] : "";

    if (isClose) {
      if (SKIP_TAGS.has(tagName) && skipDepth > 0) skipDepth--;
      pos = gt + 1;
      continue;
    }

    if (SKIP_TAGS.has(tagName) && !isSelfClose) {
      skipDepth++;
      pos = gt + 1;
      continue;
    }

    if (skipDepth === 0) {
      if (tagName === "w:t" && !isSelfClose) {
        // Najdi nejbližší </w:t> a sečti délku textu uvnitř.
        const closeIdx = xml.indexOf("</w:t>", gt + 1);
        if (closeIdx === -1) break;
        const text = decodeEntities(xml.substring(gt + 1, closeIdx));
        count += text.length;
        pos = closeIdx + "</w:t>".length;
        continue;
      }
      if (tagName === "w:tab") {
        // <w:tab/> = 1 znak (jak to počítá Word)
        count += 1;
      }
    }

    pos = gt + 1;
  }

  return count;
}

/**
 * Extrahuje počet znaků včetně mezer z ODT souboru (content.xml).
 * Zpracovává <text:s c:c="N"/> (N mezer), <text:tab/> (tabulátor), ostatní tagy odstraní.
 * Počítá pouze obsah <office:text> (tělo dokumentu bez stylů a metadat).
 */
async function extractCharsFromOdt(buffer) {
  const zip = await JSZip.loadAsync(buffer).catch(() => {
    throw new Error("Soubor nelze otevřít jako ZIP. Ujisti se, že jde o platný .odt.");
  });

  const contentFile = zip.file("content.xml");
  if (!contentFile) throw new Error("content.xml nenalezen v ODT souboru.");
  let xml = await contentFile.async("string");

  // Extrahuj jen tělo dokumentu (<office:text>)
  const bodyStart = xml.indexOf("<office:text");
  const bodyEnd = xml.lastIndexOf("</office:text>");
  if (bodyStart !== -1 && bodyEnd !== -1) {
    xml = xml.substring(bodyStart, bodyEnd + "</office:text>".length);
  }

  // <text:s c:c="N"/> → N mezer (výchozí 1)
  xml = xml.replace(/<text:s(?:\s[^>]*)?\s*\/>/g, (m) => {
    const n = m.match(/c:c="(\d+)"/);
    return " ".repeat(n ? parseInt(n[1], 10) : 1);
  });
  // <text:tab/> → tabulátor
  xml = xml.replace(/<text:tab(?:\s[^>]*)?\s*\/>/g, "\t");
  // <text:line-break/> → newline
  xml = xml.replace(/<text:line-break(?:\s[^>]*)?\s*\/>/g, "\n");
  // Odstraň zbývající XML tagy
  xml = xml.replace(/<[^>]+>/g, "");
  // Dekóduj entity
  xml = decodeEntities(xml);

  return xml.length;
}

/**
 * Extrahuje počet znaků včetně mezer z .docx souboru. Pokud document.xml chybí,
 * sáhne po `<CharactersWithSpaces>` v `docProps/app.xml` jako hluboký fallback.
 */
export async function extractCharsFromDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    const appXmlFile = zip.file("docProps/app.xml");
    if (appXmlFile) {
      const xml = await appXmlFile.async("string");
      const m = xml.match(/<CharactersWithSpaces>(\d+)<\/CharactersWithSpaces>/);
      if (m) return parseInt(m[1], 10);
    }
    throw new Error("Invalid .docx: missing word/document.xml");
  }

  // Hlavní text + textová pole (txbxContent zůstává v document.xml a počítá se).
  let total = countCharsFromDocumentXml(await docFile.async("string"));

  // Poznámky pod čarou a vysvětlivky jsou v samostatných XML souborech.
  for (const path of ["word/footnotes.xml", "word/endnotes.xml"]) {
    const file = zip.file(path);
    if (!file) continue;
    total += countCharsFromDocumentXml(await file.async("string"));
  }

  return total;
}

/**
 * Dispečer: extrahuje znaky včetně mezer podle přípony souboru.
 * - .docx → word/document.xml
 * - .odt  → content.xml
 * - .doc  → chyba (binární formát bez parseru)
 */
export async function extractChars(buffer, filename = "") {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "doc") {
    throw new Error(
      "Starý formát .doc nepodporuje analýzu znaků. Ulož soubor jako .docx nebo použij cloud konvertor."
    );
  }
  if (ext === "odt") return extractCharsFromOdt(buffer);
  return extractCharsFromDocx(buffer);
}
