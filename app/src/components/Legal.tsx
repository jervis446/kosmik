import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { font, useTheme } from "../lib/theme";
import { Header } from "./Header";
import { COPYRIGHT, OPERATOR } from "../lib/legal";
import { Sky } from "./Sky";

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
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={["top", "bottom"]}
    >
      <Sky />
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
          {`Last updated ${updated}. Kosmik by Asanoha, operated by ${OPERATOR.name} (LLPIN ${OPERATOR.llpin}).`}
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
        <Text style={{ color: colors.muted, fontFamily: font.medium, fontSize: 13 }}>{COPYRIGHT}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
