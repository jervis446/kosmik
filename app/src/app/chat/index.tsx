import { Conversation } from "../../components/Conversation";
import { Shell } from "../../components/Shell";
import { useShell } from "../../lib/shell";

export default function NewChat() {
  const { chatKey } = useShell();
  return (
    <Shell>
      <Conversation key={chatKey} />
    </Shell>
  );
}
