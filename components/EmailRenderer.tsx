import { Image, Linking, Pressable, Text, View } from "react-native";
import { isSplitRow, type DocItem, type EmailDoc, type Line, type Run } from "@/lib/emailTemplate";
import { colors } from "./ui";

function ImageRun({ r }: { r: Run }) {
  const img = (
    <Image
      source={{ uri: r.imageSrc! }}
      style={{
        width: r.imageWidth ?? 96,
        height: r.imageHeight ?? 24,
        marginRight: 10,
      }}
      accessibilityLabel={r.text}
    />
  );
  if (!r.href) return img;
  return (
    <Pressable onPress={() => Linking.openURL(r.href!)} accessibilityRole="link">
      {img}
    </Pressable>
  );
}

function LineView({
  line,
  keyId,
  firstInBlock = false,
}: {
  line: Line;
  keyId: string | number;
  firstInBlock?: boolean;
}) {
  const borderColor = line[0]?.borderTopColor;
  const hasImage = line.some((r) => r.imageSrc);

  if (hasImage) {
    return (
      <View
        key={keyId}
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 12 }}
      >
        {line.map((r, j) =>
          r.imageSrc ? (
            <ImageRun key={j} r={r} />
          ) : (
            <Text key={j} style={{ color: r.color ?? colors.text }}>
              {r.text}
            </Text>
          ),
        )}
      </View>
    );
  }

  const tight = line[0]?.tight;
  const textEl = (
    <Text selectable style={{ color: colors.text, lineHeight: tight ? 18 : 20 }}>
      {line.length === 0
        ? " "
        : line.map((r, j) => (
            <Text
              key={j}
              style={{
                color: r.color ?? colors.text,
                fontWeight: r.bold ? "700" : "400",
                fontStyle: r.italic ? "italic" : "normal",
                fontSize: r.sizePx,
              }}
            >
              {r.text}
            </Text>
          ))}
    </Text>
  );
  if (borderColor) {
    return (
      <View
        key={keyId}
        style={{
          alignSelf: "flex-start",
          borderTopWidth: 1,
          borderTopColor: borderColor,
          marginTop: firstInBlock ? 0 : 24,
          paddingTop: 2,
        }}
      >
        {textEl}
      </View>
    );
  }
  return <View key={keyId}>{textEl}</View>;
}

function renderItem(item: DocItem, key: number) {
  if (isSplitRow(item)) {
    return (
      <View
        key={key}
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          marginTop: 24,
        }}
      >
        <View style={{ marginRight: 6 }}>
          <ImageRun r={item.leftImage} />
        </View>
        <View style={{ flexShrink: 1 }}>
          {item.right.map((line, i) => (
            <LineView key={i} line={line} keyId={i} firstInBlock={i === 0} />
          ))}
        </View>
      </View>
    );
  }
  return <LineView key={key} line={item} keyId={key} />;
}

export function EmailRenderer({ doc }: { doc: EmailDoc }) {
  return <>{doc.map((item, i) => renderItem(item, i))}</>;
}
