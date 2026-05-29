// LibreOffice headless konverze DOCX → PDF, počet stránek přes pdf-parse.
// Dokumenty nikdy neopouštějí náš server — žádná třetí strana.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pdfParse from "pdf-parse";

const SOFFICE = process.env.SOFFICE_PATH || "soffice";
const CONVERT_TIMEOUT_MS = 90_000; // 90 sekund na konverzi

/**
 * Spustí soffice --headless --convert-to pdf a počká na dokončení.
 * Každé volání má vlastní user-profile, aby paralelní volání nekolidovala.
 */
async function runSoffice(docxPath, outDir, profileDir) {
  return new Promise((resolve, reject) => {
    const args = [
      `-env:UserInstallation=file://${profileDir}`,
      "--headless",
      "--nologo",
      "--nofirststartwizard",
      "--convert-to",
      "pdf",
      "--outdir",
      outDir,
      docxPath,
    ];
    const proc = spawn(SOFFICE, args, { timeout: CONVERT_TIMEOUT_MS });
    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`soffice exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

export async function countPhysicalPagesLocal(docxBuffer, originalName = "document.docx") {
  const tmpRoot = path.join(os.tmpdir(), "diplometr-" + randomUUID());
  const profileDir = path.join(tmpRoot, "profile");
  const workDir = path.join(tmpRoot, "work");
  const docxPath = path.join(workDir, "input.docx");
  const pdfPath = path.join(workDir, "input.pdf");

  try {
    await fs.mkdir(profileDir, { recursive: true });
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(docxPath, docxBuffer);

    await runSoffice(docxPath, workDir, profileDir);

    const pdfBuffer = await fs.readFile(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    return parsed.numpages;
  } finally {
    // Cleanup tmp dir
    fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

/** Diagnostic info pro /health endpoint. */
export function localConvertStatus() {
  return {
    sofficePath: SOFFICE,
    timeoutMs: CONVERT_TIMEOUT_MS,
  };
}
