import { Redirect } from "expo-router";

/** On the website, / is the landing page (served by the Worker). Inside the app it opens the chat. */
export default function Index() {
  return <Redirect href="/chat" />;
}
