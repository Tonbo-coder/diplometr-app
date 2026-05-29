import { useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { colors } from "./ui";

export type PickedAsset = {
  uri: string;
  name: string;
  mimeType?: string | null;
  file?: File | Blob | null;
};

/**
 * Tlačítko pro výběr .docx. Na webu navíc funguje jako drop zone — soubor
 * lze přetáhnout. Na nativu (Expo Go) jen klikací výběr.
 */
export function FilePicker({
  label,
  disabled,
  accent,
  onPick,
}: {
  label: string;
  disabled?: boolean;
  accent?: string;
  onPick: (asset: PickedAsset) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File) => {
    onPick({
      uri: URL.createObjectURL(file),
      name: file.name,
      mimeType: file.type,
      file,
    });
  };

  const openPicker = async () => {
    if (Platform.OS === "web" && inputRef.current) {
      inputRef.current.click();
      return;
    }
    const r = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.oasis.opendocument.text",
        "application/msword",
        ".docx",
        ".odt",
        ".doc",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const asset = r.assets[0];
    onPick({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      file: (asset as any).file ?? null,
    });
  };

  const bg = disabled
    ? "#cbd5e1"
    : dragging
      ? (accent ?? colors.primary)
      : (accent ?? colors.primary);
  const opacity = disabled ? 0.5 : dragging ? 0.85 : 1;

  if (Platform.OS === "web") {
    return (
      // @ts-expect-error – web-only DOM props
      <div
        onDragOver={(e: any) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDragEnd={() => setDragging(false)}
        onDrop={(e: any) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer?.files?.[0];
          if (!f) return;
          const name = f.name.toLowerCase();
          if (!name.endsWith(".docx") && !name.endsWith(".odt") && !name.endsWith(".doc")) {
            window.alert("Vlož prosím soubor ve formátu .docx, .odt nebo .doc.");
            return;
          }
          handleFile(f);
        }}
        onClick={openPicker}
        style={{
          cursor: disabled ? "not-allowed" : "pointer",
          backgroundColor: bg,
          opacity,
          padding: "16px",
          borderRadius: 10,
          textAlign: "center" as const,
          border: dragging ? `2px dashed #fff` : "2px solid transparent",
          transition: "border 0.15s",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* @ts-expect-error – web div */}
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "inherit" }}>
          {label}
        </div>
        {/* @ts-expect-error – web div */}
        <div
          style={{
            color: "rgba(255,255,255,0.85)",
            fontSize: 12,
            marginTop: 6,
            fontFamily: "inherit",
          }}
        >
          {dragging ? "Pusť tady" : "klikni nebo přetáhni .docx / .odt / .doc soubor sem"}
        </div>
        {/* skrytý input pro click fallback */}
        {/* @ts-expect-error – input */}
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.odt,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/msword"
          style={{ display: "none" }}
          onChange={(e: any) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  // Native fallback — jen tlačítko
  return (
    <Pressable
      onPress={openPicker}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: accent ?? colors.primary,
        padding: 14,
        borderRadius: 10,
        alignItems: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
