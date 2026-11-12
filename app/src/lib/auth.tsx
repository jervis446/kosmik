import type { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./supabase";

type AuthCtx = {
  session: Session | null;
  ready: boolean;
  /** Emails a 6-digit sign-in code. */
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const friendly = (message: string) => {
  if (/rate limit|too many/i.test(message))
    return "Too many codes requested. Please wait a minute and try again.";
  if (/expired|invalid/i.test(message))
    return "That code didn’t work. Check it, or ask for a new one.";
  if (/sending|smtp|email/i.test(message))
    return "We couldn’t send the email just now. Please try again in a moment.";
  return "Something went wrong. Please try again.";
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      ready,
      async sendCode(email) {
        if (!supabase) throw new Error("Sign-in isn’t set up in this build.");
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true },
        });
        if (error) throw new Error(friendly(error.message));
      },
      async verifyCode(email, code) {
        if (!supabase) throw new Error("Sign-in isn’t set up in this build.");
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "email",
        });
        if (error) throw new Error(friendly(error.message));
      },
      async signOut() {
        await supabase?.auth.signOut();
      },
    }),
    [session, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
