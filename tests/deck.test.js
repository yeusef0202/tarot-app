"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../deck.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Critical chi-square value (Wilson–Hilferty approximation). z=3.719 → p≈0.0001,
 *  so a correct implementation fails a given test only 1 time in 10,000 runs. */
function chiSquareCritical(df, z = 3.719) {
  const a = 2 / (9 * df);
  return df * Math.pow(1 - a + z * Math.sqrt(a), 3);
}

function chiSquare(counts, expected) {
  return counts.reduce((sum, o) => sum + ((o - expected) ** 2) / expected, 0);
}

/** Small seeded PRNG (mulberry32) for reproducibility tests. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True if `text` contains `term` starting at a word boundary ("ending" does
 *  not match "blending", but the stem "manipulat" matches "manipulation"). */
function mentions(text, term) {
  return new RegExp("(^|[^a-z])" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text);
}

const byName = Object.fromEntries(T.DECK.map((c) => [c.name, c]));
const indexOf = Object.fromEntries(T.DECK.map((c, i) => [c.id, i]));
const up = (name) => ({ card: byName[name], reversed: false });
const rev = (name) => ({ card: byName[name], reversed: true });

// ---------------------------------------------------------------------------
// 1. Deck structure
// ---------------------------------------------------------------------------
const MAJOR_NAMES = [
  "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
  "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
  "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance",
  "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement", "The World",
];
const RANK_NAMES = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Page", "Knight", "Queen", "King"];
const SUIT_ELEMENTS = { wands: "Fire", cups: "Water", swords: "Air", pentacles: "Earth" };

test("deck has exactly 78 unique cards", () => {
  assert.equal(T.DECK.length, 78);
  assert.equal(new Set(T.DECK.map((c) => c.id)).size, 78);
  assert.equal(new Set(T.DECK.map((c) => c.name)).size, 78);
});

test("22 Major Arcana in RWS order (Strength = VIII, Justice = XI)", () => {
  const majors = T.DECK.filter((c) => c.arcana === "major");
  assert.deepEqual(majors.map((c) => c.name), MAJOR_NAMES);
  majors.forEach((c, i) => assert.equal(c.number, i));
  assert.equal(byName["Strength"].numeral, "VIII");
  assert.equal(byName["Justice"].numeral, "XI");
  assert.equal(byName["The World"].numeral, "XXI");
  assert.equal(byName["The Fool"].numeral, "0");
});

test("four suits of 14 cards (Ace–Ten, Page, Knight, Queen, King) with correct elements", () => {
  for (const [suit, element] of Object.entries(SUIT_ELEMENTS)) {
    const cards = T.DECK.filter((c) => c.suit === suit);
    assert.equal(cards.length, 14, suit);
    const suitName = T.SUITS[suit].name;
    assert.deepEqual(cards.map((c) => c.name), RANK_NAMES.map((r) => r + " of " + suitName));
    cards.forEach((c) => {
      assert.equal(c.element, element);
      assert.equal(c.court, ["Page", "Knight", "Queen", "King"].includes(c.rank));
    });
  }
});

test("every card has complete upright and reversed content", () => {
  for (const c of T.DECK) {
    assert.ok(c.keywords.upright.length >= 3, c.name + " upright keywords");
    assert.ok(c.keywords.reversed.length >= 3, c.name + " reversed keywords");
    assert.ok(c.meaning.upright.length > 40, c.name + " upright meaning");
    assert.ok(c.meaning.reversed.length > 30, c.name + " reversed meaning");
    assert.ok(c.image.length > 30, c.name + " image");
    assert.notEqual(c.meaning.upright, c.meaning.reversed, c.name);
    assert.notDeepEqual(c.keywords.upright, c.keywords.reversed, c.name);
  }
});

test("no two cards share the same meaning text (catches copy/paste errors)", () => {
  const texts = T.DECK.flatMap((c) => [c.meaning.upright, c.meaning.reversed, c.image]);
  assert.equal(new Set(texts).size, texts.length);
});

// Each topic meaning must be about its topic, so swapped fields (a money text
// under love) are caught.
const TOPIC_WORDS = {
  love: /love|relationship|partner|romanc|single|dating|crush|flirt|admirer|lover|heart/i,
  career: /work|job|career|colleague|boss|project|business|team/i,
  money: /money|financ|spend|saving|budget|income|debt|invest|pay|wealth/i,
  health: /health|body|energy|rest|stress|wellbeing|sleep|habit|vitality|recover|tension|mood|anxiety|exhaust|burnout/i,
};

test("every card has an upright and reversed meaning for love, career, money and health", () => {
  assert.deepEqual(T.TOPICS, ["general", "love", "career", "money", "health"]);
  const seen = new Set();
  for (const c of T.DECK) {
    assert.deepEqual(Object.keys(c.topics), Object.keys(TOPIC_WORDS), c.name);
    for (const [topic, words] of Object.entries(TOPIC_WORDS)) {
      for (const o of ["upright", "reversed"]) {
        const text = c.topics[topic][o];
        assert.ok(typeof text === "string" && text.length > 30, `${c.name} ${topic} ${o}`);
        assert.match(text, words, `${c.name} ${topic} ${o}: ${text}`);
        assert.ok(!seen.has(text), "duplicate text: " + text);
        seen.add(text);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Descriptions are correct: checked against an independent reference of
//    standard RWS meanings (Waite, Biddy Tarot, Labyrinthos). Each entry lists
//    acceptable core concepts for [upright, reversed, imagery]; the card must
//    mention at least one of each. This catches shifted/swapped data, since a
//    card carrying its neighbour's text would fail.
// ---------------------------------------------------------------------------
const REFERENCE = {
  "The Fool": [["beginning", "fresh start"], ["reckless", "naiv", "careless"], ["cliff"]],
  "The Magician": [["manifest", "into reality"], ["manipulat"], ["infinity"]],
  "The High Priestess": [["intuition"], ["secret"], ["pillar"]],
  "The Empress": [["abundance", "fertility"], ["block", "dependence"], ["wheat"]],
  "The Emperor": [["authority", "structure"], ["rigid", "domination"], ["ram"]],
  "The Hierophant": [["tradition"], ["rebel", "unconvention", "question the rules"], ["keys"]],
  "The Lovers": [["love", "harmony"], ["disharmony", "imbalance", "out of balance"], ["angel"]],
  "The Chariot": [["willpower", "determination"], ["lack of direction", "control"], ["sphinx"]],
  "Strength": [["courage", "inner strength"], ["self-doubt"], ["lion"]],
  "The Hermit": [["introspection", "soul-searching"], ["isolation", "loneliness"], ["lantern"]],
  "Wheel of Fortune": [["cycle", "destiny", "luck"], ["bad luck", "resist"], ["wheel"]],
  "Justice": [["fairness", "truth"], ["unfair", "dishonest"], ["scales"]],
  "The Hanged Man": [["surrender", "pause", "perspective"], ["stall", "resist"], ["upside down"]],
  "Death": [["transformation", "ending"], ["resist", "stagnation"], ["skeleton"]],
  "Temperance": [["balance", "moderation"], ["imbalance", "excess"], ["angel"]],
  "The Devil": [["addiction", "bondage", "materialism", "trapped", "unhealthy attachment"], ["release", "breaking free"], ["chain"]],
  "The Tower": [["upheaval", "chaos", "sudden", "collapse"], ["fear of change", "avert", "delaying the inevitable"], ["lightning"]],
  "The Star": [["hope"], ["despair", "lack of faith", "discouraged", "lost faith"], ["star"]],
  "The Moon": [["illusion", "anxiety"], ["release of fear", "clarity", "confusion is lifting", "fears come to light"], ["crayfish"]],
  "The Sun": [["joy", "success"], ["sadness", "blocked", "dimmed", "overly optimistic"], ["child"]],
  "Judgement": [["rebirth", "calling", "awakening", "reckoning"], ["self-doubt", "self-judgment", "self-criticism"], ["trumpet"]],
  "The World": [["completion", "accomplishment"], ["incomplet", "closure"], ["wreath"]],

  "Ace of Wands": [["inspiration"], ["delay", "block"], ["sprouting"]],
  "Two of Wands": [["planning", "future"], ["fear of the unknown", "lack of planning"], ["globe"]],
  "Three of Wands": [["expan", "foresight"], ["obstacle", "delay"], ["ships"]],
  "Four of Wands": [["celebration", "homecoming"], ["transition", "lack of support"], ["garland"]],
  "Five of Wands": [["conflict", "competition"], ["avoid", "resolution"], ["five young men"]],
  "Six of Wands": [["victory", "recognition"], ["egotism", "fall from grace"], ["laurel"]],
  "Seven of Wands": [["perseverance", "defend", "standing your ground"], ["giving up", "overwhelm"], ["six wands"]],
  "Eight of Wands": [["speed", "swift", "rapid"], ["delay", "frustration"], ["eight wands fly"]],
  "Nine of Wands": [["resilience", "persistence"], ["exhaustion", "paranoia"], ["bandage"]],
  "Ten of Wands": [["burden", "overwork"], ["releasing burdens", "delegat"], ["ten wands"]],
  "Page of Wands": [["enthusias", "explor"], ["lack of direction", "procrastination"], ["salamander"]],
  "Knight of Wands": [["energy", "passion", "adventure"], ["haste", "reckless"], ["rearing"]],
  "Queen of Wands": [["courage", "confiden"], ["jealous", "selfish"], ["black cat"]],
  "King of Wands": [["leader", "vision"], ["impulsive", "overbearing"], ["salamander"]],

  "Ace of Cups": [["love", "new feelings"], ["repressed", "blocked"], ["dove"]],
  "Two of Cups": [["partnership", "unified love"], ["imbalance", "out of balance", "communication has broken"], ["exchange cups"]],
  "Three of Cups": [["celebration", "friendship"], ["overindulgence", "gossip"], ["three women"]],
  "Four of Cups": [["apathy", "contemplation", "withdrawn", "dissatisfied"], ["awareness", "coming out of apathy"], ["arms crossed"]],
  "Five of Cups": [["loss", "grief", "regret"], ["accept", "move on", "moving on"], ["spilled"]],
  "Six of Cups": [["nostalgia", "childhood"], ["stuck in the past", "clinging to the past"], ["flowers"]],
  "Seven of Cups": [["choices", "illusion", "fantasy"], ["clarity", "decide", "decision"], ["seven cups"]],
  "Eight of Cups": [["walking away", "disillusion", "leaving behind", "deeper meaning"], ["fear of moving on", "stagnation", "fear holds you back"], ["walks away"]],
  "Nine of Cups": [["wish", "contentment", "satisfaction"], ["dissatisfaction", "materialism", "without inner satisfaction", "smug"], ["nine cups"]],
  "Ten of Cups": [["harmony", "family", "happiness"], ["disconnect", "broken family", "disrupted"], ["rainbow"]],
  "Page of Cups": [["creative opportunity", "intuitive message"], ["emotional immaturity", "creative block"], ["fish"]],
  "Knight of Cups": [["romance", "romantic", "charm"], ["moodiness", "unrealistic"], ["white horse"]],
  "Queen of Cups": [["compassion", "caring"], ["codependen", "insecurity"], ["closed cup"]],
  "King of Cups": [["emotional balance", "diplomacy"], ["manipulat", "moodiness"], ["sea"]],

  "Ace of Swords": [["breakthrough", "clarity"], ["confus", "clouded judgment"], ["crown"]],
  "Two of Swords": [["indecision", "stalemate", "difficult decisions"], ["information overload", "confusion"], ["blindfolded"]],
  "Three of Swords": [["heartbreak", "grief", "sorrow"], ["recovery", "forgiveness"], ["heart pierced"]],
  "Four of Swords": [["rest", "recuperation"], ["burnout", "restless"], ["tomb"]],
  "Five of Swords": [["conflict", "defeat", "winning at all costs"], ["reconciliation", "amends"], ["defeated"]],
  "Six of Swords": [["transition", "moving on"], ["baggage", "unfinished business"], ["boat"]],
  "Seven of Swords": [["deception", "strategy"], ["coming clean", "conscience"], ["five swords"]],
  "Eight of Swords": [["restriction", "trapped"], ["release", "freedom", "freeing yourself"], ["bound and blindfolded"]],
  "Nine of Swords": [["anxiety", "worry", "nightmares"], ["hope", "reaching out", "hidden worries"], ["in bed"]],
  "Ten of Swords": [["painful ending", "rock bottom"], ["recovery", "regeneration"], ["ten swords"]],
  "Page of Swords": [["curiosity", "new ideas"], ["gossip", "hasty"], ["hill"]],
  "Knight of Swords": [["ambition", "action", "fast thinking"], ["impulsive", "restless"], ["charges"]],
  "Queen of Swords": [["independence", "boundaries", "perceptive", "clear-minded", "sees through illusions"], ["cold", "bitter"], ["profile"]],
  "King of Swords": [["intellectual", "authority", "truth", "clear thinking"], ["abuse of power", "manipulat"], ["butterflies"]],

  "Ace of Pentacles": [["opportunity", "prosperity"], ["lost opportunity", "scarcity", "slips away"], ["garden"]],
  "Two of Pentacles": [["balance", "juggling", "adaptab"], ["overwhelm", "overcommit"], ["infinity"]],
  "Three of Pentacles": [["teamwork", "collaborat"], ["lack of teamwork", "disharmony", "poor teamwork"], ["cathedral"]],
  "Four of Pentacles": [["security", "saving", "conservation"], ["greed", "overspending"], ["clutching"]],
  "Five of Pentacles": [["hardship", "financial loss", "poverty"], ["recovery", "help"], ["snow"]],
  "Six of Pentacles": [["generosity", "charity"], ["debt", "strings attached"], ["scales"]],
  "Seven of Pentacles": [["patien", "long-term", "long term", "invest"], ["impatience", "poor return"], ["hoe"]],
  "Eight of Pentacles": [["diligence", "mastery", "skill"], ["perfectionism", "lack of focus"], ["carving"]],
  "Nine of Pentacles": [["self-sufficiency", "independence", "luxury"], ["overworking", "setback"], ["falcon"]],
  "Ten of Pentacles": [["wealth", "legacy", "inheritance"], ["family disputes", "financial failure"], ["dogs"]],
  "Page of Pentacles": [["ambition", "venture", "studi", "study"], ["procrastination", "lack of progress"], ["field"]],
  "Knight of Pentacles": [["hard work", "routine", "reliab"], ["boredom", "lazi"], ["black horse"]],
  "Queen of Pentacles": [["nurturing", "practical"], ["neglect", "work-home imbalance", "smothering"], ["rabbit"]],
  "King of Pentacles": [["wealth", "business"], ["greed", "materialism"], ["bulls"]],
};

const ASTRO = {
  "The Fool": "Air", "The Magician": "Mercury", "The High Priestess": "Moon", "The Empress": "Venus",
  "The Emperor": "Aries", "The Hierophant": "Taurus", "The Lovers": "Gemini", "The Chariot": "Cancer",
  "Strength": "Leo", "The Hermit": "Virgo", "Wheel of Fortune": "Jupiter", "Justice": "Libra",
  "The Hanged Man": "Water", "Death": "Scorpio", "Temperance": "Sagittarius", "The Devil": "Capricorn",
  "The Tower": "Mars", "The Star": "Aquarius", "The Moon": "Pisces", "The Sun": "Sun",
  "Judgement": "Fire", "The World": "Saturn",
};

test("reference table covers all 78 cards", () => {
  assert.deepEqual(Object.keys(REFERENCE).sort(), T.DECK.map((c) => c.name).sort());
});

for (const card of T.DECK) {
  test("description is correct: " + card.name, () => {
    const [up, rev, img] = REFERENCE[card.name];
    const imgText = card.image.toLowerCase();
    // Keywords and the meaning sentence are checked separately, so a meaning
    // paragraph attached to the wrong card is caught even if its keywords are right.
    const texts = {
      "upright keywords": [card.keywords.upright.join(" "), up],
      "upright meaning": [card.meaning.upright, up],
      "reversed keywords": [card.keywords.reversed.join(" "), rev],
      "reversed meaning": [card.meaning.reversed, rev],
    };
    for (const [label, [text, expected]] of Object.entries(texts)) {
      const t = text.toLowerCase();
      assert.ok(expected.some((k) => mentions(t, k)), `${card.name} ${label} should mention one of ${expected}; got: ${t}`);
    }
    assert.ok(img.some((k) => mentions(imgText, k)), `${card.name} imagery should mention one of ${img}; got: ${imgText}`);
    if (card.arcana === "major") {
      assert.ok(card.astro.startsWith(ASTRO[card.name]), `${card.name} astrology should be ${ASTRO[card.name]}, got ${card.astro}`);
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Randomness
// ---------------------------------------------------------------------------
test("shuffle returns a permutation of all 78 cards and does not mutate the deck", () => {
  const before = T.DECK.map((c) => c.id).join();
  const s = T.shuffle(T.DECK, { reversals: true });
  assert.equal(s.length, 78);
  assert.deepEqual(s.map((d) => d.card.id).sort(), T.DECK.map((c) => c.id).sort());
  assert.equal(T.DECK.map((c) => c.id).join(), before);
  s.forEach((d) => assert.equal(typeof d.reversed, "boolean"));
});

test("consecutive shuffles are all different (1000 shuffles, no repeats)", () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(T.shuffle(T.DECK).map((d) => d.card.id).join());
  assert.equal(seen.size, 1000);
});

test("shuffle is not the identity and moves cards around", () => {
  const ids = T.DECK.map((c) => c.id);
  let samePosition = 0;
  const runs = 200;
  for (let i = 0; i < runs; i++) {
    const s = T.shuffle(T.DECK);
    s.forEach((d, j) => { if (d.card.id === ids[j]) samePosition++; });
  }
  // A random permutation has on average exactly 1 fixed point.
  const avgFixed = samePosition / runs;
  assert.ok(avgFixed > 0.5 && avgFixed < 1.6, "average fixed points " + avgFixed);
});

test("every card is equally likely to land in every position (chi-square, 78×78 table)", () => {
  const N = 39000; // 500 expected per cell
  const table = Array.from({ length: 78 }, () => new Array(78).fill(0));
  for (let n = 0; n < N; n++) {
    const s = T.shuffle(T.DECK);
    for (let pos = 0; pos < 78; pos++) table[indexOf[s[pos].card.id]][pos]++;
  }
  const expected = N / 78;
  // Whole table
  const all = table.flat();
  const chiAll = chiSquare(all, expected);
  const critAll = chiSquareCritical(77 * 77);
  assert.ok(chiAll < critAll, `table chi²=${chiAll.toFixed(1)} >= ${critAll.toFixed(1)}`);
  // Top card specifically (the card most readers draw first)
  const top = table.map((row) => row[0]);
  const chiTop = chiSquare(top, expected);
  const crit = chiSquareCritical(77);
  assert.ok(chiTop < crit, `top-card chi²=${chiTop.toFixed(1)} >= ${crit.toFixed(1)}`);
});

test("drawing is uniform no matter where in the fan the user picks", () => {
  const N = 23400; // 300 expected per card
  for (const pickAt of [0, 38, 77]) {
    const counts = new Array(78).fill(0);
    for (let n = 0; n < N; n++) {
      const pile = T.cut(T.shuffle(T.DECK));
      counts[indexOf[T.take(pile, pickAt).card.id]]++;
    }
    const chi = chiSquare(counts, N / 78);
    const crit = chiSquareCritical(77);
    assert.ok(chi < crit, `pick@${pickAt}: chi²=${chi.toFixed(1)} >= ${crit.toFixed(1)}`);
    assert.ok(counts.every((c) => c > 0), "every card must be drawable");
  }
});

test("Major/Minor arcana and suits come up in the right proportions", () => {
  const N = 50000;
  const counts = { major: 0, wands: 0, cups: 0, swords: 0, pentacles: 0 };
  for (let n = 0; n < N; n++) {
    const c = T.shuffle(T.DECK)[0].card;
    counts[c.suit || "major"]++;
  }
  // Expected: 22/78 majors, 14/78 per suit.
  const exp = { major: N * 22 / 78, wands: N * 14 / 78, cups: N * 14 / 78, swords: N * 14 / 78, pentacles: N * 14 / 78 };
  const chi = Object.keys(exp).reduce((s, k) => s + ((counts[k] - exp[k]) ** 2) / exp[k], 0);
  assert.ok(chi < chiSquareCritical(4), `chi²=${chi.toFixed(2)} counts=${JSON.stringify(counts)}`);
});

test("reversals: ~50% when enabled, never when disabled, independent of the card", () => {
  const N = 2000;
  let rev = 0;
  const revPerCard = new Array(78).fill(0);
  for (let n = 0; n < N; n++) {
    for (const d of T.shuffle(T.DECK, { reversals: true })) {
      if (d.reversed) { rev++; revPerCard[indexOf[d.card.id]]++; }
    }
  }
  const total = N * 78;
  const p = rev / total;
  const sigma = Math.sqrt(0.25 / total);
  assert.ok(Math.abs(p - 0.5) < 4.5 * sigma, `reversal rate ${p}`);
  // Each card reversed ~50% of the time (binomial, n=2000 → sd≈22)
  revPerCard.forEach((r, i) => assert.ok(Math.abs(r - N / 2) < 5 * Math.sqrt(N / 4), T.DECK[i].name + " reversed " + r + "/" + N));

  for (let n = 0; n < 200; n++) {
    assert.ok(T.shuffle(T.DECK, { reversals: false }).every((d) => !d.reversed));
  }
});

test("secureRandomInt is in range and uniform", () => {
  const N = 70000;
  const counts = new Array(7).fill(0);
  for (let i = 0; i < N; i++) {
    const x = T.secureRandomInt(7);
    assert.ok(Number.isInteger(x) && x >= 0 && x < 7);
    counts[x]++;
  }
  assert.ok(chiSquare(counts, N / 7) < chiSquareCritical(6), JSON.stringify(counts));
  assert.equal(T.secureRandomInt(1), 0);
  assert.throws(() => T.secureRandomInt(0), RangeError);
});

test("cut keeps all cards, rotates the pile, and never cuts at the very top", () => {
  const pile = T.shuffle(T.DECK);
  const ids = pile.map((d) => d.card.id);
  const cutPoints = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = T.cut(pile).map((d) => d.card.id);
    assert.deepEqual([...c].sort(), [...ids].sort());
    const at = ids.indexOf(c[0]);
    assert.ok(at >= 1 && at <= 77, "cut point " + at);
    // Rotation: order is preserved cyclically
    assert.deepEqual(c, ids.slice(at).concat(ids.slice(0, at)));
    cutPoints.add(at);
  }
  assert.ok(cutPoints.size > 70, "cut points vary: " + cutPoints.size);
});

test("taking cards removes them from the pile; a Celtic Cross never repeats a card", () => {
  for (let r = 0; r < 500; r++) {
    const pile = T.shuffle(T.DECK, { reversals: true });
    const drawn = [];
    for (let i = 0; i < 10; i++) drawn.push(T.take(pile, Math.floor(Math.random() * pile.length)));
    assert.equal(pile.length, 68);
    assert.equal(new Set(drawn.map((d) => d.card.id)).size, 10);
    drawn.forEach((d) => assert.ok(!pile.some((p) => p.card.id === d.card.id)));
  }
  assert.throws(() => T.take([], 0), RangeError);
});

test("a seeded RNG gives reproducible shuffles (different seeds → different order)", () => {
  const a = T.shuffle(T.DECK, { rng: mulberry32(42), reversals: true }).map((d) => d.card.id + d.reversed);
  const b = T.shuffle(T.DECK, { rng: mulberry32(42), reversals: true }).map((d) => d.card.id + d.reversed);
  const c = T.shuffle(T.DECK, { rng: mulberry32(43), reversals: true }).map((d) => d.card.id + d.reversed);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

// ---------------------------------------------------------------------------
// 4. Spreads and reading summary
// ---------------------------------------------------------------------------
test("spreads have the right positions (Celtic Cross in Waite's order)", () => {
  assert.equal(T.SPREADS.single.positions.length, 1);
  assert.deepEqual(T.SPREADS.three.positions.map((p) => p.name), ["Past", "Present", "Future"]);
  assert.deepEqual(T.SPREADS.celtic.positions.map((p) => p.name), [
    "Present", "Challenge", "Crown", "Foundation", "Recent Past",
    "Near Future", "Self", "Environment", "Hopes & Fears", "Outcome",
  ]);
  assert.deepEqual(T.SPREADS.choice.positions.map((p) => p.name), ["Where you stand", "Path A", "Path B", "Advice"]);
});

test("summary detects Major Arcana weight, dominant suit, reversals, courts and aces", () => {
  const majors = T.summarize([up("The Tower"), up("Death"), up("Three of Cups")]);
  assert.ok(majors.some((n) => n.startsWith("Many Major Arcana (2 of 3)")));

  const cups = T.summarize([up("Two of Cups"), up("Ten of Cups"), up("Five of Swords")]);
  assert.ok(cups.some((n) => n.includes("Dominant suit: Cups (Water)")));
  assert.ok(cups.some((n) => n.startsWith("No Major Arcana")));

  const tie = T.summarize([up("Two of Cups"), up("Ten of Cups"), up("Five of Swords"), up("Six of Swords")]);
  assert.ok(!tie.some((n) => n.includes("Dominant suit")), "no dominant suit on a tie");

  const reversed = T.summarize([rev("The Sun"), rev("Ace of Wands"), up("Ace of Cups")]);
  assert.ok(reversed.some((n) => n.startsWith("Mostly reversed")));
  assert.ok(reversed.some((n) => n.startsWith("2 Aces")));

  const courts = T.summarize([up("Queen of Swords"), up("King of Wands"), up("The Star")]);
  assert.ok(courts.some((n) => n.startsWith("2 court cards")));

  assert.deepEqual(T.summarize([]), []);
});

// ---------------------------------------------------------------------------
// 5. Yes / No answers and the combined interpretation
// ---------------------------------------------------------------------------
test("every card has a yes/no lean; reversed flips and weakens it", () => {
  for (const c of T.DECK) {
    assert.ok([-2, -1, 0, 1, 2].includes(c.yesNo.upright), c.name);
    assert.equal(c.yesNo.reversed, -Math.sign(c.yesNo.upright) || 0, c.name);
  }
});

test("yes/no leans follow standard tarot readings", () => {
  const strongYes = ["The Sun", "The Star", "The World", "The Magician", "The Lovers", "Nine of Cups",
    "Ten of Cups", "Ace of Cups", "Ace of Wands", "Six of Wands", "Ace of Pentacles", "Nine of Pentacles"];
  const strongNo = ["The Tower", "Three of Swords", "Nine of Swords", "Ten of Swords", "Five of Pentacles"];
  const no = ["Death", "The Devil", "The Moon", "Five of Cups", "Eight of Cups", "Five of Swords", "Seven of Swords", "Ten of Wands"];
  const maybe = ["The High Priestess", "The Hermit", "Justice", "The Hanged Man", "Two of Swords", "Seven of Cups", "Seven of Pentacles"];
  strongYes.forEach((n) => assert.equal(byName[n].yesNo.upright, 2, n));
  strongNo.forEach((n) => assert.equal(byName[n].yesNo.upright, -2, n));
  no.forEach((n) => assert.equal(byName[n].yesNo.upright, -1, n));
  maybe.forEach((n) => assert.equal(byName[n].yesNo.upright, 0, n));
  // Reversed "bad" cards signal recovery, so they lean slightly yes.
  assert.equal(byName["Ten of Swords"].yesNo.reversed, 1);
  assert.equal(byName["The Sun"].yesNo.reversed, -1);
});

test("recognizes yes/no questions", () => {
  const yes = ["Will I pass my test tomorrow?", "will i get the job", "Should I move?", "Am I ready?",
    "Is it a good time to invest?", "Does he love me?", "Can we fix this?", "Do I need to study more?",
    "Should I go or not?"];
  const notYes = ["What should I focus on?", "How will my exam go?", "Should I take job A or job B?", "", "Will", "Tell me about love"];
  yes.forEach((q) => assert.ok(T.isYesNoQuestion(q), q));
  notYes.forEach((q) => assert.ok(!T.isYesNoQuestion(q), q));
});

test("answers the question in a full sentence", () => {
  const cases = [
    ["Will I pass my test tomorrow?", "yes", "Yes, you will pass your test tomorrow."],
    ["Will I pass my test tomorrow?", "likely_yes", "Most likely, you will pass your test tomorrow."],
    ["Will I pass my test tomorrow?", "unclear", "It's not clear yet whether you will pass your test tomorrow."],
    ["Will I pass my test tomorrow?", "likely_no", "Probably not. As things stand, you won't pass your test tomorrow."],
    ["Will I pass my test tomorrow?", "no", "No, you won't pass your test tomorrow."],
    ["Am I ready for this?", "no", "No, you aren't ready for this."],
    ["Should I move to Lisbon?", "yes", "Yes, you should move to Lisbon."],
    ["Is my exam going to be hard?", "no", "No, your exam isn't going to be hard."],
    ["Will Ana call me back?", "yes", "Yes, Ana will call you back."],
    ["Do I need to study more?", "yes", "Yes, you do need to study more."],
    ["Do I need to study more?", "likely_yes", "Most likely, you need to study more."],
    ["Does he love me?", "no", "No, he doesn't love you."],
    ["can we save our money", "likely_yes", "Most likely, you can save your money."],
  ];
  for (const [q, v, expected] of cases) assert.equal(T.answerSentence(q, v), expected, q + " / " + v);
  // Questions it can't safely rephrase fall back to the generic label.
  assert.equal(T.answerSentence("Will you tell me the truth?", "yes"), null);
  assert.equal(T.answerSentence("What is next?", "yes"), null);
});

test("yes/no verdict combines all cards, weighted by position", () => {
  // One card: strong card → Yes/No, mild card → Likely, neutral → Unclear.
  assert.equal(T.yesNoReading([up("The Sun")], "single").verdict.key, "yes");
  assert.equal(T.yesNoReading([up("The Fool")], "single").verdict.key, "likely_yes");
  assert.equal(T.yesNoReading([up("The Hermit")], "single").verdict.key, "unclear");
  assert.equal(T.yesNoReading([rev("The Sun")], "single").verdict.key, "likely_no");
  assert.equal(T.yesNoReading([up("The Tower")], "single").verdict.key, "no");

  const allYes = T.yesNoReading([up("The Sun"), up("The Star"), up("The World")], "three");
  assert.equal(allYes.verdict.key, "yes");
  assert.equal(allYes.score, 1);
  assert.equal(T.yesNoReading([up("The Tower"), up("Three of Swords"), up("Ten of Swords")], "three").verdict.key, "no");

  // The Future card outweighs the Past card.
  const futureBad = T.yesNoReading([up("The Sun"), up("The Hermit"), up("The Tower")], "three");
  assert.ok(futureBad.score < 0, "future Tower outweighs past Sun");
  assert.equal(futureBad.keyCard.card.name, "The Tower");
  const futureGood = T.yesNoReading([up("The Tower"), up("The Hermit"), up("The Sun")], "three");
  assert.ok(futureGood.score > 0);
  assert.equal(futureGood.keyCard.card.name, "The Sun");

  // In the Celtic Cross the Outcome card counts most.
  const celtic = ["The Hermit", "Two of Swords", "Justice", "The Hanged Man", "Seven of Cups",
    "Two of Pentacles", "Four of Swords", "Page of Swords", "Queen of Swords", "The Sun"].map(up);
  const r = T.yesNoReading(celtic, "celtic");
  assert.equal(r.keyCard.position, "Outcome");
  assert.ok(r.score > 0);
  assert.equal(r.items.length, 10);
});

test("with reversals on, random readings produce every kind of answer", () => {
  for (const spread of ["single", "three", "celtic"]) {
    const n = T.SPREADS[spread].positions.length;
    const counts = {};
    for (let i = 0; i < 5000; i++) {
      const v = T.yesNoReading(T.shuffle(T.DECK, { reversals: true }).slice(0, n), spread).verdict.key;
      counts[v] = (counts[v] || 0) + 1;
    }
    for (const key of Object.keys(T.VERDICTS)) {
      assert.ok((counts[key] || 0) > 5000 * 0.02, `${spread}: ${key} appears (${JSON.stringify(counts)})`);
    }
    const yesish = (counts.yes || 0) + (counts.likely_yes || 0);
    const noish = (counts.no || 0) + (counts.likely_no || 0);
    assert.ok(yesish > 1000 && noish > 1000, `${spread}: both yes and no are common (${JSON.stringify(counts)})`);
  }
});

test("the combined interpretation mentions every card in its position", () => {
  for (const spread of ["single", "three", "celtic"]) {
    const n = T.SPREADS[spread].positions.length;
    const drawn = T.shuffle(T.DECK, { reversals: true }).slice(0, n);
    const story = T.narrate(drawn, spread);
    drawn.forEach((d, i) => {
      const o = d.reversed ? "reversed" : "upright";
      const phrase = T.SPREADS[spread].positions[i].lead + " " + d.card.keywords[o][0] + " and " + d.card.keywords[o][1] +
        " (" + d.card.name + (d.reversed ? ", reversed" : "") + ").";
      assert.ok(story.includes(phrase), `${spread}: missing "${phrase}" in: ${story}`);
    });
    assert.match(story, /Overall, /);
  }
  assert.equal(T.narrate([], "three"), "");
});

// ---------------------------------------------------------------------------
// 6. Open questions (not yes/no)
// ---------------------------------------------------------------------------
const NOW = Date.UTC(2026, 8, 29); // 29 Sep 2026: the Sun is at ~6° Libra

test("questions are sorted into types", () => {
  const cases = {
    yesno: ["Will I pass my test?", "Should I go or not?", "Does she like me?"],
    choice: ["Should I take the job in Lisbon or stay in Porto?", "Which is better for me, coffee or tea?",
      "Is it better to rent or buy?", "Will he call or text?"],
    when: ["When will I find love?", "How long until I get a job?", "How soon will things improve?", "What month will I move?"],
    why: ["Why do I feel stuck?", "What is causing my stress?", "Why did she leave?"],
    who: ["Who is my soulmate?", "Which person can I trust?"],
    where: ["Where will I meet them?", "Where should I live?"],
    advice: ["What should I focus on?", "How can I improve my grades?", "What do I need to do?", "How do I get over him?", "Any advice for my exam?"],
    outlook: ["What will happen with my relationship?", "Tell me about love", "How will my exam go?", "My career"],
  };
  for (const [type, qs] of Object.entries(cases)) {
    for (const q of qs) assert.equal(T.classifyQuestion(q), type, q);
  }
  assert.equal(T.classifyQuestion(""), null);
  assert.equal(T.classifyQuestion("   "), null);
});

test("either/or questions are split into two options", () => {
  assert.deepEqual(T.splitOptions("Should I take the job in Lisbon or stay in Porto?"), ["take the job in Lisbon", "stay in Porto"]);
  assert.deepEqual(T.splitOptions("Which is better for me, coffee or tea?"), ["coffee", "tea"]);
  assert.deepEqual(T.splitOptions("Is it better to rent or buy?"), ["rent", "buy"]);
  assert.deepEqual(T.splitOptions("Should I stay with my partner or move on?"), ["stay with your partner", "move on"]);
  assert.deepEqual(T.splitOptions("Should I stay, or go?"), ["stay", "go"]);
  assert.equal(T.splitOptions("Should I go or not?"), null);
  assert.equal(T.splitOptions("A or B or C?"), null);
  assert.equal(T.splitOptions("When will I move?"), null);
});

test("timing: the most important card with a date gives the range", () => {
  // Two of Wands (Mars in Aries) in the Future position → the Sun's 0–10° Aries.
  const a = T.openAnswer("When will I find love?", [up("Four of Swords"), up("The Magician"), up("Two of Wands")], "three", { now: NOW });
  assert.equal(a.type, "when");
  assert.equal(a.label, "Timing");
  assert.equal(a.headline, "Most likely 20–30 March 2027 (Two of Wands).");
  assert.match(a.details[0], /Mars in Aries/);
  assert.ok(a.details.includes("Pace: fast, within days (Wands)."));

  // A card whose period is happening now.
  const now = T.openAnswer("When?", [up("Two of Swords")], "single", { now: NOW });
  assert.equal(now.headline, "Soon: from now until 3 October 2026 (Two of Swords).");

  // Season (Ace), month (court card, zodiac Major) and a reversed card (delay).
  assert.equal(T.openAnswer("When?", [up("Ace of Pentacles")], "single", { now: NOW }).headline,
    "Most likely 21 December 2026 – 20 March 2027 (Ace of Pentacles).");
  assert.equal(T.openAnswer("When?", [up("Knight of Wands")], "single", { now: NOW }).headline,
    "Most likely 22 November – 21 December 2026 (Knight of Wands)."); // Sagittarius
  const late = T.openAnswer("When?", [rev("The Emperor")], "single", { now: NOW }); // Aries
  assert.equal(late.headline, "Most likely 20 March – 20 April 2027 (The Emperor, reversed).");
  assert.ok(late.details.some((d) => /delay/.test(d)));

  // The Future card outranks the Past card, even when the Past card has a date.
  const ranked = T.openAnswer("When?", [up("Two of Wands"), up("The Sun"), up("Knight of Wands")], "three", { now: NOW });
  assert.match(ranked.headline, /Knight of Wands/);

  // Only planet cards: no date.
  const none = T.openAnswer("When?", [up("The Magician"), up("The Sun"), up("The Tower")], "three", { now: NOW });
  assert.match(none.headline, /don't give a clear date/);
});

test("cause, person, place, advice and outlook answers use the right cards", () => {
  const three = [rev("Four of Swords"), up("Eight of Pentacles"), up("The Star")];

  const why = T.openAnswer("Why do I feel stuck?", three, "three");
  assert.equal(why.headline, "The root of it is restlessness and burnout (Four of Swords, reversed).");
  assert.equal(why.details[0], byName["Four of Swords"].meaning.reversed);
  // In a Celtic Cross the root is the Foundation card (position 4).
  const celtic = ["Ace of Cups", "Five of Wands", "The Star", "The Moon", "Three of Cups", "Six of Wands",
    "Strength", "Queen of Cups", "Nine of Cups", "The World"].map(up);
  const whyC = T.openAnswer("Why?", celtic, "celtic");
  assert.match(whyC.headline, /\(The Moon\)\.$/);
  assert.ok(whyC.details.some((d) => /Three of Cups, Recent Past/.test(d)));
  assert.ok(whyC.details.some((d) => /Five of Wands, Challenge/.test(d)));

  const who = T.openAnswer("Who will help me?", [up("Queen of Cups"), up("The Star"), rev("Knight of Swords")], "three");
  assert.match(who.headline, /^Look for an energetic person on the move/); // the Future card's court
  assert.ok(who.details.some((d) => /Gemini or another air sign \(Libra or Aquarius\)/.test(d)));
  assert.ok(who.details.some((d) => /Also involved: a mature, caring person/.test(d)));
  const nobody = T.openAnswer("Who?", three, "three");
  assert.match(nobody.headline, /No court cards/);

  const where = T.openAnswer("Where will I meet them?", [up("Two of Cups"), up("The Chariot"), up("Ace of Wands")], "three");
  assert.match(where.headline, /near water/); // Cups + The Chariot (Cancer, water) outweigh one Wands card
  assert.ok(where.details[0].includes("west"));

  const advice = T.openAnswer("What should I focus on?", [up("Five of Cups"), up("Eight of Pentacles"), up("The Star")], "three");
  assert.equal(advice.headline, "Focus on hope and faith (The Star).");
  assert.equal(advice.details[0], byName["The Star"].meaning.upright);
  assert.ok(advice.details.some((d) => /^Watch out for .* \(Five of Cups, Past\)/.test(d)), advice.details.join(" | "));
  // Neutral cards only: no "watch out", and the advice comes from the main card.
  const calm = T.openAnswer("What should I do?", [up("The Hermit")], "single");
  assert.equal(calm.headline, "Make room for introspection and soul-searching (The Hermit).");
  assert.equal(calm.details.length, 1);

  const outlook = T.openAnswer("What will happen with my job?", three, "three");
  const yn = T.yesNoReading(three, "three");
  assert.equal(outlook.tone, yn.verdict.key);
  assert.equal(outlook.score, yn.score);
  assert.match(outlook.headline, /^The outlook is favourable, pointing toward hope and faith \(The Star\)\.$/);

  // Yes/no questions and empty questions are not open questions.
  assert.equal(T.openAnswer("Will I pass?", three, "three"), null);
  assert.equal(T.openAnswer("", three, "three"), null);
});

test("either/or questions compare the two paths", () => {
  const q = "Should I take the job in Lisbon or stay in Porto?";
  const a = T.openAnswer(q, [up("The Hermit"), up("Six of Wands"), up("Five of Pentacles"), up("Temperance")], "choice");
  assert.equal(a.headline, "The cards favour: take the job in Lisbon.");
  assert.equal(a.details[0], "Path A (take the job in Lisbon): victory and public recognition (Six of Wands), leans strong yes.");
  assert.match(a.details[2], /^Advice: Focus on balance and moderation \(Temperance\)\./);
  const b = T.openAnswer(q, [up("The Hermit"), up("The Tower"), up("The Sun"), up("Temperance")], "choice");
  assert.equal(b.headline, "The cards favour: stay in Porto.");
  const both = T.openAnswer(q, [up("The Hermit"), up("The Sun"), up("The Star"), up("Temperance")], "choice");
  assert.match(both.headline, /^Both paths look good/);
  // Other spreads can't compare the options, so the answer suggests Two Paths.
  const tip = T.openAnswer(q, [up("The Hermit"), up("The Sun"), up("The Star")], "three");
  assert.match(tip.headline, /Two Paths spread/);
});

test("open answers work for 3000 random readings of every type and spread", () => {
  const qs = ["When will it happen?", "Why is this happening?", "Who is he?", "Where should I go?",
    "What should I do?", "What about my career?", "Should I stay or go?"];
  for (let r = 0; r < 3000; r++) {
    const spread = ["single", "three", "celtic", "choice"][r % 4];
    const pile = T.shuffle(T.DECK, { reversals: true });
    const drawn = pile.slice(0, T.SPREADS[spread].positions.length);
    const a = T.openAnswer(qs[r % qs.length], drawn, spread, { now: NOW + r * 86400000 });
    const text = [a.headline].concat(a.details).join(" ");
    assert.ok(a.headline.length > 20, a.headline);
    assert.ok(!/undefined|null|NaN|\[object/.test(text), text);
  }
});

test("minor cards show their astrology; a reading's element is compared with the chart", () => {
  assert.equal(byName["Two of Wands"].astro, "Mars in Aries");
  assert.equal(byName["Ace of Cups"].astro, "Summer");
  assert.equal(byName["King of Cups"].astro, "Scorpio");
  assert.equal(byName["Page of Swords"].astro, "Autumn");
  assert.equal(T.elementOf(byName["The Chariot"]), "Water"); // Cancer
  assert.equal(T.elementOf(byName["The Fool"]), "Air");
  assert.equal(T.elementOf(byName["The Sun"]), null); // a planet, no element

  const fiery = [up("Ace of Wands"), up("Strength"), up("Six of Wands")];
  assert.match(T.elementHarmony("Fire", fiery), /your chart's strongest element/);
  assert.match(T.elementHarmony("Water", fiery), /mostly Fire .* while your chart is mostly Water/);
  assert.equal(T.elementHarmony(null, fiery), null);
  assert.equal(T.elementHarmony("Fire", [up("Ace of Wands")]), null); // too few cards
});
