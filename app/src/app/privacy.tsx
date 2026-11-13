import { Legal } from "../components/Legal";
import { GRIEVANCE, OPERATOR } from "../lib/legal";

export default function Privacy() {
  return (
    <Legal
      title="Privacy"
      updated="13 November 2026"
      sections={[
        {
          h: "What we collect",
          p: [
            "Your Asanoha account email, if you sign in. Sign-in is shared across Asanoha apps.",
            "Your questions and Kosmik’s answers, saved to your history when you are signed in, so you can come back to them. You can delete any chat from History.",
            "Your 👍 / 👎 on answers, used to improve the library.",
            "If you ask for a palm reading, your palm photo is sent to Google Gemini once to write the reading and is never stored by Kosmik. The written reading is saved to your history like any other answer.",
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
            "Chats are deleted automatically 12 months after you last used them, or sooner if you delete them yourself.",
            "Question counts, including the daily guest code, are deleted after 30 days.",
            "Shared general answers are removed after 6 months if nobody has asked for them, unless we have reviewed them for the library. When a verse or meaning in the library is corrected, answers that relied on the old text stop being shown.",
          ],
        },
        {
          h: "What we don’t do",
          p: [
            "We don’t sell your data, show ads, or use your chats to build a profile of you. We don’t ask for your birth details in this version.",
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
            `${OPERATOR.name}, ${OPERATOR.address}.`,
          ],
        },
      ]}
    />
  );
}
