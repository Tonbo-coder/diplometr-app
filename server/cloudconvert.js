import CloudConvert from "cloudconvert";
import pdfParse from "pdf-parse";

let client = null;
function getClient() {
  if (client) return client;
  const key = process.env.CLOUDCONVERT_API_KEY;
  if (!key) throw new Error("CLOUDCONVERT_API_KEY is not set");
  client = new CloudConvert(key);
  return client;
}

function detectFormat(filename) {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "odt") return "odt";
  if (ext === "doc") return "doc";
  return "docx";
}

// Convert .docx / .odt / .doc buffer → PDF via CloudConvert, then count pages.
export async function countPhysicalPages(docxBuffer, filename = "document.docx") {
  const cc = getClient();
  const input_format = detectFormat(filename);

  const job = await cc.jobs.create({
    tasks: {
      "import-1": { operation: "import/upload" },
      "convert-1": {
        operation: "convert",
        input: "import-1",
        input_format,
        output_format: "pdf",
      },
      "export-1": { operation: "export/url", input: "convert-1" },
    },
  });

  const uploadTask = job.tasks.find((t) => t.name === "import-1");
  await cc.tasks.upload(uploadTask, docxBuffer, filename);

  const finished = await cc.jobs.wait(job.id);
  const exportTask = finished.tasks.find(
    (t) => t.name === "export-1" && t.status === "finished",
  );
  if (!exportTask?.result?.files?.[0]?.url) {
    throw new Error("CloudConvert export task did not return a file URL");
  }

  const fileUrl = exportTask.result.files[0].url;
  const pdfRes = await fetch(fileUrl);
  if (!pdfRes.ok) throw new Error(`Failed to download converted PDF: ${pdfRes.status}`);
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  const parsed = await pdfParse(pdfBuffer);
  return parsed.numpages;
}
