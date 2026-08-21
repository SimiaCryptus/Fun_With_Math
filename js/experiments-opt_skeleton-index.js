import { OptimizerLbfgs } from './js/optimizer-lbfgs.js';
import { OptimizerAdam } from './js/optimizer-adam.js';
import { OptimizerQQN } from './js/optimizer-qqn.js';

function trainStep() {
  if (!state.isTraining || !state.points) return;

  tf.tidy(() => {
    // 1. Project current points to manifold (Constraint)

    const lossFunction = () => {
      const projected = projectToGeometry(state.points, state.params.geometry, state.params, false);
      const { entropy, densities, distSq, mask } = computeEntropy(
        projected,
        state.params.tau,
        state.params.calcNeighbors
      );

      let loss;
      if (state.params.targetMode === 'maximize') {
        loss = tf.neg(entropy); // Minimize negative entropy
      } else if (state.params.targetMode === 'minimize') {
        loss = entropy;
      } else if (state.params.targetMode === 'neutral') {
        loss = tf.scalar(0);
      } else {
        const target = tf.scalar(state.params.targetVal);
        loss = tf.square(tf.sub(entropy, target));
      }
      // Interaction Force
      const force = state.params.interaction;
      if (Math.abs(force) > 1e-5) {
        if (force < 0) {
          // Repel: Minimize 1/distance
          const potential = tf.div(1.0, tf.add(distSq, 0.001));
          // Mask diagonal (self-interaction)
          let interactionMask = tf.sub(tf.onesLike(distSq), tf.eye(distSq.shape[0]));
          if (mask) {
            interactionMask = tf.mul(interactionMask, tf.cast(mask, 'float32'));
          }
          const repelLoss = tf.mean(tf.mul(potential, interactionMask));
          loss = tf.add(loss, tf.mul(repelLoss, Math.abs(force)));
        } else {
          // Attract: Minimize distance
          let interactionMask = tf.sub(tf.onesLike(distSq), tf.eye(distSq.shape[0]));
          if (mask) {
            interactionMask = tf.mul(interactionMask, tf.cast(mask, 'float32'));
          }
          const meanDist = tf.mean(tf.mul(distSq, interactionMask));
          loss = tf.add(loss, tf.mul(meanDist, force));
        }
      }
      // Custom Potential
      if (state.params.customFormula) {
        try {
          if (!state.customFunc) {
            state.customFunc = new Function(
              'rho',
              'p',
              'q',
              'D',
              'tf',
              'return ' + state.params.customFormula
            );
          }
          const pExp = projected.expandDims(1);
          const qExp = projected.expandDims(0);
          const res = state.customFunc(densities, pExp, qExp, distSq, tf);
          if (res) {
            if (res instanceof tf.Tensor) {
              loss = tf.add(loss, tf.sum(res));
            } else if (typeof res === 'number') {
              loss = tf.add(loss, res);
            }
          }
        } catch (e) {
          // Ignore runtime errors
        }
      }

      return loss;
    };

    // Compute gradients
    // We compute gradients w.r.t state.points, but the loss uses projected points.
    // TFJS handles the chain rule through the projection op.
    const { value: loss, grads } = state.optimizer.computeGradients(lossFunction);

    // Apply gradients
    state.optimizer.applyGradients(grads);

    // Hard constraint: Project points back to manifold after update
    const constrained = projectToGeometry(state.points, state.params.geometry, state.params, true);
    state.points.assign(constrained);

    // Update metrics
    const res = computeEntropy(state.points, state.params.tau, state.params.calcNeighbors);
    state.metrics.loss = loss.dataSync()[0];
    state.metrics.entropy = res.entropy.dataSync()[0];
    state.metrics.densities = res.densities.dataSync(); // For visualization
    // Calculate interaction for display
    let interactionVal = 0;
    const force = state.params.interaction;
    if (Math.abs(force) > 1e-5) {
      const distSq = res.distSq;
      if (force < 0) {
        const potential = tf.div(1.0, tf.add(distSq, 0.001));
        let interactionMask = tf.sub(tf.onesLike(distSq), tf.eye(distSq.shape[0]));
        if (res.mask) interactionMask = tf.mul(interactionMask, tf.cast(res.mask, 'float32'));
        interactionVal =
          tf.mean(tf.mul(potential, interactionMask)).dataSync()[0] * Math.abs(force);
      } else {
        let interactionMask = tf.sub(tf.onesLike(distSq), tf.eye(distSq.shape[0]));
        if (res.mask) interactionMask = tf.mul(interactionMask, tf.cast(res.mask, 'float32'));
        interactionVal = tf.mean(tf.mul(distSq, interactionMask)).dataSync()[0] * force;
      }
    }
    state.metrics.interaction = interactionVal;
    state.step++;
  });
}

// --- Initialization & Events ---
function createOptimizer() {
  if (state.params.optimizerType === 'adam') {
    return new OptimizerAdam(state.params.lr);
  } else if (state.params.optimizerType === 'qqn') {
    return new OptimizerQQN(state.params.lr);
  }
  return new OptimizerLbfgs(state.params.lr);
}
async function init() {
  try {
    await tf.ready();
    els.loading.classList.add('hidden');
    setupEventListeners();
    animate();
  } catch (err) {
    console.error(err);
    els.loading.innerHTML = `<div style="color:var(--danger)">Error: ${err.message}</div>`;
  }
}

init();
