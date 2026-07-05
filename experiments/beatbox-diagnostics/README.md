# Vocal Parkour — Live Diagnostics

I recently put together a live diagnostics view for
[Vocal Parkour](https://vp.cognotik.com/), a browser-based rhythm game
played not with a controller or a keyboard, but with your _mouth_. You
hiss, you hum, you pop, you make an airy little "whoosh" — and a real-time
audio engine listens, frame by frame, and tries to figure out which sound
you just made. This page is the window into that engine; it's where you can
watch the classifier think out loud.

> **Try it:** [vp.cognotik.com/#/diagnostics](https://vp.cognotik.com/#/diagnostics)
>
> You'll be asked for microphone access. Nothing you say ever leaves your
> device — the signal is analyzed entirely in your browser, and anything you
> record to train it stays in local storage. So feel free to make silly
> noises; no one is listening but the math.

## Why this is interesting

We tend to think of voice interfaces as things that recognize _words_. But
words are only a sliver of what the human vocal tract can do. It turns out
that non-speech mouth sounds — a hiss, a hum, a pop — are surprisingly easy
to tell apart if you look at the right features of the sound, and they make
for a wonderfully immediate, physical way to play a game. There's no
vocabulary to learn and no language barrier; you just make a noise and see
it register instantly.

What I find genuinely delightful here is watching an abstract idea become
tangible. Sound is invisible and fleeting, yet on this page you can see it:
a shape on a radar plot, a scrolling ribbon of history, a needle that jumps
when you change pitch. It's the kind of thing that makes an intuition
click. That's really what the diagnostics panel is for — turning a
black-box classifier into a glass one.

## What you'll see on the page

- **A live feature visualizer.** As you make a sound, a radar plot redraws
  itself to show the "fingerprint" of what you're doing — how bright or
  breathy or noisy it is — alongside a scrolling history strip and a
  real-time pitch readout. Hum a rising note and watch the pitch climb.
- **Per-sound practice and calibration.** You can teach the engine _your_
  voice. Pick a sound, hold it (or tap it in rhythm through a guided
  panel), and it captures examples to learn from. Everyone's hiss is a
  little different; this is how the game meets you where you are.
- **A look at the raw data.** For the curious, you can browse — and export —
  the actual collection of examples it has gathered, and see the numbers
  behind the pretty pictures.
- **Fine-grained tuning.** If you want to get under the hood, there are
  controls for how sensitive the microphone gate is, how loud a sound has
  to be to count, which frequency ranges matter, and how the pitch tracker
  behaves — with an auto-calibration assistant to do the fiddly parts for
  you.

## A little about how it works

You don't need any of this to enjoy the page, but here's the gist for the
curious. Your microphone feeds a small audio engine that chops the incoming
sound into short frames and, for each one, measures a handful of
descriptive qualities — roughly, _how bright is it, how noisy versus tonal,
how much energy, is there a sudden onset, and what pitch (if any) can we
hear?_ That little bundle of numbers is the sound's fingerprint.

From there, the engine compares each fingerprint either against a set of
hand-tuned reference sounds or against a small model trained in your browser
on your own examples, and decides: hiss, hum, pop, or something you taught
it yourself. Those decisions are what drive the game.

One nice detail: because a fingerprint only means something relative to the
exact settings that produced it, the app quietly notices when you've changed
those settings and throws out stale training data rather than letting your
detection silently get worse. It's a small piece of honesty in the plumbing
that I'm rather fond of.

## Who might enjoy this

- **The simply curious**, who want to make noises at their computer and
  watch something react in real time (a surprisingly satisfying way to
  spend a few minutes).
- **Players of the game**, who want to calibrate detection to their own
  voice and microphone so it feels responsive.
- **Tinkerers, students, and audio-curious folks**, who want to _see_ how a
  sound gets turned into a decision — the visualizer makes a good little
  teaching tool for how audio classification works.
- **Anyone thinking about accessible or hands-free interfaces**, since
  voice-gesture control is a fun corner of that space.

## Where to go next

This diagnostics view is really the workshop behind
[Vocal Parkour](https://vp.cognotik.com/) — a sister project to
Mathematical Explorations. If you'd rather just play, start with the full
game, which adds calibration, a custom sound library, and the rhythm rail
the whole thing is built around.

Grant the mic, make a hiss, and watch it light up. Enjoy!
