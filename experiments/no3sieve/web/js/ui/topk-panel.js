// topk-panel.js — top-K browser (§5.5). Clicking flies to the window; every
// exported solution is re-verified client-side before the download is offered.
import {topWindows, windowPoints} from '../topk.js';
import {verify, verifyBruteForce} from '../verify.js';
import {toCSV, toTXTGrid, toJSON, download} from '../data/export.js';
import {createLogger} from '../util/log.js';

const log = createLogger('topk-panel');

export class TopKPanel {
    constructor(el, {onSelect}) {
        if (!el) throw new TypeError('TopKPanel: target element is required');
        if (typeof onSelect !== 'function') throw new TypeError('TopKPanel: onSelect callback is required');
        this.el = el;
        this.onSelect = onSelect;
        this.items = [];
        this.sel = -1;
        this.el.addEventListener('click', (e) => {
            try {
                const row = e.target.closest('.item');
                if (!row) return;
                const i = Number.parseInt(row.dataset.i, 10);
                if (!Number.isInteger(i) || i < 0 || i >= this.items.length) {
                    log.warn(`stale row index ${row.dataset.i}`);
                    return;
                }
                if (e.target.dataset.act) {
                    this._export(i, e.target.dataset.act);
                    return;
                }
                this.select(i);
            } catch (err) {
                log.error('top-K click handler failed:', err);
            }
        });
    }

    scan(ps, sizes, keep) {
        if (!ps || !ps.points) throw new TypeError('TopKPanel.scan: a point snapshot is required');
        if (!Array.isArray(sizes) || !sizes.length) throw new TypeError('TopKPanel.scan: sizes must be a non-empty array');
        if (!Number.isInteger(ps.rGen) || ps.rGen < 0) {
            this.el.textContent = 'nothing generated yet';
            return;
        }
        this.items = [];
        for (const s of sizes) {
            try {
                for (const w of topWindows(ps.points, ps.rGen, s, keep)) this.items.push(w);
            } catch (e) {
                log.error(`top-K scan failed for s=${s}:`, e);
            }
        }
        this.items.sort((a, b) => (b.c - a.c) || (b.pop - a.pop));
        this.ps = ps;
        this.sel = -1;
        log.info(`top-K: ${this.items.length} window(s) over sizes ${sizes.join(',')}`);
        this.render();
    }

    render() {
        if (!this.items.length) {
            this.el.textContent = 'no scan yet';
            return;
        }
        this.el.innerHTML = this.items.map((w, i) => `
          <div class="item ${i === this.sel ? 'sel' : ''}" data-i="${i}">
            <span>s=${w.s} pop=<b>${w.pop}</b> c=${w.c.toFixed(3)}</span>
            <span>(${w.x0},${w.y0})
              <button data-act="csv">csv</button><button data-act="txt">txt</button>
            </span>
          </div>`).join('');
    }

    select(i) {
        this.sel = i;
        this.render();
        const w = this.items[i];
        if (w) this.onSelect(w);
    }

    step(delta) {
        if (!this.items.length) return;
        this.select(Math.max(0, Math.min(this.items.length - 1, this.sel + delta)));
    }

    _export(i, kind) {
        const w = this.items[i];
        if (!w || !this.ps) {
            log.warn('export requested before a scan');
            return;
        }
        let pts, rep, bf;
        try {
            pts = windowPoints(this.ps.points, w.x0, w.y0, w.s);
            rep = verify(pts);
            bf = verifyBruteForce(pts);
        } catch (e) {
            log.error('window export aborted:', e);
            alert(`export failed: ${e && e.message ? e.message : e}`);
            return;
        }
        if (!rep.ok || !bf.ok) {
            log.error('window failed client-side verification', {rep, bf});
            alert('refusing to export: window failed client-side verification');
            return;
        }
        const base = `no3sieve_s${w.s}_pop${w.pop}_${w.x0}_${w.y0}`;
        if (kind !== 'csv' && kind !== 'txt') {
            log.warn(`unknown export action "${kind}"`);
            return;
        }
        if (kind === 'csv') {
            download(`${base}.csv`, 'text/csv', toCSV(pts, {withMeta: false}));
            download(`${base}.meta.json`, 'application/json', toJSON(pts, this.ps.config, {
                window: {s: w.s, origin_world: [w.x0, w.y0], pop: w.pop, c: w.c},
                brute_force: bf,
            }));
        } else {
            download(`${base}.txt`, 'text/plain', toTXTGrid(pts, 0, 0, w.s));
        }
    }
}