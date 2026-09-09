# Madame Claude — A Virtual Tarot Parlor

Step into Madame Claude's parlor: a quiet, candlelit corner of the browser
where cards are drawn, turned, and read. There's no app to install and no
account to create — just a deck, a question (or none at all), and a reading
waiting to unfold.

## What is this, exactly?

Madame Claude is a digital tarot reading experience. You visit her page,
optionally tell her what's on your mind — a worry, a question, a name, a
date, or nothing — and she deals you a spread of cards. Each card is
beautifully illustrated, and when you turn it over, she offers her
interpretation.

There are two ways she reads for you:

- **On her own** — a built-in storyteller weaves a reading from each card's
  traditional meaning, its position in the spread, and whether it landed
  upright or reversed. This works instantly, for anyone, with no setup.
- **With a little extra help** — if you bring your own Anthropic API key
  (a personal credential for Claude, Anthropic's AI), Madame Claude speaks
  in a richer, more personal voice, weaving your own words into the
  reading. This is entirely optional, and your key never goes anywhere
  except directly from your browser to Anthropic — nothing is stored on a
  server, because there is no server.

## The idea behind the cards

Traditional tarot reading has a charming rule of thumb: the cards you draw
are the cards you were "meant" to draw, at least for today. Madame Claude
takes this literally. Behind the scenes, she builds a "seed" — a kind of
fingerprint made from your rough location, today's date, and whatever you
typed — and uses it to shuffle a deck in a perfectly reproducible way.

That means:

- Ask again later today, with the same words, and you'll get the very same
  cards. It's not random chance each time — it's *your* reading for *today*.
- Change your question, or wait for tomorrow, and the cards shuffle anew.
- If you want to share a specific reading with a friend, you can send them
  a link that reproduces your exact spread — without ever sharing your
  private words or your API key. Only the cards travel.

This gives the experience a strange, pleasing quality: it feels less like
rolling dice and more like consulting something that already knows what day
it is.

## Why it's interesting

Madame Claude sits at a small but delightful intersection of ideas:

- **Determinism dressed as fate.** Ordinary randomness feels arbitrary;
  seeded randomness tied to your date and words feels *intentional*, even
  though it's just arithmetic. It's a neat trick for turning "random" into
  "meant to be."
- **A little bit of theater.** The cards are hand-designed with a
  consistent visual language (procedurally generated once, then saved as
  images), the flip animations are unhurried, and the whole thing leans
  into atmosphere rather than efficiency.
- **AI as a storyteller, not an oracle.** When a Claude API key is
  supplied, the model is explicitly asked to interpret — never to predict.
  It's a gentle example of using a language model for reflection and
  narrative rather than "answers."
- **Privacy by construction.** There's no backend server collecting your
  questions. Everything happens in your browser tab. If you don't bring an
  API key, nothing you type ever leaves your machine at all.

## Who might enjoy this

- Anyone curious about tarot who wants a low-stakes, judgment-free way to
  draw a few cards and reflect on them.
- People who enjoy small, self-contained, well-crafted web toys — the kind
  of thing you bookmark and revisit occasionally, not a productivity tool.
- Writers, journalers, or anyone who likes prompts for reflection; a
  three-card "past, present, future" spread can be a surprisingly good
  nudge for thinking something through.
- Anyone interested in seeing a thoughtful, minimal example of pairing a
  large language model with a persona and a clear ethical frame — the AI is
  asked to reflect, not to foretell.
- Folks who simply want to see nicely drawn tarot cards and a bit of
  candlelit web design, no explanation required.

There's nothing to configure, nothing to sign up for, and nothing kept
after you close the tab — unless you choose to remember your key, or share
a link to a reading you'd like to revisit. Pull up a chair; Madame Claude
is listening.