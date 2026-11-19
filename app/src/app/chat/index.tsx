import { router } from "expo-router";
import { useEffect } from "react";

import { Conversation } from "../../components/Conversation";
import { Shell } from "../../components/Shell";
import { useAuth } from "../../lib/auth";
import { takeNext } from "../../lib/next";
import { useShell } from "../../lib/shell";

export default function NewChat() {
  const { chatKey, newKind, newReport } = useShell();
  const { session } = useAuth();
  // Back from Google sign-in, which always returns here: go on to the page that asked for it.
  useEffect(() => {
    if (!session) return;
    const next = takeNext();
    if (next) router.replace(next as "/chat");
  }, [session]);
  return (
    <Shell>
      <Conversation key={chatKey} initialKind={newKind} reportKey={newReport} />
    </Shell>
  );
}
