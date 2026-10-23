// A scripted test caller: answers whatever Mia asks from a scenario's caller details, in any order.
export function scriptedCaller(profile) {
  const opening = [].concat(profile.opening || []);
  const fallback = profile.fallback ?? 'Okay.';
  let answers = 0;
  let corrected = false;
  const fees = [].concat(profile.fee || []);
  let lastFee = fallback;
  const others = [].concat(profile.anythingElse ?? "No, that's all, thanks.");
  const interjections = [].concat(profile.interject || []);
  let done = false;
  const asked = {};
  // A list answer gives its items in turn and then repeats the last one.
  const give = (field) => {
    asked[field] = (asked[field] || 0) + 1;
    const answers = [].concat(profile[field] ?? fallback);
    return answers[Math.min(asked[field], answers.length) - 1];
  };
  const caller = (agentLine) => {
    if (opening.length) return opening.shift();
    if (done) return null;
    const full = String(agentLine || '').toLowerCase();
    // Answer the question Mia ends on, not something she mentioned earlier in the same turn.
    const line = full.split(/(?<=[.!?])\s+/).filter((s) => s.includes('?')).pop() || full;
    if (/anything else/.test(full)) {
      done = others.length === 1;
      return done ? others[0] : others.shift();
    }
    if (interjections.length && answers >= interjections[0].afterAnswers) return interjections.shift().say;
    answers += 1;
    if (/\$\s?99|ninety[\s-]?nine|service call fee/.test(full) && /okay|fine|alright|all right/.test(line)) {
      if (fees.length) lastFee = fees.shift();
      else lastFee = profile.feeAgain ?? lastFee;
      return lastFee;
    }
    if (/is that right|is that correct|did i get that|right\?|correct\?|right number|correct number/.test(line)) {
      if (profile.correction && !corrected && new RegExp(profile.correction.wrong, 'i').test(full)) {
        corrected = true;
        return profile.correction.say;
      }
      return profile.confirm ?? "Yes, that's right.";
    }
    if (/brand|make/.test(line)) return give('brand');
    if (/name|who am i speaking|who's calling/.test(line)) return give('name');
    if (/number|reach you|call you/.test(line)) return give('phone');
    if (/address|street|house number/.test(line)) return give('address');
    if (/safe/.test(line)) return profile.safe ?? fallback;
    if (/going on|wrong|problem|happen|issue/.test(line)) return give('issue');
    return fallback;
  };
  caller.asked = asked; // how often Mia asked for each detail
  return caller;
}
