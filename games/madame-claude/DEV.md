# Madame Claude

A browser-based tarot parlor. See `idea.md` for the full design.

## Run the UI

```sh
cd games/madame_claude
npx serve .            # or: python -m http.server 8080
```

Open the printed URL. No build step; everything is plain HTML, CSS and native ES modules.

## Render the card art (once, offline)

```sh
cd games/madame_claude/render
npm install
npm run render                       # all 78 cards + card back → ../assets/cards/
npm run render -- --only major-16    # a single card
npm run render -- --size 1000        # wider output
npm run render -- --force            # ignore the unchanged-card cache
```

## Notes

- Without an Anthropic API key the built-in interpreter writes the reading.
- With a key, the request goes straight from the browser to `api.anthropic.com`
  (the key is yours; nothing else ever sees it).
- Share links carry only `?spread=…&seed=h:…` — never your words or key.