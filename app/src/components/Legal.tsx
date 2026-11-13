import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { font, useTheme } from "../lib/theme";
import { Header } from "./Header";
import { OPERATOR } from "../lib/legal";

export type Section = { h: string; p: string[] };

export function Legal({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: Section[];
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Header title={title} back />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 18,
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Text
          style={{ color: colors.muted, fontFamily: font.medium, fontSize: 13 }}
        >
          Last updated {updated}. Kosmik by Asanoha, operated by {OPERATOR.name}
          (GSTIN {OPERATOR.gstin}).
        </Text>
        {sections.map((s) => (
          <View key={s.h} style={{ gap: 8 }}>
            <Text
              style={{
                color: colors.text,
                fontFamily: font.bold,
                fontSize: 18,
              }}
              role="heading"
            >
              {s.h}
            </Text>
            {s.p.map((p) => (
              <Text
                key={p.slice(0, 40)}
                style={{
                  color: colors.text,
                  fontFamily: font.body,
                  fontSize: 15,
                  lineHeight: 23,
                }}
              >
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
