import { Store } from '../engine/store.js';
import { minimalTable, spectrum, records, topOps, toCSV, toJSON } from '../engine/projections.js';
import { treesFor, exampleTree } from '../engine/reconstruct.js';
import { costBound } from '../engine/aggregator.js';
import { canonicalize } from '../expr/canonical.js';
import { print } from '../expr/printer.js';
import { renderTree } from './tree-view.js';
import { drawChart } from './chart.js';

const PAGE = 50;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function initBrowser(root, getOps = () => ({})) {
  const $ = s => root.querySelector(s);
  let worker = null;
  let store = new Store();
  let rows = [];
  let sort = { key: 'n', dir: 1 };
  let page = 0;

  const example = r => r.example ??= print(canonicalize(exampleTree(store, r.n, r.cost)));

  function stop() {
    if (worker) { worker.terminate(); worker = null; }
    $('#b-run').disabled = false;
    $('#b-stop').disabled = true;
  }

  function refresh() {
    rows = minimalTable(store);
    renderTable();
    drawChart($('#b-chart'), rows);
    $('#b-records').innerHTML = '<h3>Records (within N)</h3><table><tr><th>k</th><th>smallest n</th><th>largest n</th></tr>' +
      records(rows).map(r => `<tr><td>${r.cost}</td><td>${r.smallest}</td><td>${r.largest}</td></tr>`).join('') + '</table>';
  }

  function renderTable() {
    const sorted = [...rows].sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir || a.n - b.n);
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
    page = Math.min(page, pages - 1);
    const slice = sorted.slice(page * PAGE, page * PAGE + PAGE);
    $('#b-table tbody').innerHTML = slice.map(r =>
      `<tr data-n="${r.n}"><td>${r.n}</td><td>${r.cost}</td><td>${r.count}</td><td class="expr">${esc(example(r))}</td></tr>`
    ).join('');
    $('#b-page').textContent = ` ${page + 1} / ${pages} `;
  }

  function showDetail(n) {
    const c = store.minCost(n);
    const reps = treesFor(store, n, c, 200);
    const spec = spectrum(store, n);
    const d = $('#b-detail');
    d.innerHTML = `<h3>n = ${n}, C(n) = ${c}</h3>
      <p>Top-level operators: ${topOps(store, n).join(', ')}</p>
      <p>Cost spectrum: ${Object.entries(spec).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
      <h4>Minimal canonical trees (${reps.length}${reps.length >= 200 ? '+' : ''})</h4>
      <ul class="reps">${reps.map(r => `<li>${esc(print(r))}</li>`).join('')}</ul>`;
    if (reps[0]) d.appendChild(renderTree(reps[0]));
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  $('#b-run').onclick = () => {
    stop();
    store = new Store(); rows = []; page = 0;
    $('#b-detail').innerHTML = '';
    const N = Math.max(1, +$('#b-N').value || 1);
    const K = $('#b-K').value ? +$('#b-K').value : costBound(N);
    const opts = {
      N, K,
      mode: $('#b-mode').value,
      minimalOnly: $('#b-minimal').checked,
      includeIdentity: $('#b-identity').checked,
       ops: getOps(),
    };
    worker = new Worker(new URL('../workers/aggregator.worker.js', import.meta.url), { type: 'module' });
    $('#b-run').disabled = true;
    $('#b-stop').disabled = false;
    worker.onmessage = ({ data }) => {
      if (data.type === 'level') {
        for (const e of data.entries) store.add(e);
        $('#b-progress').textContent = `cost ${data.level}/${data.K}, ${data.totalValues} values`;
        refresh();
      } else if (data.type === 'done') {
        $('#b-progress').textContent += ' — done';
        stop();
      } else if (data.type === 'error') {
        $('#b-progress').textContent = 'Error: ' + data.message;
        stop();
      }
    };
    worker.postMessage(opts);
  };
  $('#b-stop').onclick = () => { stop(); $('#b-progress').textContent += ' — stopped'; };

  $('#b-table thead').onclick = ev => {
    const key = ev.target.dataset.key;
    if (!key) return;
    sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: 1 };
    renderTable();
  };
  $('#b-table tbody').onclick = ev => {
    const tr = ev.target.closest('tr');
    if (tr) showDetail(+tr.dataset.n);
  };
  $('#b-prev').onclick = () => { page = Math.max(0, page - 1); renderTable(); };
  $('#b-next').onclick = () => { page++; renderTable(); };
  $('#b-json').onclick = () => { rows.forEach(example); download('circuits.json', toJSON(rows), 'application/json'); };
  $('#b-csv').onclick = () => { rows.forEach(example); download('circuits.csv', toCSV(rows), 'text/csv'); };
}