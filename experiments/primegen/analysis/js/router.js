const VIEWS = new Set(['node', 'map', 'issues', 'corpus']);

export function readRoute() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const slash = raw.indexOf('/');
  const view = slash === -1 ? raw : raw.slice(0, slash);
  const id = slash === -1 ? '' : raw.slice(slash + 1);
  return { view: VIEWS.has(view) ? view : 'node', id };
}

export function writeRoute({ view, id }, replace = false) {
  const hash = `#/${view}${id ? '/' + id : ''}`;
  if (location.hash === hash) return;
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
}

export function onRoute(fn) {
  window.addEventListener('hashchange', () => fn(readRoute()));
}
