// Node test entrypoint: `node test/run.js`
import './physics.test.js';
import './integrator.test.js';
import './analysis.test.js';
import './lattice.test.js';
import {summary} from './harness.js';

summary();