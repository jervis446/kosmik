import { SafeAreaView } from "react-native-safe-area-context";

import { Conversation } from "../components/Conversation";
import { Header } from "../components/Header";

export default function AskScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Header />
      <Conversation />
    </SafeAreaView>
  );
}
