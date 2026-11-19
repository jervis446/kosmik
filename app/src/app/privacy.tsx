import { Legal } from "../components/Legal";
import { GRIEVANCE, OPERATED_BY, OPERATOR } from "../lib/legal";

export default function Privacy() {
  return (
    <Legal
      title="Privacy"
      updated="19 November 2026"
      sections={[
        {
          h: "What we collect",
          p: [
            "Your Asanoha account email, if you sign in. Sign-in is shared across Asanoha apps.",
            "Your questions and Kosmik’s answers, saved to your history when you are signed in, so you can come back to them. You can delete any chat from History.",
            "Your 👍 / 👎 on answers, used to improve the library.",
            "If you add them in Account → My details: your date, time and place of birth, photos of your palms, and your answers to the dosha quiz with the prakriti they give. These are sensitive, so we keep them only with your consent, only you can see them, and you can change or delete them any time. To find your place of birth, only the place name you type is sent to OpenStreetMap.",
            "When you ask about your own chart, Kosmik calculates it from your birth details and sends the chart (not your name) to Google Gemini to explain it. When you ask about your palm, your palm photos are sent to Google Gemini to read them. When you ask for Ayurveda advice for your prakriti, your Vata, Pitta and Kapha scores are sent with the question. The answers are saved to your history like any other chat.",
            "If you buy Premium: the plan, amount, date and the UPI reference (UTR) of your payment. You pay through Noha Pay, Asanoha’s UPI payment page; we never see your bank or UPI PIN details. Payment records are kept as long as tax law requires.",
            "If you use Kosmik without signing in, we keep a one-way code made from your network address and the date, only to apply the daily guest limit. It changes every day and cannot be turned back into your address.",
          ],
        },
        {
          h: "How answers are made",
          p: [
            "Many answers come straight from Kosmik’s library of Gita verses and written meanings. Others are written by an AI model (Google Gemini), using only that library as its source. For those, your question is sent to Google to write the answer; Google doesn’t use it to train its models.",
            "General questions (not about you personally) and their answers may be kept and shown again to anyone who asks the same thing, without any link to you. Questions that include personal details, such as your birth date or your own chart, are never reused this way.",
          ],
        },
        {
          h: "How long we keep it",
          p: [
            "Chats are deleted automatically 12 months after you last used them, or sooner if you delete them yourself. Birth details, palm photos and your prakriti are kept until you delete them, or your account.",
            "Question counts, including the daily guest code, are deleted after 30 days.",
            "Shared general answers are removed after 6 months if nobody has asked for them, unless we have reviewed them for the library. When a verse or meaning in the library is corrected, answers that relied on the old text stop being shown.",
          ],
        },
        {
          h: "What we don’t do",
          p: [
            "Your WhatsApp number, which you verify with a code we send on WhatsApp. Each number can belong to one Kosmik account, so the free questions stay fair. We keep it while your account exists, only use it for sign-in checks, and never share it or send marketing.",
            "To see which parts of Kosmik are used, we count page visits and actions (for example “a question was answered from the library” or “a number was verified”) with GoatCounter, which uses no cookies and keeps no personal data. Your questions, details and number are never sent to it.",
            "During the alpha we also use PostHog (posthog.com, stored in the EU) to see how people use Kosmik, so we can fix what’s confusing or broken. It records which screens you open and what you tap, linked to your account id and email when you’re signed in, and screen recordings of your visits. These recordings show the screen as you see it, including what you type, your questions and the answers, and your birth details. Sign-in and WhatsApp codes are always hidden. When you use Kosmik in Claude or ChatGPT, it also records which Kosmik tool was used, which of the two apps used it, and whether it worked, but not what you asked or what came back. It uses a cookie and your browser’s storage to recognise your visits. Only the Kosmik team can see this data, and we’ll turn full recordings off when the alpha ends. To have your data deleted, write to us at the address below.",
            "When something breaks, the app sends us a technical error report (what failed and where, and your account id if you’re signed in). Anything that looks like an email, phone number or key is removed first. Error reports are deleted after 30 days.",
            "We don’t sell your data, show ads, or use your chats, birth details, palm photos or prakriti for anything except answering you.",
          ],
        },
        {
          h: "Where data lives",
          p: [
            "Kosmik runs on Cloudflare. Accounts are kept by Supabase. AI answers are written by Google Gemini. Each processes data on our behalf under its own security and privacy terms.",
          ],
        },
        {
          h: "Your choices",
          p: [
            `Delete chats any time from History. To delete your account and everything linked to it, email ${OPERATOR.email} and we will do it within 30 days.`,
            GRIEVANCE,
            `Kosmik is a product of Asanoha, ${OPERATED_BY}.`,
          ],
        },
      ]}
    />
  );
}
