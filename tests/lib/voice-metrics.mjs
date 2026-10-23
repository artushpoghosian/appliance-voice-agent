// Measures how Mia sounds from Retell call data: reply gaps, pace, pauses, turn length and wording habits.

const SYSTEM_TEXT = /##|current date and time|upcoming dates|unintelligible|agent_note|\bjson\b|\b(my|the|your) instructions\b|\bprompt\b/i;
export const hasSystemText = (text) => SYSTEM_TEXT.test(text || '');

export function percentile(values, p) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export function callMetrics(call) {
  const turns = (call.transcript_object || []).filter((u) => (u.words || []).length);
  const m = {
    gaps: [], llm: (call.latency?.llm?.values || []).filter((v) => v > 0), wpm: [], sentencePauses: [],
    turnWords: [], turnSecs: [], agentTurns: 0, gotItTurns: 0, systemText: false, bracketTags: 0, cutOffs: 0,
  };
  turns.forEach((u, i) => {
    if (u.role !== 'agent') return;
    const w = u.words;
    const start = w[0].start;
    const end = w[w.length - 1].end;
    const system = hasSystemText(u.content);
    m.agentTurns += 1;
    m.turnWords.push(w.length);
    if (system) m.systemText = true;
    else m.turnSecs.push(end - start);
    if (/^\W*got it\b/i.test(u.content)) m.gotItTurns += 1;
    if (w.length >= 6 && end > start) m.wpm.push((w.length / (end - start)) * 60);
    for (let j = 1; j < w.length; j++) {
      if (/[.?!]\s*$/.test(w[j - 1].word)) m.sentencePauses.push(w[j].start - w[j - 1].end);
    }
    m.bracketTags += w.filter((x) => /^\s*\[/.test(x.word)).length;
    const prev = turns[i - 1];
    const next = turns[i + 1];
    if (prev?.role === 'user') m.gaps.push(start - prev.words[prev.words.length - 1].end);
    if (next?.role === 'user' && next.words[0].start < end - 0.15) m.cutOffs += 1;
  });
  return m;
}

export function summarize(calls) {
  const all = calls.map(callMetrics);
  const flat = (k) => all.flatMap((m) => m[k]);
  const sum = (k) => all.reduce((n, m) => n + m[k], 0);
  const max = (values) => (values.length ? Math.max(...values) : NaN);
  const gaps = flat('gaps');
  const agentTurns = sum('agentTurns');
  return {
    calls: calls.length,
    gapP50: percentile(gaps, 0.5),
    gapP90: percentile(gaps, 0.9),
    gapMax: max(gaps),
    llmP50: percentile(flat('llm'), 0.5),
    wpmP50: percentile(flat('wpm'), 0.5),
    sentencePauseP50: percentile(flat('sentencePauses'), 0.5),
    wordsP90: percentile(flat('turnWords'), 0.9),
    longestTurnSecs: max(flat('turnSecs')),
    gotItShare: agentTurns ? sum('gotItTurns') / agentTurns : NaN,
    systemTextCalls: all.filter((m) => m.systemText).length,
    bracketTags: sum('bracketTags'),
    cutOffShare: agentTurns ? sum('cutOffs') / agentTurns : NaN,
  };
}

// Measured on the 22 calls to v18-v23 (2026-10-22), before any tuning.
export const BASELINE = {
  gapP50: 1.36, gapP90: 2.31, gapMax: 8.1, llmP50: 810, wpmP50: 205, sentencePauseP50: 0.21,
  wordsP90: 29, longestTurnSecs: 15, gotItShare: 0.16, systemTextCalls: 1,
};

export const TARGETS = {
  gapP50: ['≤ 1.0', (v) => v <= 1.0],
  gapP90: ['≤ 1.6', (v) => v <= 1.6],
  gapMax: ['< 3', (v) => v < 3],
  llmP50: ['≤ 550', (v) => v <= 550],
  wpmP50: ['165–185', (v) => v >= 165 && v <= 185],
  sentencePauseP50: ['≥ 0.35', (v) => v >= 0.35],
  wordsP90: ['≤ 22', (v) => v <= 22],
  longestTurnSecs: ['≤ 9', (v) => v <= 9],
  gotItShare: ['≤ 7%', (v) => v <= 0.07],
  systemTextCalls: ['0', (v) => v === 0],
  bracketTags: ['0', (v) => v === 0],
};

const ROWS = [
  ['gapP50', 'Gap after caller, p50 (s)', 2],
  ['gapP90', 'Gap after caller, p90 (s)', 2],
  ['gapMax', 'Gap after caller, worst (s)', 2],
  ['llmP50', 'LLM latency, p50 (ms)', 0],
  ['wpmP50', 'Pace, p50 (wpm)', 0],
  ['sentencePauseP50', 'Pause between sentences, p50 (s)', 2],
  ['wordsP90', 'Words per turn, p90', 0],
  ['longestTurnSecs', 'Longest turn (s)', 1],
  ['gotItShare', 'Turns opening with "Got it"', '%'],
  ['systemTextCalls', 'Calls with system text', 0],
  ['bracketTags', 'Expressive tags in transcript', 0],
  ['cutOffShare', 'Turns cut off by the caller', '%'],
];

export function formatTable(summary) {
  const fmt = (v, d) => {
    if (v === undefined || Number.isNaN(v)) return '—';
    return d === '%' ? `${Math.round(v * 100)}%` : v.toFixed(d);
  };
  const rows = ROWS.map(([key, label, d]) => {
    const target = TARGETS[key];
    const mark = target && !Number.isNaN(summary[key]) ? (target[1](summary[key]) ? '✓' : '✗') : '';
    return [label, fmt(BASELINE[key], d), fmt(summary[key], d), target ? target[0] : '', mark];
  });
  const table = [['Metric', 'Baseline', 'This run', 'Target', ''], ...rows];
  const widths = table[0].map((_, c) => Math.max(...table.map((row) => row[c].length)));
  return [`${summary.calls} calls`, ...table.map((row) => row.map((cell, c) => cell.padEnd(widths[c])).join('  ').trimEnd())].join('\n');
}
