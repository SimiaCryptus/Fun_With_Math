// Game data pulled from game_rules.md §3
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
        trick: "Cast one \"Sparkle Spell\" per game",
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

    // The four stats (§3 Step 2)
    const STATS = [
      { id: "Might", desc: "pushing, lifting, fighting" },
      { id: "Magic", desc: "spells and solving puzzles" },
      { id: "Speed", desc: "running, jumping, sneaking" },
      { id: "Heart", desc: "being brave, kind, helping" },
    ];

    // Fun emoji faces for "Name & Look" (§3 Step 3)
    const FACES = [
      "😀","😎","🤩","😺","🐯","🦊","🐻","🐼",
      "🐸","🦄","🐲","🦉","🧚","🦸","👻","🤖",
    ];

    const START_HEARTS = 3; // §3 Step 4