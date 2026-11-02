// §5.7 epistemic classification with the evidence test.
export const STATUS = ['Observed', 'Excluded', 'Forced', 'Robust', 'Theory-dependent', 'Underdetermined'];
export const ST = { OBSERVED: 0, EXCLUDED: 1, FORCED: 2, ROBUST: 3, THEORY: 4, UNDER: 5 };

export function classify(T, rawSingle, ens, bnd, prm, which = 'local') {
  const lo = which === 'ensemble' ? bnd.eLo : bnd.lLo;
  const hi = which === 'ensemble' ? bnd.eHi : bnd.lHi;
  const frag = new Uint8Array(T.n), obs = new Uint8Array(T.N), evidenceFail = new Uint8Array(T.N);
  const w0 = ens[0].w;
  for (let i = 0; i < T.N; i++) {
    const s = T.start[i], e = T.start[i + 1];
    const ev = bnd.evidence[i] > prm.kappaU;
    evidenceFail[i] = ev ? 0 : 1;
    const tally = new Float64Array(6);
    for (let f = s; f < e; f++) {
      let st;
      if (rawSingle[i]) st = ST.OBSERVED;
      else if (e - s === 1) st = ST.FORCED; // pinned by hard support (contracted to one leaf)
      else if (!ev) st = ST.UNDER;
      else if (lo[f] >= 1 - prm.kappaF) st = ST.FORCED;
      else if (hi[f] - lo[f] <= prm.kappaR) st = ST.ROBUST;
      else {
        const spread = bnd.eHi[f] - bnd.eLo[f];
        let nearPrior = true;
        for (const th of ens) if (Math.abs(th.w[f] - T.pi[f]) > prm.kappaR) nearPrior = false;
        st = spread > prm.kappaR || !nearPrior ? ST.THEORY : ST.UNDER;
      }
      frag[f] = st;
      tally[st] += w0[f];
    }
    let b = 0;
    for (let k = 1; k < 6; k++) if (tally[k] > tally[b]) b = k;
    obs[i] = b;
  }
  return { frag, obs, evidenceFail, which };
}