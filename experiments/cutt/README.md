# Coupled Uncertain Theory Trees

*An interactive demonstrator for learning from observations you are not sure about, and for being honest about what the data can and cannot tell you.*

---

## The problem in one paragraph

Most learning methods assume every measurement is a precise point and every label is certain. Real data rarely looks like that. A sensor reading has an error bar. A survey answer is "somewhere between 30 and 40". A lab value is missing, or only known to be "below the detection limit". An expert labels a case as "either A or B". The usual fix is to tidy the data first: take the midpoint, fill in an average, pick one label. Then the method learns from the tidied version as if it were the truth. That hides the uncertainty, and the model can end up sounding more confident than the evidence allows.

This project tries something different. It treats uncertainty as part of the data, and it uses what it learns to say more about the original observations.

## The core idea

**Each observation is a region, not a point.** If a value is known to lie between 0.3 and 0.5, the observation is that whole interval. With two features, it is a rectangle, or *box*. An exact measurement is a box of zero width. A missing value is a box that covers the whole range. One representation covers all of these cases.

**Each label is a set of possibilities.** "Class A" is a set with one member. "A or B" is a set with two. "Unknown" is the set of all classes.

**A decision tree cuts space into regions.** It asks simple questions such as "is x below 0.5?". When a tree cuts through an uncertain box, the box is split into **fragments**, one per region it overlaps. The method then asks: *given the labels and everything else we have seen, how likely is it that this observation was really in each fragment?*

That question has a useful consequence. Learning runs in both directions:

- **Forward:** uncertain observations help shape the tree.
- **Backward:** the tree, combined with the labels, constrains where each uncertain observation could have been. Sometimes that rules out parts of a box entirely. The observation becomes more precise as a result of what was learned from the others.

## Hard knowledge and soft preferences

The method keeps two kinds of knowledge strictly separate. We call this the **firewall**.

- **Hard knowledge** comes from clear evidence. If a region of space contains many well-measured observations and none of them belongs to class B, then a class-B observation probably did not come from there. That part of its box can be removed. This step is careful and statistical. It only shrinks boxes, and it never removes everything.
- **Soft preferences** are the model's best guesses. The model might lean toward "this point was probably on the left". That is a preference, not a measurement, and it is never allowed to harden into a fact.

The reason is simple. A model that is 99% sure where a point was has not measured that point. If its own guesses were fed back in as facts, it could talk itself into false certainty. Several safeguards exist specifically to stop this kind of self-reinforcement.

## More than one good explanation

Most methods return one answer. This one also asks: **what else could be true?**

After finding its preferred explanation, it searches for alternatives that fit the data almost as well but differ as much as possible. Then it reports:

- facts that hold under **every** good explanation, which are robust;
- facts that **depend** on which explanation you pick;
- facts the data simply **does not speak to**.

The most striking case is when several explanations make the **same predictions** but disagree about **where the observations actually were**. Prediction accuracy alone cannot tell these explanations apart. We call this a *latent Rashomon set*, after the film in which witnesses give equally plausible but conflicting accounts of the same event.

The project's guiding principle is: **not knowing is a valid answer.** A method that confidently picks an arbitrary answer to a question the data cannot settle has failed, however accurate it looks.

## Brief background

Decision trees are among the most interpretable tools in machine learning. Researchers have studied trees for uncertain data before, and the individual building blocks have established names: constraint propagation, EM-style estimation, Rashomon sets of near-optimal models. What is new here is the combination:

- each observation's fragmentation is kept as a persistent object;
- that object is solved together with the tree;
- hard and soft inference are separated firmly;
- the whole set of near-equally-good explanations is treated as a main result, not a side note.

The full specification is in `idea.md`, and the demonstrator's design is in `plan.md`.

## The demonstrator

The demonstrator is an interactive 3D view in a web browser. Its layout is meant to make the firewall visible.

- **On the floor** is hard knowledge: the observation boxes, the regions of the tree, and the parts of boxes that evidence has ruled out.
- **Above the floor** are soft beliefs. Column height shows how much belief the model places in each fragment. A flat "lid" shows what you would believe with no learning at all, so departures from it stand out.

### The screen

- **Left panel: choose and run.** Pick a scenario, adjust how noisy the data is, and choose a caution level: *strict*, *balanced*, or *exploratory*. Then step through the pipeline one stage at a time, or press **Run all**:
  1. **Compile.** Cut each box into fragments.
  2. **Rebuild tree.** In scenarios where the tree is learned, relearn it from the tightened boxes.
  3. **Support.** Shrink boxes using hard evidence. You can replay this sweep by sweep and watch the faces move inward.
  4. **Solve.** Distribute belief across the remaining fragments.
  5. **Challenge.** Search for alternative explanations.
  6. **Bounds.** Measure how much each belief could vary, then label each fact as robust, theory-dependent, or underdetermined.
- **Centre: the 3D scene.** Rotate and zoom. Switch views between data, partition, contraction, mass, theories, envelopes, and status. Click any observation to inspect it.
- **Right panel: what happened.** This panel has a plain-language narrative and automatic pass/fail checks for each scenario's claims. It shows scores compared with a "no learning" floor and a "best possible" ceiling. It also has a prediction map for each explanation and charts of how fit trades off against diversity.

### Things to try

- **Reveal truth.** Show where the points really were. This is for checking only, and the algorithm never sees it.
- **Width sweep.** Run the whole pipeline at increasing noise levels. You can watch the problem move from *solvable*, to *ambiguous*, to *genuinely unknowable*, and check that the method's confidence falls with it.
- **Safeguards.** Switch off a protection on purpose and watch the model become confidently wrong. A warning banner shows while a safeguard is off.
- **Export run.** Save everything for later.

### Scenarios

| Scenario | What it shows |
|---|---|
| Exact data | With perfect data, the method reduces to an ordinary decision tree. |
| Uncertain XOR | Noisy points are pulled back toward the right quadrant. |
| Redundant features | Two features explain the labels equally well, so two theories emerge. |
| Unidentifiable modes | The method refuses to guess when nothing in the data can decide. |
| Self-reinforcement | What goes wrong when safeguards are removed. |
| Circle | Curved boundaries and how quickly the number of fragments grows. |
| 3D parity | The same ideas in three dimensions. |
| Mixed types | Exact, noisy, censored, and missing values handled together. |
| Learned XOR | The tree is learned from the data instead of drawn by hand. |

## Why it is interesting

- **Data gets better, not just models.** The output includes tightened, more precise observations, each with a record of why every removed part was removed.
- **Honest uncertainty.** Every inferred fact is labelled by how it is known: observed, ruled out by evidence, robust across theories, dependent on a theory, or unsupported by the data.
- **Explanations, plural.** Seeing several equally good accounts of the same data is often more informative than one confident account.
- **Guidance on what to measure next.** When two explanations stay tied, the method can point to which uncertain value, if measured more precisely, would separate them.

## Who might find it useful

- **Scientists and engineers** with imprecise instruments, censored readings, or missing values, who want to know what their data really supports.
- **Clinicians and analysts** working with ranges, detection limits, or uncertain diagnoses, where false certainty is costly.
- **Anyone labelling data** with ambiguous or disputed labels.
- **Researchers in interpretable or trustworthy AI** interested in model multiplicity and calibrated uncertainty.
- **Teachers and students** who want to see why "the model is 95% accurate" is not the same as "the model knows".

## Current state

This is a research prototype. It works on small synthetic problems with known answers, so every claim can be checked against the truth. Several parts of the full specification are not built yet. These include a worst-case way of choosing tree splits, growing an existing tree locally instead of rebuilding it, and combining several candidate trees. Work on real datasets is planned.

## Trying it

Someone comfortable with a terminal can start a simple local web server in this folder with `python3 -m http.server 8000`. Then open `http://localhost:8000/index.html` in a browser. Opening the file directly from disk will not work. An internet connection is needed to load the 3D graphics library.