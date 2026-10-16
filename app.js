/* Tarot app UI. Depends on i18n.js (window.I18N), astro.js (window.Astro)
 * and deck.js (window.Tarot). */
(function () {
  "use strict";

  const I = window.I18N;
  const t = I.t;
  const T = window.Tarot;
  const A = window.Astro;
  const $ = (sel) => document.querySelector(sel);
  const tx = (card) => T.text(card); // card texts in the current language

  // ------------------------------------------------------------------ state
  const state = {
    spread: "three",
    reversals: true,
    pile: null,      // shuffled array of { card, reversed } still in the deck
    drawn: [],       // array of { card, reversed } in spread-position order
    busy: false,     // true while an animation is running
    activeIndex: -1, // drawn card currently highlighted
    status: null,    // function returning the status message (re-run on language change)
    dialogCard: null, // id of the card open in the dialog
    topic: "general", // area of life the meanings are read for (T.TOPICS)
  };

  // Birth chart (saved in localStorage) and the tarot cards linked to it.
  const STORAGE_KEY = "arcana.birth";
  const LANG_KEY = "arcana.lang";
  const TOPIC_KEY = "arcana.topic";
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

  const signName = (s) => t("sign_" + s.name);
  const nameOf = (d) => (d.reversed ? t("ui.reversed_paren", { name: tx(d.card).name }) : tx(d.card).name);
  const shortName = (d) => tx(d.card).name + (d.reversed ? " (" + t("ui.r_short") + ")" : "");

  // ------------------------------------------------------------ rendering
  function cardFrontHtml(card) {
    const text = tx(card);
    if (card.arcana === "major") {
      return (
        '<div class="card-front major">' +
        '<div class="cf-top">' + card.numeral + "</div>" +
        '<div class="cf-art"><span class="cf-glyph">' + card.glyph + "︎</span></div>" +
        '<div class="cf-name">' + escapeHtml(text.name) + "</div></div>"
      );
    }
    const icon = ICONS[card.suit];
    let art;
    if (card.court) {
      art = '<div class="cf-court">' + icon + '<span class="cf-court-letter">' + text.rank[0] + "</span></div>";
    } else if (card.number === 1) {
      art = '<div class="cf-big">' + icon + "</div>";
    } else {
      const cls = card.number > 6 ? "cf-pips three-col" : "cf-pips";
      art = '<div class="' + cls + '">' + icon.repeat(card.number) + "</div>";
    }
    const top = card.court ? text.rank : card.number === 1 ? t("ace_short") : String(card.number);
    return (
      '<div class="card-front ' + card.suit + '">' +
      '<div class="cf-top">' + escapeHtml(top) + "</div>" +
      '<div class="cf-art">' + art + "</div>" +
      '<div class="cf-name">' + escapeHtml(text.name) + "</div></div>"
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

  const faceUpHtml = (card, reversed) => cardHtml(card, reversed, { flipped: true, static: true });

  function metaLine(card) {
    const text = tx(card);
    if (card.arcana === "major") return t("ui.major_meta", { numeral: card.numeral, astro: text.astro });
    return t("ui.minor_meta", { suit: text.suit, element: text.element }) +
      (card.court ? " · " + t("ui.court_card") : "") + " · " + text.astro;
  }

  const cardByName = (name) => T.DECK.find((c) => c.name === name);

  /** Small clickable card (opens the card dialog). */
  function miniCardHtml(name, caption) {
    const c = cardByName(name);
    return '<button type="button" class="mini-card" data-card-id="' + c.id + '" aria-label="' + escapeHtml(tx(c).name) + '">' +
      faceUpHtml(c, false) +
      (caption ? '<span class="mini-caption">' + escapeHtml(caption) + "</span>" : "") + "</button>";
  }

  /** Inline card name that opens the card dialog. */
  function cardLinkHtml(name) {
    const c = cardByName(name);
    return '<button type="button" class="card-link" data-card-id="' + c.id + '">' + escapeHtml(tx(c).name) + "</button>";
  }

  function keywordsHtml(list) {
    return '<ul class="keywords">' + list.map((k) => "<li>" + escapeHtml(k) + "</li>").join("") + "</ul>";
  }

  /** The card's meaning for the chosen topic (love, career…), or its general meaning. */
  function meaningFor(text, orient) {
    return state.topic === "general" ? text.meaning[orient] : text.topics[state.topic][orient];
  }

  /** Buttons to read the meanings for love, career, money… */
  function topicTabsHtml() {
    return '<div class="topic-tabs"><span class="control-label">' + t("ui.topic_label") + "</span>" +
      '<div class="segmented" role="radiogroup" aria-label="' + escapeHtml(t("ui.topic_label")) + '">' +
      T.TOPICS.map((k) => '<button type="button" role="radio" data-topic="' + k + '" aria-checked="' + (k === state.topic) + '">' +
        t("ui.topic." + k) + "</button>").join("") +
      "</div></div>";
  }

  // --------------------------------------------------------------- reading
  function spreadDef() {
    return T.spreadText(state.spread);
  }

  function phase() {
    if (!state.pile) return "idle";
    if (state.drawn.length >= spreadDef().positions.length) return "complete";
    return "drawing";
  }

  /** Show a status message. `msg` is a function so it can be re-rendered in another language. */
  function setStatus(msg) {
    state.status = typeof msg === "function" ? msg : () => msg;
    $("#status").textContent = state.status();
  }

  function renderSpreadChoice() {
    const wrap = $("#spread-choice");
    wrap.innerHTML = "";
    Object.keys(T.SPREADS).forEach((key) => {
      const s = T.spreadText(key);
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(key === state.spread));
      b.dataset.spread = key;
      b.textContent = s.name + " (" + s.positions.length + ")";
      b.addEventListener("click", () => {
        if (key === state.spread) return;
        if (state.drawn.length > 0 && phase() !== "complete" && !confirm(t("ui.confirm_switch"))) return;
        state.spread = key;
        resetReading(() => t("ui.status_spread", { name: T.spreadText(key).name }));
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
        b.setAttribute("aria-label", t("ui.take_card", { i: i + 1, n: count }));
      } else {
        b.disabled = true;
        b.setAttribute("aria-label", t(p === "idle" ? "ui.deck_idle" : "ui.deck"));
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
        const inner = d ? faceUpHtml(d.card, d.reversed) : "<span>" + (i + 1) + "</span>";
        const label = (i + 1) + ". " + escapeHtml(pos.name);
        return (
          '<div class="' + cls.join(" ") + '" data-position="' + i + '"' +
          (d ? ' role="button" tabindex="0" aria-label="' + escapeHtml(t("ui.show_meaning", { name: tx(d.card).name })) + '"' : "") +
          ' title="' + label + '">' +
          '<div class="slot-frame">' + inner + "</div>" +
          '<div class="slot-label"><b>' + label + "</b>" +
          (d ? escapeHtml(tx(d.card).name) + (d.reversed ? '<br><span class="rev-tag">' + t("ui.reversed") + "</span>" : "") : "") +
          "</div></div>"
        );
      })
      .join("");
  }

  function explanationHtml(d, i) {
    const pos = spreadDef().positions[i];
    const c = d.card;
    const text = tx(c);
    const orient = d.reversed ? "reversed" : "upright";
    const other = d.reversed ? "upright" : "reversed";
    return (
      '<article class="explain ' + (c.suit || "major") + '" id="explain-' + i + '" data-position="' + i +
      '" data-card-id="' + c.id + '" data-reversed="' + d.reversed + '">' +
      "<div>" + faceUpHtml(c, d.reversed) + "</div>" +
      "<div>" +
      '<p class="explain-pos"><b>' + (i + 1) + ". " + escapeHtml(pos.name) + "</b></p>" +
      '<p class="pos-meaning">' + escapeHtml(pos.meaning) + "</p>" +
      '<h3 class="explain-name">' + escapeHtml(text.name) +
      (d.reversed ? '<span class="badge rev">' + t("ui.reversed") + "</span>" : '<span class="badge up">' + t("ui.upright") + "</span>") + "</h3>" +
      '<p class="meta">' + escapeHtml(metaLine(c)) + "</p>" +
      personalNoteHtml(i) +
      keywordsHtml(text.keywords[orient]) +
      '<p class="meaning">' + escapeHtml(meaningFor(text, orient)) + "</p>" +
      '<p class="imagery"><strong>' + t("ui.on_the_card") + "</strong> " + escapeHtml(text.image) + "</p>" +
      "<details><summary>" + t(d.reversed ? "ui.upright_meaning" : "ui.reversed_meaning") + "</summary>" +
      "<p>" + escapeHtml(meaningFor(text, other)) + "</p></details>" +
      "</div></article>"
    );
  }

  function personalNoteHtml(i) {
    const link = T.personalLinks(state.drawn, chartState.links).find((l) => l.index === i);
    return link ? '<p class="personal-note">✦ <b>' + t("ui.personal_card") + "</b> " + escapeHtml(link.why.join(" ")) + "</p>" : "";
  }

  function renderExplanations() {
    // Most recent draw first, so the newest explanation is right below the spread.
    $("#explanations").innerHTML = state.drawn.map(explanationHtml).reverse().join("");
    $("#topic-bar").innerHTML = state.drawn.length ? topicTabsHtml() : "";
    $("#topic-bar").hidden = !state.drawn.length;
  }

  /** Read every meaning (reading and Card Guide) for `topic`, and remember the choice. */
  function setTopic(topic) {
    state.topic = topic;
    storageSet(TOPIC_KEY, topic);
    renderExplanations();
    if (state.dialogCard && $("#card-dialog").hasAttribute("open")) renderCardDialog(state.dialogCard);
  }

  function meterHtml(score, left, right) {
    return '<div class="meter" aria-hidden="true"><span>' + left + '</span><div class="meter-track">' +
      '<div class="meter-marker" style="left:' + ((score + 1) * 50).toFixed(1) + '%"></div></div><span>' + right + "</span></div>";
  }

  function answerHeadHtml(label, q) {
    return '<div class="answer-head"><span class="answer-label">' + escapeHtml(label) + "</span>" +
      '<span class="question-echo">“' + escapeHtml(q) + "”</span></div>";
  }

  const answerNoteHtml = () => '<p class="answer-note">' + t("ui.note") + "</p>";

  function answerHtml(q) {
    const r = T.yesNoReading(state.drawn, state.spread);
    const v = r.verdict;
    const sentence = T.answerSentence(q, v.key);
    const k = r.keyCard;
    const leanClass = (val) => (val > 0 ? "yes" : val < 0 ? "no" : "maybe");
    return (
      '<div class="answer answer-' + v.key + '" data-verdict="' + v.key + '" data-score="' + r.score.toFixed(3) + '">' +
      answerHeadHtml(v.label, q) +
      (sentence ? '<p class="answer-sentence">' + escapeHtml(sentence) + "</p>" : "") +
      '<p class="answer-text">' + escapeHtml(v.text) + "</p>" +
      meterHtml(r.score, t("ui.meter_no"), t("ui.meter_yes")) +
      '<p class="answer-key">' + t("ui.key_card", { card: escapeHtml(nameOf(k)), position: escapeHtml(k.position), lean: escapeHtml(k.lean) }) + "</p>" +
      '<ul class="lean-list">' + r.items.map((it) =>
        "<li>" + escapeHtml(it.position) + ": " + escapeHtml(shortName(it)) +
        ' <span class="lean lean-' + leanClass(it.value) + '">' + escapeHtml(it.lean) + "</span></li>").join("") + "</ul>" +
      answerNoteHtml() +
      "</div>"
    );
  }

  /** Answer box for questions that aren't yes/no (when, why, who, where, advice, A or B, outlook). */
  function openAnswerHtml(q) {
    const a = T.openAnswer(q, state.drawn, state.spread);
    if (!a) return "";
    return (
      '<div class="answer answer-' + a.tone + '" data-type="' + a.type + '"' +
      (a.score != null ? ' data-score="' + a.score.toFixed(3) + '"' : "") + ">" +
      answerHeadHtml(a.label, q) +
      '<p class="answer-sentence">' + escapeHtml(a.headline) + "</p>" +
      (a.score != null ? meterHtml(a.score, t("ui.meter_bad"), t("ui.meter_good")) : "") +
      (a.details.length ? '<ul class="answer-details">' + a.details.map((d) => "<li>" + escapeHtml(d) + "</li>").join("") + "</ul>" : "") +
      answerNoteHtml() +
      "</div>"
    );
  }

  /** How the reading relates to the user's birth chart. */
  function chartLinksHtml() {
    if (!chartState.chart) return "";
    const links = T.personalLinks(state.drawn, chartState.links);
    const positions = spreadDef().positions;
    const items = links.map((l) => "<li>" + escapeHtml(t("ui.personal_link", {
      card: tx(l.card).name, position: positions[l.index].name,
      roles: I.joinList(l.roles.map((r) => r.toLowerCase())),
    })) + "</li>");
    const harmony = T.elementHarmony(chartState.chart.dominantElement, state.drawn);
    if (harmony) items.push("<li>" + escapeHtml(harmony) + "</li>");
    if (!links.length) items.unshift("<li>" + t("ui.no_personal") + "</li>");
    return "<h3>" + t("ui.chart_and_reading") + '</h3><ul class="chart-links">' + items.join("") + "</ul>";
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
    const positions = spreadDef().positions;
    el.innerHTML =
      "<h2>" + t("ui.your_reading") + "</h2>" +
      (yesNo ? answerHtml(q) : q ? openAnswerHtml(q) : "") +
      "<h3>" + t("ui.together") + "</h3>" +
      '<p class="story">' + escapeHtml(T.narrate(state.drawn, state.spread)) + "</p>" +
      (notes.length ? "<h3>" + t("ui.patterns") + "</h3><ul>" + notes.map((n) => "<li>" + escapeHtml(n) + "</li>").join("") + "</ul>" : "") +
      chartLinksHtml() +
      '<p class="cards-line">' +
      state.drawn.map((d, i) => escapeHtml((i + 1) + ". " + positions[i].name + ": " + shortName(d))).join(" · ") +
      "</p>";
    el.hidden = false;
  }

  function renderQuestionHint() {
    const q = $("#question").value.trim();
    const type = T.classifyQuestion(q);
    let hint = !type ? t("ui.hint_empty") : T.QUESTION_TYPES[type].hint;
    if (type === "choice" && state.spread !== "choice") hint += t("ui.hint_choose_two_paths");
    $("#question-hint").textContent = hint;
  }

  function renderChartStatus() {
    const c = chartState.chart;
    const el = $("#chart-status");
    if (!c) {
      el.innerHTML = t("ui.chart_tip", { link: '<button type="button" class="card-link" data-view="chart">' + t("ui.menu.chart") + "</button>" });
      return;
    }
    const big = [["sun", "☉"], ["moon", "☽"], ["ascendant", t("ui.big_rising")]].filter(([k]) => c.byKey[k])
      .map(([k, g]) => g + " " + signName(c.byKey[k].sign)).join(" · ");
    el.innerHTML = escapeHtml(t("ui.chart_using", { big })) +
      ' <button type="button" class="card-link" data-view="chart">' + t("ui.edit") + "</button>";
  }

  function renderButtons() {
    const p = phase();
    $("#btn-shuffle").disabled = state.busy || state.drawn.length > 0;
    $("#btn-shuffle").textContent = t(p === "idle" ? "ui.shuffle" : "ui.shuffle_again");
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
    setStatus(msg || (() => t("ui.status_start")));
  }

  function animateFan(cls, ms) {
    const fan = $("#deck-fan");
    state.busy = true;
    renderButtons();
    fan.classList.remove(cls);
    void fan.offsetWidth; // force a reflow so the animation restarts
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
    setStatus(() => t("ui.status_shuffling"));
    await animateFan("shuffling", 700);
    renderButtons();
    setStatus(() => t("ui.status_shuffled", { position: spreadDef().positions[0].name }));
  }

  async function doCut() {
    if (state.busy || phase() !== "drawing" || state.drawn.length > 0) return;
    state.pile = T.cut(state.pile);
    await animateFan("cutting", 500);
    renderButtons();
    setStatus(() => t("ui.status_cut", { position: spreadDef().positions[0].name }));
  }

  function completeStatus() {
    const q = $("#question").value.trim();
    const type = T.classifyQuestion(q);
    if (type === "yesno") return t("ui.status_done_yesno", { label: T.yesNoReading(state.drawn, state.spread).verdict.label });
    if (type) return t("ui.status_done_type", { type: T.QUESTION_TYPES[type].label.toLowerCase() });
    return t("ui.status_done");
  }

  function takeCard(index) {
    if (state.busy || phase() !== "drawing") return;
    const d = T.take(state.pile, index);
    state.drawn.push(d);
    const pos = state.drawn.length - 1;
    state.activeIndex = pos;

    renderAll();

    // Flip animation (pure CSS, so the card always ends face up).
    $('.slot[data-position="' + pos + '"] .card').classList.add("flip-in");

    if (phase() === "complete") {
      setStatus(completeStatus);
    } else {
      const next = state.drawn.length;
      setStatus(() => t("ui.status_drew", { card: nameOf(d), n: next + 1, position: spreadDef().positions[next].name }));
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
    const filters = [["all", t("ui.filter_all")], ["major", t("ui.filter_major")]].concat(
      Object.keys(T.SUITS).map((k) => [k, t("suit_" + k)])
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
      const text = tx(c);
      const hay = [text.name].concat(text.keywords.upright, text.keywords.reversed).join(" ").toLowerCase();
      return hay.includes(q);
    });
    $("#guide-grid").innerHTML = cards
      .map((c) => '<button type="button" class="guide-item" data-card-id="' + c.id + '" aria-label="' + escapeHtml(tx(c).name) + '">' +
        faceUpHtml(c, false) + "</button>")
      .join("");
    $("#guide-empty").hidden = cards.length > 0;
  }

  function renderCardDialog(id) {
    const c = T.DECK.find((x) => x.id === id);
    const text = tx(c);
    $("#card-dialog-body").innerHTML =
      '<div class="dialog-card" data-card-id="' + c.id + '">' +
      "<div>" + faceUpHtml(c, false) + "</div>" +
      "<div>" +
      "<h2>" + escapeHtml(text.name) + "</h2>" +
      '<p class="meta" style="color:var(--muted)">' + escapeHtml(metaLine(c)) + "</p>" +
      '<p class="imagery"><strong>' + t("ui.on_the_card") + "</strong> " + escapeHtml(text.image) + "</p>" +
      topicTabsHtml() +
      "<h4>" + t("ui.upright") + ' <span class="badge up">' + t("ui.upright") + "</span></h4>" + keywordsHtml(text.keywords.upright) +
      '<p class="meaning-upright">' + escapeHtml(meaningFor(text, "upright")) + "</p>" +
      "<h4>" + t("ui.reversed") + ' <span class="badge rev">' + t("ui.reversed") + "</span></h4>" + keywordsHtml(text.keywords.reversed) +
      '<p class="meaning-reversed">' + escapeHtml(meaningFor(text, "reversed")) + "</p>" +
      "</div></div>";
  }

  function openCardDialog(id) {
    renderCardDialog(id);
    state.dialogCard = id;
    $("#card-dialog").showModal();
  }

  // ------------------------------------------------------------ birth chart
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

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function storageSet(key, value) {
    try {
      if (value == null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch { /* private mode: settings still work for this visit */ }
  }

  function loadBirth() {
    try {
      return JSON.parse(storageGet(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function saveBirth(b) {
    storageSet(STORAGE_KEY, b ? JSON.stringify(b) : null);
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
    if (!m) return { error: t("ui.err_date") };
    const year = Number(m[1]);
    if (year < 1800 || year > 2049) return { error: t("ui.err_range") };
    const unknown = $("#birth-time-unknown").checked;
    const time = $("#birth-time").value;
    if (!unknown && !/^\d{2}:\d{2}/.test(time)) return { error: t("ui.err_time") };
    const coord = (sel) => {
      const v = $(sel).value.trim();
      return v === "" ? null : Number(v);
    };
    const lat = coord("#birth-lat");
    const lon = coord("#birth-lon");
    // Written as !(x <= max) so that NaN is rejected too.
    if ((lat == null) !== (lon == null) || (lat != null && (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)))) {
      return { error: t("ui.err_coords") };
    }
    if (!unknown && lat == null) return { error: t("ui.err_place") };
    if (lat != null && Math.abs(lat) > 66) return { error: t("ui.err_polar") };
    const place = $("#birth-place").value.trim();
    return {
      birth: {
        name: $("#birth-name").value.trim(), date, time: unknown ? "" : time.slice(0, 5), timeKnown: !unknown,
        place: lat != null ? place || lat.toFixed(2) + ", " + lon.toFixed(2) : place,
        lat, lon, timeZone: $("#birth-tz").value,
      },
    };
  }

  let placeResults = [];

  async function searchPlace() {
    const q = $("#birth-place").value.trim();
    const [name, ...rest] = q.split(",");
    const list = $("#place-results");
    const chosen = $("#place-chosen");
    if (q.length < 2) {
      chosen.textContent = t("ui.place_short");
      return;
    }
    chosen.textContent = t("ui.place_searching");
    list.hidden = true;
    try {
      const res = await window.fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=" + I.lang +
        "&format=json&name=" + encodeURIComponent(name.trim()));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      let results = data.results || [];
      // "Aveiro, Portugal": use the part after the comma to narrow the results.
      const hint = rest.join(",").trim().toLowerCase();
      if (hint) {
        const narrowed = results.filter((r) => [r.country, r.admin1, r.country_code].some((x) => x && x.toLowerCase().startsWith(hint)));
        if (narrowed.length) results = narrowed;
      }
      placeResults = results.filter((r) => r.timezone);
      if (!placeResults.length) {
        chosen.textContent = t("ui.place_none");
        return;
      }
      list.innerHTML = placeResults.map((r, i) =>
        '<li><button type="button" data-place="' + i + '">' + escapeHtml(placeLabel(r)) +
        " <small>" + r.latitude.toFixed(2) + ", " + r.longitude.toFixed(2) + "</small></button></li>").join("");
      list.hidden = false;
      chosen.textContent = t("ui.place_choose");
    } catch {
      chosen.textContent = t("ui.place_offline");
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
    const role = t("ui.big_" + key);
    if (!p) {
      return '<article class="big-card missing"><p class="big-role">' + role + "</p><h3>" + t("ui.unknown") + "</h3>" +
        '<p class="hint">' + t("ui.rising_unknown") + "</p></article>";
    }
    const s = p.sign;
    const about = t("about_" + key);
    return (
      '<article class="big-card el-' + s.element.toLowerCase() + '" data-body="' + key + '">' +
      '<div class="big-head"><span class="big-glyph">' + s.glyph + "︎</span><div>" +
      '<p class="big-role">' + role + "</p>" +
      "<h3>" + signName(s) + " <small>" + formatDegree(p.degree) + "</small></h3></div></div>" +
      '<p class="big-about">' + escapeHtml(about.charAt(0).toUpperCase() + about.slice(1)) + ": " + escapeHtml(t("traits_" + s.name)) + ".</p>" +
      '<p class="meta">' + escapeHtml(t("ui.big_meta", { element: t("el_" + s.element), modality: t("mod_" + s.modality), ruler: t("planet_" + s.ruler) })) + "</p>" +
      (p.possibleSigns ? '<p class="note">' + escapeHtml(t("ui.uncertain", { body: t("body_" + key), a: signName(p.possibleSigns[0]), b: signName(p.possibleSigns[1]) })) + "</p>" : "") +
      '<div class="linked-cards">' + miniCardHtml(s.card, signName(s)) +
      miniCardHtml(p.decan.card, t("decan_label", { planet: t("planet_" + p.decan.planet), sign: signName(s) })) + "</div>" +
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
    const bornLine = t("ui.born", { date: t("date", { d, month: t("months")[mo - 1], y }) }) +
      (c.timeKnown ? t("ui.born_at", { time: b.time }) : t("ui.born_unknown")) + (b.place ? t("ui.born_in", { place: b.place }) : "") +
      " · " + b.timeZone + " (" + formatOffset(A.tzOffsetMinutes(b.timeZone, c.utc)) + ")";

    const rows = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "ascendant", "midheaven"]
      .filter((k) => c.byKey[k])
      .map((k) => {
        const p = c.byKey[k];
        const body = A.BODIES[k];
        return '<tr data-body="' + k + '"><td><span class="glyph">' + body.glyph + "︎</span> " + t("body_" + k) +
          (body.card ? " · " + cardLinkHtml(body.card) : "") + "<small>" + escapeHtml(t("about_" + k)) + "</small></td>" +
          "<td>" + p.sign.glyph + "︎ " + signName(p.sign) +
          (p.possibleSigns ? " <small>" + t("ui.or") + " " + signName(p.possibleSigns.find((x) => x !== p.sign)) + "</small>" : "") + "</td>" +
          "<td>" + formatDegree(p.degree) + (p.retrograde ? ' <span class="retro" title="' + t("ui.retrograde") + '">℞</span>' : "") + "</td>" +
          "<td>" + cardLinkHtml(p.sign.card) + " · " + cardLinkHtml(p.decan.card) + "</td></tr>";
      }).join("");

    const elName = (e) => t("el_" + e);
    const elSuit = (e) => t("suit_" + A.ELEMENTS[e].suit);
    const total = Object.values(c.elements).reduce((a, v) => a + v, 0);
    const bars = Object.keys(c.elements).map((e) =>
      '<div class="el-bar el-' + e.toLowerCase() + '"><span>' + elName(e) + " · " + elSuit(e) + "</span>" +
      '<div class="el-track"><div style="width:' + ((c.elements[e] / total) * 100).toFixed(0) + '%"></div></div>' +
      "<b>" + c.elements[e] + "</b></div>").join("");
    const dom = c.dominantElement;
    const elementText = dom
      ? t("ui.el_strongest", { element: elName(dom), traits: escapeHtml(t("eltraits_" + dom)), suit: elSuit(dom) })
      : t("ui.el_balanced", { elements: I.joinList(c.strongestElements.map(elName)),
        suits: I.joinList(c.strongestElements.map(elSuit)) });
    const mode = c.dominantModality;
    const modeText = mode
      ? t("ui.mode_strongest", { mode: t("mod_" + mode), text: t("ui.mode_" + mode) })
      : t("ui.mode_balanced", { modes: I.joinList(c.strongestModalities.map((m) => t("mod_" + m))) });
    const missing = c.missingElements.length
      ? t("ui.el_missing", { elements: I.joinList(c.missingElements.map(elName), "list_or"),
        traits: I.joinList(c.missingElements.map((e) => t("eltraits_" + e))) })
      : "";

    const sky = A.sky(new Date());
    const skyLine = (label, p) => "<p>" + t("ui.sky_line", { body: label, sign: signName(p.sign), degree: formatDegree(p.degree),
      cards: cardLinkHtml(p.sign.card) + " · " + cardLinkHtml(p.decan.card) + " <small>(" +
        escapeHtml(t("decan_label", { planet: t("planet_" + p.decan.planet), sign: signName(p.sign) })) + ")</small>" }) + "</p>";

    el.innerHTML =
      '<div class="panel chart-head"><h2>' + escapeHtml(b.name ? t("ui.chart_of", { name: b.name }) : t("ui.your_chart")) + "</h2>" +
      '<p class="hint">' + escapeHtml(bornLine) + "</p>" +
      (c.timeKnown ? "" : '<p class="note">' + t("ui.no_time_note") + "</p>") +
      "</div>" +
      '<div class="big-three">' + ["sun", "moon", "ascendant"].map(bigPlacementHtml).join("") + "</div>" +
      '<div class="panel"><h3>' + t("ui.your_cards") + "</h3>" +
      '<p class="hint">' + t("ui.your_cards_hint") + "</p>" +
      '<div class="personal-grid">' + chartState.links.map((l) =>
        '<figure class="personal-item" data-role="' + l.roleKey + '">' + miniCardHtml(l.card) +
        "<figcaption><b>" + escapeHtml(l.role) + "</b>" + escapeHtml(l.why) + "</figcaption></figure>").join("") + "</div></div>" +
      '<div class="panel"><h3>' + t("ui.planets") + '</h3><div class="table-wrap"><table class="planet-table">' +
      "<thead><tr><th>" + t("ui.th_planet") + "</th><th>" + t("ui.th_sign") + "</th><th>" + t("ui.th_degree") + "</th><th>" + t("ui.th_tarot") + "</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" +
      '<p class="hint">' + t("ui.retro_hint") + "</p></div>" +
      '<div class="panel"><h3>' + t("ui.elements") + '</h3><div class="el-bars">' + bars + "</div>" +
      '<p class="element-summary">' + elementText + escapeHtml(missing) + modeText + "</p>" +
      '<p class="hint">' + t("ui.el_counted") + "</p></div>" +
      '<div class="panel"><h3>' + t("ui.sky") + "</h3>" + skyLine(t("ui.sky_sun"), sky.sun) + skyLine(t("ui.sky_moon"), sky.moon) +
      '<p class="hint">' + t("ui.sky_hint") + "</p></div>";
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
      } catch {
        saveBirth(null); // corrupt or outdated data
      }
    }
    setChart(null);
  }

  // -------------------------------------------------------------- language
  /** Static text in index.html: data-i18n (text), data-i18n-html (markup),
   *  data-i18n-placeholder / -aria-label, and data-lang blocks (About page). */
  function applyStaticText() {
    document.documentElement.lang = I.lang === "pt" ? "pt-PT" : "en";
    document.title = t("ui.title");
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
    document.querySelectorAll("[data-lang]").forEach((el) => { el.hidden = el.dataset.lang !== I.lang; });
  }

  function setLanguage(code) {
    I.setLanguage(code);
    storageSet(LANG_KEY, code);
    $("#lang-select").value = code;
    applyStaticText();
    renderSpreadChoice();
    renderQuestionHint();
    renderAll();
    renderGuideFilters();
    renderGuideGrid();
    if (chartState.saved) setChart(chartState.saved); // personal card texts are generated in the language
    else renderChartStatus();
    if (state.status) $("#status").textContent = state.status();
    if (state.dialogCard && $("#card-dialog").hasAttribute("open")) renderCardDialog(state.dialogCard);
  }

  function initialLanguage() {
    const saved = storageGet(LANG_KEY);
    if (saved && I.LANGS[saved]) return saved;
    const browser = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    return /^pt\b/i.test(browser) ? "pt" : "en";
  }

  // ------------------------------------------------------------------ menu
  function showView(name) {
    document.querySelectorAll(".menu-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------------ init
  function init() {
    const langSelect = $("#lang-select");
    langSelect.innerHTML = Object.keys(I.LANGS).map((code) =>
      '<option value="' + code + '">' + escapeHtml(I.LANGS[code]) + "</option>").join("");
    langSelect.addEventListener("change", () => setLanguage(langSelect.value));
    I.setLanguage(initialLanguage());
    langSelect.value = I.lang;
    applyStaticText();

    const savedTopic = storageGet(TOPIC_KEY);
    if (T.TOPICS.includes(savedTopic)) state.topic = savedTopic;
    // Topic buttons above the reading's explanations and in the card dialog.
    for (const sel of ["#topic-bar", "#card-dialog-body"]) {
      $(sel).addEventListener("click", (e) => {
        const b = e.target.closest("[data-topic]");
        if (!b) return;
        setTopic(b.dataset.topic);
        $(sel + ' [data-topic="' + b.dataset.topic + '"]').focus(); // the buttons were re-rendered
      });
    }

    document.querySelectorAll(".menu-item").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

    $("#btn-shuffle").addEventListener("click", doShuffle);
    $("#btn-cut").addEventListener("click", doCut);
    $("#btn-reset").addEventListener("click", () => resetReading());
    $("#reversals").addEventListener("change", () => {
      state.reversals = $("#reversals").checked;
      if (state.pile && state.drawn.length === 0) {
        resetReading(() => t("ui.status_reversals", { state: t(state.reversals ? "ui.reversals_on" : "ui.reversals_off") }));
      } else if (state.drawn.length > 0) {
        setStatus(() => t("ui.status_reversals_next"));
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
      if (phase() === "complete") {
        renderSummary();
        setStatus(completeStatus);
      }
    });

    renderSpreadChoice();
    renderQuestionHint();
    resetReading();
    initChart();
  }

  window.TarotApp = { state, chartState, setLanguage }; // used by the tests; also handy in the console
  init();
})();
