// Game data mirrored from character_creator/data.js & game_rules.md §3

const HERO_TYPES = [
  {
    id: "knight",
    name: "Knight",
    emoji: "🛡️",
    strong: "Might",
    trick: "Block an attack to protect a friend",
  },
  {
    id: "wizard",
    name: "Wizard",
    emoji: "🧙",
    strong: "Magic",
    trick: 'Cast one "Sparkle Spell" per game',
  },
  {
    id: "scout",
    name: "Scout",
    emoji: "🏃",
    strong: "Speed",
    trick: "Move an extra space once per turn",
  },
  {
    id: "healer",
    name: "Healer",
    emoji: "💖",
    strong: "Heart",
    trick: "Heal a friend's hurt once per game",
  },
];

const STATS = [
  { id: "Might", desc: "pushing, lifting, fighting" },
  { id: "Magic", desc: "spells and solving puzzles" },
  { id: "Speed", desc: "running, jumping, sneaking" },
  { id: "Heart", desc: "being brave, kind, helping" },
];

const FACES = [
  "😀",
  "😎",
  "🤩",
  "😺",
  "🐯",
  "🦊",
  "🐻",
  "🐼",
  "🐸",
  "🦄",
  "🐲",
  "🦉",
  "🧚",
  "🦸",
  "👻",
  "🤖",
];

const START_HEARTS = 3; // §3 Step 4
const MAX_HEARTS = 3;
const STAT_BONUS = 2; // strong stat bonus (§3) & Help bonus (§5)
const SAVE_KEY = "tinyHeroes.guideState.v1";

// Target Numbers (§2)
const DIFFICULTIES = { 5: "Easy", 10: "Medium", 15: "Hard" };
// ---- AI Guide content (§6, §11) ----
// Goofy, never-scary encounters (§6). stats = which stat(s) can beat it.
const ENCOUNTERS = [
  {
    emoji: "👹",
    name: "Giggle Goblin",
    tn: 10,
    stats: ["Might", "Speed"],
    text: "It throws pillows! Dodge or knock it over.",
  },
  {
    emoji: "🟤",
    name: "Grumpy Mud Puddle",
    tn: 5,
    stats: ["Speed", "Heart"],
    text: "It splishes and splashes. Hop across without getting squelched!",
  },
  {
    emoji: "🐉",
    name: "Ticklish Dragon",
    tn: 15,
    stats: ["Heart", "Magic"],
    text: "It guards the bridge — but it's VERY ticklish. Make it giggle!",
  },
  {
    emoji: "🧌",
    name: "Snoring Troll",
    tn: 10,
    stats: ["Speed", "Magic"],
    text: "ZZZ… sneak past without waking it!",
  },
  {
    emoji: "🌀",
    name: "Whirly Wind Puzzle",
    tn: 10,
    stats: ["Magic"],
    text: "Leaves spin in a riddle-shape. Solve the swirly pattern!",
  },
  {
    emoji: "🧱",
    name: "Wobbly Wall",
    tn: 5,
    stats: ["Might"],
    text: "A silly stack of foam blocks blocks the path. Push it over!",
  },
];
// Goofy choices the Guide can offer (§11)
const CHOICES = [
  {
    prompt: "A snoring troll blocks the path. What do you do?",
    options: [
      "Sneak past quietly",
      "Tickle it awake",
      "Build a pillow bridge over it",
    ],
  },
  {
    prompt: "You find two glowing doors. Which one?",
    options: [
      "The sparkly blue door",
      "The giggling green door",
      "Peek through the keyhole first",
    ],
  },
  {
    prompt: "A treasure chest hums a little tune. What now?",
    options: [
      "Open it carefully",
      "Knock politely first",
      "Ask the Wizard to check for sparkles",
    ],
  },
  {
    prompt: "The river is too wide to jump. How do you cross?",
    options: [
      "Hop the lily pads",
      "Float across on a big leaf",
      "Ask a friendly turtle for a ride",
    ],
  },
];
// Symbols for the basic text map (§4 legend)
const MAP_SPACES = ["🏠", "❓", "⚔️", "💎", "🧩", "❓", "⚔️", "⭐"];
