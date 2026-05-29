import pdfParse from "pdf-parse";

const BASE = "https://v2.convertapi.com";

/**
 * Konverze DOCX → PDF přes ConvertAPI a počet stran přes pdf-parse.
 * Vyžaduje proměnnou CONVERTAPI_TOKEN.
 */
const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  doc: "application/msword",
};

function detectFormat(filename) {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "odt" || ext === "doc") return ext;
  return "docx";
}

export async function countPhysicalPagesConvertApi(docxBuffer, filename = "document.docx") {
  const token = process.env.CONVERTAPI_TOKEN;
  if (!token) throw new Error("CONVERTAPI_TOKEN není nastavený v .env");

  const fmt = detectFormat(filename);
  const form = new FormData();
  const blob = new Blob([docxBuffer], { type: MIME[fmt] });
  form.append("File", blob, filename);
  form.append("StoreFile", "false"); // vrátí Base64 přímo, žádné URL k souboru

  const url = `${BASE}/convert/${fmt}/to/pdf?Secret=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: "POST", body: form });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ConvertAPI ${res.status}: ${t.slice(0, 300)}`);
  }

  const data = await res.json();
  const fileData = data?.Files?.[0]?.FileData;
  if (!fileData) {
    throw new Error("ConvertAPI nevrátil PDF data: " + JSON.stringify(data).slice(0, 200));
  }

  const pdfBuffer = Buffer.from(fileData, "base64");
  const parsed = await pdfParse(pdfBuffer);
  return parsed.numpages;
}

export function convertApiStatus() {
  return { configured: Boolean(process.env.CONVERTAPI_TOKEN) };
}
