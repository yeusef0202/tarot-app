# Tarot

**Try it:** https://yeusef0202.github.io/tarot-app/

A simple tarot reading app with the full 78-card Rider–Waite–Smith deck. Shuffle, cut, draw cards into a spread, and read what they mean. A yes/no question gets a combined answer ("Yes, you will pass your test tomorrow.").

- Spreads: Single card, Past · Present · Future, Celtic Cross, Two Paths (for either/or decisions)
- Answers for yes/no, timing ("When…?"), cause ("Why…?"), people ("Who…?"), places ("Where…?"), advice and "A or B?" questions
- Birth chart: Sun, Moon, Rising and planets from your birth date, time and place, with the tarot cards linked to them (Golden Dawn correspondences, decans, court cards, tarot numerology). Readings mark your personal cards.
- Upright and reversed meanings, keywords, imagery and astrology for every card
- Meanings for love, career, money and wellbeing: buttons above the reading and in the Card Guide switch every card to that topic (the choice is remembered)
- English and European Portuguese (🌐 menu in the header; remembers your choice and follows the browser language)
- Card Guide to browse and search the whole deck
- Cryptographically random shuffling (Fisher–Yates with `crypto.getRandomValues`)

No build step: open `index.html`, or serve the folder:

```sh
npm start          # http://localhost:8080
```

## Tests

```sh
npm install
npm test
```

The tests check that shuffles are uniformly random (chi-square), that every card's descriptions match its traditional meaning, that the planet positions match PyEphem (`tests/fixtures/ephemeris.json`), and that both languages are complete and correct (`tests/i18n.test.js`), and that the UI works end to end (via jsdom).

Translations live in `i18n.js` (interface and generated sentences) and `cards-pt.js` (card texts).

The place search uses the free [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api). Birth details are stored only in the browser's localStorage.

## Disclaimer

For entertainment only. The cards are drawn at random; don't base real decisions on them.

## License

Public domain ([Unlicense](LICENSE)). Do whatever you like with it.
