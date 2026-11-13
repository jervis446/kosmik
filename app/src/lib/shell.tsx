import { router } from "expo-router";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, useWindowDimensions } from "react-native";

import { api, type ConversationSummary } from "./api";
import { useAuth } from "./auth";

/** Wide screens keep the sidebar open; narrow ones open it as a drawer. */
export const WIDE = 900;

type Shell = {
  wide: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  chats: ConversationSummary[] | null;
  refreshChats: () => void;
  removeChat: (id: string) => Promise<void>;
  activeId: string | null;
  /** Called by a conversation once the server has given it an id. */
  setActiveId: (id: string | null) => void;
  /** Changes whenever "New chat" is pressed, so the home conversation starts empty. */
  chatKey: number;
  newChat: () => void;
  openChat: (id: string) => void;
};

const ShellCtx = createContext<Shell | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const wide = width >= WIDE;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chats, setChats] = useState<ConversationSummary[] | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [version, setVersion] = useState(0);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    api
      .conversations()
      .then((r) => live && setChats(r.conversations))
      .catch(() => live && setChats([]));
    return () => {
      live = false;
    };
  }, [userId, version]);

  const value = useMemo<Shell>(() => {
    const closeDrawer = () => setDrawerOpen(false);
    return {
      wide,
      drawerOpen: drawerOpen && !wide,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer,
      chats: userId ? chats : null,
      refreshChats: () => setVersion((v) => v + 1),
      removeChat: async (id) => {
        await api.deleteConversation(id);
        setChats((c) => c?.filter((x) => x.id !== id) ?? null);
        if (id === activeId) {
          setActiveIdState(null);
          setChatKey((k) => k + 1);
          router.navigate("/chat");
        }
      },
      activeId,
      setActiveId: (id) => {
        setActiveIdState(id);
        // Keep the address in step with the open chat, as ChatGPT does, without remounting it.
        if (Platform.OS === "web" && id && globalThis.history) {
          globalThis.history.replaceState(
            globalThis.history.state,
            "",
            `/chat/${id}`,
          );
        }
        setVersion((v) => v + 1);
      },
      chatKey,
      newChat: () => {
        setActiveIdState(null);
        setChatKey((k) => k + 1);
        closeDrawer();
        router.navigate("/chat");
        if (Platform.OS === "web" && globalThis.history) {
          globalThis.history.replaceState(
            globalThis.history.state,
            "",
            "/chat",
          );
        }
      },
      openChat: (id) => {
        closeDrawer();
        setActiveIdState(id);
        router.navigate({ pathname: "/chat/[id]", params: { id } });
      },
    };
  }, [wide, drawerOpen, chats, userId, activeId, chatKey]);

  return <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>;
}

export function useShell(): Shell {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell outside ShellProvider");
  return ctx;
}
