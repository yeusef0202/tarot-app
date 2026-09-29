/* Tarot app UI. Depends on astro.js (window.Astro) and deck.js (window.Tarot). */
(function () {
  "use strict";

  const T = window.Tarot;
  const A = window.Astro;
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

  // Birth chart (saved in localStorage) and the tarot cards linked to it.
  const STORAGE_KEY = "arcana.birth";
  const chartState = { saved: null, chart: null, links: [] };

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
    return "Minor Arcana · " + s.name + " · " + s.element + (card.court ? " · Court card" : "") + " · " + card.astro;
  }

  const cardByName = (name) => T.DECK.find((c) => c.name === name);

  /** Small clickable card (opens the card dialog). */
  function miniCardHtml(name, caption) {
    const c = cardByName(name);
    return '<button type="button" class="mini-card" data-card-id="' + c.id + '" aria-label="' + escapeHtml(name) + '">' +
      cardHtml(c, false, { flipped: true, static: true }) +
      (caption ? '<span class="mini-caption">' + escapeHtml(caption) + "</span>" : "") + "</button>";
  }

  /** Inline card name that opens the card dialog. */
  function cardLinkHtml(name) {
    return '<button type="button" class="card-link" data-card-id="' + cardByName(name).id + '">' + escapeHtml(name) + "</button>";
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
        renderQuestionHint();
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
      personalNoteHtml(i) +
      keywordsHtml(c.keywords[orient]) +
      '<p class="meaning">' + escapeHtml(c.meaning[orient]) + "</p>" +
      '<p class="imagery"><strong>On the card:</strong> ' + escapeHtml(c.image) + "</p>" +
      "<details><summary>" + (d.reversed ? "Upright" : "Reversed") + " meaning</summary>" +
      "<p>" + escapeHtml(c.meaning[other]) + "</p></details>" +
      "</div></article>"
    );
  }

  function personalNoteHtml(i) {
    const link = T.personalLinks(state.drawn, chartState.links).find((l) => l.index === i);
    return link ? '<p class="personal-note">✦ <b>Personal card.</b> ' + escapeHtml(link.why.join(" ")) + "</p>" : "";
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
      meterHtml(r.score, "No", "Yes") +
      '<p class="answer-key">Key card: <b>' + escapeHtml(k.card.name) + (k.reversed ? " (reversed)" : "") +
      "</b> in the " + escapeHtml(k.position) + " position, which leans " + escapeHtml(k.lean) + ".</p>" +
      '<ul class="lean-list">' + r.items.map((it) =>
        "<li>" + escapeHtml(it.position) + ": " + escapeHtml(it.card.name) + (it.reversed ? " (R)" : "") +
        ' <span class="lean lean-' + leanClass(it.value) + '">' + escapeHtml(it.lean) + "</span></li>").join("") + "</ul>" +
      '<p class="answer-note">Tarot offers guidance and reflection, not certainty.</p>' +
      "</div>"
    );
  }

  function meterHtml(score, left, right) {
    return '<div class="meter" aria-hidden="true"><span>' + left + '</span><div class="meter-track">' +
      '<div class="meter-marker" style="left:' + ((score + 1) * 50).toFixed(1) + '%"></div></div><span>' + right + "</span></div>";
  }

  /** Answer box for questions that aren't yes/no (when, why, who, where, advice, A or B, outlook). */
  function openAnswerHtml(q) {
    const a = T.openAnswer(q, state.drawn, state.spread);
    if (!a) return "";
    return (
      '<div class="answer answer-' + a.tone + '" data-type="' + a.type + '"' +
      (a.score != null ? ' data-score="' + a.score.toFixed(3) + '"' : "") + ">" +
      '<div class="answer-head"><span class="answer-label">' + escapeHtml(a.label) + "</span>" +
      '<span class="question-echo">“' + escapeHtml(q) + "”</span></div>" +
      '<p class="answer-sentence">' + escapeHtml(a.headline) + "</p>" +
      (a.score != null ? meterHtml(a.score, "Difficult", "Favourable") : "") +
      (a.details.length ? '<ul class="answer-details">' + a.details.map((d) => "<li>" + escapeHtml(d) + "</li>").join("") + "</ul>" : "") +
      '<p class="answer-note">Tarot offers guidance and reflection, not certainty.</p>' +
      "</div>"
    );
  }

  /** How the reading relates to the user's birth chart. */
  function chartLinksHtml() {
    if (!chartState.chart) return "";
    const links = T.personalLinks(state.drawn, chartState.links);
    const positions = spreadDef().positions;
    const items = links.map((l) =>
      "<li>" + escapeHtml(l.card.name + " (" + positions[l.index].name + ") is your " +
        l.roles.map((r) => r.toLowerCase()).join(" and ") + " card: this part of the reading speaks directly about you.") + "</li>");
    const harmony = T.elementHarmony(chartState.chart.dominantElement, state.drawn);
    if (harmony) items.push("<li>" + escapeHtml(harmony) + "</li>");
    if (!links.length) items.unshift("<li>None of your personal cards came up in this reading.</li>");
    return '<h3>Your chart and this reading</h3><ul class="chart-links">' + items.join("") + "</ul>";
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
      (yesNo ? answerHtml(q) : q ? openAnswerHtml(q) : "") +
      "<h3>Reading the cards together</h3>" +
      '<p class="story">' + escapeHtml(T.narrate(state.drawn, state.spread)) + "</p>" +
      (notes.length ? "<h3>Patterns in the spread</h3><ul>" + notes.map((n) => "<li>" + escapeHtml(n) + "</li>").join("") + "</ul>" : "") +
      chartLinksHtml() +
      '<p class="cards-line">' +
      state.drawn.map((d, i) => (i + 1) + ". " + spreadDef().positions[i].name + ": " + d.card.name + (d.reversed ? " (R)" : "")).map(escapeHtml).join(" · ") +
      "</p>";
    el.hidden = false;
  }

  function renderQuestionHint() {
    const q = $("#question").value.trim();
    const type = T.classifyQuestion(q);
    let hint = !type
      ? "Tip: ask a yes/no question (“Will I pass my test tomorrow?”), or ask when, why, who, where, what to do, or “A or B?”."
      : T.QUESTION_TYPES[type].hint;
    if (type === "choice" && state.spread !== "choice") hint += " Choose the Two Paths spread for this.";
    $("#question-hint").textContent = hint;
  }

  function renderChartStatus() {
    const c = chartState.chart;
    const el = $("#chart-status");
    if (!c) {
      el.innerHTML = 'Tip: add your birth details in <button type="button" class="card-link" data-view="chart">Birth Chart</button> to see which cards are personal to you.';
      return;
    }
    const big = [["sun", "☉"], ["moon", "☽"], ["ascendant", "Rising"]].filter(([k]) => c.byKey[k])
      .map(([k, g]) => g + " " + c.byKey[k].sign.name).join(" · ");
    el.innerHTML = "✦ Using your birth chart (" + escapeHtml(big) + "): your personal cards will be marked. " +
      '<button type="button" class="card-link" data-view="chart">Edit</button>';
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
      const type = T.classifyQuestion(q);
      setStatus(type === "yesno"
        ? "Reading complete. Your answer: " + T.yesNoReading(state.drawn, state.spread).verdict.label + ". Scroll down for the full interpretation."
        : type
          ? "Reading complete. Your " + T.QUESTION_TYPES[type].label.toLowerCase() + " answer is below."
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

  // ------------------------------------------------------------ birth chart
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  const MODALITY_TEXT = {
    Cardinal: "you like to start things and take the initiative",
    Fixed: "you like to keep things steady and see them through",
    Mutable: "you adapt easily and enjoy variety",
  };

  const pad2 = (n) => String(n).padStart(2, "0");
  function formatDegree(deg) {
    const d = Math.floor(deg);
    return d + "°" + pad2(Math.floor((deg - d) * 60)) + "′";
  }
  function formatOffset(minutes) {
    const sign = minutes < 0 ? "−" : "+";
    const m = Math.round(Math.abs(minutes));
    return "UTC" + sign + Math.floor(m / 60) + (m % 60 ? ":" + pad2(m % 60) : "");
  }

  function loadBirth() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function saveBirth(b) {
    try {
      if (b) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* private mode: the chart still works for this visit */ }
  }

  /** Saved birth details → Astro.chart input. */
  function birthToChartInput(b) {
    const [year, month, day] = b.date.split("-").map(Number);
    const [hour, minute] = b.timeKnown ? b.time.split(":").map(Number) : [null, null];
    return { year, month, day, hour, minute, timeKnown: b.timeKnown, timeZone: b.timeZone, lat: b.lat, lon: b.lon };
  }

  function setChart(b) {
    chartState.saved = b;
    chartState.chart = b ? A.chart(birthToChartInput(b)) : null;
    chartState.links = b ? A.personalCards(chartState.chart) : [];
    renderChart();
    renderChartStatus();
    $("#btn-forget").hidden = !b;
    if (state.drawn.length) {
      renderExplanations();
      renderSummary();
    }
  }

  function fillBirthForm(b) {
    $("#birth-name").value = b.name || "";
    $("#birth-date").value = b.date;
    $("#birth-time").value = b.timeKnown ? b.time : "";
    $("#birth-time-unknown").checked = !b.timeKnown;
    $("#birth-time").disabled = !b.timeKnown;
    $("#birth-place").value = b.place || "";
    $("#birth-lat").value = b.lat != null ? b.lat : "";
    $("#birth-lon").value = b.lon != null ? b.lon : "";
    $("#birth-tz").value = b.timeZone;
    $("#place-chosen").textContent = b.place ? "✓ " + b.place : "";
  }

  /** Read and validate the form. Returns { birth } or { error }. */
  function readBirthForm() {
    const date = $("#birth-date").value;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return { error: "Please enter your date of birth." };
    const year = Number(m[1]);
    if (year < 1800 || year > 2049) return { error: "The date of birth must be between 1800 and 2049." };
    const unknown = $("#birth-time-unknown").checked;
    const time = $("#birth-time").value;
    if (!unknown && !/^\d{2}:\d{2}/.test(time)) {
      return { error: "Please enter your time of birth, or tick “I don't know my birth time”." };
    }
    const latText = $("#birth-lat").value.trim(), lonText = $("#birth-lon").value.trim();
    const lat = latText === "" ? null : Number(latText), lon = lonText === "" ? null : Number(lonText);
    if ((lat == null) !== (lon == null) || (lat != null && (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)))) {
      return { error: "The coordinates aren't valid: latitude must be between -90 and 90, longitude between -180 and 180." };
    }
    if (!unknown && lat == null) {
      return { error: "Please choose your place of birth: it's needed to work out your rising sign." };
    }
    if (lat != null && Math.abs(lat) > 66) {
      return { error: "Rising signs can't be calculated reliably inside the polar circles." };
    }
    const place = $("#birth-place").value.trim();
    return {
      birth: {
        name: $("#birth-name").value.trim(), date, time: unknown ? "" : time.slice(0, 5), timeKnown: !unknown,
        place: lat != null ? place || lat.toFixed(2) + ", " + lon.toFixed(2) : place,
        lat, lon, timeZone: $("#birth-tz").value,
      },
    };
  }

  const placeResults = [];

  async function searchPlace() {
    const q = $("#birth-place").value.trim();
    const list = $("#place-results");
    const chosen = $("#place-chosen");
    if (q.length < 2) {
      chosen.textContent = "Type at least two letters of your place of birth.";
      return;
    }
    chosen.textContent = "Searching…";
    list.hidden = true;
    try {
      const res = await window.fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" +
        encodeURIComponent(q.split(",")[0].trim()));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      let results = data.results || [];
      // "Aveiro, Portugal": use the part after the comma to narrow the results.
      const hint = q.split(",").slice(1).join(",").trim().toLowerCase();
      if (hint) {
        const narrowed = results.filter((r) => [r.country, r.admin1, r.country_code].some((x) => x && x.toLowerCase().startsWith(hint)));
        if (narrowed.length) results = narrowed;
      }
      placeResults.length = 0;
      results.filter((r) => r.timezone).forEach((r) => placeResults.push(r));
      if (!placeResults.length) {
        chosen.textContent = "No places found. Check the spelling, or enter the coordinates manually.";
        return;
      }
      list.innerHTML = placeResults.map((r, i) =>
        '<li><button type="button" data-place="' + i + '">' + escapeHtml(placeLabel(r)) +
        ' <small>' + r.latitude.toFixed(2) + ", " + r.longitude.toFixed(2) + "</small></button></li>").join("");
      list.hidden = false;
      chosen.textContent = "Choose your place of birth:";
    } catch (e) {
      chosen.textContent = "Couldn't reach the place search. Check your connection, or enter the coordinates manually.";
    }
  }

  function placeLabel(r) {
    return [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join(", ");
  }

  function choosePlace(r) {
    $("#birth-place").value = placeLabel(r);
    $("#birth-lat").value = r.latitude;
    $("#birth-lon").value = r.longitude;
    if ([...$("#birth-tz").options].some((o) => o.value === r.timezone)) $("#birth-tz").value = r.timezone;
    $("#place-results").hidden = true;
    $("#place-chosen").textContent = "✓ " + placeLabel(r) + " (" + r.timezone + ")";
  }

  function bigPlacementHtml(key) {
    const c = chartState.chart;
    const p = c.byKey[key];
    const role = { sun: "Sun sign", moon: "Moon sign", ascendant: "Rising sign" }[key];
    if (!p) {
      return '<article class="big-card missing"><p class="big-role">' + role + "</p><h3>Unknown</h3>" +
        '<p class="hint">Your rising sign depends on the exact time and place of birth. Add your birth time to see it.</p></article>';
    }
    const s = p.sign;
    const other = p.possibleSigns ? p.possibleSigns.find((x) => x !== s) : null;
    return (
      '<article class="big-card el-' + s.element.toLowerCase() + '" data-body="' + key + '">' +
      '<div class="big-head"><span class="big-glyph">' + s.glyph + "︎</span><div>" +
      '<p class="big-role">' + role + "</p>" +
      "<h3>" + s.name + " <small>" + formatDegree(p.degree) + "</small></h3></div></div>" +
      '<p class="big-about">' + escapeHtml(A.BODIES[key].about.charAt(0).toUpperCase() + A.BODIES[key].about.slice(1)) +
      ": " + escapeHtml(s.traits) + ".</p>" +
      '<p class="meta">' + s.element + " · " + s.modality + " · ruled by " + s.ruler + "</p>" +
      (other ? '<p class="note">Without a birth time this is uncertain: the ' + A.BODIES[key].name + " moved from " +
        escapeHtml(p.possibleSigns[0].name) + " into " + escapeHtml(p.possibleSigns[1].name) + " that day.</p>" : "") +
      '<div class="linked-cards">' + miniCardHtml(s.card, s.name) +
      miniCardHtml(p.decan.card, p.decan.planet + " in " + s.name) + "</div>" +
      "</article>"
    );
  }

  function renderChart() {
    const el = $("#chart-result");
    const c = chartState.chart;
    if (!c) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const b = chartState.saved;
    const [y, mo, d] = b.date.split("-").map(Number);
    const bornLine = "Born " + d + " " + MONTH_NAMES[mo - 1] + " " + y +
      (c.timeKnown ? " at " + b.time : " (time unknown)") + (b.place ? " in " + b.place : "") +
      " · " + b.timeZone + " (" + formatOffset(A.tzOffsetMinutes(b.timeZone, c.utc)) + ")";

    const rows = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "ascendant", "midheaven"]
      .filter((k) => c.byKey[k])
      .map((k) => {
        const p = c.byKey[k];
        const body = A.BODIES[k];
        return '<tr data-body="' + k + '"><td><span class="glyph">' + body.glyph + "︎</span> " + body.name +
          (body.card ? " · " + cardLinkHtml(body.card) : "") + "<small>" + escapeHtml(body.about) + "</small></td>" +
          "<td>" + p.sign.glyph + "︎ " + p.sign.name + (p.possibleSigns ? " <small>or " + p.possibleSigns.find((x) => x !== p.sign).name + "</small>" : "") + "</td>" +
          "<td>" + formatDegree(p.degree) + (p.retrograde ? ' <span class="retro" title="Retrograde">℞</span>' : "") + "</td>" +
          "<td>" + cardLinkHtml(p.sign.card) + " · " + cardLinkHtml(p.decan.card) + "</td></tr>";
      }).join("");

    const total = Object.values(c.elements).reduce((a, v) => a + v, 0);
    const bars = Object.keys(c.elements).map((e) =>
      '<div class="el-bar el-' + e.toLowerCase() + '"><span>' + e + " · " + A.ELEMENTS[e].suitName + "</span>" +
      '<div class="el-track"><div style="width:' + ((c.elements[e] / total) * 100).toFixed(0) + '%"></div></div>' +
      "<b>" + c.elements[e] + "</b></div>").join("");
    const dom = c.dominantElement;
    const joinAnd = (list) => list.join(", ").replace(/, ([^,]*)$/, " and $1");
    const elementText = dom
      ? "Your strongest element is <b>" + dom + "</b> (" + escapeHtml(A.ELEMENTS[dom].traits) + "), so your tarot suit is <b>" +
        A.ELEMENTS[dom].suitName + "</b>."
      : "Your chart is balanced between <b>" + joinAnd(c.strongestElements) + "</b>, so your suits are " +
        joinAnd(c.strongestElements.map((e) => A.ELEMENTS[e].suitName)) + ".";
    const mode = c.dominantModality;
    const modeText = mode
      ? " Your strongest mode is <b>" + mode + "</b>: " + MODALITY_TEXT[mode] + "."
      : " Your modes are balanced between " + joinAnd(c.strongestModalities) + ".";
    const missing = c.missingElements.length
      ? " You have nothing in " + c.missingElements.join(" or ") + ", so " +
        c.missingElements.map((e) => A.ELEMENTS[e].traits).join(" and ") + " may take more effort."
      : "";

    const sky = A.sky(new Date());
    const skyLine = (label, p) => "<p>" + label + " is in <b>" + p.sign.name + "</b> (" + formatDegree(p.degree) + "): " +
      cardLinkHtml(p.sign.card) + " · " + cardLinkHtml(p.decan.card) + " <small>(" + p.decan.planet + " in " + p.sign.name + ")</small></p>";

    el.innerHTML =
      '<div class="panel chart-head"><h2>' + escapeHtml(b.name ? b.name + "'s chart" : "Your chart") + "</h2>" +
      '<p class="hint">' + escapeHtml(bornLine) + "</p>" +
      (c.timeKnown ? "" : '<p class="note">Without a birth time, the rising sign can\'t be worked out and the Moon\'s degree is approximate (it moves about 13° a day).</p>') +
      "</div>" +
      '<div class="big-three">' + ["sun", "moon", "ascendant"].map(bigPlacementHtml).join("") + "</div>" +
      '<div class="panel"><h3>Your tarot cards</h3>' +
      '<p class="hint">These cards are tied to your chart. When one of them comes up in a reading, it is marked as personal.</p>' +
      '<div class="personal-grid">' + chartState.links.map((l) =>
        '<figure class="personal-item" data-role="' + escapeHtml(l.role) + '">' + miniCardHtml(l.card) +
        "<figcaption><b>" + escapeHtml(l.role) + "</b>" + escapeHtml(l.why) + "</figcaption></figure>").join("") + "</div></div>" +
      '<div class="panel"><h3>Planets</h3><div class="table-wrap"><table class="planet-table">' +
      "<thead><tr><th>Planet</th><th>Sign</th><th>Degree</th><th>Tarot (sign · decan)</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<p class="hint">℞ = retrograde (the planet appears to move backwards).</p></div>' +
      '<div class="panel"><h3>Elements</h3><div class="el-bars">' + bars + "</div>" +
      '<p class="element-summary">' + elementText + escapeHtml(missing) + modeText + "</p>" +
      '<p class="hint">Counted over the Sun, Moon and Rising (double) and Mercury to Saturn.</p></div>' +
      '<div class="panel"><h3>The sky today</h3>' + skyLine("The Sun", sky.sun) + skyLine("The Moon", sky.moon) +
      '<p class="hint">The Sun\'s decan card is the card of these ten days, good for reflection.</p></div>';
    el.hidden = false;
  }

  function initChart() {
    const tzSelect = $("#birth-tz");
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const all = zones.includes("UTC") ? zones : zones.concat("UTC");
    if (!all.includes(local)) all.push(local);
    tzSelect.innerHTML = all.map((z) => '<option value="' + escapeHtml(z) + '">' + escapeHtml(z.replace(/_/g, " ")) + "</option>").join("");
    tzSelect.value = local;

    $("#birth-time-unknown").addEventListener("change", (e) => {
      $("#birth-time").disabled = e.target.checked;
    });
    $("#btn-place").addEventListener("click", searchPlace);
    $("#birth-place").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); searchPlace(); }
    });
    $("#birth-place").addEventListener("input", () => {
      // A new place name invalidates the old coordinates.
      $("#birth-lat").value = "";
      $("#birth-lon").value = "";
      $("#place-chosen").textContent = "";
    });
    $("#place-results").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-place]");
      if (btn) choosePlace(placeResults[Number(btn.dataset.place)]);
    });
    $("#birth-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const { birth, error } = readBirthForm();
      $("#birth-error").textContent = error || "";
      if (!birth) return;
      saveBirth(birth);
      setChart(birth);
      $("#chart-result").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#btn-forget").addEventListener("click", () => {
      saveBirth(null);
      $("#birth-form").reset();
      $("#birth-time").disabled = false;
      tzSelect.value = local;
      $("#place-chosen").textContent = "";
      $("#birth-error").textContent = "";
      setChart(null);
    });
    $("#chart-result").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-card-id]");
      if (btn) openCardDialog(btn.dataset.cardId);
    });
    $("#chart-status").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-view]");
      if (btn) showView(btn.dataset.view);
    });

    const saved = loadBirth();
    if (saved && saved.date && saved.timeZone) {
      try {
        fillBirthForm(saved);
        setChart(saved);
        return;
      } catch (e) {
        saveBirth(null); // corrupt or outdated data
      }
    }
    setChart(null);
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
    initChart();
  }

  window.TarotApp = { state, chartState }; // handy for debugging in the console
  init();
})();
