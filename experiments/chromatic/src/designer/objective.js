// (Illustrative reference — merge these additions into your existing
  // compileObjective. Names like buildPoints/varMap/nodeIndex should match
  // whatever your current file already uses.)

  import {
    anchorError,
    lengthGroupError,
    angleGroupError,
    lengthBoundError,
    axisLockError,
    linkLength,
  } from '../solver/constraints.js';

  const SPACE_AXES = {
    OKLch: ['lightness', 'chroma', 'hue'],
    OKLab: ['L', 'a', 'b'],
  };

  export function compileObjective(doc) {
    // ... existing var-map / nodeIndex setup ...
    // varMap.pack() -> flat vector of free OKLab coords
    // buildPoints(vec) -> array of { L, a, b } indexed the same as constraints

    const nodeIndex = new Map(doc.nodes.map((n, i) => [n.id, i]));
    const spaceAxes = SPACE_AXES[doc.viewer.space];
    // Lengths measured in full 3D to match the UI's linkLength readout:
    const lengthAxes = undefined;

    // Pre-translate constraints into index-based descriptors -------------

    const anchorConstraints = [];
    doc.nodes.forEach((node) => {
      node.anchors.forEach((a) => {
        anchorConstraints.push({
          node: nodeIndex.get(node.id),
          dimension: a.dimension,
          target: a.target,
          weight: a.weight ?? 1,
          hard: !!a.hard,
        });
      });
    });

    // NEW: per-link length bounds
    const boundConstraints = [];
    doc.links.forEach((link) => {
      if (link.minLength == null && link.maxLength == null) return;
      const ia = nodeIndex.get(link.a);
      const ib = nodeIndex.get(link.b);
      if (ia == null || ib == null) return;
      boundConstraints.push({
        a: ia,
        b: ib,
        minLength: link.minLength ?? null,
        maxLength: link.maxLength ?? null,
        weight: 1,
      });
    });

    // NEW: per-link axis locks
    const lockConstraints = [];
    doc.links.forEach((link) => {
      if (!link.lockAxis) return;
      const ia = nodeIndex.get(link.a);
      const ib = nodeIndex.get(link.b);
      if (ia == null || ib == null) return;
      lockConstraints.push({ a: ia, b: ib, lockAxis: link.lockAxis, weight: 1 });
    });

    // Group descriptors: reuse your existing translation, e.g.
    const groupConstraints = doc.groups.map((g) => ({
      id: g.id,
      kind: g.kind,
      mode: g.mode,
      target: g.target,
      weight: g.weight ?? 1,
      links: g.linkIds
        .map((lid) => doc.links.find((l) => l.id === lid))
        .filter(Boolean)
        .map((l) => [nodeIndex.get(l.a), nodeIndex.get(l.b)]),
    }));

    // Hard constraints get a large multiplier so the descent respects them.
    const HARD_W = 1e4;

    // Scalar objective ---------------------------------------------------
    function objective(vec) {
      const points = buildPoints(vec); // <- your existing reconstruction

      let J = 0;

      for (const c of anchorConstraints) {
        const e = anchorError(points, c);
        J += c.hard ? HARD_W * e : e;
      }

      // NEW terms
      for (const c of boundConstraints) {
        J += lengthBoundError(points, c, lengthAxes);
      }
      for (const c of lockConstraints) {
        J += axisLockError(points, c, spaceAxes);
      }

      for (const g of groupConstraints) {
        if (g.kind === 'length') J += lengthGroupError(points, g, lengthAxes);
        else if (g.kind === 'angle') J += angleGroupError(points, g, doc.viewer.planeAxes);
      }

      // ... plus any gamut / regularization terms you already add ...
      return J;
    }

    // Residual report (feeds residualCache + the constraints panel) ------
    function residuals(vec) {
      const points = buildPoints(vec);

      const anchors = anchorConstraints.map((c) => ({
        node: doc.nodes[c.node].id,
        dimension: c.dimension,
        error: Math.abs(
          // reuse readDimension via a tiny inline; or import it
          Math.sqrt(anchorError(points, { ...c, weight: 1 }))
        ),
      }));

      const groups = groupConstraints.map((g) => {
        const lens = g.links.map(([i, j]) => linkLength(points[i], points[j], lengthAxes));
        const err =
          g.kind === 'length'
            ? Math.sqrt(lengthGroupError(points, g, lengthAxes))
            : Math.sqrt(angleGroupError(points, g, doc.viewer.planeAxes));
        return {
          group: g.id,
          error: err,
          members:
            g.kind === 'length'
              ? lens
              : g.links.map(([i, j]) => {
                  // angle members in degrees for the panel
                  const [xa, ya] = doc.viewer.planeAxes;
                  // ... compute via linkAngle if you prefer ...
                  return 0;
                }),
        };
      });

      // NEW: expose bound/lock residuals too, if you want the panel to read
      // them from residualCache instead of recomputing locally.
      const bounds = boundConstraints.map((c) => ({
        a: doc.nodes[c.a].id,
        b: doc.nodes[c.b].id,
        error: Math.sqrt(lengthBoundError(points, c, lengthAxes)),
      }));
      const locks = lockConstraints.map((c) => ({
        a: doc.nodes[c.a].id,
        b: doc.nodes[c.b].id,
        error: Math.sqrt(axisLockError(points, c, spaceAxes)),
      }));

      let total = objective(vec);

      return { total, anchors, groups, bounds, locks, worstNode: null, worstGroup: null };
    }

    return { objective, residuals, varMap /* your existing varMap */ };
  }