import {describe, it, assert, assertClose} from './harness.js';
import {Lattice} from '../src/model/lattice.js';
import {exportJSON, importJSON} from '../src/io/serialize.js';

describe('lattice: placement & hit-testing', () => {
    it('snaps world coordinates to the nearest cell', () => {
        const l = new Lattice(40, true);
        const c = l.worldToCell(58, -21);
        assert(c[0] === 1 && c[1] === -1, `got ${c}`);
        const w = l.cellToWorld(c);
        assert(w[0] === 40 && w[1] === -40, `got ${w}`);
    });

    it('allows fractional cells when snapping is off', () => {
        const l = new Lattice(40, false);
        const c = l.worldToCell(58, -21);
        assertClose(c[0], 1.45, 1e-9);
        assertClose(c[1], -0.525, 1e-9);
    });

    it('rejects out-of-bounds and overlapping placements', () => {
        const l = new Lattice(40, true, 2);
        assert(l.canPlace([3, 0]) !== null, 'outside extent');
        assert(l.canPlace([2, -2]) === null, 'corner is inside');
        l.add([0, 0]);
        assert(l.canPlace([0, 0]) !== null, 'duplicate');
        assert(l.canPlace([1, 0]) === null, 'neighbour ok');
        let threw = false;
        try {
            l.add([0, 0]);
        } catch {
            threw = true;
        }
        assert(threw, 'add should throw on invalid placement');
        assert(l.count === 1);
    });

    it('nearest() finds the closest magnet within a radius', () => {
        const l = new Lattice(40, true);
        l.add([0, 0]);
        l.add([1, 0]);
        const hit = l.nearest(35, 5);
        assert(hit && hit.idx === 1, 'closest to cell (1,0)');
        assertClose(hit.dist, Math.hypot(5, 5), 1e-12);
        assert(l.nearest(20, 0, 5) === null, 'nothing within 5px of the midpoint');
    });

    it('setExtent() removes magnets outside and bumps version', () => {
        const l = new Lattice(40, true, null);
        l.add([0, 0]);
        l.add([5, 0]);
        const v = l.version;
        const removed = l.setExtent(2);
        assert(removed === 1 && l.count === 1 && l.version > v);
        assert(l.magnets[0].cell[0] === 0);
    });

    it('ids keep increasing after explicit ids are added', () => {
        const l = new Lattice();
        l.add([0, 0], 0, 7);
        const mg = l.add([1, 0]);
        assert(mg.id === 8, `expected id 8, got ${mg.id}`);
    });
});

describe('io: JSON round-trip & validation', () => {
    it('export -> import preserves grid, params and magnets', () => {
        const l = new Lattice(32, true, 4);
        l.add([-1, 0], 0.6);
        l.add([1, 0], Math.PI - 0.6);
        const params = {k: 2.5, I: 0.7, gamma: 0.1, m: 1.2};
        const doc = importJSON(exportJSON(l, params));
        assert(doc.grid.pitch === 32 && doc.grid.snap === true && doc.grid.extent === 4);
        for (const key of Object.keys(params)) assertClose(doc.params[key], params[key], 1e-15, key);
        assert(doc.magnets.length === 2);
        const l2 = new Lattice(doc.grid.pitch, doc.grid.snap, doc.grid.extent);
        for (const mg of doc.magnets) l2.add(mg.cell, mg.theta, mg.id);
        for (let i = 0; i < 2; i++) {
            assert(l2.magnets[i].id === l.magnets[i].id);
            assert(l2.magnets[i].cell[0] === l.magnets[i].cell[0]);
            assert(l2.magnets[i].cell[1] === l.magnets[i].cell[1]);
            assertClose(l2.magnets[i].theta, l.magnets[i].theta, 1e-15);
        }
    });

    it('extent defaults to null when absent', () => {
        const doc = importJSON(
            JSON.stringify({
                version: 1,
                grid: {pitch: 20, snap: true},
                params: {k: 1, I: 1, gamma: 0, m: 1},
                magnets: [],
            }),
        );
        assert(doc.grid.extent === null);
    });

    it('rejects malformed documents with useful messages', () => {
        const base = {
            version: 1,
            grid: {pitch: 20, snap: true},
            params: {k: 1, I: 1, gamma: 0, m: 1},
            magnets: [{id: 0, cell: [0, 0], theta: 0}],
        };
        const expectThrow = (mutate, re) => {
            const d = JSON.parse(JSON.stringify(base));
            mutate(d);
            let msg = null;
            try {
                importJSON(JSON.stringify(d));
            } catch (e) {
                msg = e.message;
            }
            assert(msg && re.test(msg), `expected error matching ${re}, got "${msg}"`);
        };
        expectThrow((d) => (d.version = 2), /version/);
        expectThrow((d) => (d.grid.pitch = -1), /pitch/);
        expectThrow((d) => (d.grid.extent = -3), /extent/);
        expectThrow((d) => (d.magnets[0].cell = [0.5, 0]), /int,int/);
        expectThrow((d) => d.magnets.push({id: 0, cell: [1, 0], theta: 0}), /Duplicate/);
        expectThrow((d) => (d.params.k = 'x'), /params\.k/);
    });
});