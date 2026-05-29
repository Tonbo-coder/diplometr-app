import JSZip from "jszip";

/**
 * Přečte počet fyzických stran z metadat souboru (bez konverze, offline).
 * - DOCX: docProps/app.xml → <Pages>
 * - ODT:  meta.xml → <meta:page-count>
 * - DOC:  nepodporováno (binární formát)
 */
export async function countPhysicalPagesMetadata(buffer, filename = "") {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "doc") {
    throw new Error(
      "Starý formát .doc nepodporuje čtení metadat. Ulož soubor jako .docx nebo použij CloudConvert."
    );
  }

  const zip = await JSZip.loadAsync(buffer).catch(() => {
    throw new Error("Soubor nelze otevřít jako ZIP. Ujisti se, že jde o platný .docx nebo .odt.");
  });

  if (ext === "odt") {
    const metaFile = zip.file("meta.xml");
    if (!metaFile) throw new Error("meta.xml nenalezen v ODT souboru.");
    const xml = await metaFile.async("string");
    const match = xml.match(/<meta:page-count>(\d+)<\/meta:page-count>/);
    if (!match) throw new Error("Počet stran (<meta:page-count>) nenalezen v metadatech ODT.");
    return parseInt(match[1], 10);
  }

  // DOCX (výchozí)
  const appXml = zip.file("docProps/app.xml");
  if (!appXml) throw new Error("docProps/app.xml nenalezen. Soubor pravděpodobně není platný .docx.");
  const content = await appXml.async("string");
  const match = content.match(/<Pages>(\d+)<\/Pages>/);
  if (!match) throw new Error("Počet stran (<Pages>) nenalezen v metadatech DOCX.");
  return parseInt(match[1], 10);
}
