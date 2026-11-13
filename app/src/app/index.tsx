import { Conversation } from "../components/Conversation";
import { Shell } from "../components/Shell";
import { useShell } from "../lib/shell";

export default function Home() {
  const { chatKey, startMode } = useShell();
  return (
    <Shell>
      <Conversation key={chatKey} initialMode={startMode ?? undefined} />
    </Shell>
  );
}
