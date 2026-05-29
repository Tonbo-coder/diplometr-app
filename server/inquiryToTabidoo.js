// Mapuje uloženou poptávku (Inquiry) na pole pro Tabidoo tabulku „Objednávky".
// Hodnoty dropdownů musí přesně odpovídat povoleným hodnotám v Tabidoo schématu.

const WEEKDAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function computeDeliveryDateISO(delivery) {
  if (!delivery) return null;
  // Tabidoo očekává plný ISO timestamp ("YYYY-MM-DDT00:00:00.000Z")
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (delivery.kind === "days") {
    const n = Number(delivery.days);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString();
  }
  if (delivery.kind === "weekday") {
    const target = WEEKDAY_INDEX[delivery.day];
    if (target == null) return null;
    const d = new Date(today);
    const diff = (target - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + (diff === 0 ? 7 : diff));
    return d.toISOString();
  }
  return null;
}

export function mapInquiryToTabidooFields(inquiry) {
  const sel = inquiry.selections || {};
  const services = sel.services || {};
  const fields = {};

  // Klient
  if (sel.jmeno) fields.jmeno = sel.jmeno;
  if (sel.prijmeni) fields.prijmeni = sel.prijmeni;
  if (sel.email) {
    // url_link s isMailto v Tabidoo (formát ověřený na existujícím záznamu)
    fields.email = { href: sel.email, description: null, isMailto: true };
  }
  if (sel.telefon) fields.telefon = sel.telefon;
  if (sel.projekt) fields.projekt = sel.projekt;

  // Metriky
  if (inquiry.metrics?.normostrany != null) {
    fields.pocetNSProKorekturu = Number(inquiry.metrics.normostrany);
  }
  if (inquiry.totalPrice) fields.celkovaCena = Number(inquiry.totalPrice);

  // Termín
  const date = computeDeliveryDateISO(sel.delivery);
  if (date) fields.termin = date;

  // Služby — dropdown hodnota „Ano" značí aktivní službu.
  const ANO = "Ano";
  if (services.formatting) fields.formatovani = ANO;
  if (services.proofreading) fields.korektura = ANO;
  if (services.citations) fields.citace = ANO;
  if (services.plagiarismCheck) fields.kontrolaPlag = ANO;
  if (services.abstractTranslation) fields.abstrakt = ANO;
  if (services.presentation) fields.prezentace = ANO;
  if (services.feedback) fields.zpetnaVazba = ANO;
  if (services.printBinding) fields.tiskAVazba = ANO;
  if (services.copy) fields.copy = ANO;
  if (services.prepis) fields.prepis = ANO;

  // Poznámky (karta Základní)
  if (sel.poznamka) fields.poznamky = sel.poznamka;

  // Poznámka (moje) — kombinuje aiCheck + ručně zadaný text
  const myNotes = [];
  if (services.aiCheck) myNotes.push("Kontrola použití AI");
  if (sel.poznamkaMoje) myNotes.push(sel.poznamkaMoje);
  if (myNotes.length > 0) {
    fields.poznamka = `<p>${myNotes.join("</p><p>")}</p>`;
  }

  // Čas odevzdání + čas vyhotovení
  if (sel.casOdevzdani) {
    fields.casOdevzdani = sel.casOdevzdani;
    fields.casVyhotoveni = sel.casOdevzdani;
  }

  // Složka
  if (sel.slozka) fields.slozka = "Ano";

  return fields;
}
