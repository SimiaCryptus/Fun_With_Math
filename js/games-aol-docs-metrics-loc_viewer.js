const state = {
  data: [],
  filtered: [],
  sortKey: 'lines',
  sortDir: 'desc',
  extFilter: '',
  search: '',
  pathFilter: '',
  expandedDirs: new Set(['']),
};

const els = {
  search: document.getElementById('search'),
  extFilter: document.getElementById('extFilter'),
  fileInput: document.getElementById('fileInput'),
  reloadBtn: document.getElementById('reloadBtn'),
  summary: document.getElementById('summary'),
  extBars: document.getElementById('extBars'),
  filesBody: document.getElementById('filesBody'),
  rowCount: document.getElementById('rowCount'),
  empty: document.getElementById('empty'),
  table: document.getElementById('filesTable'),
  folderTreeBody: document.getElementById('folderTreeBody'),
  expandAllBtn: document.getElementById('expandAllBtn'),
  collapseAllBtn: document.getElementById('collapseAllBtn'),
  expandTopBtn: document.getElementById('expandTopBtn'),
};

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString();
}
function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

async function tryAutoLoad() {
  try {
    const r = await fetch('loc_index.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    loadData(data);
  } catch (e) {
    els.empty.style.display = 'block';
    els.empty.textContent =
      'Could not auto-load loc_index.json (' + e.message + '). Use the file picker above.';
  }
}

function loadData(data) {
  if (!Array.isArray(data)) {
    alert('Expected a JSON array of file entries.');
    return;
  }
  state.data = data.map((d) => ({
    path: d.path || '',
    ext: d.ext || '(none)',
    lines: +d.lines || 0,
    blank: +d.blank || 0,
    comment: +d.comment || 0,
    code: +d.code || 0,
    bytes: +d.bytes || 0,
  }));
  populateExtFilter();
  render();
}

function populateExtFilter() {
  const exts = Array.from(new Set(state.data.map((d) => d.ext))).sort();
  els.extFilter.innerHTML =
    '<option value="">All extensions</option>' +
    exts.map((e) => `<option value="${e}">${e}</option>`).join('');
  els.extFilter.value = state.extFilter;
}

function applyFilters() {
  const q = state.search.toLowerCase();
  const pf = state.pathFilter.toLowerCase();
  state.filtered = state.data.filter((d) => {
    if (state.extFilter && d.ext !== state.extFilter) return false;
    if (q && !d.path.toLowerCase().includes(q)) return false;
    if (pf && !d.path.toLowerCase().startsWith(pf)) return false;
    return true;
  });
  const { sortKey, sortDir } = state;
  const dir = sortDir === 'asc' ? 1 : -1;
  state.filtered.sort((a, b) => {
    const va = a[sortKey],
      vb = b[sortKey];
    if (typeof va === 'string') return va.localeCompare(vb) * dir;
    return (va - vb) * dir;
  });
}

function render() {
  applyFilters();
  renderSummary();
  renderExtBars();
  renderFolderTree();
  renderTable();
  renderSortIndicators();
}

function aggregate(rows) {
  const agg = { files: rows.length, lines: 0, code: 0, comment: 0, blank: 0, bytes: 0 };
  for (const r of rows) {
    agg.lines += r.lines;
    agg.code += r.code;
    agg.comment += r.comment;
    agg.blank += r.blank;
    agg.bytes += r.bytes;
  }
  return agg;
}

function renderSummary() {
  const a = aggregate(state.filtered);
  const cards = [
    ['Files', fmt(a.files)],
    ['Total Lines', fmt(a.lines)],
    ['Code', fmt(a.code)],
    ['Comments', fmt(a.comment)],
    ['Blank', fmt(a.blank)],
    ['Size', fmtBytes(a.bytes)],
  ];
  els.summary.innerHTML = cards
    .map(
      ([l, v]) =>
        `<div class="card"><div class="label">${l}</div><div class="value">${v}</div></div>`
    )
    .join('');
}

function renderExtBars() {
  const byExt = {};
  for (const r of state.filtered) {
    if (!byExt[r.ext])
      byExt[r.ext] = {
        ext: r.ext,
        files: 0,
        lines: 0,
        code: 0,
        comment: 0,
        blank: 0,
        bytes: 0,
      };
    const b = byExt[r.ext];
    b.files++;
    b.lines += r.lines;
    b.code += r.code;
    b.comment += r.comment;
    b.blank += r.blank;
    b.bytes += r.bytes;
  }
  const arr = Object.values(byExt).sort((a, b) => b.lines - a.lines);
  const max = arr.reduce((m, x) => Math.max(m, x.lines), 0) || 1;

  els.extBars.innerHTML = arr
    .map((b) => {
      const w = (b.lines / max) * 100;
      const codePct = b.lines ? (b.code / b.lines) * 100 : 0;
      const cmtPct = b.lines ? (b.comment / b.lines) * 100 : 0;
      const blkPct = b.lines ? (b.blank / b.lines) * 100 : 0;
      const active = state.extFilter === b.ext ? 'active' : '';
      return `
    <div class="ext-bar ${active}" data-ext="${b.ext}">
      <div class="name">.${b.ext}</div>
      <div class="bar-track" style="width: ${w}%; min-width: 40px;">
        <div class="bar-seg bar-code" style="width:${codePct}%"></div>
        <div class="bar-seg bar-cmt"  style="width:${cmtPct}%"></div>
        <div class="bar-seg bar-blk"  style="width:${blkPct}%"></div>
      </div>
      <div class="meta">${fmt(b.files)} files · ${fmt(b.lines)} lines</div>
    </div>`;
    })
    .join('');

  els.extBars.querySelectorAll('.ext-bar').forEach((el) => {
    el.addEventListener('click', () => {
      const ext = el.dataset.ext;
      state.extFilter = state.extFilter === ext ? '' : ext;
      els.extFilter.value = state.extFilter;
      render();
    });
  });
}
// --- Folder tree ---
function buildFolderTree(rows) {
  // Root node represents project root ("")
  const root = {
    name: '',
    path: '',
    isDir: true,
    children: {},
    files: 0,
    lines: 0,
    code: 0,
    comment: 0,
    blank: 0,
    bytes: 0,
  };
  for (const r of rows) {
    const parts = r.path.split(/[\/\\]/).filter(Boolean);
    let node = root;
    node.files++;
    node.lines += r.lines;
    node.code += r.code;
    node.comment += r.comment;
    node.blank += r.blank;
    node.bytes += r.bytes;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      acc = acc ? acc + '/' + part : part;
      if (!node.children[part]) {
        node.children[part] = isLast
          ? {
              name: part,
              path: acc,
              isDir: false,
              entry: r,
              files: 1,
              lines: r.lines,
              code: r.code,
              comment: r.comment,
              blank: r.blank,
              bytes: r.bytes,
            }
          : {
              name: part,
              path: acc,
              isDir: true,
              children: {},
              files: 0,
              lines: 0,
              code: 0,
              comment: 0,
              blank: 0,
              bytes: 0,
            };
      }
      node = node.children[part];
      if (!isLast) {
        node.files++;
        node.lines += r.lines;
        node.code += r.code;
        node.comment += r.comment;
        node.blank += r.blank;
        node.bytes += r.bytes;
      }
    }
  }
  return root;
}
function renderFolderTree() {
  const root = buildFolderTree(state.filtered);
  const out = [];
  function emit(node, depth) {
    if (node !== root) {
      const expanded = state.expandedDirs.has(node.path);
      const indent = depth * 16;
      const cls = node.isDir ? 'dir' : 'file';
      const expCls = expanded ? 'expanded' : '';
      const twisty = node.isDir ? '▶' : '•';
      const labelPrefix = node.isDir ? '📁 ' : '📄 ';
      out.push(`
     <div class="tree-row ${cls} ${expCls}" data-path="${escapeHtml(node.path)}" data-isdir="${node.isDir}" style="padding-left:${6 + indent}px;">
       <div class="label"><span class="twisty">${twisty}</span> ${labelPrefix}${escapeHtml(node.name)}</div>
       <div class="num">${node.isDir ? fmt(node.files) : ''}</div>
       <div class="num lines">${fmt(node.lines)}</div>
       <div class="num">${fmt(node.code)}</div>
       <div class="num">${fmt(node.comment)}</div>
       <div class="num">${fmtBytes(node.bytes)}</div>
     </div>`);
    }
    if (node.isDir && (node === root || state.expandedDirs.has(node.path))) {
      const kids = Object.values(node.children).sort((a, b) => {
        // Directories first, then by lines desc
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return b.lines - a.lines;
      });
      for (const k of kids) emit(k, node === root ? 0 : depth + 1);
    }
  }
  emit(root, 0);
  els.folderTreeBody.innerHTML =
    out.join('') ||
    `<div style="padding:20px;text-align:center;color:var(--muted);">No folders match.</div>`;
  els.folderTreeBody.querySelectorAll('.tree-row').forEach((el) => {
    const path = el.dataset.path;
    const isDir = el.dataset.isdir === 'true';
    const labelEl = el.querySelector('.label');
    if (isDir) {
      // Click twisty/row toggles expansion.
      el.addEventListener('click', (e) => {
        if (e.target.closest('.label') && e.shiftKey) {
          // Shift-click on label filters instead.
          state.pathFilter = state.pathFilter === path + '/' ? '' : path + '/';
          render();
          return;
        }
        if (state.expandedDirs.has(path)) state.expandedDirs.delete(path);
        else state.expandedDirs.add(path);
        renderFolderTree();
      });
      // Double-click on dir label filters file table.
      labelEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        state.pathFilter = state.pathFilter === path + '/' ? '' : path + '/';
        render();
      });
    }
  });
}
function collectAllDirPaths(rows) {
  const dirs = new Set(['']);
  for (const r of rows) {
    const parts = r.path.split(/[\/\\]/).filter(Boolean);
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? acc + '/' + parts[i] : parts[i];
      dirs.add(acc);
    }
  }
  return dirs;
}
function collectTopLevelDirs(rows) {
  const dirs = new Set(['']);
  for (const r of rows) {
    const parts = r.path.split(/[\/\\]/).filter(Boolean);
    if (parts.length > 1) dirs.add(parts[0]);
  }
  return dirs;
}

function renderTable() {
  const rows = state.filtered;
  els.rowCount.textContent = `(${rows.length} of ${state.data.length})`;
  if (!rows.length) {
    els.filesBody.innerHTML = '';
    els.empty.style.display = 'block';
    els.empty.textContent = 'No files match your filters.';
    return;
  }
  els.empty.style.display = 'none';
  // Limit to 2000 rows for performance.
  const MAX = 2000;
  const slice = rows.slice(0, MAX);
  els.filesBody.innerHTML = slice
    .map(
      (r) => `
  <tr>
    <td class="path" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</td>
    <td class="ext">${escapeHtml(r.ext)}</td>
    <td class="num">${fmt(r.lines)}</td>
    <td class="num">${fmt(r.code)}</td>
    <td class="num">${fmt(r.comment)}</td>
    <td class="num">${fmt(r.blank)}</td>
    <td class="num">${fmtBytes(r.bytes)}</td>
  </tr>`
    )
    .join('');
  if (rows.length > MAX) {
    els.filesBody.innerHTML += `<tr><td colspan="7" style="text-align:center;color:var(--muted);">…${rows.length - MAX} more rows hidden (refine filter)…</td></tr>`;
  }
}

function renderSortIndicators() {
  els.table.querySelectorAll('thead th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.key === state.sortKey) {
      th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Event wiring ---
els.search.addEventListener('input', (e) => {
  state.search = e.target.value;
  render();
});
els.extFilter.addEventListener('change', (e) => {
  state.extFilter = e.target.value;
  render();
});
els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      loadData(JSON.parse(ev.target.result));
    } catch (err) {
      alert('Failed to parse JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
});
els.reloadBtn.addEventListener('click', tryAutoLoad);
els.expandAllBtn.addEventListener('click', () => {
  state.expandedDirs = collectAllDirPaths(state.data);
  renderFolderTree();
});
els.collapseAllBtn.addEventListener('click', () => {
  state.expandedDirs = new Set(['']);
  renderFolderTree();
});
els.expandTopBtn.addEventListener('click', () => {
  state.expandedDirs = collectTopLevelDirs(state.data);
  renderFolderTree();
});
els.table.querySelectorAll('thead th').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDir = key === 'path' || key === 'ext' ? 'asc' : 'desc';
    }
    render();
  });
});

// Drag & drop support.
window.addEventListener('dragover', (e) => {
  e.preventDefault();
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      loadData(JSON.parse(ev.target.result));
    } catch (err) {
      alert('Failed to parse JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
});

tryAutoLoad();
