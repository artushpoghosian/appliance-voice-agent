// Checks Mia's lines for assistant-speak: long turns, repeated openers, banned phrases, system text, contradictions.
import { percentile, hasSystemText } from './voice-metrics.mjs';

export const BANNED = ['certainly', 'assist', 'full name', 'what seems to be the problem', 'i apologize', 'please provide', 'i understand your frustration'];
export const LIMITS = { wordsP90: 22, maxWords: 28, gotItShare: 0.07, backToBackShare: 0.05 };

// Expressive-mode tags like [pause] shape the audio and are never spoken.
const spoken = (text) => text.replace(/\[[a-z ]+\]\s*/gi, '');
const words = (text) => spoken(text).trim().split(/\s+/).filter(Boolean);
const normalize = (text) => spoken(text).toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Acknowledgments whose repetition sounds scripted; two questions that both start "What's the" don't.
const ACKS = ['got it', 'no problem', 'thank you', 'all right', 'thanks', 'okay', 'ok', 'alright', 'great', 'perfect', 'sure', 'oh', 'right', 'yeah', 'yes', 'awesome', 'cool', 'mm hmm', 'mhm', 'so'];
const ack = (text) => {
  const n = normalize(text);
  return ACKS.find((a) => n === a || n.startsWith(`${a} `)) || '';
};

export const opener = (text) => normalize(text).split(' ').slice(0, 2).join(' ');

export function bannedIn(text) {
  const n = ` ${normalize(text)} `;
  return BANNED.filter((phrase) => n.includes(` ${phrase} `));
}

export function wordingReport(conversations) {
  const counts = [];
  let turns = 0;
  let gotIt = 0;
  let backToBack = 0;
  const banned = [];
  const systemText = [];
  const contradictions = [];
  for (const { id, agentLines } of conversations) {
    let previousAck = '';
    for (const line of agentLines) {
      turns += 1;
      counts.push({ n: words(line).length, safety: line.includes('911') });
      const o = opener(line);
      if (o === 'got it') gotIt += 1;
      const a = ack(line);
      if (a && a === previousAck) backToBack += 1;
      previousAck = a;
      for (const phrase of bannedIn(line)) banned.push({ id, phrase, line });
      if (hasSystemText(line)) systemText.push({ id, line });
      if (/\bone (moment|sec(ond)?)\b/i.test(line) && /\b(booked|all set)\b/i.test(line)) contradictions.push({ id, line });
    }
  }
  return {
    turns,
    wordsP90: percentile(counts.map((c) => c.n), 0.9),
    maxWords: Math.max(0, ...counts.filter((c) => !c.safety).map((c) => c.n)),
    gotItShare: turns ? gotIt / turns : 0,
    backToBackShare: turns ? backToBack / turns : 0,
    banned,
    systemText,
    contradictions,
  };
}

export function wordingFailures(report) {
  const out = [];
  for (const [key, limit] of Object.entries(LIMITS)) {
    if (report[key] > limit) out.push(`${key} ${Math.round(report[key] * 100) / 100} > ${limit}`);
  }
  for (const b of report.banned) out.push(`${b.id}: says "${b.phrase}": ${b.line}`);
  for (const s of report.systemText) out.push(`${s.id}: system text: ${s.line}`);
  for (const c of report.contradictions) out.push(`${c.id}: waits and finishes in one line: ${c.line}`);
  return out;
}
