import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, Stack } from "expo-router";

import { deleteInquiry, listInquiries } from "@/lib/api";
import type { Inquiry } from "@/lib/types";
import { Button, Card, SectionTitle, colors } from "@/components/ui";

export default function Poptavky() {
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listInquiries());
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

  const handleDelete = async (id: string) => {
    if (!confirmAction("Opravdu smazat tuto poptávku? Nelze vrátit.")) return;
    setBusy(id);
    try {
      await deleteInquiry(id);
      await load();
    } catch (e: any) {
      setError(e?.message || "Smazání selhalo");
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (s: Inquiry["status"]) => {
    if (s === "sent_to_tabidoo") {
      return { label: "v Tabidoo", color: colors.success };
    }
    return { label: "draft", color: colors.muted };
  };

  return (
    <>
      <Stack.Screen options={{ title: "Poptávky" }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>Poptávky</SectionTitle>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Uložené nacenění před odesláním do Tabidoo. Po klientově potvrzení otevřeš
            poptávku, doplníš co je třeba a klikneš „Přidat do Tabidoo".
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
              Zatím tu nic není. Z hlavní stránky klikni „Přidat do poptávek" a uložíš sem
              první záznam.
            </Text>
          </Card>
        )}

        {items?.map((it) => {
          const badge = statusBadge(it.status);
          const fullName = [it.selections.jmeno, it.selections.prijmeni]
            .filter(Boolean)
            .join(" ")
            .trim();
          return (
            <Card key={it.id}>
              <Link href={`/poptavky/${it.id}`} asChild>
                <Pressable
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{ flex: 1, minWidth: 200 }}>
                    <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4 }}>
                      {new Date(it.createdAt).toLocaleString("cs-CZ")}
                    </Text>
                    <Text style={{ fontWeight: "700", color: colors.text, fontSize: 16 }}>
                      {fullName || "(bez jména)"}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
                      {it.selections.projekt || "(bez projektu)"}
                      {it.selections.email ? ` · ${it.selections.email}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontWeight: "800", color: colors.primary, fontSize: 18 }}>
                      {it.totalPrice} Kč
                    </Text>
                    <View
                      style={{
                        backgroundColor: badge.color,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        marginTop: 4,
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </Link>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <View style={{ flex: 1, minWidth: 100 }}>
                  <Button
                    label={busy === it.id ? "Pracuju…" : "Smazat"}
                    onPress={() => handleDelete(it.id)}
                    variant="danger"
                    disabled={busy !== null}
                  />
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
});
