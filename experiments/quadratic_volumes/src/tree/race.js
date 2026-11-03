// Decision-directed refinement (idea.md §6.2). Candidates expose
// evaluate() -> {gain:{lo,hi}, ...} and refine(budget) -> boxes used.

export function race(states, {
  budget = 8000, step = 750, onStep = null, maxRounds = 64,
} = {}) {
  let active = [];
  for (const s of states) {
    const r = s.evaluate();
    if (r && r.gain.hi > 0) active.push({ s, r });
  }
  let spent = 0;
  let rounds = 0;
  const snapshot = (note) =>
    onStep && onStep({
      note,
      bars: active.map((x) => ({
        label: x.r.label ?? x.s.label,
        family: x.r.family ?? x.s.family,
        lo: x.r.gain.lo,
        hi: x.r.gain.hi,
      })),
    });

  snapshot('start');
  while (active.length > 1 && spent < budget && rounds++ < maxRounds) {
    active.sort((a, b) => b.r.gain.lo - a.r.gain.lo);
    const lead = active[0];
    let rivalHi = -Infinity;
    for (let i = 1; i < active.length; i++) {
      rivalHi = Math.max(rivalHi, active[i].r.gain.hi);
    }
    if (lead.r.gain.lo >= rivalHi) break; // certified winner

    // refine the widest still-contested interval
    let pick = null, bw = -1;
    for (const x of active) {
      if (x.s.frozen) continue;
      if (x !== lead && x.r.gain.hi <= lead.r.gain.lo) continue;
      const w = x.r.gain.hi - x.r.gain.lo;
      if (w > bw) { bw = w; pick = x; }
    }
    if (!pick || bw <= 1e-9) break;

    const used = pick.s.refine(step);
    spent += Math.max(used, 1);
    pick.r = pick.s.evaluate() || pick.r;
    active = active.filter((x) => x.r.gain.hi > 0);
    snapshot('refine');
  }

  active.sort((a, b) => b.r.gain.lo - a.r.gain.lo);
  snapshot('done');
  const winner = active[0];
  return {
    winner: winner && winner.r.gain.lo > 0 ? winner.r : null,
    boxesSpent: spent,
    survivors: active.length,
  };
}