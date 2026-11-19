/** The Kosmik MCP server: one per request (stateless), for one signed-in Asanoha account. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { CALLS_PER_DAY, drawTarot, findVerse, herbInfo, matchKundali, myDashas, myKundali, myPrakriti, myReports, takeCall, ToolInputError, transitsNow, type ToolEnv } from './tools.ts';

export const TOOL_NAMES = ['my_kundali', 'my_dashas', 'transits_now', 'match_kundali', 'draw_tarot', 'find_verse', 'herb_info', 'my_prakriti', 'my_reports'] as const;

const INSTRUCTIONS = `Kosmik (by Asanoha) gives exact Vedic astrology, tarot, Bhagavad Gita and Ayurveda facts for the signed-in person, calculated from their saved birth details (sidereal, Lahiri ayanamsa, whole-sign houses, Vimshottari dasha). Call the tools for facts instead of guessing placements or dates, then explain them warmly in plain words. Never invent dates. No fear or doom, no gemstones, no paid pujas; remedies are practical. For health, a doctor comes first.`;

/** Kosmik's logo, from the website, for Claude and ChatGPT to show beside the connector. */
const ICONS = [
  { src: 'https://kosmik.asanoha.co.in/logo.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
  { src: 'https://kosmik.asanoha.co.in/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] },
];

type Result ={ content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (text: string): Result => ({ content: [{ type: 'text', text }] });
const fail = (text: string): Result => ({ content: [{ type: 'text', text }], isError: true });

export function kosmikServer(env: ToolEnv): McpServer {
  const server = new McpServer({ name: 'kosmik', title: 'Kosmik', version: '1.0.0', icons: ICONS }, { instructions: INSTRUCTIONS });

  /** Every call counts toward the daily allowance; input problems come back as readable errors. */
  const run = async (fn: () => Promise<string>): Promise<Result> => {
    if (!(await takeCall(env))) return fail(`You’ve used today’s ${CALLS_PER_DAY} Kosmik lookups. They refill at midnight India time.`);
    try {
      return ok(await fn());
    } catch (e) {
      if (e instanceof ToolInputError) return fail(e.message);
      throw e;
    }
  };
  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

  server.registerTool(
    'my_kundali',
    {
      title: 'My kundali',
      description: "The person's Vedic birth chart (kundali) from their saved birth details: lagna, every planet's sign, degree, nakshatra, house and dignity, house lords, aspects, yogas, panchang at birth and the avkahada chakra. Use this before answering anything about their chart.",
      annotations: { title: 'My kundali', ...readOnly },
    },
    () => run(() => myKundali(env)),
  );

  server.registerTool(
    'my_dashas',
    {
      title: 'My dasha periods',
      description: "The person's Vimshottari dasha: the running mahadasha, antardasha and pratyantardasha with exact dates, and the full table of mahadashas with antardashas. Use it for any 'when' question (career, marriage, money, moves) and give dates only from it.",
      annotations: { title: 'My dasha periods', ...readOnly },
    },
    () => run(() => myDashas(env)),
  );

  server.registerTool(
    'transits_now',
    {
      title: 'Transits now',
      description: "Where Saturn, Jupiter, Rahu and Ketu are now against the person's chart (from the Moon and from the lagna), when they next change sign, and the person's Sade Sati and dhaiya periods across their life.",
      annotations: { title: 'Transits now', ...readOnly },
    },
    () => run(() => transitsNow(env)),
  );

  server.registerTool(
    'match_kundali',
    {
      title: 'Match kundali',
      description: "Kundali matching (Guna Milan, all 8 kootas out of 36, and Manglik for both) between the person and a partner, from the partner's birth details. The partner's details are used once and not saved.",
      inputSchema: {
        name: z.string().max(60).optional().describe("Partner's first name, if known"),
        birthDate: z.string().describe("Partner's date of birth, YYYY-MM-DD"),
        birthTime: z.string().optional().describe("Partner's birth time, HH:MM 24-hour; leave out if unknown"),
        place: z.string().max(100).describe("Partner's place of birth: town or city, and state or country"),
      },
      annotations: { title: 'Match kundali', ...readOnly },
    },
    (args) => run(() => matchKundali(env, args)),
  );

  server.registerTool(
    'draw_tarot',
    {
      title: 'Draw tarot cards',
      description: 'Draws tarot cards fairly from a full 78-card deck: 1 card, or 3 for past, present and future, each upright or reversed, with its meaning. Read the cards as drawn; never pick or redraw cards yourself.',
      inputSchema: { count: z.union([z.literal(1), z.literal(3)]).default(1).describe('1 card, or 3 for past, present, future') },
      annotations: { title: 'Draw tarot cards', readOnlyHint: true, openWorldHint: false },
    },
    ({ count }) => run(() => drawTarot(env, count)),
  );

  server.registerTool(
    'find_verse',
    {
      title: 'Bhagavad Gita verse',
      description: "A Bhagavad Gita verse by chapter and verse, in Sanskrit (Devanagari and IAST) with an English translation and its translator. Use it to quote the Gita exactly instead of from memory.",
      inputSchema: {
        chapter: z.number().int().min(1).max(18).describe('Chapter, 1 to 18'),
        verse: z.number().int().min(1).max(78).describe('Verse number'),
      },
      annotations: { title: 'Bhagavad Gita verse', ...readOnly },
    },
    ({ chapter, verse }) => run(() => findVerse(env, chapter, verse)),
  );

  server.registerTool(
    'herb_info',
    {
      title: 'Ayurveda herb',
      description: 'An Ayurveda herb from Kosmik’s library, by any of its names (Sanskrit, Hindi, English or botanical): parts used, rasa, guna, virya, vipaka, which doshas it calms or aggravates, and cautions. Information, not a prescription.',
      inputSchema: { name: z.string().min(2).max(60).describe('Herb name, e.g. ashwagandha, tulsi, giloy') },
      annotations: { title: 'Ayurveda herb', ...readOnly },
    },
    ({ name }) => run(() => herbInfo(env, name)),
  );

  server.registerTool(
    'my_prakriti',
    {
      title: 'My prakriti',
      description: "The person's Ayurveda prakriti (Vata, Pitta, Kapha percentages) and current vikriti and agni, from the quizzes they took in Kosmik.",
      annotations: { title: 'My prakriti', ...readOnly },
    },
    () => run(() => myPrakriti(env)),
  );

  server.registerTool(
    'my_reports',
    {
      title: 'My Kosmik reports',
      description: 'The in-depth Kosmik reports the person has bought (career, marriage and others), in full: verdict, sections, dated dasha periods, transits and remedies. Premium accounts only.',
      annotations: { title: 'My Kosmik reports', ...readOnly },
    },
    () => run(() => myReports(env)),
  );

  return server;
}
