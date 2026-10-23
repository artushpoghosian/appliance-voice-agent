# Web-call scripts for tuning Mia's voice

These calls check how Mia **sounds**: reply speed, pace, pauses, interruptions. Booking rules are covered by `tests/playground.mjs` and `tests/test-scenarios.md`.

## Before you call

1. Deploy the draft: `node --env-file=.env retell/deploy.mjs --draft` (it prints the draft version number).
2. In the Retell dashboard, open the agent, pick that draft version, and press **Test Audio**.
3. Web calls have no caller ID, so give the number from the script when Mia asks.
4. If Mia asks things in a different order, answer what she asks using the script's details.
5. Measure afterwards: `node --env-file=.env tests/voice-metrics.mjs --version=N --type=web_call`

After each call, note a 1–5 naturalness score and the worst moment.

## W1. Relaxed booking

1. "Hi, yeah, my dryer stopped heating, um, since yesterday."
2. "It's a Whirlpool."
3. "Maria Lopez."
4. "512 555 0142."
5. "Yep, that's right."
6. "412 Oak Street, Austin."
7. "Yes."
8. "Yeah, that's fine."
9. "No, that's it, thanks."

Listen for: the delay before each reply, her pace, and pauses in the number readback.

## W2. Pauses and a correction

1. "Hi... *(two-second pause)* my washer is making a loud banging noise."
2. "Maytag."
3. "Linda Park."
4. "512 555 0187."
5. "Yes."
6. "It's 412... *(one-second pause)* sorry, 414 Pine Street, Austin."
7. "Yes."
8. "Sure."

Listen for: whether she jumps in during your pauses, and whether she uses 414.

## W3. Fee hesitation, then yes

1. "My Bosch dishwasher is leaking."
2. "Julia Ross."
3. "512 555 0110."
4. "Yes."
5. "12 Oak Lane, Austin."
6. "Yes."
7. At the fee: "Hmm. Does that go toward the repair?"
8. "Okay, let's do it."

Listen for: a natural "I don't have that" answer, no pushing, and a booking after "let's do it".

## W4. LG warranty

1. "Hi, my LG fridge stopped cooling, it's still under warranty."
2. "Dana Kim."
3. "512 555 0133."
4. "Yes."
5. "77 Pine Ave, Austin."
6. "Yes."

Listen for: no fee mention, and a short, natural confirmation.

## W5. Talking over her

1. "My Frigidaire freezer stopped freezing."
2. Cut in while she asks your name: "Oh, and it clicks a lot. I'm Tom Becker."
3. "512 555 0199." Then say "mm-hmm" while she reads it back.
4. "301 Lake Road, Austin."
5. "Yes."
6. At the fee: "Yes, that's fine." While she says "one sec", ask: "Do you need the model number?"

Listen for: she stops when you talk, doesn't repeat herself, and still tells you it's booked.
