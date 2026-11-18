import { Legal } from "../components/Legal";
import { GRIEVANCE, OPERATED_BY, OPERATOR } from "../lib/legal";

/** FAQs, the refund policy and the disclaimer, linked from Help in the account menu. */
export default function Help() {
  return (
    <Legal
      title="Help"
      updated="16 November 2026"
      sections={[
        {
          h: "FAQs",
          p: [
            "What can I ask? In a Kosmik chat: anything about your life through Vedic astrology (your kundli, dashas and transits), tarot and palm reading. Ayurveda has its own chats: tap “Ask Ayurveda” in the sidebar and describe what you feel.",
            "Going through something hard (a breakup, a loss, a failure, fights at home)? Tap “Talk to Shanti”. Shanti listens and answers with what the Bhagavad Gita and other Hindu texts teach, and it is where Gita questions go now. It is spiritual comfort, not therapy: if you might hurt yourself, call Tele-MANAS 14416 (free, 24×7); if you are in danger, call 112.",
            "Why does Kosmik need my birth time and place? Your lagna and houses change every two hours and with place. With them, readings name your exact periods and dates. Without a time, readings stay approximate.",
            "How many questions do I get? A free account gets 11 questions a week, refilled every Monday (India time). Premium gives 10 questions a day for 7 or 30 days, and lets you buy reports.",
            "Which language does Kosmik answer in? The one you pick under the message box: English, हिंदी or Hinglish. Auto follows the language you type in.",
            "Can I delete my data? Yes. Account & privacy → Delete all my details removes your birth details, palm photos and prakriti. Each chat can be deleted from the sidebar.",
            `Something not working? WhatsApp us on ${OPERATOR.phone} or email ${OPERATOR.email}.`,
          ],
        },
        {
          h: "Refund Policy",
          p: [
            "Premium is a one-time UPI payment and never renews on its own.",
            "If a payment left your account but Premium didn’t start, send us the UTR (UPI reference) and we’ll switch it on or refund it in full.",
            "Refunds for Premium days not yet started are given on request. Days already used are not refunded. Approved refunds go back to the UPI account that paid.",
          ],
        },
        {
          h: "Disclaimer",
          p: [
            "Astrology, tarot and palm reading in Kosmik are for spiritual reflection and guidance. Readings and dates are interpretations of your chart, not certainties, so please don’t make important decisions on them alone.",
            "Ayurveda guidance comes from an AYUSH-licensed Ayurvedic company and the classical texts. It does not replace a consultation: see a doctor promptly for serious or worsening symptoms, and never stop a prescribed medicine.",
            "Nothing in Kosmik is legal, financial or psychological advice. If you are in distress, call Tele-MANAS on 14416 (free, 24×7) or your local emergency number.",
          ],
        },
        {
          h: "Contact",
          p: [`Kosmik is a product of Asanoha, ${OPERATED_BY}.`, GRIEVANCE],
        },
      ]}
    />
  );
}
