# games/emergensim/README_REWRITE.md
```markdown
# PROTOCOL: A Turn-Based Emergency Response Tactical Simulator

## What Is This?

PROTOCOL is an interactive, browser-based simulation that puts you in charge of
navigating a crisis — a chemistry lab fire, an active lockdown, a structural
emergency — one careful decision at a time. Rather than testing your reflexes
under real-time pressure, it asks you to *think*: where is the smoke going,
who's panicking, which door should stay shut, and what happens six turns from
now if you get it wrong?

It plays out on an isometric 3D map, like a tactics game, where you move your
character tile by tile, spend a small budget of "Action Points" each turn, and
watch fire, smoke, structural damage, and the people around you all react to
your choices — and to each other.

## The Idea Behind It

Most emergency-preparedness media falls into one of two traps: dry instructional
videos nobody remembers, or high-stress, graphic simulations that are
upsetting rather than educational. PROTOCOL tries a third path, inspired
loosely by classic turn-based strategy games and systemic simulators like
*The Oregon Trail* — games where the tension comes from *understanding a
system*, not from jump-scares or gore.

There is no blood, no graphic injury, and no real-time panic-button gameplay.
Danger is communicated instead through numbers, spreading hazards, and visible
consequences: smoke fills a hallway, a door gets hot to the touch, a
classmate's fear rises and they freeze in place. When someone can no longer
continue safely, they're simply marked as "evacuated" or "tagged" and removed
from the board — no dramatization, just a clear systemic outcome.

Every person on the map — including the crowd of non-player characters around
you — behaves according to an underlying psychological model built from five
simple traits: fear, greed, trust, rage, and cohesion. These combine
mathematically into behaviors like panic-freezing, fleeing, cooperating,
following instructions, or even bullying and conflict. Nothing is scripted;
it all *emerges* from the numbers, the same way real crowd behavior emerges
from real human psychology. Rumors and misinformation can even spread through
the crowd, getting distorted as frightened people pass them along — mirroring
how misinformation actually propagates during real emergencies.

## The "Autopsy" — Learning From What Happened

Perhaps the most distinctive feature is what happens *after* a scenario ends
(or even mid-scenario): the Autopsy view. This is a step-by-step causal
replay of everything that happened, explaining *why* it happened — "leaving
the fire door open let oxygen in, which accelerated the fire's spread into
the stairwell, which blocked the exit, which caused a crowd to reroute into a
smoke-filled hallway." You can even ask "what if" — rewind to an earlier
decision point and see how a different choice would have changed the
outcome. It turns every playthrough into a lesson, not just a score.

## The Interface

The screen is built like a tactical command console:

- A **3D isometric map** in the center, where you see the building, the fire,
  the smoke, and everyone in it — including what you can and cannot currently
  see (fog of war reveals things as you explore).
- A **status header** showing the current turn, scenario, alarm status, and
  estimated time until help arrives.
- A **side panel** with live readouts on your own condition, the people around
  you, active hazards, and your objectives.
- A **social log** narrating what NPCs are saying and doing, reflecting their
  internal emotional state in real time.
- An **action bar** at the bottom where you spend your limited Action Points
  each turn on things like moving, checking a door's temperature, barricading
  an exit, calming down a panicked bystander, or sounding the alarm.

Every action costs something, every choice has a ripple effect, and you can
always rewind a turn to try a different approach — because the point isn't to
punish failure, it's to explore cause and effect safely.

## Why It's Interesting

PROTOCOL treats an emergency not as a jump-scare gauntlet but as a *system* —
one governed by physics (heat, oxygen, structural load), by psychology (fear,
trust, group behavior), and by information flow (rumors, alarms, social
influence). Watching these systems interact produces surprisingly realistic,
often counterintuitive outcomes, and understanding *why* they happened is the
whole point of the experience.

It's a small case study in how a lot of real-world institutional failures
happen — not through single catastrophic mistakes, but through small
compounding decisions: a door left open, a rumor left uncorrected, a group
that didn't trust the plan.

## Who Might Enjoy or Use This

- **Students and educators** studying emergency preparedness, safety
  protocols (fire, lockdown, natural disaster), or civics/health curricula
  looking for a low-stress, non-graphic way to explore these topics.
- **Game design or simulation enthusiasts** curious about emergent NPC
  behavior systems, deterministic simulations, or turn-based tactical design
  outside of combat contexts.
- **People interested in crowd psychology or misinformation dynamics**, since
  the rumor-spreading and trait-driven behavior systems double as a light,
  playable model of how fear and trust shape group decision-making.
- **Anyone who enjoys systemic, puzzle-like strategy games** — if you like
  thinking several turns ahead and tracing consequences backward through a
  causal chain, this scratches a similar itch to logistics or tactics games,
  just applied to a very different subject.

Ultimately, PROTOCOL is less about "winning" an emergency and more about
building an intuition for how small decisions cascade into big outcomes —
and giving you the freedom to rewind, experiment, and learn from the
simulation without real-world stakes.
```