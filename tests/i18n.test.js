"use strict";
/*
 * Translation tests: every text exists in both languages, the Portuguese card
 * descriptions belong to the right cards, and Portuguese questions are
 * understood and answered in Portuguese.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../i18n.js");
const T = require("../deck.js");
const A = require("../astro.js");
const PT = require("../cards-pt.js");

/** Run `fn` in Portuguese, then switch back to English. */
function inPortuguese(fn) {
  I.setLanguage("pt");
  try {
    return fn();
  } finally {
    I.setLanguage("en");
  }
}

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
// English words that should never show up in Portuguese text.
// Letters with accents count as letters (\b would split "cruéis" into "cru" + "is").
const ENGLISH = /(?<![\p{L}])(the|and|you|your|with|this|that|is|are|of|card|cards|reversed|upright|when|why|who|where|yes)(?![\p{L}])/iu; // not "no": it is Portuguese too

// ---------------------------------------------------------------------------
// 1. Completeness
// ---------------------------------------------------------------------------
test("every text exists in English and Portuguese, with matching placeholders", () => {
  const en = I.STRINGS.en, pt = I.STRINGS.pt;
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
  const holes = (s) => (typeof s === "string" ? (s.match(/\{\w+\}/g) || []).sort() : []);
  for (const key of Object.keys(en)) {
    // Portuguese may leave a placeholder out (for grammar), but never invent one.
    for (const h of holes(pt[key])) assert.ok(holes(en[key]).includes(h), key + " " + h);
    if (key !== "ui.uncertain") assert.deepEqual(holes(pt[key]), holes(en[key]), key);
    if (Array.isArray(en[key])) assert.equal(pt[key].length, en[key].length, key);
  }
});

test("Portuguese interface texts contain no English", () => {
  for (const [key, value] of Object.entries(I.STRINGS.pt)) {
    const text = [].concat(value).join(" ").replace(/Rider–Waite–Smith|Open-Meteo|Golden Dawn|\{\w+\}/g, "");
    assert.doesNotMatch(text, ENGLISH, key + ": " + text);
  }
});

test("all 78 cards have a complete Portuguese text", () => {
  assert.deepEqual(Object.keys(PT).sort(), T.DECK.map((c) => c.name).sort());
  const seen = new Set();
  for (const card of T.DECK) {
    const c = PT[card.name];
    for (const field of ["name", "upright", "reversed", "image"]) {
      assert.ok(typeof c[field] === "string" && c[field].length >= (field === "name" ? 3 : 20), card.name + " " + field);
      assert.doesNotMatch(c[field], ENGLISH, card.name + " " + field + ": " + c[field]);
    }
    assert.equal(c.up.length, card.keywords.upright.length, card.name + " upright keywords");
    assert.equal(c.rev.length, card.keywords.reversed.length, card.name + " reversed keywords");
    for (const k of c.up.concat(c.rev)) assert.doesNotMatch(k, ENGLISH, card.name + " keyword " + k);
    for (const text of [c.upright, c.reversed, c.image]) {
      assert.ok(!seen.has(text), "duplicate text: " + text);
      seen.add(text);
    }
  }
});

test("all 78 cards have Portuguese love, career, money and health meanings", () => {
  const words = {
    love: /amor|relação|parceir|romanc|solteir|namor|paix|apaixon|coração|admirador/i,
    career: /trabalho|emprego|carreira|colega|chefe|projeto|negócio|profission|equipa/i,
    money: /dinheiro|finan|gast|poup|orçamento|rendimento|dívida|invest|pag|riqueza/i,
    health: /saúde|corpo|energia|descans|stress|bem-estar|sono|hábito|vitalidade|recupera|tensão|humor|ansiedade|exaust|esgota/i,
  };
  const seen = new Set();
  for (const card of T.DECK) {
    for (const [topic, re] of Object.entries(words)) {
      const pair = PT[card.name][topic];
      assert.equal(pair.length, 2, card.name + " " + topic);
      pair.forEach((text, i) => {
        const where = `${card.name} ${topic} ${i ? "reversed" : "upright"}: ${text}`;
        assert.ok(text.length > 20, where);
        assert.match(text, re, where);
        assert.doesNotMatch(text, ENGLISH, where);
        assert.notEqual(text, card.topics[topic][i ? "reversed" : "upright"], where);
        assert.ok(!seen.has(text), "duplicate text: " + text);
        seen.add(text);
      });
    }
  }
  const star = T.DECK.find((c) => c.name === "The Star");
  assert.match(T.text(star).topics.love.upright, /^Hope and healing in love/);
  assert.match(inPortuguese(() => T.text(star).topics.love.upright), /^Esperança e cura no amor/);
});

test("Portuguese card names follow the standard names", () => {
  const majors = ["O Louco", "O Mago", "A Sacerdotisa", "A Imperatriz", "O Imperador", "O Hierofante", "Os Enamorados",
    "O Carro", "A Força", "O Eremita", "A Roda da Fortuna", "A Justiça", "O Enforcado", "A Morte", "A Temperança",
    "O Diabo", "A Torre", "A Estrela", "A Lua", "O Sol", "O Julgamento", "O Mundo"];
  assert.deepEqual(T.DECK.filter((c) => c.arcana === "major").map((c) => PT[c.name].name), majors);
  const ranks = ["Ás", "Dois", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez", "Pajem", "Cavaleiro", "Rainha", "Rei"];
  const suits = { wands: "Paus", cups: "Copas", swords: "Espadas", pentacles: "Ouros" };
  for (const c of T.DECK.filter((x) => x.arcana === "minor")) {
    assert.equal(PT[c.name].name, ranks[c.number - 1] + " de " + suits[c.suit]);
  }
});

// ---------------------------------------------------------------------------
// 2. Portuguese descriptions are correct
// ---------------------------------------------------------------------------
// For every card, word stems (without accents) for the traditional upright and
// reversed meanings. The keywords AND the meaning sentence must each contain
// one of them, so a meaning attached to the wrong card is caught.
const REFERENCE_PT = {
  "The Fool": [["comec", "espontan", "salto"], ["imprud", "hesit", "descuid"]],
  "The Magician": [["vontade", "habilid", "capacidad", "manifest"], ["manipul", "desperdic"]],
  "The High Priestess": [["intuic", "interior"], ["segred"]],
  "The Empress": [["abundanc", "natur", "cuid", "fertil"], ["bloque", "sufoc", "desleix", "descuid"]],
  "The Emperor": [["estrutur", "autorid", "disciplin"], ["rigid", "control", "domin"]],
  "The Hierophant": [["tradic", "institu", "orient"], ["crenc", "rebel", "regras"]],
  "The Lovers": [["harmon", "valor", "escolh"], ["desequil", "conflit"]],
  "The Chariot": [["vitori", "determin", "vontade"], ["control", "rumo"]],
  "Strength": [["coragem", "pacienc", "compaix"], ["duvid", "insegur", "emoc"]],
  "The Hermit": [["solid", "introspe", "interior"], ["isolam", "afast"]],
  "Wheel of Fortune": [["ciclo", "viragem", "sorte", "destin"], ["azar", "resist"]],
  "Justice": [["justic", "verdad"], ["injust", "desonest", "responsab"]],
  "The Hanged Man": [["pausa", "entreg", "perspet"], ["sacrif", "resist"]],
  "Death": [["transform", "fins", "termina"], ["mudanc", "resist", "agarrad"]],
  "Temperance": [["moderac", "equilib", "pacienc"], ["desequil", "excess"]],
  "The Devil": [["pris", "pres", "vici", "tentac"], ["libert", "poder", "desprend"]],
  "The Tower": [["subit", "queda", "revel", "caos"], ["evit", "inevit"]],
  "The Star": [["esperanc", "inspir", "renov"], ["desesper", "desanim"]],
  "The Moon": [["ilus", "medo", "inconsc", "incert"], ["confus", "clarez"]],
  "The Sun": [["alegr", "sucess", "vitalid"], ["otimis", "triste"]],
  "Judgement": [["chamam", "renasc", "perdo"], ["autocrit", "duvid"]],
  "The World": [["realiz", "plenitud", "conclus"], ["acabar", "atalho", "encerr"]],
  "Ace of Wands": [["inspir", "oportun", "centelha"], ["atras", "bloque", "motiv"]],
  "Two of Wands": [["planea", "visao", "decis", "horizont"], ["desconhec", "seguro"]],
  "Three of Wands": [["expans", "progress", "oportun"], ["atras", "obstac"]],
  "Four of Wands": [["celebr", "harmon", "regress", "comunid"], ["apoio", "instab"]],
  "Five of Wands": [["conflit", "competic"], ["resoluc", "evit"]],
  "Six of Wands": [["vitori", "reconhec", "sucess"], ["reconhec", "queda", "desgraca"]],
  "Seven of Wands": [["desafi", "firm", "posic"], ["desist", "sobrecarg", "defensiv"]],
  "Eight of Wands": [["rapid", "notic", "progress"], ["atras", "frustr"]],
  "Nine of Wands": [["resilien", "limite"], ["exaust", "desconfi"]],
  "Ten of Wands": [["fardo", "respons", "excesso"], ["fardo", "deleg"]],
  "Page of Wands": [["entusias", "notic", "explor"], ["rumo", "procrast", "precipit"]],
  "Knight of Wands": [["aventur", "paix", "impuls"], ["imprud", "pressa", "frustr"]],
  "Queen of Wands": [["confian", "calor", "determin"], ["ciume", "insegur", "exig"]],
  "King of Wands": [["visao", "honra", "ousad"], ["impuls", "expectativ", "domin"]],
  "Ace of Cups": [["amor", "compaix"], ["reprim", "bloque", "vazio"]],
  "Two of Cups": [["ligac", "mutu", "parceri"], ["desequil", "comunic", "tensao"]],
  "Three of Cups": [["celebr", "amig", "comunid"], ["mexeric", "terceir"]],
  "Four of Cups": [["apat", "insatisf"], ["aceit"]],
  "Five of Cups": [["perda", "luto", "arrepend"], ["aceit", "perdao", "seguir em frente"]],
  "Six of Cups": [["memori", "infanc", "nostalg"], ["passado"]],
  "Seven of Cups": [["ilus", "escolh", "opco"], ["clarez", "decis", "decid", "realid", "realis"]],
  "Eight of Cups": [["deixar", "sentido"], ["medo", "deriva"]],
  "Nine of Cups": [["contentam", "satisf", "desej"], ["insatisf", "presunc"]],
  "Ten of Cups": [["harmon", "famil", "realiz"], ["valor"]],
  "Page of Cups": [["criativ", "intuit", "mensag"], ["imatur", "insegur", "bloque"]],
  "Knight of Cups": [["romance", "coracao", "convite"], ["humor", "irreal", "desilus"]],
  "Queen of Cups": [["compaix", "compass", "intui", "emocion"], ["codepend", "sobrecarg"]],
  "King of Cups": [["equilib", "diplomac", "seren"], ["humor", "instab", "manipul"]],
  "Ace of Swords": [["clarez", "verdad", "ideia"], ["confus", "mal-entend"]],
  "Two of Swords": [["impasse", "escolh"], ["informac", "confus"]],
  "Three of Swords": [["desgost", "dor", "tristez"], ["recuper", "perdo", "cura"]],
  "Four of Swords": [["descans", "recuper"], ["esgot", "exaust"]],
  "Five of Swords": [["conflit", "vitori", "preco"], ["reconcil", "repar", "ressent"]],
  "Six of Swords": [["transic", "aguas", "viag"], ["bagagem", "resist"]],
  "Seven of Swords": [["engan", "estrateg", "impune"], ["confiss", "consciencia", "apanhad"]],
  "Eight of Swords": [["pres", "restric", "limit"], ["libert"]],
  "Nine of Swords": [["ansied", "preocup", "pesadel"], ["ajuda", "ansied"]],
  "Ten of Swords": [["fundo do poco", "traic", "doloros"], ["recuper", "regener"]],
  "Page of Swords": [["curios", "ideia", "aprend"], ["mexeric", "palavras", "convers"]],
  "Knight of Swords": [["determin", "rapid", "ambic"], ["esgot", "agress"]],
  "Queen of Swords": [["honest", "lucid"], ["frieza", "amargur", "cruel"]],
  "King of Swords": [["pensamento claro", "verdad", "etica", "autorid"], ["tiran", "logica fria", "manipul"]],
  "Ace of Pentacles": [["oportun", "prosper"], ["oportun", "escass"]],
  "Two of Pentacles": [["flexib", "prioridad", "equilib"], ["desorganiz", "compromiss"]],
  "Three of Pentacles": [["equipa", "colabor", "competenc"], ["equipa", "desalinh"]],
  "Four of Pentacles": [["segur", "poup", "control"], ["ganan", "gast"]],
  "Five of Pentacles": [["perda", "dificuld", "pobre"], ["recuper", "ajuda", "melhor"]],
  "Six of Pentacles": [["generos", "partilh", "receb"], ["divid", "segundas intenc", "poder"]],
  "Seven of Pentacles": [["pacien", "longo prazo", "invest"], ["impacien", "retorno"]],
  "Eight of Pentacles": [["dedicac", "mestria"], ["perfecc", "foco", "atalho"]],
  "Nine of Pentacles": [["independ", "requint"], ["excesso de trabalho", "depend", "superfic"]],
  "Ten of Pentacles": [["riquez", "legado", "heranc"], ["disput", "longo prazo"]],
  "Page of Pentacles": [["estud", "projet"], ["procrast", "irreal"]],
  "Knight of Pentacles": [["rotina", "metod"], ["tedio", "pregu"]],
  "Queen of Pentacles": [["pratic", "sustent"], ["desequil", "descuid", "desleix"]],
  "King of Pentacles": [["negoci", "segur", "disciplin"], ["ganan", "teimos"]],
};

test("reference table covers all 78 cards", () => {
  assert.deepEqual(Object.keys(REFERENCE_PT).sort(), T.DECK.map((c) => c.name).sort());
});

for (const card of T.DECK) {
  test("Portuguese description is correct: " + card.name, () => {
    const [up, rev] = REFERENCE_PT[card.name];
    const c = PT[card.name];
    const texts = {
      "upright keywords": [c.up.join(" "), up],
      "upright meaning": [c.upright, up],
      "reversed keywords": [c.rev.join(" "), rev],
      "reversed meaning": [c.reversed, rev],
    };
    for (const [label, [text, stems]] of Object.entries(texts)) {
      assert.ok(stems.some((s) => norm(text).includes(s)), `${card.name} ${label} should mention one of ${stems}; got: ${text}`);
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Switching language
// ---------------------------------------------------------------------------
test("cards, spreads and astrology switch language", () => {
  const two = T.DECK.find((c) => c.name === "Two of Wands");
  assert.equal(T.text(two).name, "Two of Wands");
  assert.equal(T.text(two).astro, "Mars in Aries");
  inPortuguese(() => {
    assert.equal(T.text(two).name, "Dois de Paus");
    assert.equal(T.text(two).astro, "Marte em Carneiro");
    assert.equal(T.text(two).suit, "Paus");
    assert.equal(T.text(two).element, "Fogo");
    assert.equal(T.text(T.DECK[0]).astro, "Ar (moderno: Úrano)"); // The Fool
    assert.equal(T.text(T.DECK.find((c) => c.name === "Ace of Cups")).astro, "Verão");
    assert.equal(T.text(T.DECK.find((c) => c.name === "King of Cups")).astro, "Escorpião");
    assert.deepEqual(T.spreadText("three").positions.map((p) => p.name), ["Passado", "Presente", "Futuro"]);
    assert.deepEqual(T.spreadText("celtic").positions.map((p) => p.weight), T.SPREADS.celtic.positions.map((p) => p.weight));
    assert.equal(T.VERDICTS.likely_yes.label, "Provavelmente sim");
  });
  assert.equal(T.VERDICTS.likely_yes.label, "Likely yes");
  assert.deepEqual(T.spreadText("three").positions.map((p) => p.name), ["Past", "Present", "Future"]);
  assert.throws(() => I.setLanguage("xx"), RangeError);
});

// ---------------------------------------------------------------------------
// 4. Portuguese questions
// ---------------------------------------------------------------------------
test("Portuguese questions are sorted into types", () => {
  const cases = {
    yesno: ["Vou passar no teste amanhã?", "Devo ir ou não?", "Ele gosta de mim?", "Será que vou conseguir?", "Vale a pena?"],
    choice: ["Devo ficar no Porto ou ir para Lisboa?", "O que é melhor para mim, café ou chá?", "É melhor arrendar ou comprar?"],
    when: ["Quando vou encontrar o amor?", "Daqui a quanto tempo vou ter emprego?", "Em que mês me vou mudar?"],
    why: ["Porque é que me sinto preso?", "Porquê?", "Qual a razão disto?"],
    who: ["Quem é a minha alma gémea?", "Que pessoa me pode ajudar?"],
    where: ["Onde vou conhecer essa pessoa?", "Em que cidade devo viver?"],
    advice: ["O que devo fazer?", "Como posso melhorar as notas?", "Que conselho me dás?"],
    outlook: ["O que vai acontecer na minha relação?", "Fala-me do amor", "Como vai correr o exame?"],
  };
  inPortuguese(() => {
    for (const [type, qs] of Object.entries(cases)) {
      for (const q of qs) assert.equal(T.classifyQuestion(q), type, q);
    }
    assert.deepEqual(T.splitOptions("Devo ficar com o meu namorado ou seguir em frente?"), ["ficar com o teu namorado", "seguir em frente"]);
    assert.deepEqual(T.splitOptions("O que é melhor para mim, café ou chá?"), ["café", "chá"]);
    assert.equal(T.splitOptions("Devo ir ou não?"), null);
  });
});

test("Portuguese yes/no answers in a full sentence", () => {
  const cases = [
    ["Vou passar no teste amanhã?", "yes", "Sim, vais passar no teste amanhã."],
    ["Vou passar no teste amanhã?", "likely_yes", "Muito provavelmente, vais passar no teste amanhã."],
    ["Vou passar no teste amanhã?", "unclear", "Ainda não é claro se vais passar no teste amanhã."],
    ["Vou passar no teste amanhã?", "likely_no", "Provavelmente não. Para já, não vais passar no teste amanhã."],
    ["Vou passar no teste amanhã?", "no", "Não, não vais passar no teste amanhã."],
    ["Devo mudar de casa?", "yes", "Sim, deves mudar de casa."],
    ["Ele gosta de mim?", "no", "Não, ele não gosta de ti."],
    ["O meu namorado vai ligar-me?", "yes", "Sim, o teu namorado vai ligar-te."],
    ["Ele ama-me?", "no", "Não, ele não te ama."],
    ["Será que vou conseguir o emprego?", "yes", "Sim, vais conseguir o emprego."],
    ["Vale a pena mudar de emprego?", "no", "Não, não vale a pena mudar de emprego."],
    ["Eu passarei no exame?", "yes", "Sim, passarás no exame."],
    ["A Ana vai ligar-me?", "yes", "Sim, a Ana vai ligar-te."],
    ["Tenho de estudar mais?", "likely_yes", "Muito provavelmente, tens de estudar mais."],
    ["Devo ir ou não?", "yes", "Sim, deves ir."],
  ];
  inPortuguese(() => {
    for (const [q, v, expected] of cases) assert.equal(T.answerSentence(q, v), expected, q + " / " + v);
    // Can't be rephrased safely → null (the plain verdict is shown).
    assert.equal(T.answerSentence("Vais ajudar-me?", "yes"), null); // addressed to the cards
    assert.equal(T.answerSentence("Corro a maratona?", "yes"), null); // unknown verb
    assert.equal(T.answerSentence("Quando vou casar?", "yes"), null); // not yes/no
  });
});

test("Portuguese open answers, summaries and stories are fully in Portuguese", () => {
  const card = (name) => ({ card: T.DECK.find((c) => c.name === name), reversed: false });
  const NOW = Date.UTC(2026, 8, 29);
  inPortuguese(() => {
    const when = T.openAnswer("Quando vou encontrar o amor?", [card("Four of Swords"), card("The Magician"), card("Two of Wands")], "three", { now: NOW });
    assert.equal(when.label, "Quando");
    assert.equal(when.headline, "Muito provavelmente por volta de 20–30 de março de 2027 (Dois de Paus).");
    assert.match(when.details[0], /Marte em Carneiro.*\(posição: Futuro\)$/);
    assert.equal(T.openAnswer("Quando?", [card("Two of Swords")], "single", { now: NOW }).headline,
      "Em breve: de agora até 3 de outubro de 2026 (Dois de Espadas).");
    const choice = T.openAnswer("Devo ficar no Porto ou ir para Lisboa?",
      [card("The Hermit"), card("Six of Wands"), card("Five of Pentacles"), card("Temperance")], "choice");
    assert.equal(choice.headline, "As cartas favorecem: ficar no Porto.");
    assert.equal(choice.details[0], "Caminho A (ficar no Porto): vitória e reconhecimento público (Seis de Paus), tende para: sim forte.");

    // Thousands of random readings: never any English or missing text.
    const qs = ["Quando vai acontecer?", "Porque é que isto acontece?", "Quem é ele?", "Onde devo ir?", "O que devo fazer?",
      "E a minha carreira?", "Devo ficar ou ir?", "Vou passar no exame?"];
    for (let r = 0; r < 2000; r++) {
      const spread = ["single", "three", "celtic", "choice"][r % 4];
      const drawn = T.shuffle(T.DECK, { reversals: true }).slice(0, T.SPREADS[spread].positions.length);
      const q = qs[r % qs.length];
      const a = T.openAnswer(q, drawn, spread, { now: NOW + r * 86400000 });
      const parts = [T.narrate(drawn, spread)].concat(T.summarize(drawn));
      if (a) parts.push(a.label, a.headline, ...a.details);
      else parts.push(T.yesNoReading(drawn, spread).verdict.text, T.answerSentence(q, "no"));
      const text = parts.join(" ");
      assert.doesNotMatch(text, /undefined|null|NaN|\[object/, text);
      assert.doesNotMatch(text, ENGLISH, text);
    }
  });
});

test("personal cards are explained in Portuguese", () => {
  const c = A.chart({ year: 1990, month: 7, day: 15, hour: 14, minute: 30, timeZone: "Europe/Lisbon", lat: 38.7167, lon: -9.1333 });
  const links = inPortuguese(() => A.personalCards(c, new Date(2026, 8, 29)));
  const byRole = Object.fromEntries(links.map((l) => [l.roleKey, l]));
  assert.equal(byRole.sun_sign.role, "Signo solar");
  assert.equal(byRole.sun_sign.why, "Sol em Caranguejo: O Carro é a carta de Caranguejo.");
  assert.equal(byRole.sun_decan.why, "Sol a 22° de Caranguejo cai no decanato de Lua em Caranguejo, regido pelo Quatro de Copas.");
  assert.equal(byRole.court.why, "A tua carta da corte: Rainha de Copas rege Caranguejo (cardinal, água).");
  for (const l of links) assert.doesNotMatch(l.role + " " + l.why, ENGLISH, l.why);
  // Cards are still identified by their English names, so readings match them in any language.
  assert.equal(byRole.sun_sign.card, "The Chariot");
});
