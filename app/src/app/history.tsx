import { Redirect } from "expo-router";

/** Chats now live in the sidebar; old links to /history land on the home screen. */
export default function History() {
  return <Redirect href="/" />;
}
