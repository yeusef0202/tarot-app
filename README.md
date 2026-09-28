# Tarot

A simple tarot reading app with the full 78-card Rider–Waite–Smith deck. Shuffle, cut, draw cards into a spread, and read what they mean. A yes/no question gets a combined answer ("Yes, you will pass your test tomorrow.").

- Spreads: Single card, Past · Present · Future, Celtic Cross
- Upright and reversed meanings, keywords, imagery and astrology for every card
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

The tests check that shuffles are uniformly random (chi-square), that every card's descriptions match its traditional meaning, and that the UI works end to end (via jsdom).
