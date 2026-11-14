// Traditional tambola calls, indexed by number.
window.CALLS = ["",
"Kelly’s eye","One little duck","Cup of tea","Knock at the door","Man alive","Half a dozen","Lucky seven","Garden gate","Doctor’s orders","Cock and hen",
"Legs eleven","One dozen","Unlucky for some","Valentine’s Day","Young and keen","Sweet sixteen","Dancing queen","Coming of age","Goodbye teens","One score",
"Key of the door","Two little ducks","Thee and me","Two dozen","Duck and dive","Pick and mix","Gateway to heaven","In a state","Rise and shine","Dirty Gertie",
"Get up and run","Buckle my shoe","All the threes","Ask for more","Jump and jive","Three dozen","More than eleven","Christmas cake","All the steps","Naughty forty",
"Time for fun","Four and two","Down on your knees","Droopy drawers","Halfway there","Up to tricks","Four and seven","Four dozen","Nearly fifty","Half a century",
"Tweak of the thumb","Weeks in a year","Stuck in the tree","Clean the floor","Snakes alive","Was she worth it?","All the beans","Make them wait","Brighton line","Five dozen",
"Baker’s bun","Tickety-boo","Tickle me","Red raw","Old age pension","Clickety click","Made in heaven","Saving grace","Either way up","Three score and ten",
"Bang on the drum","Six dozen","Queen bee","Candy store","Strive and strive","Trombones","Sunset strip","Heaven’s gate","One more time","Eight and blank",
"Stop and run","Straight on through","Time for tea","Seven dozen","Staying alive","Between the sticks","Torquay in Devon","Two fat ladies","Nearly there","Top of the shop"];

window.speakCall = function (n, withRhyme) {
  if (!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const rhyme = (window.CALLS[n] || "").replace(/’/g, "'");
    const u = new SpeechSynthesisUtterance(withRhyme ? `${rhyme}. ${n}` : String(n));
    u.rate = 0.92;
    speechSynthesis.speak(u);
  } catch (e) {}
};
