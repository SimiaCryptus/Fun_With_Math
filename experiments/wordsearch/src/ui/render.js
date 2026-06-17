// Render a grid to the DOM and to PNG.

/**
 * Render grid into a container as a table of cells.
 * @param {HTMLElement} container
 * @param {import('../grid/Grid.js').Grid} grid
 * @param {object} [opts]
 * @param {boolean} [opts.debug] highlight locked cells
 */
export function renderGrid(container, grid, opts = {}) {
  const { debug = false, lattice = 'square' } = opts;
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = `ws-grid ws-lattice-${lattice}`;
  for (let y = 0; y < grid.height; y++) {
    const tr = document.createElement('tr');
    if (lattice === 'hex' || lattice === 'triangular') {
      tr.classList.toggle('odd-row', (y & 1) === 1);
    }
    for (let x = 0; x < grid.width; x++) {
      const td = document.createElement('td');
      td.textContent = (grid.get(x, y) || '').toUpperCase();
      if (debug && grid.isLocked(x, y)) td.classList.add('locked');
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  container.appendChild(table);
}

/**
 * Export grid to a PNG data URL via canvas.
 * @param {import('../grid/Grid.js').Grid} grid
 * @param {number} [cell] cell size in px
 * @returns {string} data URL
 */
export function gridToPNG(grid, cell = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * cell;
  canvas.height = grid.height * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.font = `${Math.floor(cell * 0.6)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const ch = (grid.get(x, y) || '').toUpperCase();
      ctx.fillText(ch, x * cell + cell / 2, y * cell + cell / 2);
    }
  }
  return canvas.toDataURL('image/png');
}

/** Export grid as plain text. */
export function gridToText(grid) {
  return grid.toStringGrid().toUpperCase().replace(/\./g, ' ');
}
/**
 * Render an interactive grid for play mode. Each cell is a <td> with
 * data-x / data-y attributes so callers can wire selection handlers.
 * @param {HTMLElement} container
 * @param {import('../grid/Grid.js').Grid} grid
 * @returns {HTMLTableElement}
 */
export function renderInteractiveGrid(container, grid, opts = {}) {
  const { lattice = 'square' } = opts;
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = `ws-grid ws-grid-play ws-lattice-${lattice}`;
  for (let y = 0; y < grid.height; y++) {
    const tr = document.createElement('tr');
    if (lattice === 'hex' || lattice === 'triangular') {
      tr.classList.toggle('odd-row', (y & 1) === 1);
    }
    for (let x = 0; x < grid.width; x++) {
      const td = document.createElement('td');
      td.textContent = (grid.get(x, y) || '').toUpperCase();
      td.dataset.x = String(x);
      td.dataset.y = String(y);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  container.appendChild(table);
  return table;
}
/** Get the <td> element for a coordinate within a rendered table. */
export function cellAt(table, x, y) {
  const row = table.rows[y];
  return row ? row.cells[x] : null;
}
