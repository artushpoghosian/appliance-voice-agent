# Test calls for Mia (FixCall AI)

Call **+1 (302) 309-8447** (or use Retell's Test chat / Test Audio). Say one line at a time and wait for Mia.
Every call should produce **one Telegram alert** in Call Feed within about a minute. Only **booked** calls add a row to the `Jobs` tab.
## A. Standard bookings (should book after the $99 fee)

### A1. Dryer not heating, accepts fee
**You say:**
1. Hi, my dryer stopped heating.
2. It's a Whirlpool.
3. My name is Maria Lopez.
4. Yes, the number I'm calling from is fine.
5. 412 Oak Street, Austin, Texas.
6. Yes, that's right.
7. Yes, $99 is okay.

**Mia must:** One question per turn; confirms number and address once; says the exact $99 line before booking; after booking says the office will reach out to confirm the time (no date or time).

**Telegram:** 🔧 New booking: standard job  
**Sheet:** 1 row, job_type standard, fee_accepted true

### A2. Different callback number
**You say:**
1. Hi, my Bosch dishwasher won't drain.
2. I'm David Chen.
3. Actually, please use my cell: 512 555 0187.
4. 88 Maple Drive, Round Rock.
5. Sure, that's fine.

**Mia must:** Uses 512-555-0187, not the caller ID; reads it back digit by digit once.

**Telegram:** 🔧 standard, Callback 5125550187  
**Sheet:** 1 row with the cell number

### A3. Everything in one breath
**You say:**
1. Hi, I'm Rachel Green, my Frigidaire fridge is leaking water, I'm at 15 Elm Court in Austin and you can call me back on this number.

**Mia must:** Asks nothing it already has; only confirms number and address, then the fee line.

**Telegram:** 🔧 standard  
**Sheet:** 1 row

### A4. Error code and access notes
**You say:**
1. My KitchenAid oven won't heat up, it shows error F2.
2. Tom Becker.
3. This number is fine.
4. 301 Lake Road. There's a gate code, 4411, and a friendly dog.
5. Yes, go ahead.

**Mia must:** Keeps the error code, gate code and dog in notes.

**Telegram:** 🔧 standard, Notes: F2, gate 4411, dog  
**Sheet:** 1 row, notes filled

### A5. Address correction
**You say:**
1. My Maytag washer is making a loud banging noise.
2. Linda Park.
3. Yes, this number.
4. 412 Pine Street.
5. Sorry, I meant 414 Pine Street, not 412.
6. Yes, the fee is fine.

**Mia must:** Uses 414 everywhere after the correction.

**Telegram:** 🔧 standard, Address 414 Pine Street  
**Sheet:** 1 row with 414

### A6. Brand unknown
**You say:**
1. My freezer stopped freezing.
2. Honestly I don't know the brand, it came with the house.
3. Kevin Moore.
4. Yes, this number.
5. 9 Birch Lane.
6. Okay, $99 is fine.

**Mia must:** Doesn't push for the brand or invent one; books with brand unknown.

**Telegram:** 🔧 standard, Brand unknown  
**Sheet:** 1 row, brand unknown

### A7. Two appliances
**You say:**
1. My washer won't spin and my dryer is squeaking too. Both Samsung.
2. Anna Petrova.
3. This number works.
4. 27 Cedar Ave.
5. Yes, that's fine.

**Mia must:** One booking; the second appliance goes into notes. Does NOT treat Samsung as warranty (you never said warranty).

**Telegram:** 🔧 standard, second appliance in Notes  
**Sheet:** 1 row

### A8. Unusual name to spell
**You say:**
1. My GE range burner won't light.
2. Siobhan O'Connell.
3. S-I-O-B-H-A-N, O apostrophe C-O-N-N-E-L-L.
4. This number.
5. 5 River Road.
6. Yes.

**Mia must:** Gets the spelling right; GE without warranty is still a standard job with the fee.

**Telegram:** 🔧 standard, Name Siobhan O'Connell  
**Sheet:** 1 row

## B. Fee gate (no booking unless a clear yes)

### B1. Declines the fee
**You say:**
1. My Whirlpool fridge isn't cooling.
2. Mark Davis.
3. This number.
4. 60 Hill Street.
5. Hmm, no, $99 is too much for me.

**Mia must:** No pushing, no discount, no booking; polite close ("If you change your mind, just give us a call").

**Telegram:** ⚠️ No booking (fee declined)  
**Sheet:** none

### B2. Asks for a discount
**You say:**
1. My dishwasher is leaking. It's a Bosch.
2. Julia Ross.
3. This number.
4. 12 Oak Lane.
5. Can you do it for less? Like $50?

**Mia must:** Offers no discount; if you don't then say yes, doesn't book.

**Telegram:** ⚠️ No booking (fee declined)  
**Sheet:** none

### B3. Asks the total repair cost
**You say:**
1. How much does it cost to fix a dryer that won't heat?

**Mia must:** Says it doesn't have repair prices and will pass it on; may mention the $99 service fee; never invents a repair price.

**Telegram:** per outcome; question in Notes  
**Sheet:** only if booked

### B4. Does the $99 go toward the repair?
**You say:**
1. Before I agree, does the $99 go toward the repair cost?

**Mia must:** "I don't have that, but I'll pass it to the team". No made-up policy.

**Telegram:** per outcome; question in Notes  
**Sheet:** only if booked

### B5. Says yes, then changes mind
**You say:**
1. (standard intake) ... Yes, that's fine.
2. Actually wait, no, I'd rather not pay that. Don't book it.

**Mia must:** Doesn't book (or doesn't say booked); polite close.

**Telegram:** ⚠️ No booking (fee declined)  
**Sheet:** ideally none; note it if a row appears

### B6. Unsure answer
**You say:**
1. (standard intake, at the fee line) Um... I guess? I'm not sure.

**Mia must:** Treats unsure as not a clear yes: checks again or closes without booking.

**Telegram:** ⚠️ or 🔧 only after a clear yes  
**Sheet:** only after a clear yes

## C. Warranty customers

### C1. LG under warranty, said up front
**You say:**
1. Hi, my LG fridge stopped cooling. It's still under the LG warranty.
2. Dana Kim.
3. This number.
4. 77 Pine Ave.
5. Yes, correct.

**Mia must:** Never mentions $99; books as warranty.

**Telegram:** 🛡️ New booking: warranty job (no fee)  
**Sheet:** 1 row, job_type warranty

### C2. Samsung, warranty mentioned only when asked the brand
**You say:**
1. My washer won't drain.
2. It's a Samsung, still under warranty actually.
3. Chris Lee.
4. This number.
5. 4 Valley Road.
6. Yes.

**Mia must:** Switches to warranty the moment you say it; no fee.

**Telegram:** 🛡️ warranty (Samsung)  
**Sheet:** 1 row, warranty

### C3. General Electric by full name
**You say:**
1. My General Electric dishwasher is under warranty and it won't start.
2. Paul Adams.
3. This number.
4. 20 Lake View.
5. Yes.

**Mia must:** Recognises General Electric as GE; warranty, no fee.

**Telegram:** 🛡️ warranty (GE)  
**Sheet:** 1 row, warranty

### C4. Warranty raised after the fee quote
**You say:**
1. (Samsung dryer, standard intake; at the $99 line say:) Oh wait, it's still under the Samsung warranty.

**Mia must:** Says there's no service call fee since it's under warranty; books as warranty.

**Telegram:** 🛡️ warranty  
**Sheet:** 1 row, warranty

### C5. Whirlpool "under warranty", accepts regular visit
**You say:**
1. My Whirlpool washer is under warranty, it won't spin.
2. (after her explanation) Okay, send someone anyway.
3. Sara Wilson.
4. This number.
5. 3 Forest Lane.
6. Yes, $99 is fine.

**Mia must:** Says they only do warranty work for LG, Samsung and GE; offers a regular visit with the fee line; books standard.

**Telegram:** 🔧 standard, warranty mentioned  
**Sheet:** 1 row, standard

### C6. Kenmore "under warranty", declines
**You say:**
1. My Kenmore fridge is under warranty, it's leaking.
2. No thanks, I'll call Kenmore then.

**Mia must:** Same explanation; no booking.

**Telegram:** ⚠️ No booking  
**Sheet:** none

### C7. Says warranty, doesn't know the brand
**You say:**
1. My oven's under warranty but I don't know what brand it is.

**Mia must:** Doesn't assume coverage; can't confirm warranty without LG/Samsung/GE; offers a regular visit.

**Telegram:** per outcome  
**Sheet:** only if booked as standard

### C8. LG with no warranty mentioned
**You say:**
1. My LG microwave stopped working.
2. (answer the intake normally, never mention warranty)

**Mia must:** Never asks about warranty; standard job with the $99 fee.

**Telegram:** 🔧 standard  
**Sheet:** 1 row, standard

### C9. Homeowner with a home warranty plan
**You say:**
1. I have a home warranty with Choice Home Warranty. My Frigidaire stove isn't working.

**Mia must:** Treats you as a customer (not a rep). Frigidaire isn't LG/Samsung/GE, so offers a regular visit with the fee.

**Telegram:** 🔧 or ⚠️, not 📨  
**Sheet:** only if booked

## D. Home warranty company reps (message only, never booked)

### D1. American Home Shield with work order
**You say:**
1. Hi, this is Jen Alvarez with American Home Shield. I have a dispatch for a refrigerator not cooling at 18 Cedar Court, homeowner Pat Gomez, work order 88-1234.
2. You can reach me at 800 555 0111.

**Mia must:** Takes name, company, callback number, job and work order; "I'll pass this to the team and someone will call you back"; ends the call. No fee, no booking.

**Telegram:** 📨 Message from a warranty company  
**Sheet:** none

### D2. Rep with an extension, in a hurry
**You say:**
1. This is Mike from Choice Home Warranty, quick dispatch, dishwasher leak, claim 55-221.
2. Call me at 888 555 0100 extension 42.

**Mia must:** Keeps the extension; short and efficient.

**Telegram:** 📨 with ext. 42  
**Sheet:** none

### D3. Rep asks for an ETA and to book
**You say:**
1. (as a warranty company rep) Can you book the tech for Thursday and tell me the ETA?

**Mia must:** No booking, no date or ETA; takes the message.

**Telegram:** 📨  
**Sheet:** none

## E. Spam and irrelevant (instant drop)

### E1. Car extended warranty robocall
**You say:**
1. We've been trying to reach you about your car's extended warranty.

**Mia must:** "Sorry, I can't help you with that." and hangs up at once. Must not treat it as a warranty customer.

**Telegram:** 🚫 Spam (silent)  
**Sheet:** none

### E2. SEO / Google listing pitch
**You say:**
1. Hi, I can get your business to the top of Google search results.

**Mia must:** Same one line, hangs up.

**Telegram:** 🚫 Spam (silent)  
**Sheet:** none

### E3. Business loan offer
**You say:**
1. Hello, you've been pre-approved for a business line of credit up to $250,000.

**Mia must:** Same one line, hangs up.

**Telegram:** 🚫 Spam (silent)  
**Sheet:** none

### E4. Wrong business
**You say:**
1. Hi, is this Domino's? I want to order a large pizza.

**Mia must:** Same one line, hangs up.

**Telegram:** 🚫 Spam (silent)  
**Sheet:** none

### E5. Recorded message
**You say:**
1. (read like a recording) This is an important message. Press 1 to speak to an agent.

**Mia must:** Same one line, hangs up.

**Telegram:** 🚫 Spam (silent)  
**Sheet:** none

### E6. Ambiguous opener that is NOT spam
**You say:**
1. Hi, is this the owner?
2. Oh, okay. My washer is broken, can someone come out?

**Mia must:** Doesn't drop you after the first line; continues as a normal repair call.

**Telegram:** 🔧 or ⚠️, NOT 🚫  
**Sheet:** only if booked

## F. Other situations and edge cases

### F1. Existing job update
**You say:**
1. Hi, a technician came last week for my dryer and I want an update on the part.
2. John Smith, this number.

**Mia must:** Takes a callback message (name, number, what it's about). Not spam, no booking.

**Telegram:** 📞 Callback request / other call  
**Sheet:** none

### F2. Wants a real person
**You say:**
1. Can I talk to a real person, please?

**Mia must:** Offers a callback and takes name, number and reason. Doesn't pretend to transfer.

**Telegram:** 📞 Callback request  
**Sheet:** none

### F3. Are you a robot?
**You say:**
1. (mid-intake) Wait, are you a robot?

**Mia must:** Says yes, it's an AI assistant for FixCall AI, then carries on.

**Telegram:** per outcome  
**Sheet:** per outcome

### F4. Gas smell
**You say:**
1. I smell gas near my stove.

**Mia must:** Safety first: leave the house and call 911 or the gas company from outside. Continues only once you say you're safe.

**Telegram:** per outcome  
**Sheet:** only if booked

### F5. Business hours and service area
**You say:**
1. What are your hours? And do you service Round Rock?

**Mia must:** "I don't have that, but I'll pass it to the team." No invented hours or area.

**Telegram:** per outcome; question in Notes  
**Sheet:** only if booked

### F6. Asks for a specific time
**You say:**
1. (after a booking) Can the technician come tomorrow at 3pm?

**Mia must:** No promise of a date or time; notes the preference; the office will confirm.

**Telegram:** 🔧 with the preference in Notes  
**Sheet:** 1 row

### F7. Hangs up mid-intake
**You say:**
1. My fridge is leaking.
2. My name is Amy.
3. (hang up)

**Mia must:** Nothing more; alert shows what was collected.

**Telegram:** ⚠️ No booking (call ended early)  
**Sheet:** none

### F8. Silence
**You say:**
1. (call and say nothing for 30+ seconds)

**Mia must:** Checks once whether you can hear; ends the call after the silence limit.

**Telegram:** 📞 or 🚫  
**Sheet:** none

### F9. Interrupts and talks over
**You say:**
1. (interrupt Mia mid-sentence several times with new details)

**Mia must:** Stops, listens, and uses the new details; doesn't repeat itself.

**Telegram:** per outcome  
**Sheet:** per outcome

### F10. Angry caller
**You say:**
1. This is the third time my washer broke, I'm really frustrated!

**Mia must:** Stays calm and brief, acknowledges, continues the intake; no promises.

**Telegram:** per outcome  
**Sheet:** per outcome
