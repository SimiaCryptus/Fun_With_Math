import { el, clear } from '../dom.js';
import { typeset } from '../render.js';
import { issueCard, nodeLink } from './detail.js';

/** The `unresolved` diagnostics, grouped by issue kind. */
export function createIssuesView(root, idx, store) {
  let built = false;
  function update() {
    if (built) return;
    built = true;
    clear(root);
    const issues = idx.graph.unresolved ?? [];
    const wrap = el('div', { class: 'doc' }, [
      el('h2', {}, 'Unresolved'),
      el(
        'p',
        { class: 'empty', style: { padding: '0 0 1rem' } },
        `${issues.length} item(s) the extractor could not settle. Nothing is silently dropped.`
      ),
    ]);

    const byKind = new Map();
    for (const i of issues) {
      const a = byKind.get(i.kind);
      a ? a.push(i) : byKind.set(i.kind, [i]);
    }
    for (const [kind, list] of byKind) {
      wrap.appendChild(
        el('section', { class: 'block' }, [
          el('h3', {}, `${kind.replace(/_/g, ' ')} · ${list.length}`),
          ...list.map((i) => issueCard(i, idx, store)),
        ])
      );
    }
    root.appendChild(wrap);
    typeset(root);
  }
  return { update };
}

/** The source corpus, with per-document node counts. */
export function createCorpusView(root, idx, store) {
  let built = false;
  function update() {
    if (built) return;
    built = true;
    clear(root);

    const docs = [...(idx.graph.corpus.documents ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );

    const firstSeen = new Map();
    const cited = new Map();
    for (const n of idx.graph.nodes) {
      if (n.first_seen) firstSeen.set(n.first_seen, (firstSeen.get(n.first_seen) ?? 0) + 1);
      for (const s of new Set((n.sources ?? []).map((s) => s.file)))
        cited.set(s, (cited.get(s) ?? 0) + 1);
    }

    const wrap = el('div', { class: 'doc' }, [
      el('h2', {}, 'Corpus'),
      el(
        'p',
        { class: 'empty', style: { padding: '0 0 1rem' } },
        `${docs.length} documents, extracted ${idx.graph.generated_at ?? ''} by ${idx.graph.generator?.op ?? '?'}.`
      ),
    ]);

    for (const d of docs) {
      const file = String(d.path).split('/').pop();
      const nodes = idx.graph.nodes.filter((n) => n.first_seen === d.id);
      wrap.appendChild(
        el('section', { class: 'block' }, [
          el('h3', {}, `${d.order ?? '·'} — ${file}`),
          el('p', {}, [
            el('a', { href: d.path, target: '_blank', rel: 'noopener' }, d.title ?? d.path),
          ]),
          el(
            'p',
            { class: 'mono', style: { fontSize: '11.5px', color: 'var(--fg-faint)' } },
            `${firstSeen.get(d.id) ?? 0} nodes first seen here · cited by ${cited.get(file) ?? 0} nodes`
          ),
          nodes.length
            ? el(
                'div',
                { class: 'head-line' },
                nodes.map((n) => nodeLink(n.id, idx, store))
              )
            : null,
        ])
      );
    }

    root.appendChild(wrap);
    typeset(root);
  }
  return { update };
}
