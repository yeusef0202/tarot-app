"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../astro.js");
const T = require("../deck.js");
// Reference positions computed with PyEphem 4.2.1 (VSOP87 / ELP), 1900–2049.
const REF = require("./fixtures/ephemeris.json");

const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const iso = (ms) => new Date(ms).toISOString();

// ---------------------------------------------------------------------------
// 1. Ephemeris accuracy
// ---------------------------------------------------------------------------
test("Sun, Moon and planets match PyEphem (120 random dates, 1900–2049)", () => {
  // Tolerances in degrees. A sign is 30°, so these only matter right on a cusp.
  const tol = { sun: 0.02, moon: 0.05, mercury: 0.1, venus: 0.1, mars: 0.1, jupiter: 0.3, saturn: 0.3,
    uranus: 0.1, neptune: 0.1, pluto: 0.1 };
  for (const row of REF.positions) {
    const jd = A.julianDay(row.utc);
    for (const body of Object.keys(tol)) {
      const ours = body === "sun" ? A.sunLongitude(jd)
        : body === "moon" ? A.moonLongitude(jd)
        : A.planetLongitude(body, jd);
      assert.ok(angleDiff(ours, row[body]) < tol[body], `${body} on ${iso(row.utc)}: ${ours.toFixed(3)} vs ${row[body]}`);
    }
  }
});

test("Ascendant matches PyEphem's rising ecliptic point (60 random places and times)", () => {
  for (const row of REF.ascendants) {
    const asc = A.angles(A.julianDay(row.utc), row.lat, row.lon).ascendant;
    assert.ok(angleDiff(asc, row.ascendant) < 0.05, `${iso(row.utc)} at ${row.lat},${row.lon}: ${asc.toFixed(3)} vs ${row.ascendant}`);
  }
});

test("textbook examples (Meeus, Astronomical Algorithms)", () => {
  // Example 25.a: 1992 October 13.0 → apparent longitude of the Sun 199.90895°.
  assert.ok(angleDiff(A.sunLongitude(2448908.5), 199.90895) < 0.01);
  // Example 47.a: 1992 April 12, 0h → apparent longitude of the Moon 133.162655°.
  assert.ok(angleDiff(A.moonLongitude(2448724.5), 133.162655) < 0.01);
});

test("a published birth chart: Barack Obama, 4 Aug 1961 19:24 Honolulu", () => {
  const c = A.chart({ year: 1961, month: 8, day: 4, hour: 19, minute: 24, timeZone: "Pacific/Honolulu", lat: 21.3069, lon: -157.8583 });
  // Astro-Databank (rated AA): Sun 12°33' Leo, Moon 3°21' Gemini, Ascendant 18°03' Aquarius.
  const expect = { sun: ["Leo", 12.55], moon: ["Gemini", 3.35], ascendant: ["Aquarius", 18.05],
    mercury: ["Leo", 2.33], venus: ["Cancer", 1.78], mars: ["Virgo", 22.58] };
  for (const [k, [sign, deg]] of Object.entries(expect)) {
    assert.equal(c.byKey[k].sign.name, sign, k);
    assert.ok(Math.abs(c.byKey[k].degree - deg) < 0.1, `${k} ${c.byKey[k].degree.toFixed(2)} vs ${deg}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Time zones
// ---------------------------------------------------------------------------
test("local birth time → UTC, with historical time zones and daylight saving", () => {
  const cases = [
    [[1990, 7, 15, 14, 30, "Europe/Lisbon"], "1990-07-15T13:30:00.000Z"], // summer time (UTC+1)
    [[1995, 1, 10, 8, 0, "Europe/Lisbon"], "1995-01-10T07:00:00.000Z"], // Portugal used CET 1992–96
    [[2005, 1, 10, 8, 0, "Europe/Lisbon"], "2005-01-10T08:00:00.000Z"],
    [[2000, 12, 25, 23, 15, "America/Sao_Paulo"], "2000-12-26T01:15:00.000Z"], // Brazilian summer time
    [[1985, 3, 3, 9, 0, "Asia/Kolkata"], "1985-03-03T03:30:00.000Z"], // half-hour zone
    [[1900, 1, 1, 12, 0, "Europe/Lisbon"], "1900-01-01T12:36:45.000Z"], // local mean time −0:36:45
    [[1961, 8, 4, 19, 24, "Pacific/Honolulu"], "1961-08-05T05:24:00.000Z"],
    [[2021, 3, 14, 3, 30, "America/New_York"], "2021-03-14T07:30:00.000Z"], // an hour after clocks sprang forward
    [[2021, 11, 7, 3, 30, "America/New_York"], "2021-11-07T08:30:00.000Z"], // after clocks fell back
  ];
  for (const [args, expected] of cases) assert.equal(iso(A.localToUtc(...args)), expected, args.join(" "));
});

// ---------------------------------------------------------------------------
// 3. Zodiac ↔ tarot correspondences (Golden Dawn)
// ---------------------------------------------------------------------------
test("signs: boundaries, elements and their Major Arcana cards", () => {
  assert.equal(A.signOf(0).sign.name, "Aries");
  assert.equal(A.signOf(29.999).sign.name, "Aries");
  assert.equal(A.signOf(30).sign.name, "Taurus");
  assert.equal(A.signOf(359.99).sign.name, "Pisces");
  assert.equal(A.signOf(-1).sign.name, "Pisces");
  assert.equal(A.signOf(725).sign.name, "Aries");
  const cards = {
    Aries: "The Emperor", Taurus: "The Hierophant", Gemini: "The Lovers", Cancer: "The Chariot", Leo: "Strength",
    Virgo: "The Hermit", Libra: "Justice", Scorpio: "Death", Sagittarius: "Temperance", Capricorn: "The Devil",
    Aquarius: "The Star", Pisces: "The Moon",
  };
  assert.deepEqual(A.SIGNS.map((s) => [s.name, s.card]), Object.entries(cards));
  const elements = ["Fire", "Earth", "Air", "Water"];
  assert.deepEqual(A.SIGNS.map((s) => s.element), [...elements, ...elements, ...elements]);
  // The sign cards agree with the astrology printed on the cards themselves.
  for (const s of A.SIGNS) assert.equal(T.DECK.find((c) => c.name === s.card).astro, s.name);
});

test("decans: the 36 numbered cards (2–10), each exactly once, in Chaldean order", () => {
  const numbered = T.DECK.filter((c) => c.arcana === "minor" && c.number >= 2 && c.number <= 10).map((c) => c.name).sort();
  assert.deepEqual(A.DECANS.map((d) => d.card).sort(), numbered);
  const known = {
    "Two of Wands": "Mars in Aries", "Three of Wands": "Sun in Aries", "Four of Wands": "Venus in Aries",
    "Five of Pentacles": "Mercury in Taurus", "Ten of Swords": "Sun in Gemini", "Two of Cups": "Venus in Cancer",
    "Six of Wands": "Jupiter in Leo", "Three of Swords": "Saturn in Libra", "Five of Cups": "Mars in Scorpio",
    "Eight of Wands": "Mercury in Sagittarius", "Four of Pentacles": "Sun in Capricorn", "Seven of Swords": "Moon in Aquarius",
    "Nine of Cups": "Jupiter in Pisces", "Ten of Cups": "Mars in Pisces",
  };
  for (const [card, label] of Object.entries(known)) {
    assert.equal(A.cardAstrology(card).label, label, card);
    assert.equal(T.DECK.find((c) => c.name === card).astro, label, card + " (deck)");
  }
  assert.equal(A.decanOf(15).card, "Three of Wands"); // 15° Aries
  assert.equal(A.decanOf(125).card, "Five of Wands"); // 5° Leo: first decan (Saturn in Leo)
  assert.equal(A.decanOf(145).card, "Seven of Wands"); // 25° Leo: third decan (Mars in Leo)
});

test("court cards, Aces and Pages have their signs and seasons; every card has astrology", () => {
  const courts = {
    Aries: "Queen of Wands", Leo: "King of Wands", Sagittarius: "Knight of Wands", Cancer: "Queen of Cups",
    Scorpio: "King of Cups", Pisces: "Knight of Cups", Libra: "Queen of Swords", Aquarius: "King of Swords",
    Gemini: "Knight of Swords", Capricorn: "Queen of Pentacles", Taurus: "King of Pentacles", Virgo: "Knight of Pentacles",
  };
  for (const [sign, card] of Object.entries(courts)) {
    assert.equal(A.courtCardFor(A.SIGNS.find((s) => s.name === sign)), card);
    assert.equal(A.cardAstrology(card).sign.name, sign);
  }
  assert.equal(A.cardAstrology("Ace of Wands").label, "spring");
  assert.equal(A.cardAstrology("Page of Cups").label, "summer");
  assert.equal(A.cardAstrology("Ace of Swords").label, "autumn");
  assert.equal(A.cardAstrology("Page of Pentacles").label, "winter");
  assert.equal(A.cardAstrology("The Magician").label, "Mercury");
  for (const c of T.DECK) assert.ok(c.astrology && c.astrology.label, c.name + " has astrology");
});

test("sunPeriod finds the next time the Sun is in a stretch of the zodiac", () => {
  const from = Date.UTC(2026, 8, 29); // Sun at ~6° Libra
  const two = A.sunPeriod(0, 10, from); // Two of Wands: 0–10° Aries
  assert.equal(two.now, false);
  assert.match(iso(two.start), /^2027-03-20/); // March equinox 2027
  assert.match(iso(two.end), /^2027-03-30/);
  const libra = A.sunPeriod(180, 190, from); // Two of Swords: happening now
  assert.equal(libra.now, true);
  assert.equal(libra.start, from);
  assert.match(iso(libra.end), /^2026-10-03/);
  const winter = A.sunPeriod(270, 360, from);
  assert.match(iso(winter.start), /^2026-12-21/); // December solstice
  assert.match(iso(winter.end), /^2027-03-20/);
  // The Sun really is at the start longitude at the start time.
  assert.ok(angleDiff(A.sunLongitude(A.julianDay(two.start)), 0) < 0.01);
});

// ---------------------------------------------------------------------------
// 4. Birth charts, numerology and personal cards
// ---------------------------------------------------------------------------
test("birth chart: signs, retrogrades, elements; no rising sign without a birth time", () => {
  const c = A.chart({ year: 1990, month: 7, day: 15, hour: 14, minute: 30, timeZone: "Europe/Lisbon", lat: 38.7167, lon: -9.1333 });
  assert.equal(c.byKey.sun.sign.name, "Cancer");
  assert.equal(c.byKey.mars.sign.name, "Taurus");
  assert.equal(c.byKey.saturn.retrograde, true);
  assert.equal(c.byKey.mars.retrograde, false);
  assert.ok(c.byKey.ascendant && c.byKey.midheaven);
  const total = Object.values(c.elements).reduce((a, b) => a + b, 0);
  assert.equal(total, 2 + 2 + 2 + 5); // Sun, Moon, Rising count double + 5 planets
  // Water (Sun, Jupiter), Fire (Moon, Mercury) and Air (Rising, Venus) tie on 3: no single winner.
  assert.deepEqual(c.elements, { Fire: 3, Earth: 2, Air: 3, Water: 3 });
  assert.equal(c.dominantElement, null);
  assert.deepEqual(c.strongestElements, ["Fire", "Air", "Water"]);
  const obama = A.chart({ year: 1961, month: 8, day: 4, hour: 19, minute: 24, timeZone: "Pacific/Honolulu", lat: 21.3069, lon: -157.8583 });
  assert.deepEqual(obama.elements, { Fire: 3, Earth: 2, Air: 5, Water: 1 }); // Gemini Moon + Aquarius Rising
  assert.equal(obama.dominantElement, "Air");

  const noTime = A.chart({ year: 1990, month: 7, day: 15, timeKnown: false, timeZone: "Europe/Lisbon" });
  assert.equal(noTime.timeKnown, false);
  assert.equal(noTime.byKey.ascendant, undefined);
  assert.equal(noTime.byKey.sun.sign.name, "Cancer");
  // On 1 Sep 2026 the Moon moved from Aries into Taurus, so without a time both are possible.
  const moonDay = A.chart({ year: 2026, month: 9, day: 1, timeKnown: false, timeZone: "Europe/Lisbon" });
  assert.deepEqual(moonDay.byKey.moon.possibleSigns.map((s) => s.name), ["Aries", "Taurus"]);
  assert.equal(moonDay.byKey.sun.possibleSigns, undefined);
});

test("tarot numerology: birth cards and year card (Mary K. Greer)", () => {
  assert.deepEqual(A.birthCards(1990, 7, 15), [5]); // 7+15+1990 = 2012 → 5 The Hierophant
  assert.deepEqual(A.birthCards(1960, 10, 12), [20, 2]); // 1982 → 20 Judgement → 2 The High Priestess
  assert.deepEqual(A.birthCards(1970, 1, 1), [19, 10, 1]); // 1972 → 19 → 10 → 1
  assert.deepEqual(A.birthCards(1950, 6, 1), [0, 4]); // 1957 → 22 = The Fool → 4 The Emperor
  assert.equal(A.yearCard(7, 15, 2026), 14); // 7+15+2026 = 2048 → 14 Temperance
  assert.equal(A.yearCard(7, 15, 2027), 15); // 2049 → 15 The Devil
});

test("personal cards come from the chart, and readings find them", () => {
  const c = A.chart({ year: 1990, month: 7, day: 15, hour: 14, minute: 30, timeZone: "Europe/Lisbon", lat: 38.7167, lon: -9.1333 });
  const links = A.personalCards(c, new Date(2026, 8, 29));
  const byRole = Object.fromEntries(links.map((l) => [l.role, l.card]));
  assert.equal(byRole["Sun sign"], "The Chariot"); // Cancer
  assert.equal(byRole["Sun decan"], "Four of Cups"); // 22° Cancer: Moon in Cancer
  assert.equal(byRole["Moon sign"], "The Emperor"); // Aries
  assert.equal(byRole["Rising sign"], "Justice"); // Libra
  assert.equal(byRole["Court card"], "Queen of Cups");
  assert.equal(byRole["Birth card"], "The Hierophant");
  assert.equal(byRole["Year card"], "Temperance"); // birthday 2026: 7+15+2026 = 2048 → 14
  for (const l of links) assert.ok(T.DECK.some((d) => d.name === l.card), l.card + " is a real card");

  const card = (n) => T.DECK.find((d) => d.name === n);
  const drawn = [{ card: card("Four of Cups"), reversed: false }, { card: card("The Star"), reversed: true }, { card: card("The Chariot"), reversed: false }];
  const found = T.personalLinks(drawn, links);
  assert.deepEqual(found.map((f) => [f.index, f.roles]), [[0, ["Sun decan"]], [2, ["Sun sign"]]]);
  assert.deepEqual(T.personalLinks(drawn, []), []);
});
