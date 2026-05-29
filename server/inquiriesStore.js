import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || __dirname;
const INQUIRIES_DIR = path.join(DATA_DIR, "inquiries");

function ensureDir() {
  if (!fs.existsSync(INQUIRIES_DIR)) fs.mkdirSync(INQUIRIES_DIR, { recursive: true });
}

function fileFor(id) {
  // sanitizace id — jen alfanumerické + pomlčky
  const safe = String(id).replace(/[^a-zA-Z0-9-]/g, "");
  if (!safe) throw new Error("Invalid id");
  return path.join(INQUIRIES_DIR, `${safe}.json`);
}

export function listInquiries() {
  ensureDir();
  return fs
    .readdirSync(INQUIRIES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(INQUIRIES_DIR, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function getInquiry(id) {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function createInquiry(data) {
  ensureDir();
  const now = new Date().toISOString();
  const inquiry = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "draft",
    metrics: data.metrics ?? null,
    selections: data.selections ?? {},
    clientEmailText: data.clientEmailText ?? "",
    totalPrice: Number(data.totalPrice) || 0,
  };
  fs.writeFileSync(fileFor(inquiry.id), JSON.stringify(inquiry, null, 2), "utf8");
  return inquiry;
}

export function updateInquiry(id, patch) {
  const existing = getInquiry(id);
  if (!existing) throw new Error("Inquiry not found");
  const updated = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

export function deleteInquiry(id) {
  const file = fileFor(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
