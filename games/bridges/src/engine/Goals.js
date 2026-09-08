/** Pluggable win predicates.  `opposite` is an O(1) sentinel comparison. */
export function checkGoal(goal, player, game) {
  const arcs = game.board.arcs.filter(a => a.owner === player);
  if (arcs.length < 2) return false;
  const S = id => game.conn.sentinel(id);
  if (goal === 'fork') return arcs.every(a => game.conn.same(player, S(arcs[0].id), S(a.id)));
  return game.conn.same(player, S(arcs[0].id), S(arcs[1].id));
}