import "./polyfills";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

/**
 * The Asanoha account: the same Supabase Auth project as the Asanoha store and Wearday, so one
 * login works across Asanoha apps. Kosmik keeps none of its own data in Supabase.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const authConfigured = !!url && !!key;

export const supabase: SupabaseClient | null = authConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
        flowType: "pkce",
      },
    })
  : null;
