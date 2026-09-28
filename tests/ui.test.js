"use strict";
/*
 * UI tests: load the real index.html + deck.js + app.js into jsdom and drive
 * the app through clicks, like a user would.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
const deckSrc = fs.readFileSync(path.join(ROOT, "deck.js"), "utf8");
const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

const flush = () => new Promise((r) => setImmediate(r));

function load() {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/" });
  const w = dom.window;
  if (!w.crypto || !w.crypto.getRandomValues) {
    Object.defineProperty(w, "crypto", { value: globalThis.crypto });
  }
  // Skip animation delays and stub browser APIs jsdom doesn't implement.
  w.setTimeout = (fn) => { fn(); return 0; };
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = function () { w.__scrolledTo = this.id; };
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  w.confirm = () => true;
  w.eval(deckSrc);
  w.eval(appSrc);
  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  return { w, $, $$, T: w.Tarot };
}

async function shuffle(app) {
  app.$("#btn-shuffle").click();
  await flush();
}

function enabledFan(app) {
  return app.$$("#deck-fan .fan-card:not(:disabled)");
}

function pickSpread(app, key) {
  app.$(`#spread-choice [data-spread="${key}"]`).click();
}

/** Verify every rendered explanation matches the deck data for its card. */
function checkExplanations(app, spreadKey) {
  const { T, $$ } = app;
  const out = [];
  for (const e of $$(".explain")) {
    const card = T.DECK.find((c) => c.id === e.dataset.cardId);
    const rev = e.dataset.reversed === "true";
    const o = rev ? "reversed" : "upright";
    const other = rev ? "upright" : "reversed";
    const pos = Number(e.dataset.position);
    const where = `${card.name} at ${pos}`;
    assert.ok(e.querySelector(".explain-name").textContent.startsWith(card.name), where + " name");
    assert.equal(e.querySelector(".badge").textContent, rev ? "Reversed" : "Upright", where + " badge");
    assert.equal(e.querySelector(".meaning").textContent, card.meaning[o], where + " meaning");
    // Spread into a Node array: jsdom arrays come from another realm.
    assert.deepEqual([...e.querySelectorAll(".keywords li")].map((l) => l.textContent), [...card.keywords[o]], where + " keywords");
    assert.ok(e.querySelector(".imagery").textContent.includes(card.image), where + " imagery");
    assert.equal(e.querySelector("details p").textContent, card.meaning[other], where + " other orientation");
    const posDef = T.SPREADS[spreadKey].positions[pos];
    assert.ok(e.querySelector(".explain-pos").textContent.includes(posDef.name), where + " position name");
    assert.equal(e.querySelector(".pos-meaning").textContent, posDef.meaning, where + " position meaning");
    // The card shown in the spread slot is the same card, same orientation, face up.
    const slotCard = app.$(`.slot[data-position="${pos}"] .card`);
    assert.equal(slotCard.dataset.cardId, card.id, where + " slot card");
    assert.equal(slotCard.dataset.reversed, String(rev), where + " slot orientation");
    assert.ok(slotCard.classList.contains("flipped"), where + " face up");
    assert.equal(slotCard.querySelector(".cf-name").textContent, card.name, where + " card face");
    out.push({ card, rev, pos });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

// ---------------------------------------------------------------------------

test("initial screen: menu, disabled deck, only Shuffle available", () => {
  const app = load();
  assert.deepEqual(app.$$(".menu-item").map((b) => b.textContent), ["Reading", "Card Guide", "How it works"]);
  assert.ok(app.$("#view-reading").classList.contains("active"));
  assert.equal(app.$$("#deck-fan .fan-card").length, 78);
  assert.equal(enabledFan(app).length, 0, "cannot take cards before shuffling");
  assert.equal(app.$("#btn-shuffle").disabled, false);
  assert.equal(app.$("#btn-cut").disabled, true);
  assert.equal(app.$("#btn-reset").disabled, true);
  assert.equal(app.$$(".explain").length, 0);
});

test("menu switches between Reading, Card Guide and How it works", () => {
  const app = load();
  for (const view of ["guide", "about", "reading"]) {
    app.$(`.menu-item[data-view="${view}"]`).click();
    assert.deepEqual(app.$$(".view.active").map((v) => v.id), ["view-" + view]);
    assert.equal(app.$(".menu-item.active").dataset.view, view);
  }
});

test("shuffle → take a card → explanation appears below, for every spread", async () => {
  const app = load();
  for (const spread of ["single", "three", "celtic"]) {
    pickSpread(app, spread);
    await shuffle(app);
    const n = app.T.SPREADS[spread].positions.length;
    assert.equal(enabledFan(app).length, 78);
    assert.equal(app.$("#btn-cut").disabled, false);
    for (let k = 0; k < n; k++) {
      enabledFan(app)[k * 7].click();
      assert.equal(app.$$(".explain").length, k + 1, "one explanation per card taken");
      assert.equal(app.$$(".explain")[0].dataset.position, String(k), "newest explanation is first");
      const expectedLeft = k + 1 < n ? 78 - (k + 1) : 0;
      assert.equal(enabledFan(app).length, expectedLeft);
    }
    const drawn = checkExplanations(app, spread);
    assert.equal(drawn.length, n);
    assert.equal(new Set(drawn.map((d) => d.card.id)).size, n, "no repeated cards");
    assert.equal(app.$("#summary").hidden, false, "summary shown when complete");
    assert.ok(app.$("#deck-fan").classList.contains("locked"));
    assert.equal(app.$("#btn-shuffle").disabled, true);
    assert.equal(app.$("#btn-reset").disabled, false);
    app.$("#btn-reset").click();
    assert.equal(app.$$(".explain").length, 0);
  }
});

test("200 readings through the UI: explanations always match the drawn cards", async () => {
  const app = load();
  const spreads = ["single", "three", "celtic"];
  const seen = {};
  for (let r = 0; r < 200; r++) {
    const spread = spreads[r % 3];
    if (!app.$("#btn-reset").disabled) app.$("#btn-reset").click();
    pickSpread(app, spread);
    await shuffle(app);
    if (r % 2) { app.$("#btn-cut").click(); await flush(); }
    const n = app.T.SPREADS[spread].positions.length;
    for (let k = 0; k < n; k++) {
      const fan = enabledFan(app);
      fan[Math.floor(Math.random() * fan.length)].click();
    }
    const drawn = checkExplanations(app, spread);
    assert.equal(drawn.length, n);
    (seen[spread] = seen[spread] || []).push(drawn.map((d) => d.card.id + d.rev).join());
  }
  // One-card readings have only 156 outcomes, so repeats are expected (birthday
  // paradox); multi-card spreads have billions, so they should never repeat.
  assert.ok(new Set(seen.single).size > 40, "single-card readings vary: " + new Set(seen.single).size);
  for (const key of ["three", "celtic"]) {
    assert.equal(new Set(seen[key]).size, seen[key].length, key + " readings all different");
  }
});

test("cards drawn through the UI are uniformly random", async () => {
  const app = load();
  pickSpread(app, "single");
  const N = 2340; // 30 expected per card (chi-square needs >= 5)
  const counts = {};
  let reversed = 0;
  for (let r = 0; r < N; r++) {
    if (!app.$("#btn-reset").disabled) app.$("#btn-reset").click();
    await shuffle(app);
    enabledFan(app)[0].click(); // always take the top card: only the shuffle decides
    const e = app.$(".explain");
    counts[e.dataset.cardId] = (counts[e.dataset.cardId] || 0) + 1;
    if (e.dataset.reversed === "true") reversed++;
  }
  assert.equal(Object.keys(counts).length, 78, "every card appeared");
  const expected = N / 78;
  const chi = Object.values(counts).reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
  // df = 77, p = 0.0001 critical value ≈ 131.6
  assert.ok(chi < 131.6, "chi² = " + chi.toFixed(1));
  const rate = reversed / N;
  assert.ok(Math.abs(rate - 0.5) < 0.05, "reversed rate " + rate); // ~4.8 standard deviations
});

test("turning reversals off means no reversed cards", async () => {
  const app = load();
  app.$("#reversals").click(); // uncheck
  assert.equal(app.$("#reversals").checked, false);
  pickSpread(app, "celtic");
  for (let r = 0; r < 50; r++) {
    if (!app.$("#btn-reset").disabled) app.$("#btn-reset").click();
    await shuffle(app);
    for (let k = 0; k < 10; k++) enabledFan(app)[0].click();
    assert.ok(app.$$(".explain").every((e) => e.dataset.reversed === "false"));
    assert.equal(app.$$(".rev-tag").length, 0);
  }
});

test("reversed cards are drawn upside down and labelled", async () => {
  const app = load();
  pickSpread(app, "celtic");
  let found = false;
  for (let r = 0; r < 20 && !found; r++) {
    if (!app.$("#btn-reset").disabled) app.$("#btn-reset").click();
    await shuffle(app);
    for (let k = 0; k < 10; k++) enabledFan(app)[0].click();
    for (const e of app.$$(".explain")) {
      const slot = app.$(`.slot[data-position="${e.dataset.position}"]`);
      const rev = e.dataset.reversed === "true";
      assert.equal(slot.querySelector(".card").classList.contains("reversed"), rev);
      assert.equal(!!slot.querySelector(".rev-tag"), rev);
      found = found || rev;
    }
  }
  assert.ok(found, "saw at least one reversed card");
});

test("clicking a card in the spread highlights its explanation", async () => {
  const app = load();
  await shuffle(app);
  for (let k = 0; k < 3; k++) enabledFan(app)[0].click();
  app.$('.slot[data-position="0"]').click();
  assert.equal(app.w.__scrolledTo, "explain-0");
  assert.ok(app.$("#explain-0").classList.contains("highlight"));
  assert.ok(app.$('.slot[data-position="0"]').classList.contains("active"));
});

test("the question is shown in the summary as text (HTML is escaped)", async () => {
  const app = load();
  app.$("#question").value = '<img src=x onerror="alert(1)"> Will I find a job?';
  pickSpread(app, "single");
  await shuffle(app);
  enabledFan(app)[0].click();
  assert.ok(app.$("#summary .question-echo").textContent.includes("<img src=x"));
  assert.equal(app.$("#summary img"), null);
});

test("changing the spread or reversals after shuffling resets the deck", async () => {
  const app = load();
  await shuffle(app);
  assert.equal(enabledFan(app).length, 78);
  pickSpread(app, "celtic");
  assert.equal(enabledFan(app).length, 0, "must shuffle again after changing spread");
  await shuffle(app);
  app.$("#reversals").click();
  assert.equal(enabledFan(app).length, 0, "must shuffle again after changing reversals");
});

test("Card Guide lists all 78 cards, filters, searches and shows both meanings", () => {
  const app = load();
  app.$('.menu-item[data-view="guide"]').click();
  assert.equal(app.$$("#guide-grid .guide-item").length, 78);
  const filter = (k) => app.$(`#guide-filter [data-filter="${k}"]`).click();
  filter("major");
  assert.equal(app.$$("#guide-grid .guide-item").length, 22);
  for (const suit of ["wands", "cups", "swords", "pentacles"]) {
    filter(suit);
    const items = app.$$("#guide-grid .guide-item");
    assert.equal(items.length, 14);
    assert.ok(items.every((i) => i.dataset.cardId.startsWith(suit)));
  }
  filter("all");
  const search = app.$("#guide-search");
  search.value = "heartbreak";
  search.dispatchEvent(new app.w.Event("input"));
  assert.deepEqual(app.$$("#guide-grid .guide-item").map((i) => i.getAttribute("aria-label")), ["Three of Swords"]);
  search.value = "zzzz";
  search.dispatchEvent(new app.w.Event("input"));
  assert.equal(app.$("#guide-empty").hidden, false);
  search.value = "";
  search.dispatchEvent(new app.w.Event("input"));

  // Every card's detail dialog shows its own data.
  for (const item of app.$$("#guide-grid .guide-item")) {
    item.click();
    const card = app.T.DECK.find((c) => c.id === item.dataset.cardId);
    assert.ok(app.$("#card-dialog").hasAttribute("open"));
    assert.equal(app.$("#card-dialog-body h2").textContent, card.name);
    assert.equal(app.$("#card-dialog-body .meaning-upright").textContent, card.meaning.upright);
    assert.equal(app.$("#card-dialog-body .meaning-reversed").textContent, card.meaning.reversed);
    assert.ok(app.$("#card-dialog-body .imagery").textContent.includes(card.image));
    app.$("#card-dialog").close();
  }
});

test("a yes/no question gets an answer that combines all the cards", async () => {
  const app = load();
  const q = app.$("#question");
  q.value = "Will I pass my test tomorrow?";
  q.dispatchEvent(new app.w.Event("input"));
  assert.match(app.$("#question-hint").textContent, /Yes\/no question/);
  for (const spread of ["single", "three", "celtic"]) {
    for (let r = 0; r < 30; r++) {
      if (!app.$("#btn-reset").disabled) app.$("#btn-reset").click();
      pickSpread(app, spread);
      await shuffle(app);
      const n = app.T.SPREADS[spread].positions.length;
      for (let k = 0; k < n; k++) enabledFan(app)[Math.floor(Math.random() * (78 - k))].click();
      const drawn = checkExplanations(app, spread).map((x) => ({ card: x.card, reversed: x.rev }));
      const expected = app.T.yesNoReading(drawn, spread);
      const box = app.$("#summary .answer");
      assert.ok(box, "answer box shown");
      assert.equal(box.dataset.verdict, expected.verdict.key);
      assert.equal(app.$("#summary .answer-label").textContent, expected.verdict.label);
      assert.equal(app.$("#summary .answer-sentence").textContent, app.T.answerSentence(q.value, expected.verdict.key));
      assert.match(app.$("#summary .answer-sentence").textContent, /pass your test tomorrow\.$/);
      assert.equal(app.$$("#summary .lean-list li").length, n, "one lean per card");
      assert.equal(app.$("#summary .story").textContent, app.T.narrate(drawn, spread));
      assert.match(app.$("#status").textContent, new RegExp("Your answer: " + expected.verdict.label));
    }
  }
});

test("an open question gets the combined interpretation but no yes/no answer", async () => {
  const app = load();
  const q = app.$("#question");
  q.value = "What should I focus on this month?";
  q.dispatchEvent(new app.w.Event("input"));
  assert.match(app.$("#question-hint").textContent, /Open question/);
  await shuffle(app);
  for (let k = 0; k < 3; k++) enabledFan(app)[0].click();
  assert.equal(app.$("#summary .answer"), null);
  assert.ok(app.$("#summary .story").textContent.length > 50);
  assert.equal(app.$("#summary .question-echo").textContent, "“What should I focus on this month?”");

  // Rewording it as a yes/no question after the reading updates the summary.
  q.value = "Should I focus on my studies?";
  q.dispatchEvent(new app.w.Event("input"));
  assert.ok(app.$("#summary .answer"));
  assert.match(app.$("#summary .answer-sentence").textContent, /focus on your studies\.$/);
});
