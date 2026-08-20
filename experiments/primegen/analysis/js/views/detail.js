import { el, clear } from '../dom.js';
import { renderMarkdown, mdEl, displayMath, typeset } from '../render.js';
import {
  RELATION_ORDER,
  edgesIn,
  edgesOut,
  clustersOf,
  issuesOf,
  inversePhrase,
} from '../graph-model.js';

export function createDetailView(root, idx, store) {
  function update(s) {
    clear(root);
    const node = s.selected ? idx.nodes.get(s.selected) : null;
    root.appendChild(node ? nodeArticle(node, idx, store) : overview(idx, store));
    root.scrollTop = 0;
    typeset(root);
  }
  return { update };
}

/* ------------------------------------------------------------------ */

function overview(idx, store) {
  const g = idx.graph;
  const wrap = el('div', { class: 'doc' });

  wrap.appendChild(el('h2', {}, g.corpus.documents?.[0]?.title ?? 'Theory graph'));
  wrap.appendChild(
    el(
      'p',
      { class: 'empty', style: { padding: '0 0 1rem' } },
      `${g.nodes.length} nodes, ${g.edges.length} edges extracted from ` +
        `${g.corpus.documents.length} documents by ${g.generator?.op ?? 'the extractor'}. ` +
        'Pick a node on the left, or start from a cluster below.'
    )
  );

  wrap.appendChild(
    el('section', { class: 'block' }, [
      el('h3', {}, 'clusters'),
      el(
        'div',
        { class: 'cards' },
        g.clusters.map((c) =>
          el('div', { class: 'card' }, [
            el('h4', {}, [nodeLink(c.root ?? c.members[0], idx, store, c.name)]),
            el('p', {}, c.summary ?? ''),
            el(
              'p',
              { class: 'mono', style: { fontSize: '11px', color: 'var(--fg-faint)' } },
              `${c.members.length} members`
            ),
            el(
              'p',
              {},
              el(
                'button',
                {
                  class: 'btn',
                  type: 'button',
                  onclick: () => store.set({ cluster: c.id, selected: c.root ?? c.members[0] }),
                },
                'filter to cluster'
              )
            ),
          ])
        )
      ),
    ])
  );

  return wrap;
}

/* ------------------------------------------------------------------ */

function nodeArticle(n, idx, store) {
  const wrap = el('div', { class: 'doc' });

  // header
  const head = el('header', { class: `node-head k-${n.kind}` }, [
    el('div', { class: 'head-line' }, [
      el('span', { class: 'badge kind' }, n.kind),
      el('span', { class: `badge status st-${n.status}` }, n.status),
      n.domain ? el('span', { class: 'tag' }, n.domain) : null,
      n.confidence != null ? meter('extraction confidence', n.confidence) : null,
    ]),
    el('h2', { html: renderMarkdown(n.name, { inline: true }) }),
    el('div', { class: 'head-line' }, [
      el('span', { class: 'node-id' }, n.id),
      n.first_seen ? docLink(idx, n.first_seen) : null,
      ...clustersOf(idx, n.id).map((c) =>
        el(
          'button',
          { class: 'chip', type: 'button', onclick: () => store.set({ cluster: c.id }) },
          c.name
        )
      ),
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => store.set({ view: 'map', selected: n.id }),
        },
        'show on map'
      ),
    ]),
    n.aliases?.length
      ? el(
          'div',
          { class: 'tags' },
          n.aliases.map((a) => el('span', { class: 'tag' }, a))
        )
      : null,
  ]);
  wrap.appendChild(head);

  // statement / formal
  wrap.appendChild(
    block('statement', [
      mdEl('div', 'statement', n.statement),
      n.formal ? displayMath(n.formal) : null,
    ])
  );

  if (n.notation?.length)
    wrap.appendChild(
      block(
        'notation',
        el(
          'div',
          { class: 'tags' },
          n.notation.map((t) => {
            const c = el('span', { class: 'tag' });
            c.textContent = `\\(${t}\\)`;
            return c;
          })
        )
      )
    );

  if (n.scope) wrap.appendChild(block('scope', mdEl('div', null, n.scope)));

  if (n.attributes?.length)
    wrap.appendChild(
      block(
        'attributes',
        el('table', { class: 'kv' }, [
          el(
            'tbody',
            {},
            n.attributes.map((a) =>
              el('tr', {}, [
                el('th', {}, a.key),
                el('td', {}, [
                  el('span', { html: renderMarkdown(String(a.value), { inline: true }) }),
                  a.unit ? el('span', { class: 'unit' }, a.unit) : null,
                  a.error != null ? el('span', { class: 'unit' }, `± ${a.error}`) : null,
                ]),
              ])
            )
          ),
        ])
      )
    );

  // relations
  const outs = edgesOut(idx, n.id);
  const ins = edgesIn(idx, n.id);
  if (outs.length || ins.length)
    wrap.appendChild(
      block('relations', [
        outs.length ? relationList(outs, 'out', idx, store) : null,
        ins.length ? relationList(ins, 'in', idx, store) : null,
      ])
    );

  if (n.notes) wrap.appendChild(block('extractor notes', mdEl('div', null, n.notes)));

  // sources
  wrap.appendChild(
    block(
      'sources',
      el(
        'ul',
        { class: 'sources' },
        (n.sources ?? []).map((s) => sourceItem(s, idx))
      )
    )
  );

  // issues touching this node
  const issues = issuesOf(idx, n.id);
  if (issues.length)
    wrap.appendChild(
      block(
        'unresolved',
        issues.map((i) => issueCard(i, idx, store))
      )
    );

  return wrap;
}

/* ---------------------------- pieces ------------------------------- */

function block(title, children) {
  return el('section', { class: 'block' }, [el('h3', {}, title), ...[].concat(children)]);
}

function meter(label, v) {
  return el('span', { class: 'meter', title: label }, [
    el('span', { class: 'bar' }, el('i', { style: { width: `${Math.round(v * 100)}%` } })),
    v.toFixed(2),
  ]);
}

export function nodeLink(id, idx, store, labelOverride) {
  const target = idx.nodes.get(id);
  if (!target)
    return el('span', { class: 'mono', style: { color: 'var(--s-refuted)' } }, `${id} (missing)`);
  return el(
    'button',
    {
      class: `nlink k-${target.kind}`,
      type: 'button',
      title: `${target.kind} · ${target.status}\n${target.id}`,
      onclick: () => store.set({ selected: id, view: store.get().view === 'map' ? 'map' : 'node' }),
    },
    [
      el('span', { class: 'swatch' }),
      el('span', { class: 'nlink-name' }, labelOverride ?? target.name),
    ]
  );
}

function relationList(edges, dir, idx, store) {
  const groups = new Map();
  for (const e of edges) {
    const arr = groups.get(e.relation);
    arr ? arr.push(e) : groups.set(e.relation, [e]);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => RELATION_ORDER.indexOf(a[0]) - RELATION_ORDER.indexOf(b[0])
  );

  return el(
    'div',
    {},
    ordered.map(([rel, list]) =>
      el('div', { class: 'rel-group' }, [
        el(
          'div',
          { class: `rel-label r-${rel}` },
          dir === 'out' ? `${rel} →` : `← ${inversePhrase(rel)}`
        ),
        ...list.map((e) => relationItem(e, dir, idx, store)),
      ])
    )
  );
}

function relationItem(e, dir, idx, store) {
  const otherId = dir === 'out' ? e.to : e.from;
  const bits = [];
  if (e.strength != null) bits.push(`strength ${e.strength}`);
  if (e.confidence != null) bits.push(`conf ${e.confidence}`);
  return el('div', { class: 'rel-item' }, [
    el('span', { class: 'rel-arrow' }, dir === 'out' ? '→' : '←'),
    el('div', {}, [
      nodeLink(otherId, idx, store),
      bits.length ? el('span', { class: 'rel-note' }, `  (${bits.join(', ')})`) : null,
      e.label ? el('div', { class: 'rel-note' }, e.label) : null,
      e.conditions ? el('div', { class: 'rel-cond' }, `⚑ ${e.conditions}`) : null,
      e.notes ? el('div', { class: 'rel-note' }, e.notes) : null,
      ...(e.sources ?? []).map((s) =>
        el('blockquote', { class: 'quote', html: renderMarkdown(quoteLine(s)) })
      ),
    ]),
  ]);
}

function quoteLine(s) {
  const where = [s.file, s.heading].filter(Boolean).join(' § ');
  return `${s.quote ?? ''}${s.quote ? '  ' : ''}*— ${where}*`;
}

export function sourceItem(s, idx) {
  const doc = idx.docByFile.get(s.file);
  return el('li', {}, [
    doc
      ? el('a', { class: 'src-file', href: doc.path, target: '_blank', rel: 'noopener' }, s.file)
      : el('span', { class: 'src-file' }, s.file),
    s.heading ? el('span', { class: 'src-heading' }, ` § ${s.heading}`) : null,
    s.lines ? el('span', { class: 'src-lines' }, ` L${s.lines[0]}–${s.lines[1]}`) : null,
    s.quote ? el('blockquote', { class: 'quote', html: renderMarkdown(s.quote) }) : null,
  ]);
}
/** Small inline link to the document a node was first seen in. */
export function docLink(idx, file) {
  if (!file) return null;
  const doc = idx.docByFile.get(file);
  const label = doc?.title ?? file;
  const title = `first seen in ${file}`;
  return doc
    ? el(
        'a',
        { class: 'src-file', href: doc.path, target: '_blank', rel: 'noopener', title },
        label
      )
    : el('span', { class: 'src-file', title }, label);
}

export function issueCard(issue, idx, store) {
  return el('div', { class: `issue k-${issue.kind}` }, [
    el('div', { class: 'issue-kind' }, issue.kind.replace(/_/g, ' ')),
    mdEl('div', null, issue.description),
    issue.refs?.length
      ? el(
          'div',
          { class: 'head-line' },
          issue.refs.map((r) => nodeLink(r, idx, store))
        )
      : null,
    ...(issue.sources ?? []).map((s) =>
      el('blockquote', { class: 'quote', html: renderMarkdown(quoteLine(s)) })
    ),
  ]);
}
