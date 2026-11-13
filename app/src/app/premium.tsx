import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Header } from "../components/Header";
import {
  api,
  ApiError,
  type Me,
  type PaymentState,
  type PlanId,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { OPERATOR } from "../lib/legal";
import { font, useTheme } from "../lib/theme";

const POLL_MS = 4000;
const POLL_TRIES = 45; // about 3 minutes; after that the page explains and stops asking

const date = (ms: number) =>
  new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const rupees = (paise: number) => `₹${paise / 100}`;
const message = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Please try again.";

/**
 * Buy Premium with UPI through Noha Pay. The gateway sends people back here with ?order=<id>;
 * the payment is confirmed once the UTR is matched, so this page waits and explains.
 */
export default function Premium() {
  const { session, ready } = useAuth();
  const { colors } = useTheme();
  const { order } = useLocalSearchParams<{ order?: string }>();
  const [me, setMe] = useState<Me | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<PlanId | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    api
      .me()
      .then((m) => !stopped && setMe(m))
      .catch((e) => !stopped && setError(message(e)));
    if (order) {
      let tries = 0;
      const check = () =>
        api
          .payment(order)
          .then((p) => {
            if (stopped) return;
            setPayment(p);
            if (p.status === "pending" && ++tries < POLL_TRIES)
              timer = setTimeout(check, POLL_MS);
          })
          .catch((e) => !stopped && setError(message(e)));
      check();
    }
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ready, session, order]);

  const buy = (plan: PlanId) => {
    setError(null);
    setOpening(plan);
    api
      .pay(plan)
      .then((r) => globalThis.location?.assign(r.checkoutUrl))
      .catch((e) => {
        setError(message(e));
        setOpening(null);
      });
  };

  const text = {
    color: colors.text,
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
  } as const;
  const muted = { ...text, color: colors.muted, fontSize: 14, lineHeight: 21 };
  const card = {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 10,
  } as const;
  const until = payment?.premiumUntil ?? me?.premiumUntil ?? null;
  // The server returns no end date once Premium has run out.
  const active = until !== null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Header title="Premium" back />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
          maxWidth: 560,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {payment ? (
          <View
            style={[card, { backgroundColor: colors.primarySoft }]}
            accessibilityLiveRegion="polite"
            testID="payment-status"
          >
            {payment.status === "paid" ? (
              <Text style={[text, { fontFamily: font.bold }]}>
                Payment confirmed. Premium is on
                {until ? ` until ${date(until)}` : ""}.
              </Text>
            ) : payment.status === "pending" ? (
              <>
                <Text style={[text, { fontFamily: font.bold }]}>
                  Waiting for your payment to be confirmed
                </Text>
                <Text style={muted}>
                  Premium switches on by itself as soon as the payment reaches
                  our bank account, usually within a few minutes. You can close
                  this page.
                </Text>
              </>
            ) : (
              <>
                <Text style={[text, { fontFamily: font.bold }]}>
                  This payment wasn’t completed
                </Text>
                <Text style={muted}>
                  If money did leave your account, email {OPERATOR.email} with
                  the UTR and we’ll sort it out.
                </Text>
              </>
            )}
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text
            style={{
              color: colors.text,
              fontFamily: font.heavy,
              fontSize: 26,
            }}
            role="heading"
          >
            {active ? "You have Premium" : "Unlimited questions"}
          </Text>
          <Text style={muted}>
            {active
              ? `Premium is on until ${date(until!)}. Buying more adds days after that.`
              : "Starter gives you 11 questions a week. Premium removes the limit for 7 or 30 days. It’s a one-time UPI payment and doesn’t renew on its own."}
          </Text>
        </View>

        {!me && !error ? <ActivityIndicator color={colors.primary} /> : null}

        {me?.plans.map((p) => (
          <View key={p.id} style={card}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontFamily: font.bold,
                  fontSize: 17,
                }}
              >
                {p.days} days
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontFamily: font.heavy,
                  fontSize: 24,
                }}
              >
                {rupees(p.amountPaise)}
              </Text>
            </View>
            <Text style={muted}>
              Unlimited questions for {p.days} days. Launch price, GST included.
            </Text>
            {me.paymentsEnabled && Platform.OS === "web" ? (
              <Pressable
                onPress={() => buy(p.id)}
                disabled={opening !== null}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 999,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: opening && opening !== p.id ? 0.5 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel={`Pay ${rupees(p.amountPaise)} with UPI for ${p.days} days`}
              >
                {opening === p.id ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text
                    style={{
                      color: colors.onPrimary,
                      fontFamily: font.bold,
                      fontSize: 16,
                    }}
                  >
                    Pay {rupees(p.amountPaise)} with UPI
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>
        ))}

        {me && !me.paymentsEnabled ? (
          <Text style={[text, { fontFamily: font.semibold }]} testID="pay-soon">
            Premium payments open soon.
          </Text>
        ) : null}
        {me?.paymentsEnabled && Platform.OS !== "web" ? (
          <Text style={muted}>
            Premium can be bought on the Kosmik website.
          </Text>
        ) : null}
        {error ? (
          <Text
            style={{ color: colors.danger, fontFamily: font.semibold }}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}

        <Text style={muted}>
          You pay by UPI on Noha Pay, Asanoha’s payment page, straight into our
          UPI account; nobody else holds the money. Questions about a payment:{" "}
          {OPERATOR.email}, {OPERATOR.phone}.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
