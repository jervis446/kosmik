import { Legal } from "../components/Legal";

export default function Terms() {
  return (
    <Legal
      title="Terms"
      updated="12 November 2026"
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
            "Guests can ask 3 questions a day. With a free Asanoha account (Starter) you get 11 questions a week, refilled each Monday (India time). Premium, with unlimited questions, will cost ₹51 a week or ₹101 a month when it launches.",
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
          ],
        },
        {
          h: "Contact",
          p: ["Asanoha LLP. Grievance Officer: Joseph, joseph@asanoha.co.in."],
        },
      ]}
    />
  );
}
