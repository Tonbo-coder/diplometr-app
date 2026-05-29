import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

export const colors = {
  bg: "#f6f7fb",
  card: "#ffffff",
  border: "#e3e6ee",
  text: "#111827",
  muted: "#6b7280",
  primary: "#2563eb",
  primarySoft: "#dbeafe",
  danger: "#dc2626",
  success: "#059669",
  /** Soft varianta success pro pozadí karet / sekcí. */
  successSoft: "#d1fae5",
};

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  accent,
  accentSoft,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  /** Přebije primární modrou — barva pozadí pro primary / barva textu pro secondary. */
  accent?: string;
  /** Pozadí pro secondary variantu (jinak colors.primarySoft). */
  accentSoft?: string;
}) {
  const primaryColor = accent ?? colors.primary;
  const softColor = accentSoft ?? colors.primarySoft;
  const bg =
    variant === "primary"
      ? primaryColor
      : variant === "danger"
        ? colors.danger
        : softColor;
  const fg = variant === "secondary" ? primaryColor : "#fff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent?: string;
}) {
  const c = accent ?? colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? c : "#fff",
          borderColor: selected ? c : colors.border,
        },
      ]}
    >
      <Text style={{ color: selected ? "#fff" : colors.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Checkbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.checkRow}>
      <View
        style={[
          styles.checkBox,
          { backgroundColor: value ? colors.primary : "#fff", borderColor: value ? colors.primary : colors.border },
        ]}
      >
        {value && <Text style={{ color: "#fff", fontWeight: "800" }}>✓</Text>}
      </View>
      <Text style={{ color: colors.text, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 10,
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontWeight: "700", fontSize: 15 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
