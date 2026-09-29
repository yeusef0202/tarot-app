/*
 * Astrology for the tarot app: zodiac signs, a small ephemeris (Sun, Moon,
 * planets, Ascendant), birth charts, and the Golden Dawn correspondences
 * that link the zodiac to the tarot cards.
 *
 * Accuracy (checked against PyEphem in tests/astro.test.js):
 *   Sun ≈ 0.01°, Moon ≈ 0.05°, planets ≈ 0.1–0.3°, Ascendant ≈ 0.05°.
 * That is far below the 30° width of a sign, so signs are only uncertain
 * when a body sits right on a cusp.
 *
 * Works in the browser (window.Astro) and in Node (module.exports).
 */
(function (root) {
  "use strict";

  const RAD = Math.PI / 180;
  const norm = (deg) => ((deg % 360) + 360) % 360;
  const sin = (deg) => Math.sin(deg * RAD);
  const cos = (deg) => Math.cos(deg * RAD);

  // ---------------------------------------------------------------------------
  // Zodiac
  // ---------------------------------------------------------------------------
  // `card` is the Major Arcana card the Golden Dawn assigned to each sign.
  const SIGNS = [
    { name: "Aries", glyph: "♈", element: "Fire", modality: "Cardinal", ruler: "Mars", card: "The Emperor",
      traits: "bold, pioneering, direct and energetic" },
    { name: "Taurus", glyph: "♉", element: "Earth", modality: "Fixed", ruler: "Venus", card: "The Hierophant",
      traits: "patient, reliable, sensual and determined" },
    { name: "Gemini", glyph: "♊", element: "Air", modality: "Mutable", ruler: "Mercury", card: "The Lovers",
      traits: "curious, witty, adaptable and talkative" },
    { name: "Cancer", glyph: "♋", element: "Water", modality: "Cardinal", ruler: "Moon", card: "The Chariot",
      traits: "caring, protective, intuitive and home-loving" },
    { name: "Leo", glyph: "♌", element: "Fire", modality: "Fixed", ruler: "Sun", card: "Strength",
      traits: "confident, generous, creative and warm-hearted" },
    { name: "Virgo", glyph: "♍", element: "Earth", modality: "Mutable", ruler: "Mercury", card: "The Hermit",
      traits: "analytical, helpful, precise and modest" },
    { name: "Libra", glyph: "♎", element: "Air", modality: "Cardinal", ruler: "Venus", card: "Justice",
      traits: "diplomatic, fair-minded, charming and sociable" },
    { name: "Scorpio", glyph: "♏", element: "Water", modality: "Fixed", ruler: "Mars", card: "Death",
      traits: "intense, passionate, perceptive and private" },
    { name: "Sagittarius", glyph: "♐", element: "Fire", modality: "Mutable", ruler: "Jupiter", card: "Temperance",
      traits: "optimistic, adventurous, honest and philosophical" },
    { name: "Capricorn", glyph: "♑", element: "Earth", modality: "Cardinal", ruler: "Saturn", card: "The Devil",
      traits: "ambitious, disciplined, practical and patient" },
    { name: "Aquarius", glyph: "♒", element: "Air", modality: "Fixed", ruler: "Saturn", card: "The Star",
      traits: "independent, original, humanitarian and idealistic" },
    { name: "Pisces", glyph: "♓", element: "Water", modality: "Mutable", ruler: "Jupiter", card: "The Moon",
      traits: "compassionate, imaginative, sensitive and dreamy" },
  ];

  const ELEMENTS = {
    Fire: { suit: "wands", suitName: "Wands", traits: "passion, action and inspiration" },
    Water: { suit: "cups", suitName: "Cups", traits: "feelings, intuition and relationships" },
    Air: { suit: "swords", suitName: "Swords", traits: "ideas, communication and logic" },
    Earth: { suit: "pentacles", suitName: "Pentacles", traits: "practicality, stability and the senses" },
  };

  // The planets, their Major Arcana cards (Golden Dawn; the outer planets use
  // the modern attributions) and what they stand for in a birth chart.
  const BODIES = {
    sun: { name: "Sun", glyph: "☉", card: "The Sun", about: "your core self and life purpose" },
    moon: { name: "Moon", glyph: "☽", card: "The High Priestess", about: "your emotions, instincts and inner needs" },
    ascendant: { name: "Rising", glyph: "AC", card: null, about: "how you come across and meet the world" },
    midheaven: { name: "Midheaven", glyph: "MC", card: null, about: "your career, goals and public image" },
    mercury: { name: "Mercury", glyph: "☿", card: "The Magician", about: "how you think and communicate" },
    venus: { name: "Venus", glyph: "♀", card: "The Empress", about: "what you love and value" },
    mars: { name: "Mars", glyph: "♂", card: "The Tower", about: "your drive, courage and anger" },
    jupiter: { name: "Jupiter", glyph: "♃", card: "Wheel of Fortune", about: "where you grow and find luck" },
    saturn: { name: "Saturn", glyph: "♄", card: "The World", about: "your lessons, limits and discipline" },
    uranus: { name: "Uranus", glyph: "♅", card: "The Fool", about: "where you rebel and break free" },
    neptune: { name: "Neptune", glyph: "♆", card: "The Hanged Man", about: "your dreams and ideals" },
    pluto: { name: "Pluto", glyph: "♇", card: "Judgement", about: "where you transform deeply" },
  };

  const SUIT_NAMES = { Fire: "Wands", Water: "Cups", Air: "Swords", Earth: "Pentacles" };
  const NUMBER_NAMES = ["", "", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  // Chaldean order of the planets; the decans run through it starting with Mars at 0° Aries.
  const CHALDEAN = ["Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter"];

  /** The sign, degree within the sign and decan (1–3) of an ecliptic longitude. */
  function signOf(lon) {
    const l = norm(lon);
    const index = Math.floor(l / 30);
    const degree = l - index * 30;
    return { index, sign: SIGNS[index], degree, decan: Math.floor(degree / 10) + 1 };
  }

  /** Golden Dawn decans: each 10° of the zodiac is ruled by a planet and by one
   *  of the numbered Minor Arcana (2–10). Cardinal signs get the 2–4 of their
   *  element's suit, fixed signs 5–7 and mutable signs 8–10. */
  function decanOf(lon) {
    const s = signOf(lon);
    const i = s.index * 3 + s.decan - 1; // 0…35
    const first = { Cardinal: 2, Fixed: 5, Mutable: 8 }[s.sign.modality];
    const number = first + s.decan - 1;
    return {
      index: i,
      sign: s.sign,
      decan: s.decan,
      planet: CHALDEAN[i % 7],
      card: NUMBER_NAMES[number] + " of " + SUIT_NAMES[s.sign.element],
      start: i * 10,
    };
  }

  const DECANS = Array.from({ length: 36 }, (_, i) => decanOf(i * 10 + 5));

  /** Court card for a sign (a common modern system): Queens rule the cardinal
   *  signs, Kings the fixed signs and Knights the mutable signs of their element. */
  function courtCardFor(sign) {
    const rank = { Cardinal: "Queen", Fixed: "King", Mutable: "Knight" }[sign.modality];
    return rank + " of " + SUIT_NAMES[sign.element];
  }

  /** The astrology behind a card, e.g. { kind: "decan", sign, planet } for the
   *  Two of Wands (Mars in Aries). Aces and Pages rule a season: the quarter of
   *  the year that begins with the cardinal sign of their element. */
  function cardAstrology(cardName) {
    for (const d of DECANS) {
      if (d.card === cardName) {
        return { kind: "decan", label: d.planet + " in " + d.sign.name, sign: d.sign, planet: d.planet,
          start: d.start, end: d.start + 10 };
      }
    }
    for (let i = 0; i < 12; i++) {
      const s = SIGNS[i];
      if (s.card === cardName) return { kind: "sign", label: s.name, sign: s, start: i * 30, end: i * 30 + 30 };
      if (courtCardFor(s) === cardName) return { kind: "court", label: s.name, sign: s, start: i * 30, end: i * 30 + 30 };
    }
    const m = /^(Ace|Page) of (\w+)$/.exec(cardName);
    if (m) {
      const element = Object.keys(SUIT_NAMES).find((e) => SUIT_NAMES[e] === m[2]);
      const i = SIGNS.findIndex((s) => s.element === element && s.modality === "Cardinal");
      const seasons = { Aries: "spring", Cancer: "summer", Libra: "autumn", Capricorn: "winter" };
      return { kind: "season", label: seasons[SIGNS[i].name], sign: SIGNS[i], start: i * 30, end: i * 30 + 90 };
    }
    const planet = Object.keys(BODIES).find((k) => BODIES[k].card === cardName);
    if (planet) return { kind: "planet", label: BODIES[planet].name, planet: BODIES[planet].name };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------
  const julianDay = (ms) => ms / 86400000 + 2440587.5;
  const centuries = (jd) => (jd - 2451545) / 36525;

  /** Offset of a time zone from UTC, in minutes, at a given instant. Uses the
   *  browser's time zone database, which includes historical daylight saving.
   *  Not rounded: old local mean times have seconds (Lisbon 1900: -0:36:45). */
  function tzOffsetMinutes(timeZone, utcMs) {
    const parts = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    }).formatToParts(new Date(utcMs)).forEach((p) => { parts[p.type] = Number(p.value); });
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    return (asUtc - Math.floor(utcMs / 1000) * 1000) / 60000;
  }

  /** Local wall-clock time in a time zone → UTC milliseconds. */
  function localToUtc(year, month, day, hour, minute, timeZone) {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    const first = tzOffsetMinutes(timeZone, guess);
    let t = guess - first * 60000;
    const second = tzOffsetMinutes(timeZone, t);
    if (second !== first) t = guess - second * 60000;
    return t;
  }

  // ---------------------------------------------------------------------------
  // Ephemeris
  // ---------------------------------------------------------------------------
  /** Nutation in longitude (degrees), low-precision series. */
  function nutation(T) {
    const omega = 125.04452 - 1934.136261 * T;
    const L = 280.4665 + 36000.7698 * T;
    const Lm = 218.3165 + 481267.8813 * T;
    return (-17.2 * sin(omega) - 1.32 * sin(2 * L) - 0.23 * sin(2 * Lm) + 0.21 * sin(2 * omega)) / 3600;
  }

  function obliquity(T) {
    return 23.439291 - 0.0130042 * T;
  }

  /** Apparent geocentric longitude of the Sun (Meeus, ch. 25). */
  function sunLongitude(jd) {
    const T = centuries(jd);
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) +
      (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
    const omega = 125.04 - 1934.136 * T;
    return norm(L0 + C - 0.00569 - 0.00478 * sin(omega));
  }

  // Main periodic terms of the Moon's longitude (Meeus, ch. 47):
  // multiples of D, M, M', F and the coefficient in 1e-6 degrees.
  const MOON_TERMS = [
    [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
    [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
    [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
    [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
    [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
    [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
    [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689],
    [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390], [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236],
    [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
    [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110], [3, 0, -1, 0, -892],
    [2, 1, 1, 0, -810], [4, -1, -2, 0, 759], [0, 2, -1, 0, -713], [2, 2, -1, 0, -700],
    [2, 1, -2, 0, 691], [2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
    [4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399], [0, 0, 2, -2, -381],
    [1, 1, 1, 0, 351], [3, 0, -2, 0, -340], [4, 0, -3, 0, 330], [2, -1, 2, 0, 327],
    [0, 2, 1, 0, -323], [1, 1, -1, 0, 299], [2, 0, 3, 0, 294],
  ];

  /** Apparent geocentric longitude of the Moon (Meeus, ch. 47). */
  function moonLongitude(jd) {
    const T = centuries(jd);
    const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
    const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
    const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
    const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
    const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T;
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    let sum = 0;
    for (const [d, m, mp, f, coeff] of MOON_TERMS) {
      const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
      sum += coeff * e * sin(d * D + m * M + mp * Mp + f * F);
    }
    const A1 = 119.75 + 131.849 * T;
    const A2 = 53.09 + 479264.29 * T;
    sum += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
    return norm(Lp + sum / 1e6 + nutation(T));
  }

  // Keplerian elements and their rates per century (J2000 ecliptic), from
  // JPL's "Approximate Positions of the Planets" (valid 1800–2050):
  // a (AU), e, I, L, long. of perihelion, long. of ascending node (degrees).
  const ELEMENTS_J2000 = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
      [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
      [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
    earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
      [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
    mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
      [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
      [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
      [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
      [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
      [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
    pluto: [[39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
      [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]],
  };

  /** Heliocentric ecliptic position (J2000 frame, AU) of a planet. */
  function heliocentric(planet, T) {
    const [base, rate] = ELEMENTS_J2000[planet];
    const [a, e, I, L, peri, node] = base.map((v, i) => v + rate[i] * T);
    const M = norm(L - peri) * RAD;
    let E = M + e * Math.sin(M);
    for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const w = (peri - node) * RAD, O = node * RAD, i = I * RAD;
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
    return {
      x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
      y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
      z: sw * si * xp + cw * si * yp,
    };
  }

  /** Apparent geocentric longitude of a planet, referred to the equinox of date. */
  function planetLongitude(planet, jd) {
    const T = centuries(jd);
    const p = heliocentric(planet, T);
    const earth = heliocentric("earth", T);
    const lonJ2000 = Math.atan2(p.y - earth.y, p.x - earth.x) / RAD;
    const precession = 1.3969713 * T; // general precession in longitude since J2000
    return norm(lonJ2000 + precession + nutation(T));
  }

  function bodyLongitude(key, jd) {
    if (key === "sun") return sunLongitude(jd);
    if (key === "moon") return moonLongitude(jd);
    return planetLongitude(key, jd);
  }

  function localSiderealTime(jd, lonEast) {
    const T = centuries(jd);
    const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - (T * T * T) / 38710000;
    return norm(gmst + lonEast);
  }

  /** Ascendant (the zodiac degree rising in the east) and Midheaven. */
  function angles(jd, lat, lonEast) {
    const theta = localSiderealTime(jd, lonEast);
    const eps = obliquity(centuries(jd));
    const asc = Math.atan2(cos(theta), -(sin(theta) * cos(eps) + Math.tan(lat * RAD) * sin(eps))) / RAD;
    const mc = Math.atan2(sin(theta), cos(theta) * cos(eps)) / RAD;
    return { ascendant: norm(asc), midheaven: norm(mc) };
  }

  /** Next time (after `from`, UTC ms) the Sun is between two longitudes.
   *  Returns { start, end } in UTC ms; start = from if it is there already. */
  function sunPeriod(startLon, endLon, from) {
    const span = norm(endLon - startLon) || 360;
    const reach = (target, t0) => {
      let t = t0;
      for (let k = 0; k < 6; k++) {
        const ahead = norm(target - sunLongitude(julianDay(t)));
        const step = k === 0 ? ahead : ((ahead + 180) % 360) - 180;
        t += (step / 0.98565) * 86400000;
      }
      return t;
    };
    const inside = norm(sunLongitude(julianDay(from)) - startLon) < span;
    const start = inside ? from : reach(startLon, from);
    const end = reach(norm(startLon + span), inside ? from : start);
    return { start, end, now: inside };
  }

  // ---------------------------------------------------------------------------
  // Birth chart
  // ---------------------------------------------------------------------------
  const PLANET_KEYS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

  function placement(key, lon, extra) {
    const s = signOf(lon);
    return Object.assign({ key, body: BODIES[key], lon, sign: s.sign, degree: s.degree, decan: decanOf(lon) }, extra);
  }

  /**
   * Birth chart. `birth` = { year, month, day, hour, minute, timeKnown,
   * timeZone, lat, lon }. Without a birth time, noon is used, the rising sign
   * is left out, and any body that changes sign during that day (usually the
   * Moon) is flagged with both possible signs.
   */
  function chart(birth) {
    const timeKnown = birth.timeKnown !== false && birth.hour != null;
    const hour = timeKnown ? birth.hour : 12;
    const minute = timeKnown ? birth.minute || 0 : 0;
    const utc = localToUtc(birth.year, birth.month, birth.day, hour, minute, birth.timeZone);
    const jd = julianDay(utc);
    const dayStart = julianDay(localToUtc(birth.year, birth.month, birth.day, 0, 0, birth.timeZone));
    const dayEnd = dayStart + 1 - 1 / 1440;

    const bodies = PLANET_KEYS.map((key) => {
      const lon = bodyLongitude(key, jd);
      const extra = {};
      if (key !== "sun" && key !== "moon") {
        extra.retrograde = norm(bodyLongitude(key, jd + 0.5) - bodyLongitude(key, jd - 0.5) + 180) - 180 < 0;
      }
      if (!timeKnown) {
        const a = signOf(bodyLongitude(key, dayStart)).sign, b = signOf(bodyLongitude(key, dayEnd)).sign;
        if (a !== b) extra.possibleSigns = [a, b];
      }
      return placement(key, lon, extra);
    });
    const byKey = {};
    bodies.forEach((b) => { byKey[b.key] = b; });
    if (timeKnown) {
      const a = angles(jd, birth.lat, birth.lon);
      byKey.ascendant = placement("ascendant", a.ascendant);
      byKey.midheaven = placement("midheaven", a.midheaven);
    }

    // Element and modality balance: the Sun, Moon and Rising count double,
    // the outer planets (which stay in a sign for years) are left out.
    const weights = { sun: 2, moon: 2, ascendant: 2, mercury: 1, venus: 1, mars: 1, jupiter: 1, saturn: 1 };
    const elements = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    const modalities = { Cardinal: 0, Fixed: 0, Mutable: 0 };
    Object.keys(weights).forEach((k) => {
      if (!byKey[k]) return;
      elements[byKey[k].sign.element] += weights[k];
      modalities[byKey[k].sign.modality] += weights[k];
    });
    // Ties count as a balance, not a winner.
    const leaders = (obj) => Object.keys(obj).filter((k) => obj[k] === Math.max(...Object.values(obj)));
    const top = (obj) => (leaders(obj).length === 1 ? leaders(obj)[0] : null);

    return {
      birth, timeKnown, utc, jd, bodies, byKey, elements, modalities,
      dominantElement: top(elements), // null when tied
      strongestElements: leaders(elements),
      dominantModality: top(modalities),
      strongestModalities: leaders(modalities),
      missingElements: Object.keys(elements).filter((e) => elements[e] === 0),
    };
  }

  // ---------------------------------------------------------------------------
  // Tarot numerology (Mary K. Greer): birth cards and the card of the year
  // ---------------------------------------------------------------------------
  const digitSum = (n) => String(n).split("").reduce((s, d) => s + Number(d), 0);

  /** Major Arcana numbers for a date sum: reduce to ≤ 22 (22 = The Fool),
   *  then keep adding digits down to a single digit. */
  function reduceToCards(sum) {
    let n = sum;
    while (n > 22) n = digitSum(n);
    const chain = [n];
    let m = n;
    while (m > 9) {
      m = digitSum(m);
      chain.push(m);
    }
    return chain.map((x) => (x === 22 ? 0 : x));
  }

  /** Birth cards: month + day + year of birth, e.g. 15 July 1990 → 7+15+1990. */
  function birthCards(year, month, day) {
    return reduceToCards(month + day + year);
  }

  /** Year card: the same sum with the current year; it shows the theme of your
   *  personal year (birthday to birthday). */
  function yearCard(month, day, year) {
    return reduceToCards(month + day + year)[0];
  }

  // ---------------------------------------------------------------------------
  // Personal cards: which tarot cards are tied to a birth chart
  // ---------------------------------------------------------------------------
  const MAJOR_NAMES = ["The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
    "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit", "Wheel of Fortune", "Justice",
    "The Hanged Man", "Death", "Temperance", "The Devil", "The Tower", "The Star", "The Moon", "The Sun",
    "Judgement", "The World"];

  /** List of { card, role, why } linking tarot cards to a chart. `today` (a
   *  Date) sets the year card; it defaults to now. */
  function personalCards(c, today) {
    const links = [];
    const add = (card, role, why) => links.push({ card, role, why });
    const now = today || new Date();
    const big = [["sun", "Sun"], ["moon", "Moon"], ["ascendant", "Rising"]];
    big.forEach(([key, label]) => {
      const p = c.byKey[key];
      if (!p) return;
      add(p.sign.card, label + " sign", label + " in " + p.sign.name + ": " + p.sign.card + " is the card of " + p.sign.name + ".");
      add(p.decan.card, label + " decan",
        label + " at " + Math.floor(p.degree) + "° " + p.sign.name + " falls in the decan of " + p.decan.planet +
        " in " + p.sign.name + ", ruled by the " + p.decan.card + ".");
    });
    const sun = c.byKey.sun.sign;
    add(courtCardFor(sun), "Court card",
      "Your court card: the " + courtCardFor(sun) + " rules " + sun.name + " (" + sun.modality.toLowerCase() + " " + sun.element.toLowerCase() + ").");
    const b = c.birth;
    birthCards(b.year, b.month, b.day).forEach((n, i, all) => {
      add(MAJOR_NAMES[n], "Birth card",
        (all.length === 1 ? "Your birth card" : i === 0 ? "Your personality card" : i === all.length - 1 ? "Your soul card" : "A birth card") +
        " from tarot numerology (" + b.month + " + " + b.day + " + " + b.year + ").");
    });
    // The personal year runs from birthday to birthday.
    const beforeBirthday = now.getMonth() + 1 < b.month || (now.getMonth() + 1 === b.month && now.getDate() < b.day);
    const y = now.getFullYear() - (beforeBirthday ? 1 : 0);
    add(MAJOR_NAMES[yearCard(b.month, b.day, y)], "Year card",
      "Your card of the year for your birthday " + y + "–" + (y + 1) + " (" + b.month + " + " + b.day + " + " + y + ").");
    return links;
  }

  /** The sky right now: where the Sun and Moon are and their tarot cards. */
  function sky(date) {
    const jd = julianDay((date || new Date()).getTime());
    return {
      sun: placement("sun", sunLongitude(jd)),
      moon: placement("moon", moonLongitude(jd)),
    };
  }

  const api = {
    SIGNS, ELEMENTS, BODIES, DECANS, MAJOR_NAMES,
    signOf, decanOf, courtCardFor, cardAstrology,
    julianDay, tzOffsetMinutes, localToUtc,
    sunLongitude, moonLongitude, planetLongitude, angles, localSiderealTime, sunPeriod,
    chart, birthCards, yearCard, reduceToCards, personalCards, sky,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Astro = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
