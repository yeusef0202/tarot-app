/*
 * Tarot deck data + core logic (shuffle, cut, draw, spreads, reading summary).
 * Works both in the browser (window.Tarot) and in Node (module.exports) so it
 * can be unit-tested without a browser.
 *
 * Meanings follow the Rider–Waite–Smith (RWS) tradition, the most widely used
 * modern tarot system (A. E. Waite & Pamela Colman Smith, 1909).
 */
(function (root) {
  "use strict";

  // Zodiac data and the Sun's position (for timing questions). In the browser
  // astro.js is loaded first.
  const Astro = root.Astro || require("./astro.js");

  // ---------------------------------------------------------------------------
  // Major Arcana (0–21). Astrology follows the Golden Dawn attributions; the
  // Fool, Hanged Man and Judgement also show their modern outer-planet rulers.
  // ---------------------------------------------------------------------------
  const MAJOR_ARCANA = [
    {
      name: "The Fool", astro: "Air (modern: Uranus)", glyph: "♅",
      up: ["beginnings", "innocence", "spontaneity", "free spirit", "leap of faith"],
      rev: ["recklessness", "naivety", "hesitation", "careless risk"],
      upright: "A fresh start is calling. The Fool invites you to step into the unknown with curiosity and trust, even without knowing exactly where the path leads.",
      reversed: "You may be acting carelessly or, the opposite, holding back out of fear. Look before you leap, but don't let hesitation stop you from beginning at all.",
      image: "A carefree young traveler steps toward a cliff edge holding a white rose and a small bundle, a little white dog at his heels and the sun shining behind him.",
    },
    {
      name: "The Magician", astro: "Mercury", glyph: "☿",
      up: ["manifestation", "willpower", "skill", "resourcefulness", "concentration"],
      rev: ["manipulation", "trickery", "untapped talent", "poor planning"],
      upright: "You have every tool you need to turn an idea into reality. Focus your will, use your skills, and act: this is a moment of personal power.",
      reversed: "Talent is being wasted or misused. Beware of manipulation (yours or someone else's) and of plans that are all show and no substance.",
      image: "A figure raises a wand to the sky with one hand and points to the earth with the other. The four suit symbols lie on his table and an infinity sign floats above his head.",
    },
    {
      name: "The High Priestess", astro: "Moon", glyph: "☽",
      up: ["intuition", "the subconscious", "mystery", "inner voice", "hidden knowledge"],
      rev: ["secrets", "ignored intuition", "withdrawal", "repressed feelings"],
      upright: "Be still and listen inward. Answers come through intuition, dreams and quiet reflection rather than action or logic. Not everything is revealed yet.",
      reversed: "You are disconnected from your inner voice, or something is being kept secret. Stop seeking outside approval and trust what you already sense.",
      image: "A serene woman sits between a black pillar (B) and a white pillar (J), holding a scroll marked TORA, with a crescent moon at her feet and a veil of pomegranates behind her.",
    },
    {
      name: "The Empress", astro: "Venus", glyph: "♀",
      up: ["abundance", "fertility", "nurturing", "nature", "sensuality"],
      rev: ["creative block", "dependence", "smothering", "self-neglect"],
      upright: "A season of growth, creativity and abundance. Nurture yourself and others, connect with nature and the senses, and let things flourish at their own pace.",
      reversed: "Creative or emotional energy is blocked. You may be neglecting your own needs, or over-caring for others to the point of smothering them.",
      image: "A crowned woman with twelve stars rests on cushions in a lush forest, a field of ripe wheat at her feet and a heart-shaped shield bearing the symbol of Venus.",
    },
    {
      name: "The Emperor", astro: "Aries", glyph: "♈",
      up: ["authority", "structure", "stability", "father figure", "control"],
      rev: ["domination", "rigidity", "excessive control", "lack of discipline"],
      upright: "Order, leadership and clear structure bring success. Take charge, set firm boundaries, and build something stable through discipline.",
      reversed: "Authority is being abused or is lacking altogether. Watch for rigid, controlling behavior, or for a situation that has no structure at all.",
      image: "A stern, bearded ruler sits on a stone throne carved with ram heads, holding an ankh-shaped sceptre and an orb, with barren mountains behind him.",
    },
    {
      name: "The Hierophant", astro: "Taurus", glyph: "♉",
      up: ["tradition", "conformity", "spiritual wisdom", "institutions", "mentorship"],
      rev: ["rebellion", "unconventionality", "personal beliefs", "challenging the status quo"],
      upright: "Established traditions, teachers and institutions offer guidance. Learning from a mentor or following a proven path serves you now.",
      reversed: "It's time to question the rules and find your own beliefs. Tradition may feel restrictive; breaking from convention can be freeing.",
      image: "A religious figure in red robes and a triple crown raises his hand in blessing between two pillars. Two followers kneel before him and crossed keys lie at his feet.",
    },
    {
      name: "The Lovers", astro: "Gemini", glyph: "♊",
      up: ["love", "harmony", "relationships", "aligned values", "choices"],
      rev: ["disharmony", "imbalance", "misaligned values", "poor choices"],
      upright: "A meaningful union or an important choice guided by your values. Deep connection and harmony come from honesty and alignment with what you truly believe.",
      reversed: "Something is out of balance in a relationship or within yourself. Values are in conflict; be honest about what you really want before choosing.",
      image: "A naked man and woman stand beneath a great angel. Behind the woman is a tree with a serpent; behind the man, a tree of flames.",
    },
    {
      name: "The Chariot", astro: "Cancer", glyph: "♋",
      up: ["willpower", "determination", "victory", "control", "direction"],
      rev: ["lack of direction", "loss of control", "aggression", "obstacles"],
      upright: "Victory through determination and focus. Harness opposing forces, stay on course, and you will overcome the obstacles ahead.",
      reversed: "You are being pulled in different directions or trying to force an outcome. Regain your focus and self-control before pushing on.",
      image: "An armored warrior stands in a chariot drawn by a black sphinx and a white sphinx. He holds no reins, steering by will alone.",
    },
    {
      name: "Strength", astro: "Leo", glyph: "♌",
      up: ["courage", "inner strength", "compassion", "patience", "gentle control"],
      rev: ["self-doubt", "weakness", "insecurity", "raw emotion"],
      upright: "True strength is gentle. Meet challenges with courage, patience and compassion instead of force, and you will tame even the wildest situation.",
      reversed: "Self-doubt or strong emotions are getting the upper hand. Reconnect with your inner confidence and be kind to yourself.",
      image: "A woman in white calmly closes the jaws of a lion. An infinity sign floats above her head and she is garlanded with flowers.",
    },
    {
      name: "The Hermit", astro: "Virgo", glyph: "♍",
      up: ["introspection", "soul-searching", "solitude", "inner guidance"],
      rev: ["isolation", "loneliness", "withdrawal", "feeling lost"],
      upright: "Step back from the noise to reflect. Solitude and soul-searching will light the way; the answers you seek are found within.",
      reversed: "Healthy solitude has become isolation. You may be too withdrawn, or avoiding the reflection you need. Reconnect with others.",
      image: "An old man in a grey cloak stands alone on a snowy peak, holding a staff and a lantern containing a six-pointed star.",
    },
    {
      name: "Wheel of Fortune", astro: "Jupiter", glyph: "♃",
      up: ["cycles", "destiny", "turning point", "luck", "change"],
      rev: ["bad luck", "resisting change", "setbacks", "breaking cycles"],
      upright: "The wheel is turning. A turning point, change of luck or fateful event is at hand; life moves in cycles, so go with the flow.",
      reversed: "A run of bad luck or resistance to inevitable change. Consider what patterns keep repeating and what is within your control.",
      image: "A great wheel marked with letters and alchemical symbols, with a sphinx on top, a snake descending and Anubis rising. Four winged creatures read books in the corners.",
    },
    {
      name: "Justice", astro: "Libra", glyph: "♎",
      up: ["fairness", "truth", "cause and effect", "law", "accountability"],
      rev: ["unfairness", "dishonesty", "lack of accountability", "legal complications"],
      upright: "Truth and fairness prevail. Decisions have consequences; act with integrity, and expect a just outcome in legal or ethical matters.",
      reversed: "Something is unfair or dishonest, or someone is avoiding responsibility. Own your part and look for the truth being hidden.",
      image: "A crowned figure in red sits between two pillars, holding an upright double-edged sword in one hand and balanced scales in the other.",
    },
    {
      name: "The Hanged Man", astro: "Water (modern: Neptune)", glyph: "♆",
      up: ["surrender", "pause", "letting go", "new perspective", "suspension"],
      rev: ["stalling", "resistance", "needless sacrifice", "indecision"],
      upright: "Pause and see things from a new angle. Surrendering control or waiting, rather than acting, brings insight and release.",
      reversed: "You are stuck, resisting a necessary pause, or making sacrifices that lead nowhere. Stop stalling and decide.",
      image: "A man hangs upside down by one foot from a living T-shaped tree. His face is calm, and a halo of light surrounds his head.",
    },
    {
      name: "Death", astro: "Scorpio", glyph: "♏",
      up: ["endings", "transformation", "transition", "letting go", "change"],
      rev: ["resisting change", "stagnation", "fear of endings", "inability to move on"],
      upright: "One chapter ends so another can begin. Death rarely means physical death: it signals deep transformation and the release of what no longer serves you.",
      reversed: "You are clinging to something that has already ended. Resisting change keeps you stuck; letting go will free you.",
      image: "A skeleton in black armor rides a white horse carrying a black flag with a white rose. A king lies fallen and others plead, while the sun rises between two towers.",
    },
    {
      name: "Temperance", astro: "Sagittarius", glyph: "♐",
      up: ["balance", "moderation", "patience", "purpose", "blending"],
      rev: ["imbalance", "excess", "impatience", "lack of harmony"],
      upright: "Find the middle way. Patience, moderation and the careful blending of opposites create harmony and a sense of purpose.",
      reversed: "Life is out of balance, perhaps through excess or haste. Step back, realign, and restore moderation.",
      image: "A winged angel stands with one foot on land and one in water, pouring liquid between two cups. A path leads to a distant glowing crown.",
    },
    {
      name: "The Devil", astro: "Capricorn", glyph: "♑",
      up: ["bondage", "addiction", "materialism", "shadow self", "temptation"],
      rev: ["release", "breaking free", "reclaiming power", "detachment"],
      upright: "You may feel trapped by habits, desires or unhealthy attachments. The chains are looser than they seem: recognize what binds you.",
      reversed: "You are breaking free from something that held you captive. Awareness of your shadow side gives you back your power.",
      image: "A horned, bat-winged creature squats on a pedestal. A naked man and woman stand chained to it, yet the chains around their necks are loose enough to remove.",
    },
    {
      name: "The Tower", astro: "Mars", glyph: "♂",
      up: ["sudden upheaval", "revelation", "chaos", "awakening", "collapse of false structures"],
      rev: ["averting disaster", "fear of change", "delaying the inevitable", "inner upheaval"],
      upright: "A sudden, shocking change tears down what was built on false foundations. Painful as it is, the collapse clears the way for truth.",
      reversed: "You may be avoiding a necessary upheaval or going through it internally. Delaying the inevitable only prolongs the discomfort.",
      image: "Lightning strikes a tall tower on a rocky peak, blowing off its crown. Flames burst from the windows and two figures fall headfirst.",
    },
    {
      name: "The Star", astro: "Aquarius", glyph: "♒",
      up: ["hope", "faith", "renewal", "inspiration", "serenity"],
      rev: ["despair", "lack of faith", "discouragement", "disconnection"],
      upright: "After the storm comes healing. Hope, renewed faith and calm inspiration guide you; the future is brighter than it seems.",
      reversed: "You feel discouraged or have lost faith. Reconnect with what inspires you; hope is still there, even if it's hard to see.",
      image: "A naked woman kneels by a pool, pouring water onto the land and into the pool. A large eight-pointed star shines above, surrounded by seven smaller stars.",
    },
    {
      name: "The Moon", astro: "Pisces", glyph: "♓",
      up: ["illusion", "fear", "anxiety", "the subconscious", "uncertainty"],
      rev: ["release of fear", "clarity", "repressed emotion", "confusion lifting"],
      upright: "Things are not what they seem. Illusions, fears and the subconscious cloud the path; trust your intuition to find your way through the fog.",
      reversed: "Confusion is lifting and hidden fears come to light. Facing them releases their power over you.",
      image: "A full moon shines between two towers. A dog and a wolf howl at it while a crayfish crawls from a pool onto a winding path.",
    },
    {
      name: "The Sun", astro: "Sun", glyph: "☉",
      up: ["joy", "success", "positivity", "vitality", "warmth"],
      rev: ["temporary sadness", "blocked joy", "over-optimism", "dimmed enthusiasm"],
      upright: "One of the most positive cards in the deck. Joy, success, confidence and vitality shine on you; things are clear and bright.",
      reversed: "Your inner light is temporarily dimmed, or you are being overly optimistic. Happiness is still near, just clouded for a moment.",
      image: "A joyful naked child rides a white horse beneath a radiant sun, holding a red banner, with tall sunflowers behind a garden wall.",
    },
    {
      name: "Judgement", astro: "Fire (modern: Pluto)", glyph: "♇",
      up: ["rebirth", "inner calling", "reflection", "absolution", "reckoning"],
      rev: ["self-doubt", "harsh self-judgment", "ignoring the call", "regret"],
      upright: "A moment of awakening and reckoning. Reflect honestly on the past, forgive, and answer the call to a new level of being.",
      reversed: "Harsh self-criticism or doubt keeps you from moving forward. Don't ignore the inner call; learn from the past rather than dwell in it.",
      image: "An angel blows a trumpet from the clouds. Below, people rise from their coffins with arms outstretched, answering the call.",
    },
    {
      name: "The World", astro: "Saturn", glyph: "♄",
      up: ["completion", "integration", "accomplishment", "travel", "wholeness"],
      rev: ["incompletion", "lack of closure", "shortcuts", "delays"],
      upright: "A cycle comes to a successful end. You have achieved wholeness and accomplishment; celebrate before the next journey begins.",
      reversed: "Something is left unfinished. Seek closure and complete what you started instead of taking shortcuts.",
      image: "A dancing figure wrapped in a sash floats inside a laurel wreath, holding two wands. A man, eagle, lion and bull watch from the four corners.",
    },
  ];

  const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

  // ---------------------------------------------------------------------------
  // Minor Arcana: four suits, each Ace–Ten plus four court cards.
  // ---------------------------------------------------------------------------
  const SUITS = {
    wands: {
      name: "Wands", element: "Fire",
      domain: "passion, creativity, ambition, action and energy",
    },
    cups: {
      name: "Cups", element: "Water",
      domain: "emotions, relationships, intuition and love",
    },
    swords: {
      name: "Swords", element: "Air",
      domain: "thoughts, communication, truth and conflict",
    },
    pentacles: {
      name: "Pentacles", element: "Earth",
      domain: "money, work, the body and the material world",
    },
  };

  const RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Page", "Knight", "Queen", "King"];

  const MINOR_ARCANA = {
    wands: [
      {
        up: ["inspiration", "new opportunity", "creative spark", "potential"],
        rev: ["delays", "lack of motivation", "creative block"],
        upright: "A burst of inspiration and a new opportunity full of potential. Seize the creative spark while it's hot.",
        reversed: "The spark is there but stalled: delays, low motivation or a creative block. Clarify what you really want to pursue.",
        image: "A hand emerges from a cloud gripping a sprouting wand, with a castle on a distant hill.",
      },
      {
        up: ["planning", "future vision", "decisions", "discovery"],
        rev: ["fear of the unknown", "lack of planning", "playing it safe"],
        upright: "You're planning your next move and looking toward wider horizons. Make a decision and step beyond your comfort zone.",
        reversed: "Fear of the unknown keeps you playing it safe, or poor planning holds you back.",
        image: "A man on castle battlements holds a small globe, one wand in his hand and another fixed to the wall, gazing out over land and sea.",
      },
      {
        up: ["expansion", "foresight", "progress", "opportunities abroad"],
        rev: ["delays", "obstacles to progress", "lack of foresight", "frustration"],
        upright: "Your plans are in motion and expanding. Look ahead: progress, growth and opportunities, possibly far away, are coming.",
        reversed: "Expansion is slowed by obstacles or a lack of foresight. Expected results are delayed.",
        image: "A figure stands on a cliff with three wands planted around him, watching ships sail across the sea.",
      },
      {
        up: ["celebration", "harmony", "homecoming", "community", "milestones"],
        rev: ["lack of support", "transition", "conflict at home", "instability"],
        upright: "A joyful milestone worth celebrating: harmony at home, a homecoming, a wedding or community gathering.",
        reversed: "Celebration is dampened by tension at home, instability or a lack of support. A period of transition.",
        image: "Four wands topped with a garland of flowers form a canopy. Two figures raise bouquets in celebration, a castle behind them.",
      },
      {
        up: ["conflict", "competition", "disagreement", "tension"],
        rev: ["avoiding conflict", "resolution", "inner conflict", "truce"],
        upright: "Conflict, competition and clashing egos. Friction can be productive if it pushes everyone to improve.",
        reversed: "Conflict is ending or being avoided. Seek resolution, or examine an inner struggle.",
        image: "Five young men brandish wands in what looks like a chaotic mock battle, none clearly winning.",
      },
      {
        up: ["victory", "public recognition", "success", "self-confidence"],
        rev: ["egotism", "fall from grace", "lack of recognition", "private achievement"],
        upright: "Success and public recognition. You've earned this victory; enjoy the praise and confidence it brings.",
        reversed: "Recognition is missing, or pride is getting in the way. Beware of arrogance or a fall from grace.",
        image: "A rider crowned with a laurel wreath rides a white horse through a cheering crowd, carrying a wand topped with another wreath.",
      },
      {
        up: ["challenge", "perseverance", "defending your position", "standing your ground"],
        rev: ["giving up", "overwhelm", "exhaustion", "defensiveness"],
        upright: "You're being challenged, but you hold the high ground. Stand firm and defend what you believe in.",
        reversed: "You feel overwhelmed and tempted to give up, or you've become overly defensive.",
        image: "A man on high ground fends off six wands rising from below with his own wand. He wears two different shoes.",
      },
      {
        up: ["speed", "swift action", "movement", "rapid progress", "news"],
        rev: ["delays", "frustration", "slowing down", "waiting"],
        upright: "Things are moving fast: swift action, sudden news, travel or rapid progress. Ride the momentum.",
        reversed: "Delays and frustration slow things down. Energy is scattered; wait for the right moment.",
        image: "Eight wands fly diagonally through a clear sky over open countryside, about to land.",
      },
      {
        up: ["resilience", "persistence", "last stand", "boundaries", "courage"],
        rev: ["exhaustion", "paranoia", "giving up", "fatigue"],
        upright: "You're tired but nearly there. Draw on your resilience for one last push, and protect your boundaries.",
        reversed: "Exhaustion or paranoia wears you down. You may be at the end of your strength; ask for help.",
        image: "A wounded man with a bandaged head leans on a wand, watchful, with eight wands standing behind him like a fence.",
      },
      {
        up: ["burden", "responsibility", "overwork", "stress", "hard work"],
        rev: ["releasing burdens", "delegation", "collapse", "doing it all alone"],
        upright: "You're carrying too much. Responsibilities and overwork weigh you down; the goal is close, but at what cost?",
        reversed: "Time to put some weight down: delegate, say no, and release burdens before you collapse.",
        image: "A man struggles to carry a heavy bundle of ten wands toward a distant town, his view blocked by the load.",
      },
      {
        up: ["enthusiasm", "exploration", "discovery", "free spirit", "exciting news"],
        rev: ["lack of direction", "procrastination", "hastiness", "setbacks"],
        upright: "A curious, enthusiastic energy or messenger. Exciting news or a new idea invites you to explore.",
        reversed: "Enthusiasm without direction. Ideas stall through procrastination or haste.",
        image: "A young man in a tunic patterned with salamanders holds a tall wand, studying its sprouting top in a desert landscape.",
      },
      {
        up: ["energy", "passion", "adventure", "impulsiveness", "action"],
        rev: ["haste", "recklessness", "frustration", "scattered energy"],
        upright: "Bold, passionate action and adventure. Charge ahead with confidence, but mind your impulses.",
        reversed: "Energy turns into recklessness or frustration. Rushing leads to mistakes and unfinished projects.",
        image: "A knight on a rearing horse holds a wand aloft, his tunic decorated with salamanders, pyramids in the distance.",
      },
      {
        up: ["courage", "confidence", "determination", "independence", "warmth"],
        rev: ["selfishness", "jealousy", "insecurity", "demanding behavior"],
        upright: "Confident, warm and determined, a magnetic person or quality that inspires others and gets things done.",
        reversed: "Confidence has slipped into jealousy, insecurity or a demanding attitude. Reclaim your self-assurance.",
        image: "A queen sits on a throne carved with lions, holding a wand and a sunflower, with a black cat at her feet.",
      },
      {
        up: ["natural leadership", "vision", "entrepreneurship", "honor", "boldness"],
        rev: ["impulsiveness", "overbearing behavior", "unrealistic expectations", "ruthlessness"],
        upright: "A visionary leader who inspires with boldness and honor. Take charge of your vision and lead by example.",
        reversed: "Leadership turns into impulsiveness or domination. Expectations are too high and patience too low.",
        image: "A king on a throne decorated with lions and salamanders holds a flowering wand, a small salamander at his feet.",
      },
    ],
    cups: [
      {
        up: ["love", "new feelings", "compassion", "emotional awakening", "creativity"],
        rev: ["repressed emotions", "emptiness", "blocked love"],
        upright: "A new beginning in love or emotion: an overflowing heart, compassion, a new relationship or creative flow.",
        reversed: "Feelings are blocked or held back. You may feel empty; first give love and care to yourself.",
        image: "A hand emerges from a cloud holding an overflowing chalice. A dove descends with a wafer and five streams fall into a pond of lotuses.",
      },
      {
        up: ["partnership", "unified love", "mutual attraction", "connection"],
        rev: ["imbalance", "broken communication", "tension", "separation"],
        upright: "A deep, mutual connection: a romantic partnership, a close friendship or a meaningful alliance.",
        reversed: "A relationship is out of balance. Communication has broken down or tension is driving you apart.",
        image: "A man and a woman exchange cups as a pledge. Above them floats a caduceus crowned with a winged lion's head.",
      },
      {
        up: ["celebration", "friendship", "community", "gatherings"],
        rev: ["overindulgence", "gossip", "isolation", "three's a crowd"],
        upright: "Joyful times with friends: celebrations, reunions and the support of your community.",
        reversed: "Too much partying, gossip, or a third party causing trouble. You may feel left out.",
        image: "Three women dance in a circle, raising their cups in a toast amid a harvest of fruit and flowers.",
      },
      {
        up: ["apathy", "contemplation", "disconnection", "reevaluation", "missed opportunity"],
        rev: ["sudden awareness", "choosing happiness", "acceptance", "re-engagement"],
        upright: "You're withdrawn and dissatisfied, so focused on what's lacking that you may miss a new offer right in front of you.",
        reversed: "You're coming out of apathy and ready to accept new opportunities and re-engage with life.",
        image: "A young man sits under a tree, arms crossed, staring at three cups, ignoring a fourth cup offered by a hand from a cloud.",
      },
      {
        up: ["loss", "grief", "regret", "disappointment"],
        rev: ["acceptance", "moving on", "forgiveness", "finding peace"],
        upright: "Grief and regret over what was lost. Allow yourself to mourn, but notice that not everything is gone.",
        reversed: "You're accepting the loss and ready to move on. Forgiveness and peace are within reach.",
        image: "A cloaked figure mourns over three spilled cups, not seeing the two upright cups behind. A bridge leads to a house.",
      },
      {
        up: ["nostalgia", "childhood memories", "innocence", "reunion", "kindness"],
        rev: ["stuck in the past", "idealizing the past", "moving forward", "independence"],
        upright: "Sweet memories, childhood joy and simple kindness. Someone or something from the past returns.",
        reversed: "You're clinging to the past or seeing it through rose-tinted glasses. Time to grow and move forward.",
        image: "In a village courtyard, a child offers another child a cup filled with white flowers.",
      },
      {
        up: ["choices", "illusion", "fantasy", "wishful thinking", "many options"],
        rev: ["clarity", "alignment", "making a decision", "sobering up"],
        upright: "Many options, but not all are real. Beware of daydreams and illusions; choose with your eyes open.",
        reversed: "The fog clears. You see your options realistically and are ready to decide.",
        image: "A figure faces seven cups floating in clouds, each holding a vision: a castle, jewels, a wreath, a dragon, a snake, a head and a veiled figure.",
      },
      {
        up: ["walking away", "disillusionment", "leaving behind", "seeking deeper meaning"],
        rev: ["fear of moving on", "stagnation", "aimless drifting", "trying one more time"],
        upright: "You're leaving behind something that no longer fulfills you, in search of deeper meaning, even if it looked fine from outside.",
        reversed: "You want to walk away but fear holds you back, or you're drifting without a clear purpose.",
        image: "Under an eclipsed moon, a cloaked figure with a staff walks away from eight neatly stacked cups toward the mountains.",
      },
      {
        up: ["contentment", "satisfaction", "wish fulfilled", "gratitude"],
        rev: ["dissatisfaction", "materialism", "smugness", "unfulfilled wishes"],
        upright: "The 'wish card': contentment, satisfaction and wishes coming true. Enjoy what you've achieved.",
        reversed: "Outward success without inner satisfaction, or smug overindulgence. Ask what would truly fulfill you.",
        image: "A satisfied man sits with arms crossed in front of a curved table displaying nine cups.",
      },
      {
        up: ["harmony", "lasting happiness", "family", "emotional fulfillment"],
        rev: ["disconnection", "broken family", "misaligned values", "struggling relationships"],
        upright: "Emotional fulfillment and a happy home: family harmony, lasting love and the 'happily ever after' feeling.",
        reversed: "Harmony at home is disrupted. Values or expectations don't align; reconnect with loved ones.",
        image: "A couple raise their arms toward a rainbow of ten cups while two children dance beside them, a cozy house in the distance.",
      },
      {
        up: ["creative opportunity", "intuitive message", "curiosity", "sensitivity"],
        rev: ["emotional immaturity", "creative block", "insecurity", "escapism"],
        upright: "A playful, sensitive energy. An unexpected creative idea, intuitive message or sweet emotional surprise.",
        reversed: "Emotional immaturity, insecurity or a creative block. Don't escape into fantasy.",
        image: "A young man in a flowered tunic holds a cup from which a small fish peeks out, the sea behind him.",
      },
      {
        up: ["romance", "charm", "following the heart", "imagination", "invitation"],
        rev: ["moodiness", "unrealistic expectations", "jealousy", "disappointment"],
        upright: "A romantic, idealistic invitation, like a proposal or an offer made from the heart. Follow your dreams.",
        reversed: "Moodiness, unrealistic romance or disappointment. Charm without substance.",
        image: "A knight in a winged helmet rides slowly on a white horse, holding a cup forward like an offering.",
      },
      {
        up: ["compassion", "caring", "emotional security", "intuition", "calm"],
        rev: ["codependency", "emotional insecurity", "martyrdom", "overwhelm"],
        upright: "Compassionate, intuitive and emotionally secure: someone who cares deeply and listens with the heart.",
        reversed: "Giving too much, becoming codependent or overwhelmed by emotion. Care for yourself too.",
        image: "A queen sits on a throne at the water's edge, gazing at an ornate, closed cup decorated with angels.",
      },
      {
        up: ["emotional balance", "diplomacy", "compassion", "generosity", "calm control"],
        rev: ["emotional manipulation", "moodiness", "volatility", "coldness"],
        upright: "Emotional maturity and calm diplomacy. Keep a balanced heart even when the waters are rough.",
        reversed: "Emotions are repressed or used to manipulate. Moodiness and volatility beneath a calm surface.",
        image: "A king holding a cup and sceptre sits on a stone throne floating on a turbulent sea, a ship and a leaping fish behind him.",
      },
    ],
    swords: [
      {
        up: ["breakthrough", "clarity", "truth", "new idea", "mental force"],
        rev: ["confusion", "miscommunication", "clouded judgment", "chaos"],
        upright: "A mental breakthrough. Clarity, truth and a sharp new idea cut through confusion.",
        reversed: "Confused thinking, miscommunication or misuse of words. Wait for clarity before acting.",
        image: "A hand from a cloud grips an upright sword topped by a crown, with olive and palm branches draped over it.",
      },
      {
        up: ["difficult decisions", "stalemate", "indecision", "avoidance"],
        rev: ["information overload", "confusion", "truth revealed", "lesser of two evils"],
        upright: "A stalemate: you're avoiding a hard choice by blocking out your feelings. Remove the blindfold and decide.",
        reversed: "Too much information and confusion make the decision harder, or the truth comes out and forces a choice.",
        image: "A blindfolded woman sits holding two crossed swords across her chest, the sea and a crescent moon behind her.",
      },
      {
        up: ["heartbreak", "grief", "sorrow", "emotional pain", "rejection"],
        rev: ["recovery", "forgiveness", "releasing pain", "healing"],
        upright: "Heartbreak and painful truth. Grief hurts, but facing it is the first step toward healing.",
        reversed: "Recovery from heartbreak. You're releasing pain and learning to forgive.",
        image: "A red heart pierced by three swords hangs in a grey sky, under storm clouds and falling rain.",
      },
      {
        up: ["rest", "recuperation", "contemplation", "recovery"],
        rev: ["restlessness", "burnout", "exhaustion", "stagnation"],
        upright: "Time to rest and recharge. Step back, recover your strength and reflect before the next challenge.",
        reversed: "You're running on empty. Refusing rest leads to burnout; or, after resting, it's time to re-engage.",
        image: "The effigy of a knight lies on a tomb, hands in prayer. Three swords hang above him and one lies beneath, beside a stained-glass window.",
      },
      {
        up: ["conflict", "defeat", "winning at all costs", "betrayal", "tension"],
        rev: ["reconciliation", "making amends", "past resentment", "moving on"],
        upright: "A hollow victory. Conflict where someone wins at all costs, and everyone loses something. Is it worth it?",
        reversed: "The desire to reconcile and make amends, or resentment from a past conflict lingering on.",
        image: "A smirking man gathers swords as two defeated figures walk away under a jagged, stormy sky.",
      },
      {
        up: ["transition", "moving on", "leaving behind", "calmer waters"],
        rev: ["resistance to change", "unfinished business", "emotional baggage"],
        upright: "Moving away from difficulty toward calmer waters. A transition, a journey or a sad but necessary departure.",
        reversed: "You're unable or unwilling to move on, carrying unresolved baggage with you.",
        image: "A ferryman poles a boat carrying a cloaked woman and a child toward a distant shore, six swords standing upright in the boat.",
      },
      {
        up: ["deception", "strategy", "stealth", "getting away with something", "acting alone"],
        rev: ["coming clean", "conscience", "getting caught", "rethinking an approach"],
        upright: "Deception, secrecy or cunning strategy. Someone may be getting away with something; be alert, or examine your own honesty.",
        reversed: "The truth comes out: a confession, a guilty conscience or getting caught. Time to come clean.",
        image: "A man tiptoes away from a military camp carrying five swords, glancing back at the two he left behind.",
      },
      {
        up: ["restriction", "self-imposed limits", "feeling trapped", "victim mentality"],
        rev: ["release", "new perspective", "freedom", "self-acceptance"],
        upright: "You feel trapped, but the prison is largely in your mind. Your thoughts, not your circumstances, are what bind you.",
        reversed: "You're freeing yourself from limiting beliefs and seeing a way out.",
        image: "A bound and blindfolded woman stands surrounded by eight swords stuck in the ground, yet the way out is open.",
      },
      {
        up: ["anxiety", "worry", "nightmares", "fear", "despair"],
        rev: ["hope", "reaching out", "recovery from anxiety", "hidden worries"],
        upright: "Anxiety and sleepless nights. Worries feel overwhelming, though they are often worse in your mind than in reality.",
        reversed: "The worst of the anxiety is passing, or you're finally reaching out for help with worries kept hidden.",
        image: "A woman sits up in bed, face in her hands, with nine swords hanging on the dark wall behind her.",
      },
      {
        up: ["painful ending", "betrayal", "rock bottom", "crisis", "loss"],
        rev: ["recovery", "regeneration", "surviving the worst", "resisting an inevitable end"],
        upright: "Rock bottom: a painful ending or betrayal. It's over, and the only way from here is up; dawn is on the horizon.",
        reversed: "Recovery after the worst has passed, or refusing to accept an ending that has already happened.",
        image: "A man lies face down with ten swords in his back, under a black sky that gives way to a golden dawn.",
      },
      {
        up: ["curiosity", "new ideas", "thirst for knowledge", "communication", "vigilance"],
        rev: ["gossip", "hasty speech", "all talk no action", "deception"],
        upright: "A curious, sharp mind eager to learn and communicate. New ideas, but stay watchful.",
        reversed: "Gossip, hasty words or lots of talk without action.",
        image: "A youth stands on a windy hill holding a sword upright, alert, with birds and clouds swirling around him.",
      },
      {
        up: ["ambition", "action", "fast thinking", "drive", "assertiveness"],
        rev: ["restlessness", "impulsiveness", "burnout", "aggression"],
        upright: "Charging ahead with determination and ideas. Fast, assertive action toward a goal.",
        reversed: "Rushing without thinking, aggression or scattered, restless energy leading to burnout.",
        image: "A knight charges at full speed on a galloping horse, sword raised, as the wind bends the trees.",
      },
      {
        up: ["clear boundaries", "independence", "direct communication", "perceptiveness", "honesty"],
        rev: ["coldness", "cruelty", "bitterness", "harsh criticism"],
        upright: "Clear-minded and honest, a person who sees through illusions and speaks directly, shaped by experience.",
        reversed: "Honesty turns harsh: coldness, bitterness or cruel words. Pain from the past closes the heart.",
        image: "A queen sits in profile with her sword held upright, the other hand extended as if inviting someone in; butterflies adorn her throne.",
      },
      {
        up: ["intellectual power", "authority", "truth", "clear thinking", "ethics"],
        rev: ["abuse of power", "manipulation", "tyranny", "cold logic"],
        upright: "Clear thinking, fairness and intellectual authority. Decide with logic, truth and ethics.",
        reversed: "Intelligence used to manipulate or dominate. Cold, tyrannical logic without compassion.",
        image: "A king sits facing forward holding an upright sword, calm and judicial, with butterflies carved on his throne.",
      },
    ],
    pentacles: [
      {
        up: ["new financial opportunity", "prosperity", "manifestation", "abundance", "security"],
        rev: ["lost opportunity", "poor planning", "scarcity mindset"],
        upright: "A new opportunity for prosperity: a job, an investment or a gift. A solid seed for material success.",
        reversed: "An opportunity slips away due to poor planning or fear of lack. Check your finances.",
        image: "A hand from a cloud holds a golden pentacle above a flourishing garden with an archway of flowers.",
      },
      {
        up: ["balance", "adaptability", "juggling priorities", "time management", "flexibility"],
        rev: ["overwhelm", "disorganization", "overcommitment", "financial disarray"],
        upright: "Juggling many demands with flexibility and humor. Keep adapting and prioritizing.",
        reversed: "You've taken on too much. Disorganization and overcommitment threaten the balance.",
        image: "A young man dances while juggling two pentacles linked by an infinity loop, as ships ride high waves behind him.",
      },
      {
        up: ["teamwork", "collaboration", "skill", "learning", "craftsmanship"],
        rev: ["lack of teamwork", "disharmony", "poor quality work", "misalignment"],
        upright: "Skill recognized and teamwork that builds something lasting. Collaborate and learn from others.",
        reversed: "Poor teamwork, misalignment or sloppy work. Not everyone is on the same page.",
        image: "A stonemason works on a cathedral arch while a monk and an architect holding plans consult with him.",
      },
      {
        up: ["security", "saving", "control", "conservation", "possessiveness"],
        rev: ["greed", "materialism", "overspending", "letting go"],
        upright: "Holding on tight to money or security. Saving is wise, but don't let fear of loss make you rigid.",
        reversed: "Either greed and hoarding, or the opposite: overspending. Loosen your grip or reassess priorities.",
        image: "A crowned man sits clutching a pentacle to his chest, with one on his crown and two beneath his feet, a city behind him.",
      },
      {
        up: ["hardship", "financial loss", "poverty", "isolation", "worry"],
        rev: ["recovery from loss", "help arriving", "improvement", "spiritual renewal"],
        upright: "Hard times: financial loss, illness or feeling left out in the cold. Help may be closer than you think.",
        reversed: "Recovery from hardship. Help arrives and things start improving.",
        image: "Two ragged figures, one on crutches, trudge through the snow past a lit stained-glass church window.",
      },
      {
        up: ["generosity", "charity", "giving and receiving", "sharing wealth"],
        rev: ["debt", "strings attached", "one-sided charity", "power imbalance"],
        upright: "Generosity and a fair flow of giving and receiving. Share your resources, or accept help gracefully.",
        reversed: "Help comes with strings attached, or giving is one-sided. Watch for debt and power games.",
        image: "A merchant holding balanced scales gives coins to two kneeling beggars.",
      },
      {
        up: ["patience", "long-term view", "investment", "assessment", "perseverance"],
        rev: ["impatience", "poor returns", "limited success", "wasted effort"],
        upright: "Your hard work is growing. Pause to assess your progress and invest patiently for the long term.",
        reversed: "Impatience or poor returns. Effort isn't paying off; reconsider where you invest your energy.",
        image: "A farmer leans on his hoe, gazing thoughtfully at seven pentacles growing on a leafy bush.",
      },
      {
        up: ["diligence", "mastery", "skill development", "hard work", "craftsmanship"],
        rev: ["perfectionism", "lack of focus", "uninspired work", "shortcuts"],
        upright: "Dedication to your craft. Repetition and diligent effort lead to mastery.",
        reversed: "Perfectionism or lack of focus. Work feels uninspired, or shortcuts compromise quality.",
        image: "A craftsman sits at his bench carefully carving pentacles, six finished pieces displayed beside him.",
      },
      {
        up: ["abundance", "luxury", "self-sufficiency", "financial independence", "refinement"],
        rev: ["overworking", "financial setbacks", "superficiality", "dependence"],
        upright: "Enjoying the rewards of your effort: independence, comfort and refined pleasures earned on your own terms.",
        reversed: "Overworking, superficial values or financial dependence. Is the lifestyle worth its price?",
        image: "An elegant woman stands in a lush vineyard among nine pentacles, a hooded falcon perched on her gloved hand.",
      },
      {
        up: ["wealth", "legacy", "family", "inheritance", "long-term security"],
        rev: ["financial failure", "family disputes", "loss of legacy", "short-term focus"],
        upright: "Lasting wealth and legacy: family, inheritance and security that spans generations.",
        reversed: "Family disputes over money or property, or losing sight of long-term security.",
        image: "An old man with two dogs sits beneath an archway with his family, surrounded by ten pentacles arranged as the Tree of Life.",
      },
      {
        up: ["ambition", "new venture", "diligence", "study", "manifestation"],
        rev: ["lack of progress", "procrastination", "unrealistic goals", "learning from failure"],
        upright: "A studious beginning: a new course, job or venture approached with care and focus.",
        reversed: "Procrastination or unrealistic goals. Good ideas that never get put into practice.",
        image: "A young man stands in a green field, holding up a pentacle and studying it intently.",
      },
      {
        up: ["hard work", "routine", "reliability", "responsibility", "methodical"],
        rev: ["boredom", "stagnation", "laziness", "perfectionism"],
        upright: "Slow and steady wins the race. Reliable, methodical effort and routine bring results.",
        reversed: "Routine has become a rut. Boredom, laziness or obsessive perfectionism slow you down.",
        image: "A knight sits motionless on a heavy black horse, holding a pentacle and gazing over a ploughed field.",
      },
      {
        up: ["nurturing", "practicality", "financial security", "down-to-earth", "provider"],
        rev: ["self-neglect", "work-home imbalance", "smothering", "financial dependence"],
        upright: "Practical, warm and generous: a provider who creates comfort and stability for everyone around her.",
        reversed: "Neglecting yourself while caring for everything else, or an imbalance between work and home.",
        image: "A queen sits in a lush garden, a pentacle cradled in her lap and a rabbit nearby, surrounded by roses.",
      },
      {
        up: ["wealth", "business", "leadership", "security", "discipline"],
        rev: ["greed", "stubbornness", "financial mismanagement", "materialism"],
        upright: "Material success and business acumen. A disciplined, generous leader who builds lasting security.",
        reversed: "Greed, stubbornness or obsession with status. Wealth is being misused or mismanaged.",
        image: "A king in a robe covered with grapevines sits on a throne decorated with bulls, holding a pentacle and sceptre, a castle behind him.",
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Yes/No leaning of each card when upright, as used in yes/no tarot readings:
  // 2 = strong yes, 1 = yes, 0 = maybe / not yet, -1 = no, -2 = strong no.
  // A reversed card weakens and flips the lean: reversed "yes" cards lean no,
  // while reversed "no" cards (The Tower, Ten of Swords…) signal recovery and
  // lean slightly yes. Neutral cards stay neutral.
  // ---------------------------------------------------------------------------
  const YES_NO = {
    "The Fool": 1, "The Magician": 2, "The High Priestess": 0, "The Empress": 2,
    "The Emperor": 1, "The Hierophant": 1, "The Lovers": 2, "The Chariot": 2,
    "Strength": 2, "The Hermit": 0, "Wheel of Fortune": 1, "Justice": 0,
    "The Hanged Man": 0, "Death": -1, "Temperance": 1, "The Devil": -1,
    "The Tower": -2, "The Star": 2, "The Moon": -1, "The Sun": 2,
    "Judgement": 1, "The World": 2,
    wands: [2, 1, 1, 2, -1, 2, 1, 2, 1, -1, 1, 1, 1, 1],
    cups: [2, 2, 2, -1, -1, 1, 0, -1, 2, 2, 1, 1, 1, 1],
    swords: [1, 0, -2, 0, -1, 1, -1, -1, -2, -2, 0, 1, 0, 1],
    pentacles: [2, 0, 1, 0, -2, 1, 0, 1, 2, 2, 1, 1, 1, 2],
  };

  function yesNoFor(upright) {
    return { upright: upright, reversed: -Math.sign(upright) || 0 }; // "|| 0" avoids -0
  }

  // ---------------------------------------------------------------------------
  // Build the 78-card deck.
  // ---------------------------------------------------------------------------
  function buildDeck() {
    const deck = [];
    MAJOR_ARCANA.forEach((c, i) => {
      deck.push({
        id: "major-" + String(i).padStart(2, "0"),
        arcana: "major",
        number: i,
        numeral: ROMAN[i],
        name: c.name,
        suit: null,
        element: null,
        astro: c.astro,
        glyph: c.glyph,
        astrology: Astro.cardAstrology(c.name),
        keywords: { upright: c.up, reversed: c.rev },
        meaning: { upright: c.upright, reversed: c.reversed },
        image: c.image,
        yesNo: yesNoFor(YES_NO[c.name]),
      });
    });
    Object.keys(SUITS).forEach((suitKey) => {
      const suit = SUITS[suitKey];
      MINOR_ARCANA[suitKey].forEach((c, i) => {
        const rank = RANKS[i];
        const name = rank + " of " + suit.name;
        // Golden Dawn: the 2–10 each rule a decan ("Mars in Aries"), court
        // cards a sign, and Aces and Pages a season.
        const astrology = Astro.cardAstrology(name);
        deck.push({
          id: suitKey + "-" + String(i + 1).padStart(2, "0"),
          arcana: "minor",
          number: i + 1,
          rank: rank,
          court: i >= 10,
          name: name,
          suit: suitKey,
          element: suit.element,
          astro: astrology.kind === "season"
            ? astrology.label[0].toUpperCase() + astrology.label.slice(1)
            : astrology.label,
          astrology: astrology,
          keywords: { upright: c.up, reversed: c.rev },
          meaning: { upright: c.upright, reversed: c.reversed },
          image: c.image,
          yesNo: yesNoFor(YES_NO[suitKey][i]),
        });
      });
    });
    return deck;
  }

  const DECK = Object.freeze(buildDeck());

  // ---------------------------------------------------------------------------
  // Randomness. Uses crypto.getRandomValues with rejection sampling, which gives
  // unbiased integers; an alternative rng (() => float in [0,1)) can be injected
  // for deterministic testing.
  // ---------------------------------------------------------------------------
  const pool = new Uint32Array(256);
  let poolPos = pool.length;

  function nextUint32() {
    if (poolPos >= pool.length) {
      root.crypto.getRandomValues(pool);
      poolPos = 0;
    }
    return pool[poolPos++];
  }

  function secureRandomInt(max) {
    if (max <= 0) throw new RangeError("max must be > 0");
    const limit = Math.floor(0x100000000 / max) * max; // reject the biased tail
    let x;
    do {
      x = nextUint32();
    } while (x >= limit);
    return x % max;
  }

  function makeRandomInt(rng) {
    return rng ? (max) => Math.floor(rng() * max) : secureRandomInt;
  }

  /** Fisher–Yates shuffle. Returns a new array; each card also gets a random
   *  orientation (like turning cards while shuffling) when reversals are on. */
  function shuffle(cards, options) {
    const opts = options || {};
    const randomInt = makeRandomInt(opts.rng);
    const out = cards.map((c) => ({
      card: c.card || c,
      reversed: opts.reversals ? randomInt(2) === 1 : false,
    }));
    for (let i = out.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** Cut the deck at a random point (never at the very top or bottom). */
  function cut(pile, options) {
    const opts = options || {};
    if (pile.length < 2) return pile.slice();
    const randomInt = makeRandomInt(opts.rng);
    const at = 1 + randomInt(pile.length - 1);
    return pile.slice(at).concat(pile.slice(0, at));
  }

  /** Remove and return the card at `index` from the pile (mutates the pile). */
  function take(pile, index) {
    if (index < 0 || index >= pile.length) throw new RangeError("No card at index " + index);
    return pile.splice(index, 1)[0];
  }

  // ---------------------------------------------------------------------------
  // Spreads
  // ---------------------------------------------------------------------------
  // Each position has a `weight` (how much it counts toward a yes/no answer;
  // future/outcome positions count most) and a `lead` used to weave the cards
  // into one paragraph ("It began with …, right now …").
  const SPREADS = {
    single: {
      name: "One Card",
      description: "A single card for daily guidance or a quick answer to a focused question.",
      positions: [
        { name: "Guidance", meaning: "The core message or energy surrounding your question.",
          weight: 1, lead: "The card's message is about" },
      ],
    },
    three: {
      name: "Past · Present · Future",
      description: "The classic three-card spread showing how a situation developed and where it is heading.",
      positions: [
        { name: "Past", meaning: "Influences and events that led to the current situation.",
          weight: 0.5, lead: "It began with" },
        { name: "Present", meaning: "The current state of affairs and what is happening now.",
          weight: 1, lead: "Right now, the focus is on" },
        { name: "Future", meaning: "The likely direction if things continue on their current path.",
          weight: 1.5, lead: "This is leading toward" },
      ],
    },
    celtic: {
      name: "Celtic Cross",
      description: "The traditional ten-card spread (as described by A. E. Waite) for an in-depth look at a situation.",
      positions: [
        { name: "Present", meaning: "The heart of the matter: you and your current situation.",
          weight: 1, lead: "At the heart of the matter is" },
        { name: "Challenge", meaning: "What crosses you: the immediate obstacle or opposing force.",
          weight: 0.5, lead: "Crossing you is" },
        { name: "Crown", meaning: "What crowns you: your conscious goal or ideal, or the best that can be achieved.",
          weight: 0.75, lead: "At best, you can reach" },
        { name: "Foundation", meaning: "What lies beneath: the root of the matter, often something in the past or subconscious.",
          weight: 0.5, lead: "Underneath it all lies" },
        { name: "Recent Past", meaning: "What is behind you: an influence that has just passed or is now passing away.",
          weight: 0.5, lead: "You are leaving behind" },
        { name: "Near Future", meaning: "What is coming next in the short term.",
          weight: 1, lead: "Coming up next is" },
        { name: "Self", meaning: "Your attitude and how you see yourself in this situation.",
          weight: 0.75, lead: "You approach this with" },
        { name: "Environment", meaning: "External influences: other people and your surroundings.",
          weight: 0.75, lead: "Around you, there is" },
        { name: "Hopes & Fears", meaning: "What you hope for, or fear, often both at once.",
          weight: 0.5, lead: "Deep down, you hope for (or fear)" },
        { name: "Outcome", meaning: "Where it is all heading: the culmination of the other cards.",
          weight: 2, lead: "And it all points toward" },
      ],
    },
    choice: {
      name: "Two Paths",
      description: "For either/or decisions (“Should I stay or go?”): one card for each option, plus where you stand and advice.",
      positions: [
        { name: "Where you stand", meaning: "Your current situation and what the decision is really about.",
          weight: 0.5, lead: "You stand at a crossroads marked by" },
        { name: "Path A", meaning: "What happens if you choose the first option.",
          weight: 1, lead: "The first path leads to" },
        { name: "Path B", meaning: "What happens if you choose the second option.",
          weight: 1, lead: "The second path leads to" },
        { name: "Advice", meaning: "What will help you decide well.",
          weight: 1, lead: "The advice is" },
      ],
    },
  };

  // ---------------------------------------------------------------------------
  // Reading summary: patterns a tarot reader looks at across a whole spread.
  // ---------------------------------------------------------------------------
  function summarize(drawn) {
    const notes = [];
    const n = drawn.length;
    if (n === 0) return notes;
    const majors = drawn.filter((d) => d.card.arcana === "major").length;
    const reversed = drawn.filter((d) => d.reversed).length;
    const courts = drawn.filter((d) => d.card.court).length;
    const aces = drawn.filter((d) => d.card.rank === "Ace").length;

    if (n > 1 && majors / n >= 0.5) {
      notes.push("Many Major Arcana (" + majors + " of " + n + "): big life themes and forces beyond day-to-day matters are at work. This is a significant moment.");
    } else if (n > 1 && majors === 0) {
      notes.push("No Major Arcana: the situation lies mostly in everyday matters that are within your control.");
    }

    const suitCounts = {};
    drawn.forEach((d) => {
      if (d.card.suit) suitCounts[d.card.suit] = (suitCounts[d.card.suit] || 0) + 1;
    });
    const suitKeys = Object.keys(suitCounts).sort((a, b) => suitCounts[b] - suitCounts[a]);
    if (n >= 3 && suitKeys.length && suitCounts[suitKeys[0]] >= 2 &&
        (suitKeys.length === 1 || suitCounts[suitKeys[0]] > suitCounts[suitKeys[1]])) {
      const s = SUITS[suitKeys[0]];
      notes.push("Dominant suit: " + s.name + " (" + s.element + "). The reading centers on " + s.domain + ".");
    }

    if (n > 1 && reversed / n > 0.5) {
      notes.push("Mostly reversed cards (" + reversed + " of " + n + "): energy may be blocked, delayed or turned inward. Look at what you're resisting.");
    }
    if (courts >= 2) {
      notes.push(courts + " court cards: other people, or different sides of your own personality, play an important role.");
    }
    if (aces >= 2) {
      notes.push(aces + " Aces: strong energy of new beginnings and fresh opportunities.");
    }
    return notes;
  }

  // ---------------------------------------------------------------------------
  // Yes / No answers
  // ---------------------------------------------------------------------------
  const VERDICTS = {
    yes: { key: "yes", label: "Yes", text: "The cards give a clear yes. The energy around your question is strongly positive." },
    likely_yes: { key: "likely_yes", label: "Likely yes", text: "The cards lean toward yes, though it may take some effort, so read each card to see what to watch for." },
    unclear: { key: "unclear", label: "Unclear", text: "The cards don't give a clear yes or no. The outcome is still open and depends on your choices." },
    likely_no: { key: "likely_no", label: "Likely no", text: "The cards lean toward no, or not yet. There are obstacles; the cards show what you could change." },
    no: { key: "no", label: "No", text: "The cards point to no, at least not in the way you hope right now." },
  };

  const LEANS = { 2: "strong yes", 1: "yes", 0: "maybe", "-1": "no", "-2": "strong no" };

  // Auxiliary verbs that open a yes/no question, with their negative forms.
  const NEGATIVES = {
    will: "won't", would: "wouldn't", can: "can't", could: "couldn't", should: "shouldn't",
    shall: "shouldn't", do: "don't", does: "doesn't", did: "didn't", am: "aren't",
    is: "isn't", are: "aren't", was: "wasn't", were: "weren't", have: "haven't",
    has: "hasn't", may: "may not", might: "might not",
  };
  const YES_NO_START = /^(will|would|can|could|should|shall|do|does|did|am|is|are|was|were|have|has|may|might|must)\s+\S/i;

  /** Does the question look like a yes/no question ("Will I…?", "Should I…?")?
   *  Either/or questions ("Should I take job A or job B?") are not. */
  function isYesNoQuestion(question) {
    const q = stripOrNot(String(question || "").trim());
    return YES_NO_START.test(q) && !/\bor\b/i.test(q);
  }

  // "Should I go or not?" is still a yes/no question.
  function stripOrNot(q) {
    return q.replace(/,?\s+or\s+not\s*([?.!]*)$/i, "$1");
  }

  // First person → second person, so "my test" becomes "your test".
  const SWAPS = {
    i: "you", me: "you", my: "your", mine: "yours", myself: "yourself",
    we: "you", us: "you", our: "your", ours: "yours", ourselves: "yourselves",
    am: "are", "i'm": "you're", "i've": "you've", "i'll": "you'll", "i'd": "you'd",
  };
  function swapPronouns(text) {
    return text.replace(/\b[\w']+\b/g, (w) => SWAPS[w.toLowerCase()] || w);
  }

  const SUBJECT_PRONOUNS = { i: "you", we: "you", you: null, he: "he", she: "she", it: "it", they: "they", there: "there" };
  const DETERMINERS = ["my", "our", "the", "this", "that", "these", "those", "his", "her", "their", "a", "an"];

  /** Turn "Will I pass my test tomorrow?" + verdict into
   *  "Yes, you will pass your test tomorrow." Returns null when the question
   *  can't be rephrased safely (the generic verdict label is used instead). */
  function answerSentence(question, verdictKey) {
    const words = stripOrNot(String(question || "").trim()).replace(/[?.!\s]+$/, "").split(/\s+/);
    if (words.length < 2 || !isYesNoQuestion(question)) return null;
    let aux = words[0].toLowerCase();
    if (!NEGATIVES[aux]) return null;
    const first = words[1];
    const lower = first.toLowerCase();
    let subject, restFrom;
    if (lower in SUBJECT_PRONOUNS) {
      subject = SUBJECT_PRONOUNS[lower];
      if (!subject) return null; // "Will you…?" is addressed to the cards
      restFrom = 2;
    } else if (DETERMINERS.includes(lower) && words.length > 2) {
      subject = swapPronouns(lower + " " + words[2]);
      restFrom = 3;
    } else if (/^[A-Z]/.test(first)) {
      subject = first; // a name: "Will Ana call me?"
      restFrom = 2;
    } else {
      return null;
    }
    if (subject === "you") {
      if (aux === "am") aux = "are";
      if (aux === "was") aux = "were";
    }
    if (aux === "shall") aux = "should";
    const neg = aux === "are" ? "aren't" : aux === "were" ? "weren't" : NEGATIVES[aux];
    const rest = swapPronouns(words.slice(restFrom).join(" "));
    const clause = (verb) => [subject, verb, rest].filter(Boolean).join(" ");
    // "Do I need…" → "you need…" (the emphatic "do" only reads well after "Yes,").
    const plain = aux === "do" && subject === "you" ? "" : aux;
    switch (verdictKey) {
      case "yes": return "Yes, " + clause(aux) + ".";
      case "likely_yes": return "Most likely, " + clause(plain) + ".";
      case "unclear": return "It's not clear yet whether " + clause(plain) + ".";
      case "likely_no": return "Probably not. As things stand, " + clause(neg) + ".";
      case "no": return "No, " + clause(neg) + ".";
      default: return null;
    }
  }

  /** Combine all drawn cards into one yes/no answer. Each card's lean is
   *  weighted by its position; the score runs from -1 (no) to +1 (yes).
   *  Averaging many cards pulls the result toward "maybe", so the average is
   *  scaled by √(effective number of cards); otherwise a 10-card spread would
   *  almost never give a clear answer. */
  function yesNoReading(drawn, spreadKey) {
    const positions = SPREADS[spreadKey].positions;
    const items = drawn.map((d, i) => {
      const value = d.card.yesNo[d.reversed ? "reversed" : "upright"];
      const weight = positions[i].weight;
      return { card: d.card, reversed: d.reversed, position: positions[i].name, weight, value,
        lean: LEANS[value], contribution: weight * value };
    });
    const sumW = items.reduce((s, it) => s + it.weight, 0);
    const sumW2 = items.reduce((s, it) => s + it.weight * it.weight, 0);
    const average = sumW ? items.reduce((s, it) => s + it.contribution, 0) / (2 * sumW) : 0;
    const effectiveCards = sumW2 ? (sumW * sumW) / sumW2 : 1;
    const score = Math.max(-1, Math.min(1, average * Math.sqrt(effectiveCards)));
    // One card: a strong yes card (±2) gives Yes/No, a mild one (±1) Likely yes/no.
    let verdict;
    if (score > 0.5) verdict = VERDICTS.yes;
    else if (score >= 0.15) verdict = VERDICTS.likely_yes;
    else if (score > -0.15) verdict = VERDICTS.unclear;
    else if (score >= -0.5) verdict = VERDICTS.likely_no;
    else verdict = VERDICTS.no;

    // The card that did the most to push the answer in its direction.
    let keyCard = null;
    items.forEach((it) => {
      const better = !keyCard ||
        (score >= 0.15 ? it.contribution > keyCard.contribution
          : score <= -0.15 ? it.contribution < keyCard.contribution
            : it.weight >= keyCard.weight);
      if (better) keyCard = it;
    });
    return { score, verdict, keyCard, items };
  }

  /** Weave all cards into one paragraph that reads the spread as a story. */
  function narrate(drawn, spreadKey) {
    if (!drawn.length) return "";
    const positions = SPREADS[spreadKey].positions;
    const sentences = drawn.map((d, i) => {
      const kw = d.card.keywords[d.reversed ? "reversed" : "upright"];
      return positions[i].lead + " " + kw[0] + " and " + kw[1] +
        " (" + d.card.name + (d.reversed ? ", reversed" : "") + ").";
    });
    const { score } = yesNoReading(drawn, spreadKey);
    sentences.push(score >= 0.15
      ? "Overall, the energy of this reading is encouraging."
      : score <= -0.15
        ? "Overall, this reading points to challenges you'll need to work through."
        : "Overall, the reading is mixed: the outcome depends on how you handle what the cards show.");
    return sentences.join(" ");
  }

  // ---------------------------------------------------------------------------
  // Open questions: timing, cause, people, places, advice, choices, outlook
  // ---------------------------------------------------------------------------
  const QUESTION_TYPES = {
    yesno: { label: "Yes / No", hint: "✓ Yes/no question: you'll get a yes/no answer when the spread is complete." },
    choice: { label: "Choice", hint: "Either/or question: the Two Paths spread gives each option its own card." },
    when: { label: "Timing", hint: "Timing question: the cards' astrology will suggest when." },
    why: { label: "Cause", hint: "“Why” question: the cards will show the root of the situation." },
    who: { label: "Person", hint: "“Who” question: court cards will describe the person." },
    where: { label: "Place", hint: "“Where” question: the elements of the cards will point to a place." },
    advice: { label: "Advice", hint: "Advice question: the cards will say what to focus on and what to avoid." },
    outlook: { label: "Outlook", hint: "Open question: you'll get the overall outlook and a reading of all the cards together." },
  };

  const OPTION_PREFIX = new RegExp(
    "^(?:(?:is it|would it be) (?:better|best|wiser) (?:to|if (?:i|we))\\s+|" +
    "(?:will|would|can|could|should|shall|do|does|did|am|is|are|was|were|have|has|may|might|must)\\s+" +
    "(?:i|we|you|he|she|it|they|there)\\s+)", "i");

  /** "Should I take the job or stay at university?" → ["take the job", "stay at university"].
   *  Returns null unless there are exactly two options. */
  function splitOptions(question) {
    let q = String(question || "").trim().replace(/[?.!\s]+$/, "");
    const tail = q.split(/[,:;]\s*/).pop(); // "Which is better, A or B"
    if (tail !== q && /\s+or\s+/i.test(tail)) q = tail;
    q = q.replace(OPTION_PREFIX, "");
    const parts = q.split(/\s+or\s+/i).map((s) => s.replace(/[,;:]+$/, "").trim()).filter(Boolean);
    if (parts.length !== 2 || /^not$/i.test(parts[1])) return null;
    return parts.map(swapPronouns);
  }

  /** Type of question: yesno, choice, when, why, who, where, advice or outlook. */
  function classifyQuestion(question) {
    const q = String(question || "").trim().toLowerCase();
    if (!q) return null;
    if (isYesNoQuestion(q)) return "yesno";
    if (/\bor\b/.test(q) && splitOptions(q)) return "choice";
    if (/^(when|how (long|soon)|what (time|day|week|month|year)|by when)\b/.test(q)) return "when";
    if (/^(why|what (caused|is causing|causes|is behind|is the reason))\b/.test(q)) return "why";
    if (/^(who|which person)\b/.test(q)) return "who";
    if (/^where\b/.test(q)) return "where";
    if (/^(how (can|could|do|should|to|may|might) |what (should|can|could|must) (i|we) |what do (i|we) (need to |have to )?do\b|what would help|any advice|advice\b)/.test(q)) return "advice";
    return "outlook";
  }

  const orientation = (d) => (d.reversed ? "reversed" : "upright");
  const pair = (d) => { const kw = d.card.keywords[orientation(d)]; return kw[0] + " and " + kw[1]; };
  const ref = (d) => d.card.name + (d.reversed ? ", reversed" : "");
  const meaningOf = (d) => d.card.meaning[orientation(d)];
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /** The card in the most important position (the Outcome, the Future…). */
  function mainItem(items) {
    return items.reduce((best, it) => (it.position.weight >= best.position.weight ? it : best));
  }

  /** Element of a card: its suit, or for the Major Arcana its sign's element. */
  function elementOf(card) {
    if (card.element) return card.element;
    if (card.astrology && card.astrology.sign) return card.astrology.sign.element;
    const m = /^(Fire|Water|Air|Earth)\b/.exec(card.astro || "");
    return m ? m[1] : null;
  }

  const OUTLOOKS = {
    yes: ["favourable", "Most of the cards support you. This is a good time to move forward."],
    likely_yes: ["mostly favourable", "The cards are mostly supportive, with a few things to watch."],
    unclear: ["mixed", "The cards are mixed: the result depends on the choices you make."],
    likely_no: ["challenging", "There are obstacles to work through; the individual cards show where."],
    no: ["difficult", "This is a hard period for this matter. Be patient and look after yourself."],
  };

  const PERSONA = {
    Page: "a young person, a student or someone bringing news",
    Knight: "an energetic person on the move",
    Queen: "a mature, caring person who leads from within",
    King: "a mature person in authority",
  };

  // Golden Dawn directions of the elements, and the kinds of places they rule.
  const PLACES = {
    Fire: { direction: "south", places: "somewhere lively and active: a gym, a stage, a busy workplace or outdoors in the sun" },
    Water: { direction: "west", places: "somewhere near water or full of feeling: home, a café or bar, the sea or a river" },
    Air: { direction: "east", places: "somewhere busy with people and ideas: a city, a school, an office, online or while travelling" },
    Earth: { direction: "north", places: "somewhere quiet and practical: home, a garden, a shop, a bank or the countryside" },
  };

  // Traditional timing by suit.
  const PACE = {
    wands: "fast, within days",
    swords: "quick, within days or weeks",
    cups: "moderate, within weeks or months",
    pentacles: "slow and steady, within months",
  };

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  const formatDate = (ms) => {
    const d = new Date(ms);
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
  };

  /** "20–30 March 2027", "21 June – 22 September 2027" or "22 December 2026 – 20 March 2027". */
  function formatRange(startMs, endMs) {
    const a = new Date(startMs), b = new Date(endMs);
    if (a.getUTCFullYear() !== b.getUTCFullYear()) return formatDate(startMs) + " – " + formatDate(endMs);
    if (a.getUTCMonth() !== b.getUTCMonth()) return a.getUTCDate() + " " + MONTHS[a.getUTCMonth()] + " – " + formatDate(endMs);
    return a.getUTCDate() + "–" + formatDate(endMs);
  }

  function paceNote(items) {
    const notes = [];
    const counts = {}; // weighted by position, so ties are rare and the Future/Outcome decides
    items.forEach((it) => { if (it.card.suit) counts[it.card.suit] = (counts[it.card.suit] || 0) + it.position.weight; });
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if (top) notes.push("Pace: " + PACE[top] + " (" + SUITS[top].name + ").");
    const majors = items.filter((it) => it.card.arcana === "major").length;
    if (items.length > 1 && majors / items.length > 0.5) notes.push("Many Major Arcana: this is a big development and may take longer to unfold.");
    if (items.length > 1 && items.filter((it) => it.reversed).length / items.length > 0.5) notes.push("Most cards are reversed, which suggests delays.");
    return notes;
  }

  /** Explain an advice card: "Focus on" what helps, "Avoid" what hurts. */
  function adviceLine(it) {
    const verb = it.value > 0 ? "Focus on" : it.value < 0 ? "Avoid" : it.reversed ? "Be careful with" : "Make room for";
    return verb + " " + pair(it) + " (" + ref(it) + ").";
  }

  const ANSWERS = {
    outlook(items, ctx) {
      const v = ctx.reading.verdict;
      const main = mainItem(items);
      return {
        tone: v.key,
        score: ctx.reading.score,
        headline: "The outlook is " + OUTLOOKS[v.key][0] + ", pointing toward " + pair(main) + " (" + ref(main) + ").",
        details: [OUTLOOKS[v.key][1], main.position.name + ": " + meaningOf(main)],
      };
    },

    advice(items) {
      const byHelp = items.slice().sort((a, b) => b.value * b.position.weight - a.value * a.position.weight);
      const adviceCard = items.find((it) => it.position.name === "Advice");
      const best = adviceCard || (byHelp[0].value > 0 ? byHelp[0] : mainItem(items));
      const worst = byHelp[byHelp.length - 1];
      const details = [meaningOf(best)];
      if (worst !== best && worst.value < 0) {
        details.push("Watch out for " + pair(worst) + " (" + ref(worst) + ", " + worst.position.name + "). " + meaningOf(worst));
      }
      return { headline: adviceLine(best), details };
    },

    why(items) {
      const order = ["Foundation", "Past", "Recent Past", "Where you stand", "Guidance"];
      const causes = order.map((n) => items.find((it) => it.position.name === n)).filter(Boolean);
      const root = causes[0] || items[0];
      const details = [meaningOf(root)];
      if (causes[1]) details.push("It was fed by " + pair(causes[1]) + " (" + ref(causes[1]) + ", " + causes[1].position.name + ").");
      const challenge = items.find((it) => it.position.name === "Challenge");
      if (challenge) details.push("What keeps it going: " + pair(challenge) + " (" + ref(challenge) + ", Challenge).");
      return { headline: "The root of it is " + pair(root) + " (" + ref(root) + ").", details };
    },

    who(items) {
      const courts = items.filter((it) => it.card.court).sort((a, b) => b.position.weight - a.position.weight);
      if (!courts.length) {
        const env = items.find((it) => it.position.name === "Environment") || mainItem(items);
        return {
          headline: "No court cards came up, so the cards describe the situation more than a specific person.",
          details: ["Watch for someone who brings " + pair(env) + " (" + ref(env) + ")."],
        };
      }
      const c = courts[0];
      const a = c.card.astrology;
      const element = a.sign.element;
      const others = Astro.SIGNS.filter((s) => s.element === element && s !== a.sign).map((s) => s.name);
      const signLine = a.kind === "court"
        ? "The " + c.card.name + " rules " + a.sign.name + ", so they may be a " + a.sign.name + " or another " +
          element.toLowerCase() + " sign (" + others.join(" or ") + ")."
        : "As a " + element.toLowerCase() + " card, they may be a " +
          Astro.SIGNS.filter((s) => s.element === element).map((s) => s.name).join(", ").replace(/, ([^,]*)$/, " or $1") + ".";
      const details = [meaningOf(c), signLine];
      if (courts.length > 1) {
        details.push("Also involved: " + courts.slice(1).map((o) => PERSONA[o.card.rank] + " (" + ref(o) + ")").join("; ") + ".");
      }
      return { headline: "Look for " + PERSONA[c.card.rank] + ", with " + pair(c) + " (" + ref(c) + ").", details };
    },

    where(items) {
      const tally = {};
      items.forEach((it) => {
        const e = elementOf(it.card);
        if (e) tally[e] = (tally[e] || 0) + it.position.weight;
      });
      const els = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
      if (!els.length) {
        return { headline: "The cards don't point to a particular place: the answer is more about timing and attitude than location.", details: [] };
      }
      const e = els[0];
      const cards = items.filter((it) => elementOf(it.card) === e).map((it) => it.card.name);
      const details = [e + " is the strongest element here (" + cards.join(", ") + "), and it is traditionally linked with the " + PLACES[e].direction + "."];
      if (els[1] && tally[els[1]] === tally[e]) details.push("Also consider " + PLACES[els[1]].places + " (" + els[1] + ").");
      return { headline: capitalize(PLACES[e].places) + ".", details };
    },

    when(items, ctx) {
      const now = ctx.now != null ? new Date(ctx.now).getTime() : Date.now();
      const ranked = items.slice().sort((a, b) => b.position.weight - a.position.weight || b.index - a.index);
      const timed = ranked.find((it) => it.card.astrology && it.card.astrology.start != null);
      const pace = paceNote(items);
      if (!timed) {
        return {
          headline: "The cards don't give a clear date: they're ruled by planets rather than signs, so the timing is up to you.",
          details: pace,
        };
      }
      const a = timed.card.astrology;
      const p = Astro.sunPeriod(a.start, a.end, now);
      const when = p.now ? "Soon: from now until " + formatDate(p.end) : "Most likely " + formatRange(p.start, p.end);
      const name = timed.card.name;
      const why = {
        decan: "The " + name + " is " + a.label + ": the ten days when the Sun passes through that part of " + a.sign.name + ".",
        sign: name + " is the card of " + a.sign.name + ", so its time is the month when the Sun is in " + a.sign.name + ".",
        court: "The " + name + " rules " + a.sign.name + ", so its time is the month when the Sun is in " + a.sign.name + ".",
        season: "The " + name + " rules " + a.label + ", the season that begins when the Sun enters " + a.sign.name + ".",
      }[a.kind];
      const details = [why + " (" + timed.position.name + " card)"];
      if (timed.reversed) details.push("It's reversed, which often means a delay: it may happen later than this.");
      return { headline: when + " (" + ref(timed) + ").", details: details.concat(pace) };
    },

    choice(items, ctx) {
      const options = splitOptions(ctx.question);
      if (ctx.spreadKey !== "choice") {
        const o = ANSWERS.outlook(items, ctx);
        return {
          tone: o.tone, score: o.score,
          headline: "Tip: choose the Two Paths spread to compare “" + options[0] + "” and “" + options[1] + "” side by side.",
          details: [o.headline].concat(o.details),
        };
      }
      const [stand, A, B, adv] = items;
      const lean = (v) => LEANS[v];
      let headline;
      if (A.value - B.value >= 1) headline = "The cards favour: " + options[0] + ".";
      else if (B.value - A.value >= 1) headline = "The cards favour: " + options[1] + ".";
      else if (A.value > 0) headline = "Both paths look good. Choose the one that feels right; the Advice card shows how.";
      else if (A.value < 0) headline = "Both paths look hard right now. Consider waiting, or look for a third option.";
      else headline = "Neither path clearly stands out, so the Advice card is the key.";
      return {
        headline,
        details: [
          "Path A (" + options[0] + "): " + pair(A) + " (" + ref(A) + "), leans " + lean(A.value) + ".",
          "Path B (" + options[1] + "): " + pair(B) + " (" + ref(B) + "), leans " + lean(B.value) + ".",
          "Advice: " + adviceLine(adv) + " " + meaningOf(adv),
          "Where you stand: " + pair(stand) + " (" + ref(stand) + ").",
        ],
      };
    },
  };

  /**
   * Answer an open (not yes/no) question from the drawn cards. Returns
   * { type, label, tone, headline, details[], score } or null. `options.now`
   * (Date or ms) sets "today" for timing answers.
   */
  function openAnswer(question, drawn, spreadKey, options) {
    const type = classifyQuestion(question);
    if (!type || type === "yesno" || !drawn.length) return null;
    const positions = SPREADS[spreadKey].positions;
    const reading = yesNoReading(drawn, spreadKey);
    const items = drawn.map((d, i) => ({
      card: d.card, reversed: d.reversed, index: i, position: positions[i], value: reading.items[i].value,
    }));
    const ctx = { question, spreadKey, reading, now: (options || {}).now };
    return Object.assign({ type, label: QUESTION_TYPES[type].label, tone: "open", score: null, details: [] },
      ANSWERS[type](items, ctx));
  }

  // ---------------------------------------------------------------------------
  // Personal cards: links between a birth chart and a reading
  // ---------------------------------------------------------------------------
  /** Drawn cards that are also personal cards (see Astro.personalCards). */
  function personalLinks(drawn, links) {
    const out = [];
    drawn.forEach((d, i) => {
      const mine = (links || []).filter((l) => l.card === d.card.name);
      if (mine.length) out.push({ index: i, card: d.card, reversed: d.reversed, roles: mine.map((l) => l.role), why: mine.map((l) => l.why) });
    });
    return out;
  }

  /** Compare the reading's main element with the chart's strongest element. */
  function elementHarmony(chartElement, drawn) {
    if (!chartElement || drawn.length < 3) return null;
    const tally = {};
    drawn.forEach((d) => {
      const e = elementOf(d.card);
      if (e) tally[e] = (tally[e] || 0) + 1;
    });
    const els = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    if (!els.length || (els[1] && tally[els[1]] === tally[els[0]])) return null;
    const e = els[0];
    return e === chartElement
      ? "This reading is mostly " + e + ", your chart's strongest element: the situation plays to your natural strengths."
      : "This reading is mostly " + e + " (" + Astro.ELEMENTS[e].traits + "), while your chart is mostly " + chartElement +
        ": it asks you to work in a way that may not come naturally.";
  }

  const api = {
    MAJOR_ARCANA, MINOR_ARCANA, SUITS, RANKS, ROMAN, SPREADS, DECK,
    VERDICTS, QUESTION_TYPES, buildDeck, shuffle, cut, take, summarize, secureRandomInt,
    isYesNoQuestion, answerSentence, yesNoReading, narrate,
    classifyQuestion, splitOptions, openAnswer, elementOf, personalLinks, elementHarmony,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Tarot = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
