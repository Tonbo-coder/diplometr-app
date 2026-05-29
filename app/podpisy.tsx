import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";

import {
  SIGNATURE_LABELS,
  signatures,
  toHtml,
  toPlainText,
  type EmailDoc,
} from "@/lib/emailTemplate";
import type { SignatureKey } from "@/lib/types";
import { Button, Card, SectionTitle, colors } from "@/components/ui";
import { EmailRenderer } from "@/components/EmailRenderer";

export default function Podpisy() {
  const keys = Object.keys(signatures) as SignatureKey[];

  return (
    <>
      <Stack.Screen options={{ title: "Podpisy" }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Přehled všech podpisů, jak vypadají v emailu. Klikni na tlačítko pro zkopírování
            HTML kódu (s formátováním) nebo prostého textu.
          </Text>
        </Card>

        {keys.map((key) => (
          <SignatureCard key={key} keyName={key} doc={signatures[key]} />
        ))}
      </ScrollView>
    </>
  );
}

function SignatureCard({ keyName, doc }: { keyName: SignatureKey; doc: EmailDoc }) {
  const html = toHtml(doc);
  const text = toPlainText(doc);

  const copyHtml = async () => {
    if (Platform.OS === "web" && typeof ClipboardItem !== "undefined") {
      try {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await (navigator as any).clipboard.write([item]);
        window.alert("Podpis zkopírován s formátováním.");
        return;
      } catch {
        // fall through to text
      }
    }
    await Clipboard.setStringAsync(html);
    if (Platform.OS === "web") window.alert("HTML zdroj zkopírován.");
  };

  const copyHtmlSource = async () => {
    await Clipboard.setStringAsync(html);
    if (Platform.OS === "web") window.alert("HTML zdroj zkopírován jako text.");
  };

  return (
    <Card>
      <SectionTitle>{SIGNATURE_LABELS[keyName]}</SectionTitle>
      <View style={styles.previewBox}>
        <EmailRenderer doc={doc} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Button label="Kopírovat (formát)" onPress={copyHtml} />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Button label="Kopírovat HTML zdroj" onPress={copyHtmlSource} variant="secondary" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  previewBox: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
