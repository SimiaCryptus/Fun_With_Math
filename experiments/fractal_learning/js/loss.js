// Symmetric Chamfer loss + regularizers. All differentiable via tf.js.

/**
 * Symmetric (squared) Chamfer between predicted points P [Np,2] and target Q [M,2].
 * Returns scalar loss.
 */
export function chamferLoss(P, Q, alpha = 1, beta = 1) {
  return tf.tidy(() => {
    // Pairwise squared distances [Np, M]
    // d_ij = ||P_i - Q_j||^2 = |P_i|^2 + |Q_j|^2 - 2 P_i.Q_j
    const Pn = tf.sum(tf.square(P), 1, true); // [Np,1]
    const Qn = tf.sum(tf.square(Q), 1, true); // [M,1]
    const cross = tf.matMul(P, Q, false, true); // [Np,M]
    const D = tf.add(tf.sub(Pn, tf.mul(cross, 2)), tf.transpose(Qn));
    // Forward (P -> Q) : min over j of D[i,j], mean over i
    let loss = tf.scalar(0);
    if (alpha !== 0) {
      const minPQ = tf.min(D, 1); // [Np]
      loss = tf.add(loss, tf.mul(tf.mean(minPQ), alpha));
    }
    if (beta !== 0) {
      const minQP = tf.min(D, 0); // [M]
      loss = tf.add(loss, tf.mul(tf.mean(minQP), beta));
    }
    return loss;
  });
}

/**
 * Regularizers on the IFS transforms.
 * @param {IFSModel} model
 */
export function regularizers(
  model,
  { lamA = 0, lamb = 0, lamC = 0, eps = 0.02 } = {},
) {
  return tf.tidy(() => {
    let r = tf.scalar(0);
    const sqrt2 = Math.SQRT2;
    for (const t of model.transforms) {
      const A = t.A,
        b = t.b;
      if (lamA !== 0) r = tf.add(r, tf.mul(tf.sum(tf.square(A)), lamA));
      if (lamb !== 0) r = tf.add(r, tf.mul(tf.sum(tf.square(b)), lamb));
      if (lamC !== 0) {
        const frob = tf.sqrt(tf.add(tf.sum(tf.square(A)), 1e-12));
        const target = tf.scalar(sqrt2 * (1 - eps));
        const ex = tf.relu(tf.sub(frob, target));
        r = tf.add(r, tf.mul(tf.square(ex), lamC));
      }
    }
    return r;
  });
}

/**
 * Full training loss builder (returns a closure that allocates target Q once).
 * @param {IFSModel} model
 * @param {number[][]} targetArr  list of [x,y]
 * @param {number[][]} words
 */
export function makeLossFn(model, targetArr, words, hparams) {
  const Q = tf.tensor2d(targetArr, [targetArr.length, 2]);
  const lossFn = () => {
    return tf.tidy(() => {
      const P = model.computeOrbit(words);
      const chamfer = chamferLoss(P, Q, hparams.alpha, hparams.beta);
      const reg = regularizers(model, hparams);
      return tf.add(chamfer, reg);
    });
  };
  lossFn.dispose = () => Q.dispose();
  return lossFn;
}
