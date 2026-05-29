import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";

import {
  deleteFeedback,
  listFeedback,
  promoteFeedback,
  type FeedbackEntry,
} from "@/lib/api";
import { Button, Card, SectionTitle, colors } from "@/components/ui";

export default function Vzory() {
  const [items, setItems] = useState<FeedbackEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listFeedback();
      setItems(data);
    } catch (e: any) {
      setError(e?.message || "Načtení selhalo");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmAction = (msg: string) => {
    if (Platform.OS === "web") return window.confirm(msg);
    return true;
  };

  const handleDelete = async (i: number) => {
    if (!confirmAction("Opravdu smazat tento vzor? Nelze vrátit.")) return;
    setBusy(i);
    try {
      await deleteFeedback(i);
      await load();
    } catch (e: any) {
      setError(e?.message || "Smazání selhalo");
    } finally {
      setBusy(null);
    }
  };

  const handlePromote = async (i: number) => {
    if (
      !confirmAction(
        "Povýšit tento vzor na trvalé pravidlo? Přidá se do server/instructions/99-vzory-z-praxe.md a zmizí z logu.",
      )
    )
      return;
    setBusy(i);
    try {
      await promoteFeedback(i);
      await load();
    } catch (e: any) {
      setError(e?.message || "Povýšení selhalo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Vzorové páry" }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>Naučené vzory (KLIENT → ODPOVĚĎ)</SectionTitle>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Tyto páry se ukládají automaticky pokaždé, když klikneš „Kopírovat email" a
            máš zaškrtnuto „Zahrnout v emailu". Posledních 50 záznamů parser používá
            jako vzorové odpovědi.
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 20, marginTop: 8 }}>
            <Text style={{ fontWeight: "700" }}>Smazat</Text> — vyhodí záznam z log.jsonl.{"\n"}
            <Text style={{ fontWeight: "700" }}>Povýšit do pravidel</Text> — přesune do
            trvalého souboru `instructions/99-vzory-z-praxe.md`.
          </Text>
        </Card>

        {error && (
          <Card>
            <Text style={{ color: colors.danger }}>{error}</Text>
          </Card>
        )}

        {items === null && (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator />
              <Text style={{ color: colors.muted }}>Načítám…</Text>
            </View>
          </Card>
        )}

        {items !== null && items.length === 0 && (
          <Card>
            <Text style={{ color: colors.muted }}>
              Zatím tu nic není. Záznamy se objeví, jakmile poprvé zkopíruješ email
              s AI odpovědí.
            </Text>
          </Card>
        )}

        {items?.map((it, i) => (
          <Card key={`${it.timestamp}-${i}`}>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 8 }}>
              {new Date(it.timestamp).toLocaleString("cs-CZ")}
            </Text>
            <Text style={{ fontWeight: "700", color: colors.text, marginBottom: 4 }}>
              KLIENT:
            </Text>
            <View style={styles.box}>
              <Text selectable style={{ color: colors.text, lineHeight: 20 }}>
                {it.clientEmail}
              </Text>
            </View>
            <Text
              style={{ fontWeight: "700", color: colors.text, marginTop: 10, marginBottom: 4 }}
            >
              ODPOVĚĎ:
            </Text>
            <View style={[styles.box, { backgroundColor: colors.primarySoft }]}>
              <Text selectable style={{ color: colors.text, lineHeight: 20 }}>
                {it.finalAnswer}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Button
                  label={busy === i ? "Pracuju…" : "Povýšit do pravidel"}
                  onPress={() => handlePromote(i)}
                  disabled={busy !== null}
                />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Button
                  label={busy === i ? "Pracuju…" : "Smazat"}
                  onPress={() => handleDelete(i)}
                  variant="danger"
                  disabled={busy !== null}
                />
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  box: {
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
