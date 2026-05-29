import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import {
  analyzeDocx,
  parseClientEmail,
  refineAnswer,
  saveFeedback,
  createInquiry,
} from "@/lib/api";
import { PROJECT_BY_SIGNATURE, TABIDOO_PROJECTS, SIGNATURE_COLORS } from "@/lib/projects";
import { computeBreakdown } from "@/lib/calculator";
import { generateEmail, signatures, toHtml, toPlainText, type EmailDoc } from "@/lib/emailTemplate";
import type {
  Delivery,
  Metrics,
  Selections,
  Services,
  PrintConfig,
  Weekday,
} from "@/lib/types";
import { pricing } from "@/lib/pricing";
import { Button, Card, Checkbox, Pill, SectionTitle, colors } from "@/components/ui";
import { EmailRenderer } from "@/components/EmailRenderer";
import { FilePicker, type PickedAsset } from "@/components/FilePicker";
import { Link, Stack, useNavigation } from "expo-router";

const emptyServices: Services = {
  formatting: true,
  proofreading: false,
  citations: false,
  plagiarismCheck: false,
  aiCheck: false,
  abstractTranslation: false,
  presentation: false,
  feedback: false,
  printBinding: false,
  copy: false,
  prepis: false,
};

const defaultPrint: PrintConfig = { variant: "A", copies: 1 };

const defaultSelections: Selections = {
  deadline: "4d",
  delivery: { kind: "days", days: 4 },
  formattingCustomPerPage: null,
  proofreadingCustomPerNS: null,
  citationsCustomTotal: null,
  feedbackCustomTotal: null,
  presentationCustomTotal: null,
  printBindingCustomTotal: null,
  services: emptyServices,
  print: defaultPrint,
  salutation: "pani",
  osloveni: "",
  jmeno: "",
  prijmeni: "",
  email: "",
  telefon: "",
  projekt: "Profiformátování",
  signature: "profi",
  extraNote: "",
  includeExtraNote: true,
  poznamka: "",
  poznamkaMoje: "",
  casOdevzdani: "",
  slozka: false,
};

const weekdays: { key: Weekday; short: string }[] = [
  { key: "mon", short: "Pondělí" },
  { key: "tue", short: "Úterý" },
  { key: "wed", short: "Středa" },
  { key: "thu", short: "Čtvrtek" },
  { key: "fri", short: "Pátek" },
  { key: "sat", short: "Sobota" },
  { key: "sun", short: "Neděle" },
];

const priceOptions: { key: import("@/lib/pricing").Deadline; label: string }[] = [
  { key: "1d", label: `1 den – ${pricing.formatting.express1DayPerFinalPage} Kč` },
  { key: "2d", label: `2 dny – ${pricing.formatting.express2DaysPerFinalPage} Kč` },
  { key: "4d", label: `4 dny – ${pricing.formatting.express4DaysPerFinalPage} Kč` },
];

const parseNum = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [pickedExt, setPickedExt] = useState<string | null>(null);
  const [sel, setSel] = useState<Selections>(defaultSelections);
  const [clientEmail, setClientEmail] = useState("");
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [converter, setConverterState] = useState<import("@/lib/api").ConverterKind>(() => {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("diplometr.converter");
      if (stored === "cloudconvert" || stored === "convertapi" || stored === "test" || stored === "metadata") {
        return stored;
      }
    }
    return "metadata";
  });

  const setConverter = (v: import("@/lib/api").ConverterKind) => {
    setConverterState(v);
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem("diplometr.converter", v);
    }
  };
  const [lastParsedEmail, setLastParsedEmail] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);
  const [savingInquiry, setSavingInquiry] = useState(false);
  const [inquirySaveError, setInquirySaveError] = useState<string | null>(null);
  const [inquirySaveOk, setInquirySaveOk] = useState<string | null>(null);

  const parseFromEmail = async () => {
    setParseError(null);
    if (!clientEmail.trim()) return;
    setParseLoading(true);
    setAiHint("");
    try {
      const r = await parseClientEmail(clientEmail);
      setLastParsedEmail(clientEmail);
      setSel((s) => {
        // Termín → delivery (a pokud sedí s tarifem, i deadline pro cenu)
        let delivery = s.delivery;
        let deadline = s.deadline;
        if (r.weekday) {
          delivery = { kind: "weekday", day: r.weekday };
        } else if (r.deadlineDays) {
          delivery = { kind: "days", days: r.deadlineDays };
          if (r.deadlineDays === 1) deadline = "1d";
          else if (r.deadlineDays === 2) deadline = "2d";
          else if (r.deadlineDays === 4) deadline = "4d";
        }
        // Podpis: pokud AI rozpoznala podle adresy příjemce, použijeme ho.
        const signature = r.signature ?? s.signature;
        // Projekt: explicitní z AI > odvození z (nového) podpisu > stávající.
        const projekt =
          r.projekt ?? (r.signature ? PROJECT_BY_SIGNATURE[r.signature] : s.projekt);
        // Oslovení v emailu: primárně příjmení, jinak křestní, jinak ponechat stávající
        const osloveni = r.prijmeni ?? r.jmeno ?? s.osloveni;
        return {
          ...s,
          salutation: r.salutation ?? s.salutation,
          osloveni,
          jmeno: r.jmeno ?? s.jmeno,
          prijmeni: r.prijmeni ?? s.prijmeni,
          email: r.email ?? s.email,
          telefon: r.telefon ?? s.telefon,
          projekt,
          signature,
          services: { ...s.services, ...r.services },
          delivery,
          deadline,
          formattingCustomPerPage:
            r.formattingPricePerPage ?? s.formattingCustomPerPage,
          extraNote: r.questionAnswer ?? "",
          includeExtraNote: r.questionAnswer != null,
        };
      });
    } catch (e: any) {
      setParseError(e?.message || "Parsování selhalo");
    } finally {
      setParseLoading(false);
    }
  };

  const breakdown = useMemo(
    () => (metrics ? computeBreakdown(metrics, sel) : null),
    [metrics, sel],
  );
  const emailDoc: EmailDoc = useMemo(
    () => (metrics && breakdown ? generateEmail(metrics, sel, breakdown) : []),
    [metrics, sel, breakdown],
  );
  const emailText = useMemo(() => toPlainText(emailDoc), [emailDoc]);
  const emailHtml = useMemo(() => toHtml(emailDoc), [emailDoc]);
  const emailDocNoSig: EmailDoc = useMemo(
    () => emailDoc.slice(0, emailDoc.length - signatures[sel.signature].length),
    [emailDoc, sel.signature],
  );
  const emailTextNoSig = useMemo(() => toPlainText(emailDocNoSig), [emailDocNoSig]);
  const emailHtmlNoSig = useMemo(() => toHtml(emailDocNoSig), [emailDocNoSig]);

  const handlePickedFile = async (asset: PickedAsset) => {
    setError(null);
    const ext = asset.name.toLowerCase().split(".").pop() ?? null;
    setPickedExt(ext);
    setLoading(true);
    try {
      const m = await analyzeDocx(asset, { converter });
      setMetrics(m);
    } catch (e: any) {
      setError(e?.message || "Nepodařilo se analyzovat soubor.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMetrics(null);
    setSel(defaultSelections);
    setError(null);
    setPickedExt(null);
  };

  const refineAnswerHandler = async () => {
    if (!lastParsedEmail || !aiHint.trim()) return;
    setRefineLoading(true);
    setParseError(null);
    try {
      const newAnswer = await refineAnswer({
        clientEmail: lastParsedEmail,
        previousAnswer: sel.extraNote,
        hint: aiHint,
      });
      setSel((s) => ({ ...s, extraNote: newAnswer, includeExtraNote: true }));
      setAiHint("");
    } catch (e: any) {
      setParseError(e?.message || "Přegenerování selhalo");
    } finally {
      setRefineLoading(false);
    }
  };

  const saveToInquiries = async () => {
    setInquirySaveError(null);
    setInquirySaveOk(null);
    setSavingInquiry(true);
    try {
      const inq = await createInquiry({
        metrics,
        selections: sel,
        clientEmailText: lastParsedEmail ?? clientEmail,
        totalPrice: breakdown?.total ?? 0,
      });
      setInquirySaveOk(
        `Uloženo jako poptávka (${inq.id.slice(0, 8)}…). Najdeš ji v záložce Poptávky.`,
      );
    } catch (e: any) {
      setInquirySaveError(e?.message || "Uložení selhalo");
    } finally {
      setSavingInquiry(false);
    }
  };

  const copyEmail = async () => {
    if (!emailText) return;
    if (Platform.OS === "web") {
      try {
        const nav: any = navigator;
        if (nav.clipboard?.write && typeof ClipboardItem !== "undefined") {
          const item = new ClipboardItem({
            "text/html": new Blob([emailHtml], { type: "text/html" }),
            "text/plain": new Blob([emailText], { type: "text/plain" }),
          });
          await nav.clipboard.write([item]);
        } else {
          await nav.clipboard.writeText(emailText);
        }
        window.alert("Email zkopírován do schránky (s formátováním).");
      } catch (e: any) {
        await Clipboard.setStringAsync(emailText);
        window.alert("Email zkopírován jako prostý text (HTML schránka selhala).");
      }
      void persistFeedbackIfApplicable();
      return;
    }
    await Clipboard.setStringAsync(emailText);
    Alert.alert("Hotovo", "Email zkopírován do schránky.");
    void persistFeedbackIfApplicable();
  };

  const copyEmailNoSig = async () => {
    if (!emailTextNoSig) return;
    if (Platform.OS === "web") {
      try {
        const nav: any = navigator;
        if (nav.clipboard?.write && typeof ClipboardItem !== "undefined") {
          const item = new ClipboardItem({
            "text/html": new Blob([emailHtmlNoSig], { type: "text/html" }),
            "text/plain": new Blob([emailTextNoSig], { type: "text/plain" }),
          });
          await nav.clipboard.write([item]);
        } else {
          await nav.clipboard.writeText(emailTextNoSig);
        }
        window.alert("Email bez podpisu zkopírován do schránky.");
      } catch {
        await Clipboard.setStringAsync(emailTextNoSig);
        window.alert("Email bez podpisu zkopírován jako prostý text.");
      }
      return;
    }
    await Clipboard.setStringAsync(emailTextNoSig);
    Alert.alert("Hotovo", "Email bez podpisu zkopírován do schránky.");
  };

  const persistFeedbackIfApplicable = async () => {
    if (!lastParsedEmail || !sel.includeExtraNote || !sel.extraNote.trim()) return;
    try {
      await saveFeedback({
        clientEmail: lastParsedEmail,
        finalAnswer: sel.extraNote.trim(),
      });
    } catch {
      // ticho — uložení vzoru je best-effort, neblokujeme uživatele
    }
  };

  const shareEmail = async () => {
    if (!emailText) return;
    if (Platform.OS === "web" && (navigator as any).share) {
      try {
        await (navigator as any).share({ text: emailText });
      } catch {}
      return;
    }
    await Share.share({ message: emailText });
  };

  const setMetric = (k: keyof Metrics, v: string) => {
    if (!metrics) return;
    const num = Number(v.replace(",", "."));
    if (Number.isNaN(num)) return;
    setMetrics({ ...metrics, [k]: num });
  };

  const toggleService = (k: keyof Services) =>
    setSel((s) => ({ ...s, services: { ...s.services, [k]: !s.services[k] } }));

  const headerColor = SIGNATURE_COLORS[sel.signature] ?? "#2563EB";
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: headerColor },
      headerTintColor: "#fff",
    });
  }, [headerColor, navigation]);

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ flexDirection: "row", gap: 16, alignSelf: "flex-end", marginBottom: 8, flexWrap: "wrap" }}>
        <Link href="/poptavky" style={{ color: colors.primary, fontWeight: "600" }}>
          Poptávky →
        </Link>
        <Link href="/vzory" style={{ color: colors.primary, fontWeight: "600" }}>
          Vzorové páry →
        </Link>
        <Link href="/podpisy" style={{ color: colors.primary, fontWeight: "600" }}>
          Přehled podpisů →
        </Link>
      </View>

      <Card>
        <SectionTitle>Předvyplnit z e-mailu klienta (volitelné)</SectionTitle>
        <Text style={{ color: colors.muted, marginBottom: 8, fontSize: 13 }}>
          Vlož celé znění e-mailu od klienta a AI předvyplní oslovení, jméno a služby. Pak jen
          doladíš, co je třeba.
        </Text>
        <TextInput
          value={clientEmail}
          onChangeText={setClientEmail}
          multiline
          placeholder="Dobrý den, posílám Vám svoji diplomovou práci. Potřebovala bych formátování a kontrolu plagiátorství. Děkuji, Nováková"
          placeholderTextColor={colors.muted}
          style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
        />
        <View style={{ marginTop: 10 }}>
          <Button
            label={parseLoading ? "Analyzuji…" : "Načíst data z textu"}
            onPress={parseFromEmail}
            disabled={parseLoading || !clientEmail.trim()}
          />
        </View>
        {parseError && (
          <Text style={{ color: colors.danger, marginTop: 8 }}>{parseError}</Text>
        )}
        {sel.extraNote.length > 0 && (
          <View
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              backgroundColor: colors.primarySoft,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>
              Odpověď na otázku klienta (zobrazí se v emailu hned za termínem):
            </Text>
            <TextInput
              value={sel.extraNote}
              onChangeText={(t) => setSel((s) => ({ ...s, extraNote: t }))}
              multiline
              style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
            />
            <View style={{ marginTop: 8 }}>
              <Checkbox
                label="Zahrnout v emailu"
                value={sel.includeExtraNote}
                onChange={(v) => setSel((s) => ({ ...s, includeExtraNote: v }))}
              />
            </View>
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>
                Připomínka pro AI (např. „kratší", „víc formálně", „nezmiňuj termín"):
              </Text>
              <TextInput
                value={aiHint}
                onChangeText={setAiHint}
                placeholder="Stručnější, jen 1 věta…"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <View style={{ marginTop: 8 }}>
                <Button
                  label={refineLoading ? "Přegeneruji…" : "Přegenerovat s připomínkou"}
                  onPress={refineAnswerHandler}
                  variant="secondary"
                  disabled={refineLoading || !aiHint.trim() || !lastParsedEmail}
                />
              </View>
            </View>
          </View>
        )}
      </Card>

      <Card>
        <SectionTitle>1) Nahrání práce (.docx / .odt / .doc)</SectionTitle>
        <Text style={{ color: colors.muted, marginBottom: 6, fontSize: 13 }}>
          Konvertor pro počet stránek:
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }}>
          {(
            [
              ["metadata", "Metadata (doporučeno)"],
              ["cloudconvert", "CloudConvert"],
              ["convertapi", "ConvertAPI"],
              ["test", "Test (50 stran)"],
            ] as const
          ).map(([key, label]) => (
            <Pill
              key={key}
              label={label}
              selected={converter === key}
              onPress={() => setConverter(key)}
            />
          ))}
        </View>
        <FilePicker
          label={metrics ? "Vybrat jiný soubor" : "Vybrat soubor (.docx / .odt / .doc)"}
          disabled={loading}
          onPick={handlePickedFile}
        />
        {pickedExt && (pickedExt === "odt" || pickedExt === "doc") && converter === "metadata" && (
          <View style={{ backgroundColor: "#fff7e6", borderRadius: 8, padding: 12, marginTop: 10, borderLeftWidth: 4, borderLeftColor: "#f59e0b" }}>
            <Text style={{ color: "#92400e", fontWeight: "700", marginBottom: 3 }}>
              Metadata nefungují pro .{pickedExt}
            </Text>
            <Text style={{ color: "#92400e", fontSize: 13 }}>
              Přepni konvertor na <Text style={{ fontWeight: "700" }}>CloudConvert</Text> nebo <Text style={{ fontWeight: "700" }}>ConvertAPI</Text> a nahraj soubor znovu.
            </Text>
          </View>
        )}
        {loading && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
            <ActivityIndicator />
            <Text style={{ color: colors.muted }}>Analyzuji dokument…</Text>
          </View>
        )}
        {error && (
          <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 12, marginTop: 10, borderLeftWidth: 4, borderLeftColor: colors.danger }}>
            <Text style={{ color: "#991b1b", fontWeight: "700", marginBottom: 3 }}>Chyba při analýze</Text>
            <Text style={{ color: "#991b1b", fontSize: 13 }}>{error}</Text>
          </View>
        )}
      </Card>

      {metrics && (
        <>
          <Card>
            <SectionTitle>2) Zjištěné hodnoty (lze přepsat)</SectionTitle>
            {metrics.charsWarning && (
              <View style={{ backgroundColor: "#fff7e6", borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#f59e0b" }}>
                <Text style={{ color: "#92400e", fontWeight: "700", marginBottom: 2 }}>Znaky nelze přečíst</Text>
                <Text style={{ color: "#92400e", fontSize: 13 }}>{metrics.charsWarning}</Text>
              </View>
            )}
            {converter === "metadata" && metrics.physicalPages <= 1 && (
              <View style={{ backgroundColor: "#fff7e6", borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#f59e0b" }}>
                <Text style={{ color: "#92400e", fontWeight: "700", marginBottom: 2 }}>Počet stran vypadá špatně ({metrics.physicalPages})</Text>
                <Text style={{ color: "#92400e", fontSize: 13 }}>Metadata pravděpodobně nejsou aktuální. Zkontroluj hodnotu nebo přepni na CloudConvert / ConvertAPI.</Text>
              </View>
            )}
            <MetricRow
              label="Znaků včetně mezer"
              value={String(metrics.charsWithSpaces)}
              onChange={(v) => setMetric("charsWithSpaces", v)}
            />
            <MetricRow
              label="Normostran (znaky / 1800)"
              value={String(metrics.normostrany)}
              onChange={(v) => setMetric("normostrany", v)}
            />
            <MetricRow
              label="Fyzických stran (Word)"
              value={String(metrics.physicalPages)}
              onChange={(v) => setMetric("physicalPages", v)}
            />
          </Card>

          <Card>
            <SectionTitle>3) Cena</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {priceOptions.map((o) => (
                <Pill
                  key={o.key}
                  label={o.label}
                  selected={sel.deadline === o.key}
                  onPress={() => setSel((s) => ({ ...s, deadline: o.key }))}
                />
              ))}
            </View>
          </Card>

          <Card>
            <SectionTitle>4) Termín dodání (text v emailu)</SectionTitle>
            <Text style={{ color: colors.muted, marginBottom: 6 }}>Za kolik dnů</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {([1, 2, 3, 4] as const).map((n) => (
                <Pill
                  key={n}
                  label={`Za ${n} ${n === 1 ? "den" : n < 5 ? "dny" : "dnů"}`}
                  selected={sel.delivery.kind === "days" && sel.delivery.days === n}
                  onPress={() =>
                    setSel((s) => ({ ...s, delivery: { kind: "days", days: n } as Delivery }))
                  }
                />
              ))}
            </View>
            <Text style={{ color: colors.muted, marginTop: 10, marginBottom: 6 }}>
              nebo konkrétní den
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {weekdays.map((w) => (
                <Pill
                  key={w.key}
                  label={w.short}
                  selected={sel.delivery.kind === "weekday" && sel.delivery.day === w.key}
                  onPress={() =>
                    setSel((s) => ({
                      ...s,
                      delivery: { kind: "weekday", day: w.key } as Delivery,
                    }))
                  }
                />
              ))}
            </View>
          </Card>

          <Card>
            <SectionTitle>5) Služby</SectionTitle>
            <CheckboxWithCustomPrice
              label="Formátování"
              checked={sel.services.formatting}
              onToggle={() => toggleService("formatting")}
              value={sel.formattingCustomPerPage}
              onChange={(v) => setSel((s) => ({ ...s, formattingCustomPerPage: v }))}
              unit="Kč/str."
            />
            <CheckboxWithCustomPrice
              label="Korektura a stylistika"
              checked={sel.services.proofreading}
              onToggle={() => toggleService("proofreading")}
              value={sel.proofreadingCustomPerNS}
              onChange={(v) => setSel((s) => ({ ...s, proofreadingCustomPerNS: v }))}
              unit="Kč/NS"
            />
            <CheckboxWithCustomPrice
              label="Úprava a tvorba citací a zdrojů"
              checked={sel.services.citations}
              onToggle={() => toggleService("citations")}
              value={sel.citationsCustomTotal}
              onChange={(v) => setSel((s) => ({ ...s, citationsCustomTotal: v }))}
            />
            <Checkbox
              label="Kontrola plagiátorství"
              value={sel.services.plagiarismCheck}
              onChange={() => toggleService("plagiarismCheck")}
            />
            <Checkbox
              label="Kontrola použití AI"
              value={sel.services.aiCheck}
              onChange={() => toggleService("aiCheck")}
            />
            <Checkbox
              label="Překlad abstraktu"
              value={sel.services.abstractTranslation}
              onChange={() => toggleService("abstractTranslation")}
            />
            <CheckboxWithCustomPrice
              label="Tvorba prezentace"
              checked={sel.services.presentation}
              onToggle={() => toggleService("presentation")}
              value={sel.presentationCustomTotal}
              onChange={(v) => setSel((s) => ({ ...s, presentationCustomTotal: v }))}
            />
            <CheckboxWithCustomPrice
              label="Zpětná vazba a písemné doporučení"
              checked={sel.services.feedback}
              onToggle={() => toggleService("feedback")}
              value={sel.feedbackCustomTotal}
              onChange={(v) => setSel((s) => ({ ...s, feedbackCustomTotal: v }))}
            />
            <CheckboxWithCustomPrice
              label="Tisk a vazba"
              checked={sel.services.printBinding}
              onToggle={() => toggleService("printBinding")}
              value={sel.printBindingCustomTotal}
              onChange={(v) => setSel((s) => ({ ...s, printBindingCustomTotal: v }))}
            />

            {sel.services.printBinding && sel.printBindingCustomTotal == null && (
              <View style={{ marginTop: 8, paddingLeft: 32 }}>
                <Text style={{ color: colors.muted, marginBottom: 6 }}>Varianta vazby</Text>
                <View style={{ flexDirection: "row" }}>
                  <Pill
                    label="Varianta A"
                    selected={sel.print.variant === "A"}
                    onPress={() => setSel((s) => ({ ...s, print: { ...s.print, variant: "A" } }))}
                  />
                  <Pill
                    label="Varianta B"
                    selected={sel.print.variant === "B"}
                    onPress={() => setSel((s) => ({ ...s, print: { ...s.print, variant: "B" } }))}
                  />
                </View>
                <Text style={{ color: colors.muted, marginTop: 8, marginBottom: 6 }}>Počet kusů</Text>
                <View style={{ flexDirection: "row" }}>
                  {[1, 2, 3].map((c) => (
                    <Pill
                      key={c}
                      label={`${c} ks`}
                      selected={sel.print.copies === c}
                      onPress={() => setSel((s) => ({ ...s, print: { ...s.print, copies: c } }))}
                    />
                  ))}
                </View>
              </View>
            )}
          </Card>

          <Card>
            <SectionTitle>6) Oslovení</SectionTitle>

            <Text style={{ color: colors.muted, marginBottom: 6 }}>Pohlaví</Text>
            <View style={{ flexDirection: "row", marginBottom: 12 }}>
              <Pill
                label="paní"
                selected={sel.salutation === "pani"}
                onPress={() => setSel((s) => ({ ...s, salutation: "pani" }))}
              />
              <Pill
                label="pane"
                selected={sel.salutation === "pane"}
                onPress={() => setSel((s) => ({ ...s, salutation: "pane" }))}
              />
            </View>

            <Text style={{ color: colors.muted, marginBottom: 6 }}>
              Oslovení <Text style={{ color: colors.muted, fontSize: 12 }}>
                (jak ho oslovit v emailu — typicky příjmení)
              </Text>
            </Text>
            <TextInput
              value={sel.osloveni}
              onChangeText={(t) => setSel((s) => ({ ...s, osloveni: t }))}
              placeholder="Nováková"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </Card>

          <Card>
            <SectionTitle>7) Podpis a projekt</SectionTitle>
            <SignaturePicker
              value={sel.signature}
              onChange={(key) => {
                const newProject = PROJECT_BY_SIGNATURE[key];
                setSel((s) => ({ ...s, signature: key, projekt: newProject }));
              }}
            />
          </Card>

          {breakdown && (
            <Card>
              <SectionTitle>8) Rozpis ceny</SectionTitle>
              {breakdown.lines.length === 0 ? (
                <Text style={{ color: colors.muted }}>Žádné služby zatím nejsou vybrány.</Text>
              ) : (
                breakdown.lines.map((l) => (
                  <View key={l.key} style={styles.row}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontWeight: "600", color: colors.text }}>{l.label}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{l.detail}</Text>
                    </View>
                    <Text style={{ fontWeight: "700", color: colors.text }}>{l.amount} Kč</Text>
                  </View>
                ))
              )}
              <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 6 }]}>
                <Text style={{ fontWeight: "800", color: colors.text, fontSize: 16 }}>Celkem</Text>
                <Text style={{ fontWeight: "800", color: colors.primary, fontSize: 18 }}>
                  {breakdown.total} Kč
                </Text>
              </View>
            </Card>
          )}

          <Card>
            <SectionTitle>9) Email pro klienta</SectionTitle>
            <View style={styles.emailBox}>
              <EmailRenderer doc={emailDoc} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Button label="Kopírovat email" onPress={copyEmail} />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Button label="Bez podpisu" onPress={copyEmailNoSig} variant="secondary" />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Button
                  label={savingInquiry ? "Ukládám…" : "Přidat do poptávek"}
                  onPress={saveToInquiries}
                  variant="secondary"
                  disabled={savingInquiry}
                />
              </View>
              <View style={{ flex: 1, minWidth: 100 }}>
                <Button label="Sdílet" onPress={shareEmail} variant="secondary" />
              </View>
              <View style={{ flex: 1, minWidth: 100 }}>
                <Button label="Reset" onPress={reset} variant="danger" />
              </View>
            </View>
            {inquirySaveError && (
              <Text style={{ color: colors.danger, marginTop: 8 }}>{inquirySaveError}</Text>
            )}
            {inquirySaveOk && (
              <Text style={{ color: colors.success, marginTop: 8 }}>{inquirySaveOk}</Text>
            )}
          </Card>
        </>
      )}
    </ScrollView>
    </>
  );
}

const SIGNATURE_OPTIONS: { key: import("@/lib/types").SignatureKey; label: string }[] = [
  { key: "profi", label: "ProfiFormátování.cz" },
  { key: "profitasky", label: "Diplomka24.cz" },
  { key: "bakalarske", label: "Formátování bakalářské práce.cz" },
  { key: "diplomove", label: "Formátování diplomové práce.cz" },
  { key: "zaverecne", label: "Formátování závěrečných prací.cz" },
  { key: "korekturaBP", label: "Korektura bakalářské práce.cz" },
  { key: "korekturaDVP", label: "Korektura diplomové práce.cz" },
  { key: "kontrolaPlagiatorstvi", label: "Kontrola plagiátorství.cz" },
  { key: "prodocum", label: "ProDocum, s.r.o." },
  { key: "vazbicov", label: "Vazbicov.cz" },
  { key: "antonin", label: "Antonín Bouchal (osobní)" },
];

function SignaturePicker({
  value,
  onChange,
}: {
  value: import("@/lib/types").SignatureKey;
  onChange: (k: import("@/lib/types").SignatureKey) => void;
}) {
  if (Platform.OS === "web") {
    // Nativní <select> — nejlepší UX v prohlížeči (klávesnice, search-as-type, mobil)
    return (
      // @ts-expect-error – web-only DOM elementy nejsou v RN typování
      <select
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: 15,
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          backgroundColor: "#fff",
          color: colors.text,
        }}
      >
        {SIGNATURE_OPTIONS.map((o) => (
          // @ts-expect-error – option
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  // Fallback pro nativ — pilulky
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {SIGNATURE_OPTIONS.map((o) => (
        <Pill
          key={o.key}
          label={o.label}
          selected={value === o.key}
          onPress={() => onChange(o.key)}
        />
      ))}
    </View>
  );
}

function ProjectPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  if (Platform.OS === "web") {
    return (
      // @ts-expect-error – web select
      <select
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: 15,
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          backgroundColor: "#fff",
          color: colors.text,
        }}
      >
        {TABIDOO_PROJECTS.map((p) => (
          // @ts-expect-error – option
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    );
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {TABIDOO_PROJECTS.map((p) => (
        <Pill key={p} label={p} selected={value === p} onPress={() => onChange(p)} />
      ))}
    </View>
  );
}

function CheckboxWithCustomPrice({
  label,
  checked,
  onToggle,
  value,
  onChange,
  unit = "Kč",
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 4,
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <Checkbox label={label} value={checked} onChange={onToggle} />
      {checked && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <TextInput
            value={value == null ? "" : String(value)}
            onChangeText={(t) => onChange(parseNum(t))}
            keyboardType="decimal-pad"
            placeholder="indiv."
            placeholderTextColor={colors.muted}
            style={[styles.input, { width: 90, paddingVertical: 6, textAlign: "right" }]}
          />
          <Text style={{ color: colors.muted }}>{unit}</Text>
        </View>
      )}
    </View>
  );
}

function MetricRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={{ color: colors.muted, flex: 1 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={styles.metricInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: colors.text,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  metricInput: {
    minWidth: 100,
    textAlign: "right",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
    color: colors.text,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  emailBox: {
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
