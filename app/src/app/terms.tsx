import { Legal } from "../components/Legal";
import { GRIEVANCE, OPERATOR } from "../lib/legal";

export default function Terms() {
  return (
    <Legal
      title="Terms"
      updated="13 November 2026"
      sections={[
        {
          h: "What Kosmik is",
          p: [
            "Kosmik offers reflections drawn from the Bhagavad Gita, Vedic astrology and tarot. It is for spiritual reflection and guidance only.",
            "It is not medical, legal, financial or psychological advice, and it does not predict events. Please don’t make important decisions based on it alone.",
            "If you are in distress, call Tele-MANAS on 14416 (free, 24×7) or your local emergency number.",
          ],
        },
        {
          h: "Plans",
          p: [
            "Guests can ask 3 questions a day. With a free Asanoha account (Starter) you get 11 questions a week, refilled each Monday (India time). Premium gives unlimited questions for 7 days (₹51) or 30 days (₹101), launch prices including GST.",
            "Premium is paid once by UPI through Noha Pay, Asanoha’s payment page, and doesn’t renew on its own. It starts as soon as the payment reaches our bank account, usually within a few minutes. Buying again adds days after your current end date. If a payment goes wrong, contact us below with the UTR; refunds for Premium days not yet started are given on request.",
            "Answers served from the library or from earlier answers are fast but still count toward your limit. Safety messages and “coming soon” notices don’t.",
          ],
        },
        {
          h: "Fair use",
          p: [
            "Don’t use Kosmik to harass anyone, to automate large numbers of questions, or to try to get around its limits or safety rules. We may pause accounts that do.",
          ],
        },
        {
          h: "Content",
          p: [
            "Sanskrit verses are in the public domain. English translations are by Swami Sivananda and Shri Purohit Swami, both in the public domain in India. Library meanings and AI answers may contain mistakes; entries marked Draft have not yet been reviewed.",
            "Herb data is from the Amidha Ayurveda Herb Database v2.0 by Sparsh Varshney (github.com/sciencewithsaucee-sudo/herb-database), licensed CC BY 4.0. Kosmik changed it: descriptions are rewritten to describe traditional use only, two controlled plants are left out, and therapeutic indications are not shown.",
            "Ayurveda in Kosmik is traditional knowledge, not medical advice. Kosmik never prescribes herbs or doses. The dosha quiz is a self-assessment, not a diagnosis. Talk to a doctor or a qualified vaidya before taking any herb, and never stop a prescribed medicine.",
          ],
        },
        {
          h: "Contact",
          p: [
            `Kosmik is a product of Asanoha, operated by ${OPERATOR.name} (GSTIN ${OPERATOR.gstin}), ${OPERATOR.address}.`,
            GRIEVANCE,
          ],
        },
      ]}
    />
  );
}
