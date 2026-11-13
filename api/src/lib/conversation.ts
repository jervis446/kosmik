/**
 * Memory within a chat: spotting follow-up questions and summarising the earlier turns for the
 * model. Pure functions; the pipeline loads the messages and calls the model.
 */
import type { PastMessage } from '../store.ts';
import type { Block } from '../types.ts';
import { normalizeQuestion } from './text.ts';

/** How many earlier messages (questions and answers) a follow-up sees: the last three exchanges. */
export const CONTEXT_MESSAGES = 6;
const MAX_PER_MESSAGE = 500;

/** Words that point back at something said earlier. */
const REFERS_BACK =
  /\b(it|its|that|this|those|these|them|more|again|same|above|previous|earlier|last one|what about|how about|and what|elaborate|simpler|simply|example|examples|detail|details|continue|go on|aur batao|aur bataiye|iske|uske|isko|usko|iska|uski|uska|iski|inke|unke|ye|yeh|woh|wo|vo|phir se|samjhao|samjhaiye|matlab)\b|इसके|उसके|इसका|उसका|और बताओ|समझाओ/;

/**
 * Whether a question probably leans on the earlier conversation. Short questions with no clear
 * topic of their own ("why?", "and Rahu?") count, as do ones that point back ("tell me more").
 * A question that already names what it is about ("Gita 2.47") is answered as it is.
 */
export function isFollowUp(question: string, hasOwnTopic: boolean): boolean {
  const text = normalizeQuestion(question);
  if (!text) return false;
  const words = text.split(' ').length;
  if (REFERS_BACK.test(text) && words <= 14) return true;
  return !hasOwnTopic && words <= 4;
}

const clip = (s: string) => (s.length > MAX_PER_MESSAGE ? `${s.slice(0, MAX_PER_MESSAGE - 1).trimEnd()}…` : s);

/** What an answer said, in a line or two of plain text. */
export function summariseBlocks(blocks: Block[]): string {
  const parts = blocks.flatMap((b): string[] => {
    switch (b.type) {
      case 'text':
        return [b.text];
      case 'verse':
        return [`[Verse ${b.ref}: ${b.translation}]`];
      case 'meaning':
        return [`[${b.title}]`];
      case 'tarot':
        return [`[Tarot: ${b.cards.map((c) => `${c.position}: ${c.name}${c.reversed ? ' (reversed)' : ''}`).join('; ')}]`];
      case 'palm':
        return [`[Palm reading of: ${b.lines.map((l) => l.name).join(', ')}]`];
      case 'chart':
        return [`[Their birth chart: Lagna ${b.lagna ?? 'unknown'}, Moon ${b.moon}, Nakshatra ${b.nakshatra}]`];
      case 'herb':
        return [`[Herb: ${b.name} (${b.english}, ${b.botanical})]`];
      case 'herb-list':
        return [`[${b.title}: ${b.herbs.map((h) => h.name).join(', ')}]`];
      case 'prakriti':
        return [`[Their prakriti: ${b.label}]`];
      case 'notice':
        return b.kind === 'helpline' ? [] : [b.text];
    }
  });
  return parts.join(' ');
}

/** The earlier turns as a short transcript ("Person: …" / "Kosmik: …"). */
export function describeConversation(past: PastMessage[]): string {
  return past
    .map((m) => (m.role === 'user' ? `Person: ${clip(m.content)}` : `Kosmik: ${clip(summariseBlocks(m.blocks ?? []))}`))
    .filter((line) => !/^Kosmik: $/.test(line))
    .join('\n');
}
