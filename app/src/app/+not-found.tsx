import { Link } from "expo-router";
import { Text, View } from "react-native";

import { font, useTheme } from "../lib/theme";

export default function NotFound() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
      }}
    >
      <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 20 }}>
        This page doesn’t exist.
      </Text>
      <Link
        href="/"
        style={{
          color: colors.primary,
          fontFamily: font.semibold,
          fontSize: 16,
        }}
      >
        Back to Kosmik
      </Link>
    </View>
  );
}
