import { Redirect } from "expo-router";

/** Chats live in the sidebar; old links to /history open the chat. */
export default function History() {
  return <Redirect href="/chat" />;
}
