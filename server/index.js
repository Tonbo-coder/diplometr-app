import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: fileURLToPath(new URL(".env", import.meta.url)), override: true });
import express from "express";
import cors from "cors";
import multer from "multer";
import { extractChars } from "./docAnalyzer.js";
import { countPhysicalPages as countPhysicalPagesCloudConvert } from "./cloudconvert.js";
import { countPhysicalPagesConvertApi, convertApiStatus } from "./convertapi.js";
import { countPhysicalPagesMetadata } from "./metadataConvert.js";
import {
  parseEmailWithClaude,
  refineAnswerWithClaude,
  appendFeedback,
  listFeedback,
  deleteFeedbackAt,
  promoteFeedbackAt,
  initDataDir,
} from "./parseEmail.js";
import {
  listInquiries,
  getInquiry,
  createInquiry,
  updateInquiry,
  deleteInquiry,
} from "./inquiriesStore.js";
import { createTabidooRecord, tabidooStatus } from "./tabidooClient.js";
import { mapInquiryToTabidooFields } from "./inquiryToTabidoo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Inicializace persistent volume (production) nebo dev složek
initDataDir();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: "200kb" }));

// ===========================================================================
// Basic auth (jedno heslo pro všechny). V dev se přeskočí, když APP_PASSWORD chybí.
// ===========================================================================
const APP_PASSWORD = process.env.APP_PASSWORD;

function basicAuth(req, res, next) {
  if (!APP_PASSWORD) return next(); // dev mode: bez hesla
  if (req.path === "/health") return next(); // health endpoint bez auth (kvůli Fly checks)

  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const [, pass] = decoded.split(":");
      if (pass === APP_PASSWORD) return next();
    } catch {
      // pokračuje na 401
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Diplometr"');
  res.status(401).send("Authentication required");
}

app.use(basicAuth);

// ===========================================================================
// API
// ===========================================================================
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    converters: {
      cloudconvert: Boolean(process.env.CLOUDCONVERT_API_KEY),
      convertapi: convertApiStatus().configured,
      metadata: true,
      test: true,
    },
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    tabidoo: tabidooStatus(),
    authEnabled: Boolean(APP_PASSWORD),
  });
});

app.post("/api/refine-answer", async (req, res) => {
  try {
    const clientEmail = (req.body?.clientEmail ?? "").toString().trim();
    const previousAnswer = (req.body?.previousAnswer ?? "").toString();
    const hint = (req.body?.hint ?? "").toString().trim();
    if (!clientEmail || !hint) {
      return res.status(400).json({ error: "Chybí clientEmail nebo hint" });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ error: "ANTHROPIC_API_KEY není nastavený." });
    }
    const answer = await refineAnswerWithClaude(clientEmail, previousAnswer, hint);
    res.json({ answer });
  } catch (err) {
    console.error("[/api/refine-answer]", err);
    res.status(500).json({ error: err?.message || "Internal error" });
  }
});

app.get("/api/feedback", async (_req, res) => {
  try {
    const items = await listFeedback();
    res.json({ items });
  } catch (err) {
    console.error("[GET /api/feedback]", err);
    res.status(500).json({ error: err?.message || "Internal error" });
  }
});

app.delete("/api/feedback/:index", async (req, res) => {
  try {
    const i = Number(req.params.index);
    if (!Number.isInteger(i) || i < 0) return res.status(400).json({ error: "Bad index" });
    await deleteFeedbackAt(i);
    res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/feedback]", err);
    res.status(500).json({ error: err?.message || "Internal error" });
  }
});

app.post("/api/feedback/:index/promote", async (req, res) => {
  try {
    const i = Number(req.params.index);
    if (!Number.isInteger(i) || i < 0) return res.status(400).json({ error: "Bad index" });
    await promoteFeedbackAt(i);
    res.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/feedback/promote]", err);
    res.status(500).json({ error: err?.message || "Internal error" });
  }
});

app.post("/api/save-feedback", async (req, res) => {
  try {
    const clientEmail = (req.body?.clientEmail ?? "").toString().trim();
    const finalAnswer = (req.body?.finalAnswer ?? "").toString().trim();
    if (!clientEmail || !finalAnswer) {
      return res.status(400).json({ error: "Chybí clientEmail nebo finalAnswer" });
    }
    await appendFeedback({ clientEmail, finalAnswer });
    res.json({ ok: true });
  } catch (err) {
    console.error("[/api/save-feedback]", err);
    res.status(500).json({ error: err?.message || "Internal error" });
  }
});

app.post("/api/parse-email", async (req, res) => {
  try {
    const text = (req.body?.text ?? "").toString().trim();
    if (!text) return res.status(400).json({ error: "Chybí text e-mailu" });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({
        error:
          "ANTHROPIC_API_KEY není nastavený v server/.env. Získej klíč na console.anthropic.com.",
      });
    }
    const parsed = await parseEmailWithClaude(text);
    res.json(parsed);
  } catch (err) {
    console.error("[/api/parse-email]", err);
    res.status(500).json({ error: err?.message || "Internal error" });
  }
});

/**
 * POST /api/analyze — analýza .docx / .odt / .doc.
 * Query parametr `converter` určuje, jak se spočítá fyzický počet stran:
 *   - cloudconvert (default) — CloudConvert API (5-10/den zdarma)
 *   - convertapi              — ConvertAPI (~250/měsíc zdarma)
 *   - metadata                — metadata DOCX (docProps/app.xml → <Pages>), okamžité, offline
 *   - test                    — bez konverze, vrátí 50 stran
 */
app.post("/api/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing file" });
    const converter = String(req.query.converter || req.body?.converter || "cloudconvert");
    const buffer = req.file.buffer;
    const filename = req.file.originalname || "document.docx";

    let physicalPagesPromise;
    switch (converter) {
      case "test":
        physicalPagesPromise = Promise.resolve(50);
        break;
      case "convertapi":
        physicalPagesPromise = countPhysicalPagesConvertApi(buffer, filename);
        break;
      case "metadata":
        physicalPagesPromise = countPhysicalPagesMetadata(buffer, filename);
        break;
      case "cloudconvert":
      default:
        if (!process.env.CLOUDCONVERT_API_KEY) {
          return res.status(400).json({
            error: "CLOUDCONVERT_API_KEY není nastavený — vyber jiný konvertor nebo doplň klíč.",
          });
        }
        physicalPagesPromise = countPhysicalPagesCloudConvert(buffer, filename);
        break;
    }

    const [charsResult, physicalPages] = await Promise.all([
      extractChars(buffer, filename).then((v) => ({ ok: true, value: v })).catch((e) => ({ ok: false, error: e.message })),
      physicalPagesPromise,
    ]);

    const charsWithSpaces = charsResult.ok ? charsResult.value : 0;
    const normostrany = charsResult.ok ? Math.ceil(charsWithSpaces / 1800) : 0;
    const charsWarning = charsResult.ok ? null : charsResult.error;

    res.json({ charsWithSpaces, normostrany, physicalPages, converter, charsWarning });
  } catch (err) {
    console.error("[/api/analyze]", err);
    res.status(500).json({ error: err?.message || "Internal error" });
  }
});

// ===========================================================================
// Poptávky (inquiries) — CRUD
// ===========================================================================
app.get("/api/inquiries", (_req, res) => {
  try {
    res.json({ items: listInquiries() });
  } catch (err) {
    console.error("[GET /api/inquiries]", err);
    res.status(500).json({ error: err?.message });
  }
});

app.get("/api/inquiries/:id", (req, res) => {
  try {
    const item = getInquiry(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

app.post("/api/inquiries", (req, res) => {
  try {
    const item = createInquiry(req.body || {});
    res.status(201).json(item);
  } catch (err) {
    console.error("[POST /api/inquiries]", err);
    res.status(500).json({ error: err?.message });
  }
});

app.patch("/api/inquiries/:id", (req, res) => {
  try {
    const item = updateInquiry(req.params.id, req.body || {});
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

app.delete("/api/inquiries/:id", (req, res) => {
  try {
    deleteInquiry(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

app.post("/api/inquiries/:id/send-to-tabidoo", async (req, res) => {
  try {
    const inq = getInquiry(req.params.id);
    if (!inq) return res.status(404).json({ error: "Poptávka neexistuje" });
    if (inq.status === "sent_to_tabidoo") {
      return res
        .status(400)
        .json({ error: "Tato poptávka už byla odeslána do Tabidoo.", tabidooRecordId: inq.tabidooRecordId });
    }
    if (!inq.selections?.email) {
      return res.status(400).json({ error: "Chybí e-mail klienta (povinné pro Tabidoo)." });
    }
    const fields = mapInquiryToTabidooFields(inq);
    const record = await createTabidooRecord(fields);
    const updated = updateInquiry(req.params.id, {
      status: "sent_to_tabidoo",
      tabidooRecordId: record.id,
    });
    res.json({ ok: true, inquiry: updated, tabidooRecordId: record.id });
  } catch (err) {
    console.error("[POST /api/inquiries/:id/send-to-tabidoo]", err);
    res.status(500).json({ error: err?.message || "Internal error" });
  }
});

// ===========================================================================
// Static file serving (produkce: Expo web build)
// ===========================================================================
const STATIC_DIR = process.env.STATIC_DIR;
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  // SPA fallback — non-API routes → index.html
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
  console.log(`Serving static files from ${STATIC_DIR}`);
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Diplometr server listening on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠ ANTHROPIC_API_KEY not set — /api/parse-email will 400 until configured.");
  }
  if (!APP_PASSWORD) {
    console.warn("⚠ APP_PASSWORD not set — server běží bez autentifikace (OK pro dev).");
  }
});
