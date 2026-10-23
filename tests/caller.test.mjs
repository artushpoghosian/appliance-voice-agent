import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCaller } from './lib/caller.mjs';

test('scriptedCaller answers what Mia asks, in any order', () => {
  const caller = scriptedCaller({
    opening: 'My dryer stopped heating.', brand: "It's a Whirlpool.", name: 'Maria Lopez.',
    phone: 'Yes, this number.', address: '412 Oak Street, Austin.', fee: 'Yes, $99 is okay.',
  });
  assert.equal(caller('Thanks for calling FixCall AI, this is Mia. How can I help?'), 'My dryer stopped heating.');
  assert.equal(caller("What's the address there?"), '412 Oak Street, Austin.');
  assert.equal(caller('And your name?'), 'Maria Lopez.');
  assert.equal(caller('412 Oak Street, Austin - is that right?'), "Yes, that's right.");
  assert.equal(caller("Is the number you're calling from the best one to reach you?"), 'Yes, this number.');
  assert.equal(caller("Just so you know, there's a $99 service call fee for the technician to come out. Is that okay?"), 'Yes, $99 is okay.');
  assert.equal(caller('Anything else I can help with?'), "No, that's all, thanks.");
  assert.equal(caller('Okay, thanks for calling - have a good one.'), null);
});

test('scriptedCaller corrects a wrong readback once', () => {
  const caller = scriptedCaller({ opening: 'Hi.', address: '412 Pine Street, Austin.', correction: { wrong: '412|four one two', say: 'Sorry, I meant 414 Pine Street, not 412.' } });
  caller('How can I help?');
  assert.equal(caller('Four one two Pine Street, Austin - is that right?'), 'Sorry, I meant 414 Pine Street, not 412.');
  assert.equal(caller('414 Pine Street, Austin - is that right?'), "Yes, that's right.");
});

test('scriptedCaller says its opening lines first and its interjection after N answers', () => {
  const caller = scriptedCaller({
    opening: ['Hi, is this the owner?', 'Oh, okay. My freezer stopped freezing.'],
    brand: 'Frigidaire.', name: 'Lisa Brown.', interject: { afterAnswers: 1, say: 'Wait, are you a robot?' },
  });
  assert.equal(caller('How can I help?'), 'Hi, is this the owner?');
  assert.equal(caller("This is Mia. What's going on?"), 'Oh, okay. My freezer stopped freezing.');
  assert.equal(caller('What brand is it?'), 'Frigidaire.');
  assert.equal(caller('And your name?'), 'Wait, are you a robot?');
  assert.equal(caller("Yes, I'm an AI assistant for FixCall AI. And your name?"), 'Lisa Brown.');
});

test('scriptedCaller counts how often each detail is asked for', () => {
  const caller = scriptedCaller({ opening: 'Hi.', name: 'Maria Lopez.', address: '412 Oak Street.' });
  caller('How can I help?');
  caller('And your name?');
  caller("What's the address there?");
  caller('Could I get your name again, please?');
  assert.deepEqual(caller.asked, { name: 2, address: 1 });
});

test('scriptedCaller takes lists for answers, fee replies, "anything else" and interjections', () => {
  const caller = scriptedCaller({
    opening: 'Hi.', phone: ['Yes, this number.', "It's 512 555 0111."],
    fee: ['Is it necessary?', "No, I'd rather not."], feeAgain: 'Okay, fine.',
    anythingElse: ['Can you help me with my dryer?', "No, that's all."],
    interject: [{ afterAnswers: 1, say: 'Did you get all of it?' }, { afterAnswers: 2, say: "Don't you have my info?" }],
  });
  caller('How can I help?');
  assert.equal(caller('Best number?'), 'Yes, this number.');
  assert.equal(caller("What's the number?"), 'Did you get all of it?');
  assert.equal(caller('Yes. What number should we use?'), "It's 512 555 0111.");
  assert.equal(caller('And the address?'), "Don't you have my info?");
  assert.equal(caller('The fee is $99. Is that okay?'), 'Is it necessary?');
  assert.equal(caller('So is the $99 okay?'), "No, I'd rather not.");
  assert.equal(caller('Anything else I can help with?'), 'Can you help me with my dryer?');
  assert.equal(caller("Sure. It's $99 - is that okay?"), 'Okay, fine.');
  assert.equal(caller('Anything else?'), "No, that's all.");
  assert.equal(caller('Bye.'), null);
  assert.deepEqual(caller.asked, { phone: 2 });
});

test('scriptedCaller hears "brand name" as a brand question', () => {
  const caller = scriptedCaller({ opening: 'Hi.', name: 'Maria Lopez.', brand: "I wouldn't know." });
  caller('How can I help?');
  assert.equal(caller('Were you able to find the brand name on the dryer?'), "I wouldn't know.");
});

test('scriptedCaller answers the question at the end of a long line', () => {
  const caller = scriptedCaller({ opening: 'Hi.', brand: 'Whirlpool.', address: '412 Oak Street.' });
  caller('How can I help?');
  assert.equal(caller("The brand name is usually inside the door. If you can't find it, no problem. What's the service address, please?"), '412 Oak Street.');
});

test('scriptedCaller corrects a readback said before the question', () => {
  const caller = scriptedCaller({ opening: 'Hi.', correction: { wrong: 'zero one one zero', say: 'No, the last digit is one.' } });
  caller('How can I help?');
  assert.equal(caller('Okay, five one two - five five five - zero one one zero. Is that right?'), 'No, the last digit is one.');
});

test('scriptedCaller treats "is X the right number?" as a readback', () => {
  const caller = scriptedCaller({ opening: 'Hi.', phone: '512 555 0110.' });
  caller('How can I help?');
  assert.equal(caller('Great. Is five one two - five five five - zero one one zero the right number?'), "Yes, that's right.");
});
