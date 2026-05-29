import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";

import {
  analyzeDocx,
  deleteInquiry,
  getInquiry,
  parseClientEmail,
  sendInquiryToTabidoo,
  updateInquiry,
} from "@/lib/api";
import type {
  Delivery,
  Inquiry,
  Metrics,
  Selections,
  Services,
  Weekday,
} from "@/lib/types";
import { computeBreakdown } from "@/lib/calculator";
import { TABIDOO_PROJECTS, PROJECT_BY_SIGNATURE, PROJECT_COLORS } from "@/lib/projects";
import { Button, Card, Checkbox, Pill, SectionTitle, colors } from "@/components/ui";
import { FilePicker, type PickedAsset } from "@/components/FilePicker";

const weekdays: { key: Weekday; short: string }[] = [
  { key: "mon", short: "Pondělí" },
  { key: "tue", short: "Úterý" },
  { key: "wed", short: "Středa" },
  { key: "thu", short: "Čtvrtek" },
  { key: "fri", short: "Pátek" },
  { key: "sat", short: "Sobota" },
  { key: "sun", short: "Neděle" },
];

const parseNum = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Zelená akcentová paleta pro detail — vizuálně odliší od hlavní stránky.
const ACCENT = colors.success;
const ACCENT_SOFT = colors.successSoft;

function getHeaderColor(projekt: string): string {
  return PROJECT_COLORS[projekt as keyof typeof PROJECT_COLORS] ?? ACCENT;
}

export default function PoptavkaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [sel, setSel] = useState<Selections | null>(null);
  const [clientEmail, setClientEmail] = useState("");
  const [reparseBusy, setReparseBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [pickedExt, setPickedExt] = useState<string | null>(null);
  const [tabidooBusy, setTabidooBusy] = useState(false);
  const [tabidooMsg, setTabidooMsg] = useState<string | null>(null);
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

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        const inq = await getInquiry(id);
        setInquiry(inq);
        setMetrics(inq.metrics);
        setSel({
          poznamka: "",
          poznamkaMoje: "",
          casOdevzdani: "",
          slozka: false,
          ...inq.selections,
        });
        setClientEmail(inq.clientEmailText || "");
      } catch (e: any) {
        setError(e?.message || "Nepodařilo se načíst poptávku");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const breakdown = useMemo(
    () => (metrics && sel ? computeBreakdown(metrics, sel) : null),
    [metrics, sel],
  );

  const handleSave = async () => {
    if (!sel || !id) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const updated = await updateInquiry(id, {
        metrics,
        selections: sel,
        clientEmailText: clientEmail,
        totalPrice: breakdown?.total ?? 0,
      });
      setInquiry(updated);
      setSaveMsg("Uloženo.");
    } catch (e: any) {
      setSaveMsg(`Uložení selhalo: ${e?.message}`);
    } finally {
      setSaveBusy(false);
    }
  };

  const handleReparse = async () => {
    if (!clientEmail.trim() || !sel) return;
    setReparseBusy(true);
    try {
      const r = await parseClientEmail(clientEmail);
      let delivery = sel.delivery;
      let deadline = sel.deadline;
      if (r.weekday) {
        delivery = { kind: "weekday", day: r.weekday };
      } else if (r.deadlineDays) {
        delivery = { kind: "days", days: r.deadlineDays };
        if (r.deadlineDays === 1) deadline = "1d";
        else if (r.deadlineDays === 2) deadline = "2d";
        else if (r.deadlineDays === 4) deadline = "4d";
      }
      const signature = r.signature ?? sel.signature;
      const projekt =
        r.projekt ?? (r.signature ? PROJECT_BY_SIGNATURE[r.signature] : sel.projekt);
      const osloveni = r.prijmeni ?? r.jmeno ?? sel.osloveni;
      setSel({
        ...sel,
        salutation: r.salutation ?? sel.salutation,
        osloveni,
        jmeno: r.jmeno ?? sel.jmeno,
        prijmeni: r.prijmeni ?? sel.prijmeni,
        email: r.email ?? sel.email,
        telefon: r.telefon ?? sel.telefon,
        projekt,
        signature,
        services: { ...sel.services, ...r.services },
        delivery,
        deadline,
        formattingCustomPerPage:
          r.formattingPricePerPage ?? sel.formattingCustomPerPage,
        extraNote: r.questionAnswer ?? sel.extraNote,
        includeExtraNote: r.questionAnswer != null ? true : sel.includeExtraNote,
      });
    } catch (e: any) {
      setError(e?.message || "Re-parse selhal");
    } finally {
      setReparseBusy(false);
    }
  };

  const confirmAction = (msg: string) =>
    Platform.OS === "web" ? window.confirm(msg) : true;

  const handleDelete = async () => {
    if (!id) return;
    if (!confirmAction("Opravdu smazat tuto poptávku?")) return;
    try {
      await deleteInquiry(id);
      router.replace("/poptavky");
    } catch (e: any) {
      setError(e?.message || "Smazání selhalo");
    }
  };

  const handleSendToTabidoo = async () => {
    if (!id) return;
    setTabidooBusy(true);
    setTabidooMsg(null);
    try {
      // ulož aktuální stav před odesláním
      await updateInquiry(id, {
        metrics,
        selections: sel ?? undefined,
        clientEmailText: clientEmail,
        totalPrice: breakdown?.total ?? 0,
      });
      const r = await sendInquiryToTabidoo(id);
      setInquiry(r.inquiry);
      setTabidooMsg(`Odesláno do Tabidoo (ID: ${r.tabidooRecordId.slice(0, 8)}…).`);
    } catch (e: any) {
      setTabidooMsg(`Chyba: ${e?.message}`);
    } finally {
      setTabidooBusy(false);
    }
  };

  const handlePickedFile = async (asset: PickedAsset) => {
    setError(null);
    const ext = asset.name.toLowerCase().split(".").pop() ?? null;
    setPickedExt(ext);
    setDocUploadBusy(true);
    try {
      const m = await analyzeDocx(asset, { converter });
      setMetrics(m);
    } catch (e: any) {
      setError(e?.message || "Nepodařilo se analyzovat soubor.");
    } finally {
      setDocUploadBusy(false);
    }
  };

  if (loading || !sel) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Detail poptávky",
            headerStyle: { backgroundColor: inquiry ? getHeaderColor(inquiry.selections.projekt) : ACCENT },
            headerTintColor: "#fff",
          }}
        />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
          {error ? (
            <Text style={{ color: colors.danger, padding: 20 }}>{error}</Text>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </>
    );
  }

  const setMetric = (k: keyof Metrics, v: string) => {
    if (!metrics) return;
    const num = Number(v.replace(",", "."));
    if (Number.isNaN(num)) return;
    setMetrics({ ...metrics, [k]: num });
  };

  const toggleService = (k: keyof Services) =>
    setSel({ ...sel, services: { ...sel.services, [k]: !sel.services[k] } });

  return (
    <>
      <Stack.Screen
        options={{
          title: inquiry?.selections.osloveni
            ? `Poptávka — ${inquiry.selections.osloveni}`
            : "Poptávka",
          headerStyle: { backgroundColor: getHeaderColor(sel.projekt) },
          headerTintColor: "#fff",
        }}
      />
      <ScrollView style={[styles.screen, { backgroundColor: ACCENT_SOFT }]} contentContainerStyle={styles.content}>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {inquiry ? new Date(inquiry.createdAt).toLocaleString("cs-CZ") : ""}
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: "#fff",
                backgroundColor:
                  inquiry?.status === "sent_to_tabidoo" ? colors.success : colors.muted,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
              }}
            >
              {inquiry?.status === "sent_to_tabidoo" ? "v Tabidoo" : "draft"}
            </Text>
          </View>
        </Card>

        {/* AI re-parse z textu */}
        <Card>
          <SectionTitle>Doplnit / aktualizovat z e-mailu klienta</SectionTitle>
          <Text style={{ color: colors.muted, marginBottom: 8, fontSize: 13 }}>
            Pokud klient pošle další zprávu (potvrzení nebo upřesnění), vlož ji sem a klikni
            „Re-parse". AI vyplněná pole přepíše / doplní.
          </Text>
          <TextInput
            value={clientEmail}
            onChangeText={setClientEmail}
            multiline
            placeholder="Text e-mailu od klienta…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
          />
          <View style={{ marginTop: 10 }}>
            <Button
              label={reparseBusy ? "Analyzuji…" : "Re-parse z textu"}
              onPress={handleReparse}
              disabled={reparseBusy || !clientEmail.trim()}
              accent={ACCENT}
            />
          </View>
        </Card>

        {/* Re-parse ze souboru */}
        <Card>
          <SectionTitle>Re-parse ze souboru</SectionTitle>
          <Text style={{ color: colors.muted, marginBottom: 8, fontSize: 13 }}>
            Když máš novou verzi práce, nahraj ji znovu — přepíšeme metriky (znaky,
            normostrany, fyzické strany).
          </Text>
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
                accent={ACCENT}
              />
            ))}
          </View>
          <FilePicker
            label={docUploadBusy ? "Analyzuji…" : "Vybrat soubor (.docx / .odt / .doc)"}
            disabled={docUploadBusy}
            accent={ACCENT}
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
          {error && (
            <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 12, marginTop: 10, borderLeftWidth: 4, borderLeftColor: ACCENT }}>
              <Text style={{ color: "#991b1b", fontWeight: "700", marginBottom: 3 }}>Chyba při analýze</Text>
              <Text style={{ color: "#991b1b", fontSize: 13 }}>{error}</Text>
            </View>
          )}
        </Card>

        {/* Klient */}
        <Card>
          <SectionTitle>Klient</SectionTitle>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Field label="Jméno" style={{ flex: 1, minWidth: 140 }}>
              <TextInput
                value={sel.jmeno}
                onChangeText={(t) => setSel({ ...sel, jmeno: t })}
                placeholder="Jana"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </Field>
            <Field label="Příjmení" style={{ flex: 1, minWidth: 140 }}>
              <TextInput
                value={sel.prijmeni}
                onChangeText={(t) => setSel({ ...sel, prijmeni: t })}
                placeholder="Nováková"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </Field>
          </View>
          <Field label="E-mail">
            <TextInput
              value={sel.email}
              onChangeText={(t) => setSel({ ...sel, email: t })}
              placeholder="novakova@example.cz"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
          </Field>
          <Field label="Telefon">
            <TextInput
              value={sel.telefon}
              onChangeText={(t) => setSel({ ...sel, telefon: t })}
              placeholder="+420 123 456 789"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </Field>
          <Field label="Projekt">
            <DropdownSelect
              value={sel.projekt}
              options={TABIDOO_PROJECTS.map((p) => ({ key: p, label: p }))}
              onChange={(v) => setSel({ ...sel, projekt: v })}
            />
          </Field>
        </Card>

        {/* Metriky */}
        {metrics && (
          <Card>
            <SectionTitle>Metriky práce</SectionTitle>
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
              label="Normostran"
              value={String(metrics.normostrany)}
              onChange={(v) => setMetric("normostrany", v)}
            />
            <MetricRow
              label="Fyzických stran"
              value={String(metrics.physicalPages)}
              onChange={(v) => setMetric("physicalPages", v)}
            />
          </Card>
        )}

        {/* Termín */}
        <Card>
          <SectionTitle>Termín dodání</SectionTitle>
          <Text style={{ color: colors.muted, marginBottom: 6 }}>Za kolik dnů</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {([1, 2, 3, 4] as const).map((n) => (
              <Pill
                key={n}
                label={`Za ${n} ${n === 1 ? "den" : "dny"}`}
                selected={sel.delivery.kind === "days" && sel.delivery.days === n}
                onPress={() =>
                  setSel({ ...sel, delivery: { kind: "days", days: n } as Delivery })
                }
                accent={ACCENT}
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
                  setSel({
                    ...sel,
                    delivery: { kind: "weekday", day: w.key } as Delivery,
                  })
                }
                accent={ACCENT}
              />
            ))}
          </View>
          <Field label="Čas odevzdání" style={{ marginTop: 12 }}>
            {Platform.OS === "web" ? (
              // @ts-expect-error web
              <input
                type="time"
                value={sel.casOdevzdani}
                onChange={(e: any) => setSel({ ...sel, casOdevzdani: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 15,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  backgroundColor: "#fff",
                  color: colors.text,
                  boxSizing: "border-box",
                }}
              />
            ) : (
              <TextInput
                value={sel.casOdevzdani}
                onChangeText={(t) => setSel({ ...sel, casOdevzdani: t })}
                placeholder="HH:MM"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                style={styles.input}
              />
            )}
          </Field>
        </Card>

        {/* Služby */}
        <Card>
          <SectionTitle>Služby</SectionTitle>
          <ServiceRow
            label="Formátování"
            checked={sel.services.formatting}
            onToggle={() => toggleService("formatting")}
            value={sel.formattingCustomPerPage}
            onChange={(v) => setSel({ ...sel, formattingCustomPerPage: v })}
            unit="Kč/str."
          />
          <ServiceRow
            label="Korektura a stylistika"
            checked={sel.services.proofreading}
            onToggle={() => toggleService("proofreading")}
            value={sel.proofreadingCustomPerNS}
            onChange={(v) => setSel({ ...sel, proofreadingCustomPerNS: v })}
            unit="Kč/NS"
          />
          <ServiceRow
            label="Úprava a tvorba citací a zdrojů"
            checked={sel.services.citations}
            onToggle={() => toggleService("citations")}
            value={sel.citationsCustomTotal}
            onChange={(v) => setSel({ ...sel, citationsCustomTotal: v })}
          />
          <Checkbox
            label="Kontrola plagiátorství"
            value={sel.services.plagiarismCheck}
            onChange={() => toggleService("plagiarismCheck")}
          />
          <View>
            <Checkbox
              label="Kontrola použití AI"
              value={sel.services.aiCheck}
              onChange={() => toggleService("aiCheck")}
            />
            {sel.services.aiCheck && (
              <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 32, fontStyle: "italic" }}>
                ↳ při odeslání do Tabidoo se zapíše jako text do pole „Poznámka (moje)".
              </Text>
            )}
          </View>
          <Checkbox
            label="Překlad abstraktu"
            value={sel.services.abstractTranslation}
            onChange={() => toggleService("abstractTranslation")}
          />
          <Checkbox
            label="Copy (copywriting)"
            value={sel.services.copy}
            onChange={() => toggleService("copy")}
          />
          <Checkbox
            label="Přepis textu"
            value={sel.services.prepis}
            onChange={() => toggleService("prepis")}
          />
          <ServiceRow
            label="Tvorba prezentace"
            checked={sel.services.presentation}
            onToggle={() => toggleService("presentation")}
            value={sel.presentationCustomTotal}
            onChange={(v) => setSel({ ...sel, presentationCustomTotal: v })}
          />
          <ServiceRow
            label="Zpětná vazba a písemné doporučení"
            checked={sel.services.feedback}
            onToggle={() => toggleService("feedback")}
            value={sel.feedbackCustomTotal}
            onChange={(v) => setSel({ ...sel, feedbackCustomTotal: v })}
          />
          <ServiceRow
            label="Tisk a vazba"
            checked={sel.services.printBinding}
            onToggle={() => toggleService("printBinding")}
            value={sel.printBindingCustomTotal}
            onChange={(v) => setSel({ ...sel, printBindingCustomTotal: v })}
          />
          {sel.services.printBinding && sel.printBindingCustomTotal == null && (
            <View style={{ marginTop: 8, paddingLeft: 32 }}>
              <Text style={{ color: colors.muted, marginBottom: 6 }}>Varianta vazby</Text>
              <View style={{ flexDirection: "row" }}>
                <Pill
                  label="Varianta A"
                  selected={sel.print.variant === "A"}
                  onPress={() => setSel({ ...sel, print: { ...sel.print, variant: "A" } })}
                  accent={ACCENT}
                />
                <Pill
                  label="Varianta B"
                  selected={sel.print.variant === "B"}
                  onPress={() => setSel({ ...sel, print: { ...sel.print, variant: "B" } })}
                  accent={ACCENT}
                />
              </View>
              <Text style={{ color: colors.muted, marginTop: 8, marginBottom: 6 }}>
                Počet kusů
              </Text>
              <View style={{ flexDirection: "row" }}>
                {[1, 2, 3].map((c) => (
                  <Pill
                    key={c}
                    label={`${c} ks`}
                    selected={sel.print.copies === c}
                    onPress={() => setSel({ ...sel, print: { ...sel.print, copies: c } })}
                    accent={ACCENT}
                  />
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Složka + Poznámky */}
        <Card>
          <SectionTitle>Poznámky</SectionTitle>
          <View style={{ marginBottom: 10 }}>
            <Checkbox
              label="Složka (klient má nahranou složku)"
              value={sel.slozka}
              onChange={(v) => setSel({ ...sel, slozka: v })}
            />
          </View>
          <Field label="Text do poznámky (Tabidoo → Poznámky / Základní)">
            <TextInput
              value={sel.poznamka}
              onChangeText={(t) => setSel({ ...sel, poznamka: t })}
              multiline
              placeholder="Poznámky k zakázce…"
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
            />
          </Field>
          <Field label="Poznámka (moje) (Tabidoo → Poznámka (moje))">
            <TextInput
              value={sel.poznamkaMoje}
              onChangeText={(t) => setSel({ ...sel, poznamkaMoje: t })}
              multiline
              placeholder="Interní poznámka…"
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
            />
          </Field>
        </Card>

        {/* Rozpis ceny */}
        {breakdown && (
          <Card>
            <SectionTitle>Rozpis ceny</SectionTitle>
            {breakdown.lines.map((l) => (
              <View key={l.key} style={styles.row}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontWeight: "600", color: colors.text }}>{l.label}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{l.detail}</Text>
                </View>
                <Text style={{ fontWeight: "700", color: colors.text }}>{l.amount} Kč</Text>
              </View>
            ))}
            <View
              style={[
                styles.row,
                {
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: 10,
                  marginTop: 6,
                },
              ]}
            >
              <Text style={{ fontWeight: "800", color: colors.text, fontSize: 16 }}>
                Celkem
              </Text>
              <Text style={{ fontWeight: "800", color: ACCENT, fontSize: 18 }}>
                {breakdown.total} Kč
              </Text>
            </View>
          </Card>
        )}

        {/* Tabidoo */}
        <Card>
          <SectionTitle>Odeslat do Tabidoo</SectionTitle>
          {inquiry?.status === "sent_to_tabidoo" ? (
            <View>
              <Text style={{ color: colors.success, fontWeight: "700", marginBottom: 4 }}>
                ✓ Záznam v Tabidoo vytvořen
              </Text>
              <Text selectable style={{ color: colors.muted, fontSize: 12 }}>
                ID: {inquiry.tabidooRecordId}
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 10 }}>
                Vytvoří nový řádek v tabulce „Objednávky" v Tabidoo. Vyžaduje e-mail
                klienta. Po odeslání se status přepne na „v Tabidoo".
              </Text>
              <Button
                label={tabidooBusy ? "Odesílám…" : "Přidat do Tabidoo"}
                onPress={handleSendToTabidoo}
                disabled={tabidooBusy || !sel.email}
                accent={ACCENT}
              />
              {!sel.email && (
                <Text style={{ color: colors.danger, marginTop: 8, fontSize: 13 }}>
                  Doplň prosím e-mail klienta v sekci „Klient".
                </Text>
              )}
            </>
          )}
          {tabidooMsg && (
            <Text
              style={{
                marginTop: 8,
                color: tabidooMsg.startsWith("Chyba") ? colors.danger : colors.success,
              }}
            >
              {tabidooMsg}
            </Text>
          )}
        </Card>

        {/* Akce */}
        <Card>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Button
                label={saveBusy ? "Ukládám…" : "Uložit změny"}
                onPress={handleSave}
                disabled={saveBusy}
                accent={ACCENT}
              />
            </View>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Button label="Smazat poptávku" onPress={handleDelete} variant="danger" />
            </View>
          </View>
          {saveMsg && (
            <Text
              style={{
                marginTop: 8,
                color: saveMsg.startsWith("Uložení selhalo") ? colors.danger : colors.success,
              }}
            >
              {saveMsg}
            </Text>
          )}
        </Card>
      </ScrollView>
    </>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View style={[{ marginTop: 10 }, style]}>
      <Text style={{ color: colors.muted, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

function DropdownSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { key: string; label: string }[];
  onChange: (v: string) => void;
}) {
  if (Platform.OS === "web") {
    return (
      // @ts-expect-error web
      <select
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: 15,
          border: `1px solid ${ACCENT}`,
          borderRadius: 10,
          backgroundColor: "#fff",
          color: colors.text,
        }}
      >
        {options.map((o) => (
          // @ts-expect-error option
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {options.map((o) => (
        <Pill
          key={o.key}
          label={o.label}
          selected={value === o.key}
          onPress={() => onChange(o.key)}
          accent={ACCENT}
        />
      ))}
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

function ServiceRow({
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
  metricRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
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
