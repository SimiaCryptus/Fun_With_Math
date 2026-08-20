import { el, clear } from '../dom.js';
import { filterNodes, groupNodes } from '../graph-model.js';

export function createSidebar(root, idx, store) {
  clear(root);

  // ---- search + controls -------------------------------------------
  const search = el('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Search names, statements, quotes…  ( / )',
    oninput: () => store.set({ query: search.value }),
  });

  const sort = el('select', { class: 'ctl', onchange: () => store.set({ sort: sort.value }) }, [
    el('option', { value: 'kind' }, 'kind'),
    el('option', { value: 'name' }, 'name'),
    el('option', { value: 'confidence' }, 'confidence'),
    el('option', { value: 'degree' }, 'connectivity'),
    el('option', { value: 'document' }, 'first seen'),
  ]);

  const cluster = el(
    'select',
    { class: 'ctl', onchange: () => store.set({ cluster: cluster.value }) },
    [
      el('option', { value: '' }, 'all clusters'),
      ...idx.graph.clusters.map((c) =>
        el('option', { value: c.id }, `${c.name} (${c.members.length})`)
      ),
    ]
  );

  const conf = el('input', {
    type: 'range',
    min: '0',
    max: '0.99',
    step: '0.01',
    value: '0',
    class: 'ctl',
    oninput: () => store.set({ minConfidence: Number(conf.value) }),
  });
  const confLabel = el('span', { class: 'mono' }, '≥0.00');

  const reset = el(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: () => {
        search.value = '';
        conf.value = '0';
        cluster.value = '';
        store.set({
          query: '',
          kinds: new Set(),
          statuses: new Set(),
          domains: new Set(),
          cluster: '',
          minConfidence: 0,
        });
      },
    },
    'reset'
  );

  const counter = el('span', { class: 'mono' }, '');

  const head = el('div', { class: 'side-head' }, [
    search,
    el('div', { class: 'side-row' }, ['sort', sort]),
    el('div', { class: 'side-row' }, [cluster]),
    el('div', { class: 'side-row' }, ['conf', conf, confLabel]),
    el('div', { class: 'side-row' }, [counter, el('span', { style: { flex: '1' } }), reset]),
  ]);

  // ---- facets --------------------------------------------------------
  const facets = el('div', { class: 'facets' }, [
    facetGroup('kind', 'kinds', idx.facets.kind, store, true),
    facetGroup('status', 'statuses', idx.facets.status, store, true),
    facetGroup('domain', 'domains', idx.facets.domain, store, false),
  ]);

  const list = el('div', { class: 'node-list' });
  root.append(head, facets, list);

  // ---- rendering -----------------------------------------------------
  function update(s) {
    if (search.value !== s.query) search.value = s.query;
    sort.value = s.sort;
    cluster.value = s.cluster;
    confLabel.textContent = `≥${s.minConfidence.toFixed(2)}`;

    for (const chip of facets.querySelectorAll('.chip')) {
      const set = s[chip.dataset.set];
      chip.setAttribute('aria-pressed', String(set.has(chip.dataset.value)));
    }

    const nodes = filterNodes(idx, s);
    counter.textContent = `${nodes.length}/${idx.graph.nodes.length} nodes`;

    clear(list);
    if (!nodes.length) {
      list.appendChild(el('p', { class: 'empty', style: { padding: '1rem' } }, 'no matches'));
      return;
    }
    for (const [label, group] of groupNodes(idx, nodes, s.sort)) {
      list.appendChild(el('div', { class: 'list-group' }, `${label} · ${group.length}`));
      for (const n of group) list.appendChild(listItem(n, idx, store, s));
    }

    const active = list.querySelector('[aria-current="true"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  return { update, focusSearch: () => (search.focus(), search.select()) };
}

function facetGroup(title, stateKey, entries, store, open) {
  const body = el(
    'div',
    { class: 'facet-body' },
    entries.map(([value, count]) =>
      el(
        'button',
        {
          class: 'chip',
          type: 'button',
          'aria-pressed': 'false',
          dataset: { set: stateKey, value: String(value) },
          onclick: () => store.toggleIn(stateKey, String(value)),
        },
        [String(value), el('span', { class: 'count' }, String(count))]
      )
    )
  );
  return el('details', { class: 'facet', open: open || null }, [el('summary', {}, title), body]);
}

function listItem(n, idx, store, s) {
  return el(
    'button',
    {
      class: `list-item k-${n.kind}`,
      type: 'button',
      'aria-current': String(s.selected === n.id),
      title: n.id,
      onclick: () => store.set({ selected: n.id, view: s.view === 'map' ? 'map' : 'node' }),
    },
    [
      el('span', { class: 'dot' }),
      el('span', {}, [
        el('span', { class: 'li-name' }, n.name),
        el('span', { class: 'li-meta' }, [
          n.kind,
          '·',
          n.status,
          n.confidence != null ? `· ${n.confidence.toFixed(2)}` : '',
          (idx.issuesOf.get(n.id) || []).length ? '· ⚠' : '',
        ]),
      ]),
    ]
  );
}
