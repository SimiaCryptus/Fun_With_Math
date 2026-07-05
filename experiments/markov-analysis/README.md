# Bidirectional Markov Text Analyzer

This tool lets you **build a language model from your own text** and then
see, token by token, how _surprising_ another piece of text is to that model.
It highlights each token with a heat color, tells you what the model _expected_
instead, and lets you rewrite the text interactively.

---

## What It Does (The Big Picture)

You give the tool a **corpus** — any body of text you like (a novel, your
emails, source code, song lyrics). The tool learns the statistical patterns of
that corpus. Then you give it a **test text**, and it colors every token by how
well it fits the patterns the corpus taught it.

- **Calm / transparent** = the model expected this. It's typical.
- **Hot / bright** = the model is surprised. This token is unusual given its
  neighbors.

Click any token to see what the model _would_ have predicted there, and
optionally swap it in.

---

## The Workflow

1. **Corpus panel** — Paste text or upload a `.txt` file. You'll see live
   stats: character count, token count, and byte size. Very large corpora
   (over ~2 MB) get a gentle warning, since building may be slow.
2. **Build Model** — Click the button. A progress indicator shows the build.
   Building happens off the main thread (in a Web Worker) when available, so
   the interface stays responsive.
3. **Test text** — Type or paste the text you want to analyze.
4. **Analyze** — Press _Analyze_ (or just keep editing; analysis re-runs
   automatically shortly after you stop typing).
5. **Read the heatmap** — Hover a token for its exact probabilities; click it
   for the replacement popup.

Changing most settings does **not** require a rebuild — colors and scoring
update instantly. Settings that change _how the corpus is learned_ (tokenizer,
model order, lowercasing, smoothing) require you to rebuild; the tool will tell
you when a rebuild is needed.

---

## Reading the Heatmap

Each token is drawn as a colored chip.

- The **color intensity** encodes _surprise_ — the inverse of probability.
- **Hover** a token to see a tooltip:
  `p=… (fwd=…, bwd=…)` — the combined probability, plus the separate
  forward and backward probabilities.

### Palettes

- **Heat** — transparent when calm, glowing red/orange when surprising.
- **Viridis** — a perceptually uniform blue→green→yellow scale.

### Color scale

- **Linear** — color tracks probability directly.
- **Log** — color tracks the _logarithm_ of probability. Because natural
  language probabilities span many orders of magnitude, log scale usually
  reveals far more structure. This is the default.

A **legend** runs from "calm" to "surprising" so you can read the gradient at
a glance.

---

## The Replacement Popup

Click (or focus and press Enter/Space on) any token to open a popup showing the
model's **top predictions** for that position.

Each row shows:

- the candidate token,
- a bar sized relative to the strongest candidate,
- **fwd** — its forward probability,
- **bwd** — its backward probability,
- **joint** — the combined probability under your chosen strategy.

The token that actually appears in your text is marked as the **original**.
Click any other candidate to **replace** that token in your test text; the
analysis immediately re-runs on the edited text. This makes it easy to explore
"what would make this sentence less surprising?" one token at a time.

Press **Escape** or click outside to dismiss the popup.

---

## Match Statistics

Below the heatmap, a **Match Statistics** panel summarizes the whole test text:

- **Tokens analyzed** — how many tokens were scored.
- **Top-1 match rate** — fraction of tokens where the model's single best
  guess equaled the actual token.
- **Top-N match rate** — fraction of tokens where the actual token appeared
  anywhere in the model's Top-N candidate list.
- **Mean probability** — the ordinary average of combined probabilities.
- **Geometric mean** — the geometric average, which is more meaningful for
  probabilities (see the math below).
- **Perplexity** — a single number summarizing how "confused" the model is by
  the text. Lower is better.

---

## The Math

### Tokens and context

Text is first broken into **tokens**. A token can be a single character, a
whitespace-separated word, a word-or-punctuation unit, or whatever a custom
regular expression matches (see _Tokenizers_ below).

### The Markov model

The tool builds an **order-n Markov model**. It assumes the probability of a
token depends only on the _n_ tokens immediately before it:

```
P(token | history) ≈ P(token | previous n tokens)
```

These conditional probabilities are estimated by **counting** how often each
continuation follows each context in your corpus:

```
P(w | context) = count(context, w) / count(context)
```

The **order (n)** setting controls how much context is used. Higher orders
capture longer patterns but need more corpus text to be reliable.

### Bidirectional scoring

Unlike a plain left-to-right model, this tool builds **two** models:

- a **forward** model that predicts each token from the tokens on its _left_,
- a **backward** model that predicts each token from the tokens on its _right_
  (trained on the reversed corpus).

For every token you get two probabilities, **pF** (forward) and **pB**
(backward). They are merged into a single score by the **combine strategy** you
choose:

| Strategy       | Combined probability |
| -------------- | -------------------- |
| Forward        | `pF`                 |
| Backward       | `pB`                 |
| Average        | `(pF + pB) / 2`      |
| Min            | `min(pF, pB)`        |
| Max            | `max(pF, pB)`        |
| Geometric mean | `√(pF · pB)`         |

_Average_ is the default. _Min_ is strict (a token is only "safe" if **both**
directions like it); _Max_ is lenient (either direction is enough).

### Smoothing

What if a context+token combination never appeared in the corpus? Raw counts
would assign it probability zero. Two mechanisms guard against this.

- **Add-k smoothing** — add a small constant _k_ to every count:

```
P(w | context) = (count(context, w) + k) / (count(context) + k · V)
```

where _V_ is the vocabulary size. With `k = 0` (the default) no smoothing is
applied.

- **Backoff** — if the full _n_-token context was never seen, "back off" to a
  shorter context (n−1 tokens, then n−2, …) until one with data is found. This
  is enabled by default.

- **Floor probability** — a final safety net. If everything else fails, the
  probability is clamped to a tiny floor value rather than zero. This keeps the
  logarithms (and therefore perplexity) finite.

### Surprise and color

Color is driven by **surprise**, defined as `1 − (normalized probability)`.
On the log scale, probability is mapped through its logarithm before
normalizing, which spreads out the very small probabilities that dominate
natural text.

### Geometric mean and perplexity

Because probabilities multiply, their **arithmetic** average is misleading —
one very small value barely moves it. The **geometric mean** averages in
log-space instead:

```
geomean = exp( (1/N) · Σ log pᵢ )
```

**Perplexity** is closely related and is the standard measure of how well a
language model predicts text:

```
perplexity = exp( −(1/N) · Σ log pᵢ )
```

Intuitively, perplexity is the "effective number of equally-likely choices"
the model faced at each token. **Lower perplexity means the model found your
text more predictable.**

---

## Tokenizers

How text is split into tokens deeply affects the results. Available choices:

- **Character** — every Unicode code point is a token. Great for small
  corpora and revealing letter-level patterns.
- **Whitespace word** — splits on whitespace; punctuation stays attached to
  words. Whitespace runs are kept as their own tokens.
- **Word + punctuation** — letters/numbers form word tokens; each punctuation
  mark is its own token.
- **Custom regex** — you supply the pattern. Handy presets include word +
  punctuation, whitespace runs, single characters, words-with-apostrophes,
  ASCII words + symbols, and a playful "vowel splits" pattern. Choosing a
  preset fills the pattern box, which you can then edit freely. Invalid
  patterns fall back safely to the default.

The regex fields only appear when the **Custom regex** tokenizer is selected.

---

## Settings Summary

| Setting              | Effect                                       | Rebuild? |
| -------------------- | -------------------------------------------- | :------: |
| Tokenizer            | How text is split into tokens                |   yes    |
| Regex preset/pattern | The pattern used by the regex tokenizer      |   yes    |
| Model order (n)      | How much context the model uses              |   yes    |
| Lowercase corpus     | Fold everything to lowercase before learning |   yes    |
| Smoothing k          | Add-k smoothing amount                       |   yes    |
| Combine strategy     | How forward + backward scores merge          |    no    |
| Backoff enabled      | Use shorter contexts when needed             |    no    |
| Floor probability    | Minimum probability floor                    |    no    |
| Top-N replacements   | How many candidates the popup lists          |    no    |
| Color scale          | Linear vs. log surprise mapping              |    no    |
| Palette              | Heat vs. Viridis colors                      |    no    |

Your settings are remembered between visits.

---

## A Few Ways to Use It

- **Spot anomalies** — build on "normal" text, then paste something suspect
  and watch the outliers light up.
- **Compare styles** — train on one author, test another; the heatmap and
  perplexity reveal stylistic distance.
- **Interactive rewriting** — use the replacement popup to nudge a sentence
  toward what the model considers natural.
- **Explore n-gram behavior** — vary the order and smoothing to feel how
  context length and data sparsity trade off.
