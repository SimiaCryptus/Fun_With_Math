# Text Block

_A live, glowing look inside the machinery of text compression and search._

## What this is

Text Block is a small interactive toy that turns a piece of text into a picture.
Type any word or sentence into the box, and you'll see every possible "rotation"
of that text — the same letters, read starting from each position in turn —
laid out as rows in a grid and sorted alphabetically. It looks a bit like a
screensaver from *The Matrix*, all glowing green monospace characters on a
black background, but underneath it is a real and famous piece of computer
science: the **Burrows–Wheeler Transform**, the algorithm at the heart of tools
like `bzip2` and a key building block of modern DNA sequence search.

A companion mode goes a step further. Instead of just sorting the text, it
*learns* a small numeric fingerprint — a vector — for every single character
position in your text, based purely on which characters tend to sit near which
others in that sorted grid. No dictionaries, no labels, no outside knowledge:
just the shape of the text talking to itself. Watch it settle in real time, in
a scatter plot, and you start to see things like vowels drifting toward other
vowels, or repeated words clumping into visible "tracks."

## A little background, gently

Take a word, say `banana`, and imagine wrapping it into a loop so that after
the last letter you circle back to the first. Now write down every way of
reading that loop, starting from each letter: `banana`, `ananab`, `nanaba`,
and so on. If you sort those six rows alphabetically, something surprising
happens: the *last column* of the sorted grid — one letter from each row —
turns out to be a scrambled version of the original text that is often much
easier to compress, and, remarkably, can be un-scrambled to recover the
original perfectly. That last column is the Burrows–Wheeler Transform. It's
the same idea used in file compression, and a close cousin of it underlies the
suffix arrays used to search enormous genomes in fractions of a second.

Text Block lets you *see* this instead of reading about it. You can watch the
grid resort itself as you type, drag it sideways to reveal the characters that
come before as well as after each starting point, and click on any letter to
trace that one specific occurrence of it as a thread running through every
row. It turns an abstract algorithm into something you can poke at with a
mouse.

The embedding mode pushes the idea further, into the territory of modern
machine learning. Every position in the grid gets a random starting point in
space, and then a simple learning process nudges positions that sit near each
other in the sorted grid to have similar vectors, while a separate rule stops
everything from collapsing into an identical point. This is a tiny, fully
visible relative of the techniques used to train word embeddings and modern
language models — the same basic instinct that "you can tell a lot about a
character by the company it keeps," just made small enough to watch happen on
screen with no black boxes.

## Why it's interesting

- **It makes an abstract algorithm tangible.** The Burrows–Wheeler Transform
  is usually explained with tables and formulas. Here, you can type your own
  text, watch it re-sort itself letter by letter, and drag the grid around to
  build an intuition that's hard to get from a textbook description alone.
- **It shows compression and search sharing a root idea.** The same sorted
  structure that makes text compressible is also what makes it searchable in
  genome analysis and full-text search engines. Seeing them come from the
  same picture is satisfying in a way that reading two separate explanations
  isn't.
- **It demystifies "learned representations."** Vector embeddings are
  everywhere in modern AI, usually as an invisible step buried inside a huge
  model. This project builds one from scratch, in the open, from nothing but
  a single short string of text, so you can watch the vectors move, cluster,
  and settle in real time.
- **It rewards curiosity.** Try typing a repeated phrase, a palindrome, or a
  string of the same letter, and see what happens. Small, playful experiments
  like this often reveal the character of an algorithm faster than any amount
  of reading.

## Who might enjoy this

- Students or hobbyists learning about data compression, string algorithms,
  or bioinformatics, who want a hands-on way to build intuition rather than
  just following pseudocode.
- Teachers or workshop leaders looking for a visual, explorable demonstration
  of the Burrows–Wheeler Transform or of graph-based embedding techniques.
- People curious about machine learning who have heard the phrase "vector
  embedding" many times and would like to see, concretely and without any
  hidden neural network, what that actually looks like from the inside.
- Anyone who enjoys small, elegant, self-contained interactive toys — this
  one runs entirely in a browser tab, with no installation, no server, and no
  external libraries.

## A note on scope

This is an experiment, not a production tool. It works best on short strings
(up to a couple hundred characters) so that the grid stays visually readable
and the learned embeddings stay fast to compute. The point isn't to process
large documents — it's to make a beautiful, small window into how these
algorithms actually behave, one character at a time.