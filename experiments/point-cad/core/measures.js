// Built-in constraint kinds. `measure(coords, space)` receives the
// coordinate arrays of the constrained points (in constraint order) and the
// active space; it never touches coordinates directly.

export const distanceKind = {
  id: "distance",
  arity: { points: 2 },
  spaces: "*",
  unit: "length",
  syntax: "distance <A> <B>",
  description: "Geodesic distance between two points",
  measure(coords, space) {
    return space.distance(coords[0], coords[1]);
  },
};

export const angleKind = {
  id: "angle",
  arity: { points: 3 },
  spaces: "*",
  unit: "angle",
  syntax: "angle <A> <B> <C>",
  description: "Interior angle at the middle point B of the triplet A B C",
  measure(coords, space) {
    return space.angle(coords[0], coords[1], coords[2]);
  },
};

export const builtinConstraintKinds = [distanceKind, angleKind];