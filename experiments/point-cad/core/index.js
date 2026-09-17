// Public core API. Importing this module registers the built-in space,
// entity kind, constraint kinds and solver into the shared registry.
import { registry } from "./registry.js";
import { euclidean3 } from "./space-euclid3.js";
import { builtinConstraintKinds } from "./measures.js";
import { pointEntityKind } from "./model.js";
import { gaussNewtonSolver } from "./solver-gn.js";

if (!registry.hasSpace(euclidean3.id)) registry.registerSpace(euclidean3);
if (!registry.entityKinds.has(pointEntityKind.id)) registry.registerEntityKind(pointEntityKind);
for (const k of builtinConstraintKinds) if (!registry.hasConstraintKind(k.id)) registry.registerConstraintKind(k);
if (!registry.solvers.has(gaussNewtonSolver.id)) registry.registerSolver(gaussNewtonSolver);

export const solvers = { gaussNewton: gaussNewtonSolver };

export { registry, Registry } from "./registry.js";
export { Emitter } from "./events.js";
export { euclidean3 } from "./space-euclid3.js";
export { distanceKind, angleKind, builtinConstraintKinds } from "./measures.js";
export { gaussNewtonSolver, solveLinear, matrixRank } from "./solver-gn.js";
export { buildProblem, evaluateConstraints, statusFor, alignSketchFrame } from "./problem.js";
export { toJSON, toJSONString, fromJSON, migrate, sniffFormat, CURRENT_VERSION } from "./serialize.js";
export * from "./model.js";