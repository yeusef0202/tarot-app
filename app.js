/* Tarot app UI. Depends on deck.js (window.Tarot). */
(function () {
  "use strict";

  const T = window.Tarot;
  const $ = (sel) => document.querySelector(sel);

  // ------------------------------------------------------------------ state
  const state = {
    spread: "three",
    reversals: true,
    pile: null,      // shuffled array of { card, reversed } still in the deck
    drawn: [],       // array of { card, reversed } in spread-position order
    busy: false,     // true while an animation is running
    activeIndex: -1, // drawn card currently highlighted
  };

  // ------------------------------------------------------------ suit icons
  const ICONS = {
    wands:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
      '<path d="M7 21 17 3"/><path d="M14.2 8c1.4-.4 2.4.1 2.9 1.1M11.6 12.6c-1.4-.1-2.2-.9-2.4-2M16 4.6c1-.2 1.8.2 2.2 1"/></svg>',
    cups:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M5.5 3h13c0 5.2-2.7 8.5-6.5 8.5S5.5 8.2 5.5 3Z"/><path d="M12 11.5V18M8 21h8M9.5 18h5"/></svg>',
    swords:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M12 2 13.8 4.5V15h-3.6V4.5Z"/><path d="M6.5 15h11M12 15v5"/><circle cx="12" cy="21.2" r="1"/></svg>',
    pentacles:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9.5"/><path d="M12 5 16.11 17.66 5.34 9.84h13.32L7.89 17.66Z"/></svg>',
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ------------------------------------------------------------ rendering
  function cardFrontHtml(card) {
    if (card.arcana === "major") {
      return (
        '<div class="card-front major">' +
        '<div class="cf-top">' + card.numeral + "</div>" +
        '<div class="cf-art"><span class="cf-glyph">' + card.glyph + "︎</span></div>" +
        '<div class="cf-name">' + escapeHtml(card.name) + "</div></div>"
      );
    }
    const icon = ICONS[card.suit];
    let art;
    if (card.court) {
      art = '<div class="cf-court">' + icon + '<span class="cf-court-letter">' + card.rank[0] + "</span></div>";
    } else if (card.number === 1) {
      art = '<div class="cf-big">' + icon + "</div>";
    } else {
      const cls = card.number > 6 ? "cf-pips three-col" : "cf-pips";
      art = '<div class="' + cls + '">' + icon.repeat(card.number) + "</div>";
    }
    const top = card.court ? card.rank : card.number === 1 ? "ACE" : String(card.number);
    return (
      '<div class="card-front ' + card.suit + '">' +
      '<div class="cf-top">' + top + "</div>" +
      '<div class="cf-art">' + art + "</div>" +
      '<div class="cf-name">' + escapeHtml(card.name) + "</div></div>"
    );
  }

  /** A full card element (back + front). `flipped` shows the face. */
  function cardHtml(card, reversed, opts) {
    const o = opts || {};
    const classes = ["card"];
    if (o.flipped) classes.push("flipped");
    if (o.static) classes.push("static");
    if (reversed) classes.push("reversed");
    return (
      '<div class="' + classes.join(" ") + '" data-card-id="' + card.id + '" data-reversed="' + !!reversed + '">' +
      '<div class="card-inner"><div class="card-back"></div>' + cardFrontHtml(card) + "</div></div>"
    );
  }

  function metaLine(card) {
    if (card.arcana === "major") {
      return "Major Arcana " + card.numeral + " · " + card.astro;
    }
    const s = T.SUITS[card.suit];
    return "Minor Arcana · " + s.name + " · " + s.element + (card.court ? " · Court card" : "");
  }

  function keywordsHtml(list) {
    return '<ul class="keywords">' + list.map((k) => "<li>" + escapeHtml(k) + "</li>").join("") + "</ul>";
  }

  // --------------------------------------------------------------- reading
  function spreadDef() {
    return T.SPREADS[state.spread];
  }

  function phase() {
    if (!state.pile) return "idle";
    if (state.drawn.length >= spreadDef().positions.length) return "complete";
    return "drawing";
  }

  function setStatus(msg) {
    $("#status").textContent = msg;
  }

  function renderSpreadChoice() {
    const wrap = $("#spread-choice");
    wrap.innerHTML = "";
    Object.keys(T.SPREADS).forEach((key) => {
      const s = T.SPREADS[key];
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(key === state.spread));
      b.dataset.spread = key;
      b.textContent = s.name + " (" + s.positions.length + ")";
      b.addEventListener("click", () => {
        if (key === state.spread) return;
        if (state.drawn.length > 0 && phase() !== "complete" &&
            !confirm("Switching spreads will discard the current reading. Continue?")) return;
        state.spread = key;
        resetReading("Spread changed to " + s.name + ". Shuffle the deck to begin.");
        renderSpreadChoice();
      });
      wrap.appendChild(b);
    });
    $("#spread-description").textContent = spreadDef().description;
  }

  function renderFan() {
    const fan = $("#deck-fan");
    const p = phase();
    fan.classList.toggle("stacked", p === "idle");
    fan.classList.toggle("locked", p === "complete");
    const count = p === "idle" ? 78 : state.pile.length;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fan-card";
      b.dataset.index = String(i);
      b.innerHTML = '<span class="card-back"></span>';
      if (p === "drawing") {
        b.setAttribute("aria-label", "Take card " + (i + 1) + " of " + count);
      } else {
        b.disabled = true;
        b.setAttribute("aria-label", p === "idle" ? "Deck (shuffle first)" : "Deck");
      }
      frag.appendChild(b);
    }
    fan.innerHTML = "";
    fan.appendChild(frag);
  }

  function renderSpread() {
    const el = $("#spread");
    const def = spreadDef();
    el.className = "spread " + state.spread;
    const nextIndex = phase() === "drawing" ? state.drawn.length : -1;
    el.innerHTML = def.positions
      .map((pos, i) => {
        const d = state.drawn[i];
        const cls = ["slot", "p" + (i + 1)];
        if (d) cls.push("filled");
        if (i === nextIndex) cls.push("next");
        if (i === state.activeIndex) cls.push("active");
        const inner = d ? cardHtml(d.card, d.reversed, { flipped: true, static: true }) : "<span>" + (i + 1) + "</span>";
        return (
          '<div class="' + cls.join(" ") + '" data-position="' + i + '"' +
          (d ? ' role="button" tabindex="0" aria-label="Show meaning of ' + escapeHtml(d.card.name) + '"' : "") +
          ' title="' + (i + 1) + ". " + escapeHtml(pos.name) + '">' +
          '<div class="slot-frame">' + inner + "</div>" +
          '<div class="slot-label"><b>' + (i + 1) + ". " + escapeHtml(pos.name) + "</b>" +
          (d ? escapeHtml(d.card.name) + (d.reversed ? '<br><span class="rev-tag">Reversed</span>' : "") : "") +
          "</div></div>"
        );
      })
      .join("");
  }

  function explanationHtml(d, i) {
    const pos = spreadDef().positions[i];
    const c = d.card;
    const orient = d.reversed ? "reversed" : "upright";
    const other = d.reversed ? "upright" : "reversed";
    return (
      '<article class="explain ' + (c.suit || "major") + '" id="explain-' + i + '" data-position="' + i +
      '" data-card-id="' + c.id + '" data-reversed="' + d.reversed + '">' +
      "<div>" + cardHtml(c, d.reversed, { flipped: true, static: true }) + "</div>" +
      "<div>" +
      '<p class="explain-pos"><b>' + (i + 1) + ". " + escapeHtml(pos.name) + "</b></p>" +
      '<p class="pos-meaning">' + escapeHtml(pos.meaning) + "</p>" +
      '<h3 class="explain-name">' + escapeHtml(c.name) +
      (d.reversed ? '<span class="badge rev">Reversed</span>' : '<span class="badge up">Upright</span>') + "</h3>" +
      '<p class="meta">' + escapeHtml(metaLine(c)) + "</p>" +
      keywordsHtml(c.keywords[orient]) +
      '<p class="meaning">' + escapeHtml(c.meaning[orient]) + "</p>" +
      '<p class="imagery"><strong>On the card:</strong> ' + escapeHtml(c.image) + "</p>" +
      "<details><summary>" + (d.reversed ? "Upright" : "Reversed") + " meaning</summary>" +
      "<p>" + escapeHtml(c.meaning[other]) + "</p></details>" +
      "</div></article>"
    );
  }

  function renderExplanations() {
    // Most recent draw first, so the newest explanation is right below the spread.
    const html = state.drawn.map((d, i) => ({ d, i })).reverse().map(({ d, i }) => explanationHtml(d, i)).join("");
    $("#explanations").innerHTML = html;
  }

  function answerHtml(q) {
    const r = T.yesNoReading(state.drawn, state.spread);
    const v = r.verdict;
    const sentence = T.answerSentence(q, v.key);
    const k = r.keyCard;
    const leanClass = (val) => (val > 0 ? "yes" : val < 0 ? "no" : "maybe");
    return (
      '<div class="answer answer-' + v.key + '" data-verdict="' + v.key + '" data-score="' + r.score.toFixed(3) + '">' +
      '<div class="answer-head"><span class="answer-label">' + escapeHtml(v.label) + "</span>" +
      '<span class="question-echo">“' + escapeHtml(q) + "”</span></div>" +
      (sentence ? '<p class="answer-sentence">' + escapeHtml(sentence) + "</p>" : "") +
      '<p class="answer-text">' + escapeHtml(v.text) + "</p>" +
      '<div class="meter" aria-hidden="true"><span>No</span><div class="meter-track">' +
      '<div class="meter-marker" style="left:' + ((r.score + 1) * 50).toFixed(1) + '%"></div></div><span>Yes</span></div>' +
      '<p class="answer-key">Key card: <b>' + escapeHtml(k.card.name) + (k.reversed ? " (reversed)" : "") +
      "</b> in the " + escapeHtml(k.position) + " position, which leans " + escapeHtml(k.lean) + ".</p>" +
      '<ul class="lean-list">' + r.items.map((it) =>
        "<li>" + escapeHtml(it.position) + ": " + escapeHtml(it.card.name) + (it.reversed ? " (R)" : "") +
        ' <span class="lean lean-' + leanClass(it.value) + '">' + escapeHtml(it.lean) + "</span></li>").join("") + "</ul>" +
      '<p class="answer-note">Tarot offers guidance and reflection, not certainty.</p>' +
      "</div>"
    );
  }

  function renderSummary() {
    const el = $("#summary");
    if (phase() !== "complete") {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const q = $("#question").value.trim();
    const yesNo = T.isYesNoQuestion(q);
    const notes = T.summarize(state.drawn);
    el.innerHTML =
      "<h2>Your reading</h2>" +
      (yesNo ? answerHtml(q) : q ? '<p class="question-echo">“' + escapeHtml(q) + "”</p>" : "") +
      "<h3>Reading the cards together</h3>" +
      '<p class="story">' + escapeHtml(T.narrate(state.drawn, state.spread)) + "</p>" +
      (notes.length ? "<h3>Patterns in the spread</h3><ul>" + notes.map((n) => "<li>" + escapeHtml(n) + "</li>").join("") + "</ul>" : "") +
      '<p class="cards-line">' +
      state.drawn.map((d, i) => (i + 1) + ". " + spreadDef().positions[i].name + ": " + d.card.name + (d.reversed ? " (R)" : "")).map(escapeHtml).join(" · ") +
      "</p>";
    el.hidden = false;
  }

  function renderQuestionHint() {
    const q = $("#question").value.trim();
    $("#question-hint").textContent = !q
      ? "Tip: ask a yes/no question (e.g. “Will I pass my test tomorrow?”) to get a yes/no answer."
      : T.isYesNoQuestion(q)
        ? "✓ Yes/no question: you'll get a yes/no answer when the spread is complete."
        : "Open question: you'll get an interpretation of all the cards together.";
  }

  function renderButtons() {
    const p = phase();
    $("#btn-shuffle").disabled = state.busy || state.drawn.length > 0;
    $("#btn-shuffle").textContent = p === "idle" ? "🔀 Shuffle the deck" : "🔀 Shuffle again";
    $("#btn-cut").disabled = state.busy || p !== "drawing" || state.drawn.length > 0;
    $("#btn-reset").disabled = state.busy || p === "idle";
  }

  function renderAll() {
    renderFan();
    renderSpread();
    renderExplanations();
    renderSummary();
    renderButtons();
  }

  function resetReading(msg) {
    state.pile = null;
    state.drawn = [];
    state.activeIndex = -1;
    renderAll();
    setStatus(msg || "Choose a spread, focus on your question and shuffle the deck.");
  }

  function animateFan(cls, ms) {
    const fan = $("#deck-fan");
    state.busy = true;
    renderButtons();
    fan.classList.remove(cls);
    void fan.offsetWidth; // restart animation
    fan.classList.add(cls);
    return new Promise((resolve) =>
      setTimeout(() => {
        fan.classList.remove(cls);
        state.busy = false;
        resolve();
      }, ms)
    );
  }

  async function doShuffle() {
    if (state.busy || state.drawn.length > 0) return;
    state.reversals = $("#reversals").checked;
    state.pile = T.shuffle(T.DECK, { reversals: state.reversals });
    state.activeIndex = -1;
    renderAll();
    setStatus("Shuffling…");
    await animateFan("shuffling", 700);
    renderButtons();
    setStatus("Deck shuffled. Cut it if you like, then pick card 1 (" + spreadDef().positions[0].name + ") from the deck.");
  }

  async function doCut() {
    if (state.busy || phase() !== "drawing" || state.drawn.length > 0) return;
    state.pile = T.cut(state.pile);
    await animateFan("cutting", 500);
    renderButtons();
    setStatus("The deck has been cut. Pick card 1 (" + spreadDef().positions[0].name + ").");
  }

  function takeCard(index) {
    if (state.busy || phase() !== "drawing") return;
    const d = T.take(state.pile, index);
    state.drawn.push(d);
    const pos = state.drawn.length - 1;
    state.activeIndex = pos;

    renderFan();
    renderSpread();
    renderExplanations();
    renderSummary();
    renderButtons();

    // Flip animation (pure CSS, so the card always ends face up).
    const slotCard = document.querySelector('.slot[data-position="' + pos + '"] .card');
    if (slotCard) slotCard.classList.add("flip-in");

    const def = spreadDef();
    if (phase() === "complete") {
      const q = $("#question").value.trim();
      setStatus(T.isYesNoQuestion(q)
        ? "Reading complete. Your answer: " + T.yesNoReading(state.drawn, state.spread).verdict.label + ". Scroll down for the full interpretation."
        : "Reading complete. Scroll down for the full interpretation, or start a new reading.");
    } else {
      const next = state.drawn.length;
      setStatus("You drew " + d.card.name + (d.reversed ? " (reversed)" : "") + ". Now pick card " + (next + 1) + " (" + def.positions[next].name + ").");
    }
  }

  function focusExplanation(pos) {
    state.activeIndex = pos;
    document.querySelectorAll(".slot").forEach((s) => s.classList.toggle("active", Number(s.dataset.position) === pos));
    document.querySelectorAll(".explain").forEach((e) => e.classList.toggle("highlight", Number(e.dataset.position) === pos));
    const target = document.getElementById("explain-" + pos);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ----------------------------------------------------------------- guide
  const guideState = { filter: "all", query: "" };

  function renderGuideFilters() {
    const filters = [["all", "All"], ["major", "Major Arcana"]].concat(
      Object.keys(T.SUITS).map((k) => [k, T.SUITS[k].name])
    );
    const wrap = $("#guide-filter");
    wrap.innerHTML = "";
    filters.forEach(([key, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.dataset.filter = key;
      b.classList.toggle("active", key === guideState.filter);
      b.addEventListener("click", () => {
        guideState.filter = key;
        renderGuideFilters();
        renderGuideGrid();
      });
      wrap.appendChild(b);
    });
  }

  function renderGuideGrid() {
    const q = guideState.query.toLowerCase();
    const cards = T.DECK.filter((c) => {
      if (guideState.filter === "major" && c.arcana !== "major") return false;
      if (guideState.filter !== "all" && guideState.filter !== "major" && c.suit !== guideState.filter) return false;
      if (!q) return true;
      const hay = [c.name].concat(c.keywords.upright, c.keywords.reversed).join(" ").toLowerCase();
      return hay.includes(q);
    });
    $("#guide-grid").innerHTML = cards
      .map((c) => '<button type="button" class="guide-item" data-card-id="' + c.id + '" aria-label="' + escapeHtml(c.name) + '">' +
        cardHtml(c, false, { flipped: true, static: true }) + "</button>")
      .join("");
    $("#guide-empty").hidden = cards.length > 0;
  }

  function openCardDialog(id) {
    const c = T.DECK.find((x) => x.id === id);
    if (!c) return;
    $("#card-dialog-body").innerHTML =
      '<div class="dialog-card" data-card-id="' + c.id + '">' +
      "<div>" + cardHtml(c, false, { flipped: true, static: true }) + "</div>" +
      "<div>" +
      "<h2>" + escapeHtml(c.name) + "</h2>" +
      '<p class="meta" style="color:var(--muted)">' + escapeHtml(metaLine(c)) + "</p>" +
      '<p class="imagery"><strong>On the card:</strong> ' + escapeHtml(c.image) + "</p>" +
      '<h4>Upright <span class="badge up">Upright</span></h4>' + keywordsHtml(c.keywords.upright) +
      '<p class="meaning-upright">' + escapeHtml(c.meaning.upright) + "</p>" +
      '<h4>Reversed <span class="badge rev">Reversed</span></h4>' + keywordsHtml(c.keywords.reversed) +
      '<p class="meaning-reversed">' + escapeHtml(c.meaning.reversed) + "</p>" +
      "</div></div>";
    $("#card-dialog").showModal();
  }

  // ------------------------------------------------------------------ menu
  function showView(name) {
    document.querySelectorAll(".menu-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------------ init
  function init() {
    document.querySelectorAll(".menu-item").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

    $("#btn-shuffle").addEventListener("click", doShuffle);
    $("#btn-cut").addEventListener("click", doCut);
    $("#btn-reset").addEventListener("click", () => resetReading());
    $("#reversals").addEventListener("change", () => {
      state.reversals = $("#reversals").checked;
      if (state.pile && state.drawn.length === 0) {
        resetReading("Reversals " + (state.reversals ? "on" : "off") + ". Shuffle again to apply.");
      } else if (state.drawn.length > 0) {
        setStatus("Reversal setting will apply to your next reading.");
      }
    });

    $("#deck-fan").addEventListener("click", (e) => {
      const btn = e.target.closest(".fan-card");
      if (btn && !btn.disabled) takeCard(Number(btn.dataset.index));
    });

    const onSlot = (e) => {
      const slot = e.target.closest(".slot.filled");
      if (slot) focusExplanation(Number(slot.dataset.position));
    };
    $("#spread").addEventListener("click", onSlot);
    $("#spread").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSlot(e); }
    });

    renderGuideFilters();
    renderGuideGrid();
    $("#guide-search").addEventListener("input", (e) => {
      guideState.query = e.target.value.trim();
      renderGuideGrid();
    });
    $("#guide-grid").addEventListener("click", (e) => {
      const item = e.target.closest(".guide-item");
      if (item) openCardDialog(item.dataset.cardId);
    });
    $("#card-dialog").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) e.currentTarget.close(); // click on backdrop
    });

    $("#question").addEventListener("input", () => {
      renderQuestionHint();
      if (phase() === "complete") renderSummary();
    });

    renderSpreadChoice();
    renderQuestionHint();
    resetReading();
  }

  window.TarotApp = { state }; // handy for debugging in the console
  init();
})();
