/** results.js — end-of-round screen (§7): score, best word, misses, share. */

const $ = (id) => document.getElementById(id);

function lengthBars(words) {
  const buckets = new Map();
  for (const w of words) {
    const l = Math.min(9, w.word.length);
    buckets.set(l, (buckets.get(l) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([len, n]) => `${len === 9 ? '9+' : len}: ${'▪'.repeat(Math.min(20, n))} ${n}`)
    .join('\n');
}

function shareText(results) {
  const found = results.found.length;
  const possible = results.possible ?? '?';
  const grid = lengthBars(results.found).split('\n').join('\n');
  return [
    `Troggle ${results.size}³ · ★${results.score}`,
    `${found}/${possible} words · best ${results.best ? results.best.word.toUpperCase() : '—'}`,
    grid,
    results.seedString ?? '',
  ].filter(Boolean).join('\n');
}

export function showResults(results, { onAgain, onLobby, onReplay } = {}) {
  const dlg = $('results');
  $('res-score').textContent = String(results.score);
  $('res-stats').textContent =
    `${results.found.length} words${results.possible ? ` of ${results.possible} possible` : ''} · ` +
    `${results.wordsPerMinute.toFixed(1)} wpm · ${results.misses} misses · ` +
    `${results.adjacency} adjacency`;

  const bestBox = $('res-best');
  bestBox.innerHTML = '';
  if (results.best) {
    const b = document.createElement('p');
    b.innerHTML = `Best: <strong>${results.best.word.toUpperCase()}</strong> for ${results.best.score.total} pts`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'replay path';
    btn.className = 'tool';
    btn.addEventListener('click', () => onReplay?.(results.best.path));
    b.appendChild(document.createTextNode(' '));
    b.appendChild(btn);
    bestBox.appendChild(b);
  }

  const list = $('res-missed');
  list.innerHTML = '';
  const missed = results.missed.slice(0, 120);
  $('res-missed-count').textContent = results.missed.length
    ? `(${results.missed.length}${missed.length < results.missed.length ? `, top ${missed.length}` : ''})`
    : '';
  for (const m of missed) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `${m.word.toUpperCase()}<b>${m.score.total}</b>`;
    btn.addEventListener('click', () => onReplay?.(m.path));
    li.appendChild(btn);
    list.appendChild(li);
  }

  const again = $('btn-again');
  const share = $('btn-share');
  const lobby = $('btn-lobby');
  again.onclick = () => { dlg.close(); onAgain?.(); };
  lobby.onclick = () => { dlg.close(); onLobby?.(); };
  share.onclick = async () => {
    const text = shareText(results);
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      share.textContent = 'copied!';
    } catch {
      share.textContent = 'copy failed';
    }
    setTimeout(() => { share.textContent = 'Share'; }, 1600);
  };

  if (!dlg.open) dlg.showModal();
}

export default showResults;