import { Legal } from "../components/Legal";

export default function Privacy() {
  return (
    <Legal
      title="Privacy"
      updated="12 November 2026"
      sections={[
        {
          h: "What we collect",
          p: [
            "Your Asanoha account email, if you sign in. Sign-in is shared across Asanoha apps.",
            "Your questions and Kosmik’s answers, saved to your history when you are signed in, so you can come back to them. You can delete any chat from History.",
            "Your 👍 / 👎 on answers, used to improve the library.",
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
            "Delete chats any time from History. To delete your account and everything linked to it, email the Grievance Officer below and we will do it within 30 days.",
            "Grievance Officer: Joseph, joseph@asanoha.co.in.",
          ],
        },
      ]}
    />
  );
}
