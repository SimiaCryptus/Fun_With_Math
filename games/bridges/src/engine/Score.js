/**
 * Connection meter: fewest empty cells `player` still needs to link their two
 * arcs (own = 0, empty = 1, enemy = blocked).  Bucketed Dijkstra on the
 * adjacency graph; works for any tiling.
 */
export function connectionDistance(board, owner, player) {
  const arcs = board.arcs.filter(a => a.owner === player);
  if (arcs.length < 2) return Infinity;
  const n = board.cells.length;
  const D = new Int32Array(n).fill(0x3fffffff);
  const buckets = [];
  const push = (id, d) => { if (d < D[id]) { D[id] = d; (buckets[d] ??= []).push(id); } };
  const target = new Set(arcs[1].cells);
  for (const id of arcs[0].cells) {
    const o = owner[id];
    if (o === -1 || o === player) push(id, o === player ? 0 : 1);
  }
  for (let d = 0; d < buckets.length; d++) {
    const b = buckets[d];
    if (!b) continue;
    for (let k = 0; k < b.length; k++) {
      const id = b[k];
      if (D[id] !== d) continue;
      if (target.has(id)) return d;
      for (const nb of board.cells[id].neighbors) {
        const o = owner[nb];
        if (o !== -1 && o !== player) continue;
        push(nb, d + (o === player ? 0 : 1));
      }
    }
  }
  return Infinity;
}