/* ============================================================
   js/home-browse.js
   Renders the home page directly from the unified manifest
   (manifest.json, schema v2). Provides search, category tabs,
   tag facets, sorting, density toggle, per-group collapsing,
   lazy video/README loading and deep-linkable URL state.

   Replaces the old js/home-data.js (labs.json/games.json/…).
   ============================================================ */

(() => {
  'use strict';

  const MANIFEST_URL = 'manifest.json';
  /** Site-level overrides declared inline in index.html. */
  const SITE = window.SITE_CONFIG || {};
  /** Cards shown per group before the "show all" affordance appears. */
  const PREVIEW_COUNT = Number.isFinite(SITE.previewCount) ? SITE.previewCount : 48;
  /** Categories this build is allowed to surface (null = everything). */
  const ALLOWED_CATEGORIES =
    Array.isArray(SITE.categories) && SITE.categories.length ? new Set(SITE.categories) : null;

  const CATEGORY_META = {
    lab: {
      label: 'Laboratories',
      short: 'Labs',
      blurb: 'Extended interactive studies — each with notes on the underlying mathematics.',
    },
    game: {
      label: 'Games',
      short: 'Games',
      blurb: 'Playable sister projects built on the same browser-native tooling.',
    },
    essay: {
      label: 'Essays',
      short: 'Essays',
      blurb: 'Long-form investigations into the foundations of computational mathematics.',
    },
  };
  const CATEGORY_ORDER = ['lab', 'game', 'essay'];
  /** Default (and therefore un-serialized) category filter. */
  const DEFAULT_CAT =
    SITE.defaultCategory && CATEGORY_META[SITE.defaultCategory] ? SITE.defaultCategory : 'all';
  const SECTION_ORDER = {
    lab: ['featured', 'essays', 'demos'],
    game: ['games'],
    essay: ['essays'],
  };
  const SECTION_LABEL = {
    featured: 'Featured',
    demos: 'Demo',
    essays: 'Essay',
    games: 'Game',
  };

  /* ---------------------------------------------------------- *
   * Tiny helpers
   * ---------------------------------------------------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const escapeHtml = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ');

  const isExternal = (p) => /^[a-z][a-z0-9+.-]*:/i.test(p) || String(p).startsWith('//');

  function normalizePosix(p) {
    const abs = p.startsWith('/');
    const out = [];
    for (const part of p.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (out.length && out[out.length - 1] !== '..') out.pop();
        else if (!abs) out.push('..');
        continue;
      }
      out.push(part);
    }
    return (abs ? '/' : '') + out.join('/');
  }

  /** Mirror of schema.ts `resolvePathRef`. */
  function resolveRef(dir, value) {
    if (!value) return '';
    if (isExternal(value)) return value;
    const m = /^([^?#]*)([?#][\s\S]*)?$/.exec(value);
    const pathPart = m ? m[1] : value;
    const suffix = (m && m[2]) || '';
    if (pathPart.startsWith('/')) {
      return normalizePosix(pathPart).replace(/^\/+/, '') + suffix;
    }
    return normalizePosix(`${dir}/${pathPart}`) + suffix;
  }

  /** Mirror of schema.ts `repoBrowseUrl`. */
  function repoBrowseUrl(repo, subpath) {
    if (!repo || !repo.url) return '';
    const rel = normalizePosix(subpath || repo.subpath || '');
    if (!rel) return repo.url;
    const ref = repo.commit || repo.branch || 'HEAD';
    const verb = /bitbucket/i.test(repo.host || '') ? 'src' : 'tree';
    return `${repo.url}/${verb}/${ref}/${rel}`;
  }

  const debounce = (fn, ms) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  /* ---------------------------------------------------------- *
   * State
   * ---------------------------------------------------------- */

  const state = {
    q: '',
    cat: 'all',
    tags: new Set(),
    sort: 'curated',
    view: 'grid',
    expanded: new Set(), // group keys the user has expanded
  };

  /** @type {Array<object>} normalized entries */
  let ENTRIES = [];
  /** @type {Map<string, object>} */
  const BY_ID = new Map();
  /** @type {Map<string, Promise<string>>} readme markdown cache */
  const README_CACHE = new Map();

  let videoObserver = null;

  const el = {};

  /* ---------------------------------------------------------- *
   * Normalization
   * ---------------------------------------------------------- */

  function normalizeEntry(raw) {
    const dir = raw.dir || '';
    const category = CATEGORY_META[raw.category] ? raw.category : 'lab';
    const section = raw.section || SECTION_ORDER[category][0];
    const pitchText = stripHtml(raw.pitch || '');
    const tags = Array.isArray(raw.tags) ? raw.tags.filter(Boolean) : [];

    return {
      id: raw.id,
      category,
      section,
      order: Number.isFinite(raw.order) ? raw.order : Number.MAX_SAFE_INTEGER,
      icon: raw.icon || '·',
      title: raw.title || raw.id,
      subtitle: raw.subtitle || '',
      pitch: raw.pitch || '',
      launchLabel: raw.launchLabel || `Open ${raw.title || raw.id}`,
      href: resolveRef(dir, raw.href),
      readme: raw.readme ? resolveRef(dir, raw.readme) : '',
      video: raw.video ? resolveRef(dir, raw.video) : '',
      dir,
      tags,
      repo: raw.repo || null,
      external: isExternal(raw.href),
      // Precomputed search haystack.
      haystack: [
        raw.title,
        raw.subtitle,
        pitchText,
        tags.join(' '),
        raw.id,
        category,
        section,
        CATEGORY_META[category] ? CATEGORY_META[category].label : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      titleLower: String(raw.title || '').toLowerCase(),
    };
  }

  function curatedCompare(a, b) {
    const cr = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (cr) return cr;
    const secs = SECTION_ORDER[a.category] || [];
    const sa = secs.indexOf(a.section);
    const sb = secs.indexOf(b.section);
    const sr = (sa < 0 ? 1e9 : sa) - (sb < 0 ? 1e9 : sb);
    if (sr) return sr;
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  }

  /* ---------------------------------------------------------- *
   * Search
   * ---------------------------------------------------------- */

  function scoreEntry(entry, terms) {
    let score = 0;
    for (const term of terms) {
      if (!entry.haystack.includes(term)) return -1;
      if (entry.titleLower.startsWith(term)) score += 100;
      else if (entry.titleLower.includes(term)) score += 60;
      if (entry.tags.some((t) => t.toLowerCase().includes(term))) score += 25;
      if (entry.id.includes(term)) score += 15;
      score += 5;
    }
    return score;
  }

  function highlight(text, terms) {
    let html = escapeHtml(text);
    if (!terms.length) return html;
    const pattern = terms
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length)
      .join('|');
    return html.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
  }

  /* ---------------------------------------------------------- *
   * URL state
   * ---------------------------------------------------------- */

  function readUrlState() {
    const params = new URLSearchParams(location.search);
    state.q = params.get('q') || '';
    const cat = params.get('cat');
    state.cat = cat && (cat === 'all' || CATEGORY_META[cat]) ? cat : DEFAULT_CAT;
    state.sort = ['curated', 'az', 'za', 'media'].includes(params.get('sort'))
      ? params.get('sort')
      : 'curated';
    state.view = params.get('view') === 'list' ? 'list' : 'grid';
    state.tags = new Set((params.get('tag') || '').split(',').filter(Boolean));
  }

  function writeUrlState() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.cat !== DEFAULT_CAT) params.set('cat', state.cat);
    if (state.sort !== 'curated') params.set('sort', state.sort);
    if (state.view !== 'grid') params.set('view', state.view);
    if (state.tags.size) params.set('tag', Array.from(state.tags).join(','));
    const qs = params.toString();
    const url = `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
    history.replaceState(null, '', url);
  }

  const filtersActive = () => Boolean(state.q || state.cat !== 'all' || state.tags.size);

  /* ---------------------------------------------------------- *
   * Rendering — controls
   * ---------------------------------------------------------- */

  function renderCatTabs() {
    // Single-purpose builds (e.g. the games-only fork) hide the tab strip.
    if (SITE.hideCategoryTabs) {
      el.catTabs.hidden = true;
      el.catTabs.innerHTML = '';
      return;
    }
    const counts = { all: ENTRIES.length };
    for (const e of ENTRIES) counts[e.category] = (counts[e.category] || 0) + 1;

    const tabs = [{ key: 'all', label: 'All' }].concat(
      CATEGORY_ORDER.filter((c) => counts[c]).map((c) => ({
        key: c,
        label: CATEGORY_META[c].short,
      }))
    );

    el.catTabs.innerHTML = tabs
      .map(
        (t) => `
          <button type="button" class="cat-tab" role="tab"
                  data-cat="${t.key}"
                  aria-selected="${state.cat === t.key}">
            ${escapeHtml(t.label)}
            <span class="cat-count">${counts[t.key] || 0}</span>
          </button>`
      )
      .join('');
  }

  function renderTagChips() {
    const freq = new Map();
    for (const e of ENTRIES) {
      if (state.cat !== 'all' && e.category !== state.cat) continue;
      for (const tag of e.tags) freq.set(tag, (freq.get(tag) || 0) + 1);
    }
    // Keep any active tag visible even if the category filter hides it.
    for (const tag of state.tags) if (!freq.has(tag)) freq.set(tag, 0);

    const tags = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    if (tags.length < 2) {
      el.tagRow.hidden = true;
      return;
    }
    el.tagRow.hidden = false;

    const VISIBLE = 12;
    el.tagChips.innerHTML = tags
      .map(
        ([tag, n], i) => `
          <button type="button" class="tag-chip${i >= VISIBLE ? ' is-overflow' : ''}"
                  data-tag="${escapeHtml(tag)}"
                  aria-pressed="${state.tags.has(tag)}"
                  ${i >= VISIBLE && !el.tagMore.dataset.open ? 'hidden' : ''}>
            ${escapeHtml(tag)}${n ? ` <span class="cat-count">${n}</span>` : ''}
          </button>`
      )
      .join('');

    el.tagMore.hidden = tags.length <= VISIBLE;
    el.tagMore.textContent = el.tagMore.dataset.open ? 'fewer ▴' : `more ▾`;
  }

  /* ---------------------------------------------------------- *
   * Rendering — cards
   * ---------------------------------------------------------- */

  function cardMarkup(entry, terms) {
    const mediaHtml = entry.video
      ? `<div class="entry-media featured-card-media" data-video="${escapeHtml(entry.video)}">
           <button type="button" class="featured-card-play" aria-label="Play demo of ${escapeHtml(
             entry.title
           )}"></button>
         </div>`
      : '';

    const badges = [
      `<span class="entry-badge is-cat-${entry.category}">${escapeHtml(
        CATEGORY_META[entry.category].short
      )}</span>`,
    ];
    const sectionLabel = SECTION_LABEL[entry.section];
    if (
      sectionLabel &&
      sectionLabel.toLowerCase() !== CATEGORY_META[entry.category].short.toLowerCase()
    ) {
      badges.push(`<span class="entry-badge">${escapeHtml(sectionLabel)}</span>`);
    }
    if (entry.video) badges.push('<span class="entry-badge is-media">▶ demo</span>');
    if (entry.external) badges.push('<span class="entry-badge">external ↗</span>');

    const subtitle = entry.subtitle
      ? `<p class="entry-sub">${highlight(entry.subtitle, terms)}</p>`
      : '';

    // Pitch may carry trusted inline HTML (links) authored in entry.json.
    const pitch = entry.pitch ? `<div class="entry-pitch">${entry.pitch}</div>` : '';

    return `
      <article class="entry-card" data-id="${escapeHtml(entry.id)}" tabindex="0"
                role="button" aria-label="Details for ${escapeHtml(entry.title)}">
        <div class="entry-card-top">
          <span class="entry-icon" aria-hidden="true">${escapeHtml(entry.icon)}</span>
          <div class="entry-heads">
            <h3 class="entry-title">${highlight(entry.title, terms)}</h3>
            ${subtitle}
          </div>
        </div>
        ${mediaHtml}
        ${pitch}
        <div class="entry-foot">
           <div class="entry-badges">${badges.join('')}</div>
           <div class="entry-actions">
             <button type="button" class="entry-share" data-share="${escapeHtml(entry.id)}"
                     title="Share ${escapeHtml(entry.title)}"
                     aria-label="Share ${escapeHtml(entry.title)}">
               <span aria-hidden="true">⇪</span>
             </button>
             <a class="entry-play" data-entry-launch href="${escapeHtml(entry.href)}"
                ${entry.external ? 'target="_blank" rel="noopener"' : ''}
                aria-label="${escapeHtml(entry.launchLabel)}">
               <span class="play-glyph" aria-hidden="true">▶</span> Play
             </a>
           </div>
        </div>
      </article>`;
  }

  function render() {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);

    // 1. filter
    let rows = ENTRIES.filter((e) => {
      if (state.cat !== 'all' && e.category !== state.cat) return false;
      for (const tag of state.tags) if (!e.tags.includes(tag)) return false;
      return true;
    });

    if (terms.length) {
      rows = rows
        .map((e) => ({ e, s: scoreEntry(e, terms) }))
        .filter((r) => r.s >= 0)
        .sort((a, b) => b.s - a.s || curatedCompare(a.e, b.e))
        .map((r) => r.e);
    } else {
      rows.sort(curatedCompare);
    }

    // 2. sort override
    if (state.sort === 'az') rows.sort((a, b) => a.title.localeCompare(b.title));
    else if (state.sort === 'za') rows.sort((a, b) => b.title.localeCompare(a.title));
    else if (state.sort === 'media')
      rows.sort((a, b) => Number(!!b.video) - Number(!!a.video) || curatedCompare(a, b));

    // 3. group (flat when searching or a single category is pinned)
    const flat = terms.length > 0 || state.cat !== 'all';
    const groups = flat
      ? [
          {
            key: state.cat === 'all' ? 'results' : state.cat,
            label: state.cat === 'all' ? 'Results' : CATEGORY_META[state.cat].label,
            blurb: state.cat === 'all' ? '' : CATEGORY_META[state.cat].blurb,
            items: rows,
          },
        ]
      : CATEGORY_ORDER.map((c) => ({
          key: c,
          label: CATEGORY_META[c].label,
          blurb: CATEGORY_META[c].blurb,
          items: rows.filter((e) => e.category === c),
        })).filter((g) => g.items.length);

    // 4. paint
    const bare = groups.length === 1 && (SITE.hideCategoryTabs || flat);
    el.groups.innerHTML = groups
      .map((g) => {
        const collapsed = !flat && !state.expanded.has(g.key) && g.items.length > PREVIEW_COUNT;
        const shown = collapsed ? g.items.slice(0, PREVIEW_COUNT) : g.items;
        const more = collapsed
          ? `<button type="button" class="group-more" data-group="${escapeHtml(g.key)}">
               Show all ${g.items.length} ${escapeHtml(g.label.toLowerCase())} ▾
             </button>`
          : '';
        const head = bare
          ? ''
          : `<header class="entry-group-head">
                <h2>${escapeHtml(g.label)}</h2>
                <span class="entry-group-count">${g.items.length}</span>
                ${g.blurb ? `<p class="entry-group-sub">${escapeHtml(g.blurb)}</p>` : ''}
              </header>`;
        return `
           <section class="entry-group${bare ? ' is-bare' : ''}" id="group-${escapeHtml(g.key)}">
             ${head}
            <div class="entry-grid">
              ${shown.map((e) => cardMarkup(e, terms)).join('')}
            </div>
            ${more}
          </section>`;
      })
      .join('');

    el.groups.hidden = rows.length === 0;
    el.empty.hidden = rows.length !== 0;

    el.status.innerHTML = rows.length
      ? `<strong>${rows.length}</strong> of ${ENTRIES.length} games${
          filtersActive() ? ' · filtered' : ''
        }`
      : `no matches in ${ENTRIES.length} games`;

    el.reset.hidden = !filtersActive();
    document.body.classList.toggle('view-list', state.view === 'list');
    el.browse.classList.toggle('view-list', state.view === 'list');

    observeVideos();
  }

  /* ---------------------------------------------------------- *
   * Lazy demo videos
   * ---------------------------------------------------------- */

  function mountVideo(container) {
    if (container.dataset.mounted) return;
    container.dataset.mounted = '1';
    const src = container.dataset.video;
    const video = document.createElement('video');
    video.className = 'featured-card-video';
    video.src = src;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-hidden', 'true');
    container.insertBefore(video, container.firstChild);

    const play = () => {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
      container.classList.add('is-playing');
    };
    const pause = () => {
      video.pause();
      container.classList.remove('is-playing');
    };

    const card = container.closest('.entry-card, .modal-media');
    if (card && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      card.addEventListener('mouseenter', play);
      card.addEventListener('mouseleave', pause);
    }
    const btn = container.querySelector('.featured-card-play');
    if (btn) {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (video.paused) play();
        else pause();
      });
    }
  }

  function observeVideos() {
    const targets = $$('.entry-media[data-video]:not([data-mounted])');
    if (!targets.length) return;
    if (!('IntersectionObserver' in window)) {
      targets.forEach(mountVideo);
      return;
    }
    if (!videoObserver) {
      videoObserver = new IntersectionObserver(
        (entries) => {
          for (const it of entries) {
            if (it.isIntersecting) {
              mountVideo(it.target);
              videoObserver.unobserve(it.target);
            }
          }
        },
        { rootMargin: '200px 0px' }
      );
    }
    targets.forEach((t) => videoObserver.observe(t));
  }

  /* ---------------------------------------------------------- *
   * Sharing
   * ---------------------------------------------------------- */
  const absUrl = (href) => {
    try {
      return new URL(href, location.href).href;
    } catch (_) {
      return href;
    }
  };
  const SHARE_TARGETS = [
    {
      label: 'X',
      href: (u, t) =>
        `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
    },
    {
      label: 'Bluesky',
      href: (u, t) => `https://bsky.app/intent/compose?text=${encodeURIComponent(`${t} ${u}`)}`,
    },
    {
      label: 'Reddit',
      href: (u, t) =>
        `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}`,
    },
    {
      label: 'Facebook',
      href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
    },
    {
      label: 'Email',
      href: (u, t) =>
        `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(`${t} — ${u}`)}`,
    },
  ];
  let shareMenuEl = null;
  function toast(msg) {
    let t = $('#shareToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'shareToast';
      t.className = 'share-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('is-visible'), 2200);
  }
  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard');
    } catch (_) {
      window.prompt('Copy this link', url);
    }
  }
  function onDocClickShare(ev) {
    if (shareMenuEl && !shareMenuEl.contains(ev.target)) closeShareMenu();
  }
  function closeShareMenu() {
    if (shareMenuEl) {
      shareMenuEl.remove();
      shareMenuEl = null;
    }
    document.removeEventListener('click', onDocClickShare, true);
  }
  function openShareMenu({ title, url }, anchor) {
    closeShareMenu();
    const menu = document.createElement('div');
    menu.className = 'share-menu';
    menu.innerHTML = `
       <p class="share-menu-title">Share “${escapeHtml(title)}”</p>
       <div class="share-menu-links">
         ${SHARE_TARGETS.map(
           (t) =>
             `<a class="share-link" target="_blank" rel="noopener"
                 href="${escapeHtml(t.href(url, title))}">${escapeHtml(t.label)}</a>`
         ).join('')}
       </div>
       <button type="button" class="share-copy">Copy link</button>`;
    document.body.appendChild(menu);
    shareMenuEl = menu;
    const r = anchor
      ? anchor.getBoundingClientRect()
      : { bottom: window.innerHeight / 2, left: window.innerWidth / 2, width: 0 };
    const mw = menu.offsetWidth;
    const left = Math.max(12, Math.min(r.left + r.width / 2 - mw / 2, window.innerWidth - mw - 12));
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.min(r.bottom + 10, window.innerHeight - menu.offsetHeight - 12)}px`;
    menu.querySelector('.share-copy').addEventListener('click', () => {
      copyLink(url);
      closeShareMenu();
    });
    menu.addEventListener('click', (ev) => {
      if (ev.target.closest('a')) closeShareMenu();
    });
    setTimeout(() => document.addEventListener('click', onDocClickShare, true), 0);
  }
  async function shareEntry(entry, anchor) {
    const url = absUrl(entry ? entry.href : location.pathname);
    const title = entry ? entry.title : SITE.siteName || document.title;
    const text = entry
      ? stripHtml(entry.pitch).trim().slice(0, 140) || `Play ${entry.title}`
      : 'A small arcade of original browser games — free, no installs.';
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    openShareMenu({ title, text, url }, anchor);
  }
  /* ---------------------------------------------------------- *
   * Modal
   * ---------------------------------------------------------- */

  function fetchReadme(url) {
    if (!README_CACHE.has(url)) {
      README_CACHE.set(
        url,
        fetch(url)
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .catch(() => null)
      );
    }
    return README_CACHE.get(url);
  }

  function renderMarkdown(md, entry) {
    if (!window.marked) return `<pre>${escapeHtml(md)}</pre>`;
    // Drop YAML front-matter if present.
    const body = md.replace(/^---\n[\s\S]*?\n---\n/, '');
    const html =
      typeof window.marked.parse === 'function' ? window.marked.parse(body) : window.marked(body);

    const holder = document.createElement('div');
    holder.innerHTML = html;

    // Re-anchor relative links / images at the entry's directory.
    for (const node of holder.querySelectorAll('[src], [href]')) {
      const attr = node.hasAttribute('src') ? 'src' : 'href';
      const value = node.getAttribute(attr);
      if (!value || value.startsWith('#') || isExternal(value) || value.startsWith('/')) {
        if (attr === 'href' && isExternal(value || '')) {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener');
        }
        continue;
      }
      node.setAttribute(attr, resolveRef(entry.dir, value));
    }

    // Mermaid fences → <div class="mermaid">
    for (const code of holder.querySelectorAll('pre > code.language-mermaid')) {
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = code.textContent;
      code.parentElement.replaceWith(div);
    }
    return holder.innerHTML;
  }

  let lastFocus = null;
  let currentEntry = null;

  async function openModal(id) {
    const entry = BY_ID.get(id);
    if (!entry) return;
    lastFocus = document.activeElement;
    currentEntry = entry;

    el.modalIcon.textContent = entry.icon;
    el.modalTitle.textContent = entry.title;
    el.modalSubtitle.textContent = entry.subtitle || '';
    el.modalLaunch.href = entry.href;
    el.modalLaunch.setAttribute('aria-label', entry.launchLabel);
    if (entry.external) {
      el.modalLaunch.target = '_blank';
      el.modalLaunch.rel = 'noopener';
    } else {
      el.modalLaunch.removeAttribute('target');
      el.modalLaunch.removeAttribute('rel');
    }

    // Meta strip: badges + repository provenance.
    const meta = [
      `<span class="entry-badge is-cat-${entry.category}">${escapeHtml(
        CATEGORY_META[entry.category].label
      )}</span>`,
    ];
    for (const tag of entry.tags) meta.push(`<span class="entry-badge">${escapeHtml(tag)}</span>`);
    const src = repoBrowseUrl(entry.repo, entry.repo && entry.repo.subpath);
    if (src) {
      const ref = entry.repo.commit ? entry.repo.commit.slice(0, 7) : entry.repo.branch || '';
      meta.push(
        `<a class="modal-source" href="${escapeHtml(src)}" target="_blank" rel="noopener">
           ${escapeHtml(entry.repo.slug || 'source')}${ref ? ` @ ${escapeHtml(ref)}` : ''} ↗
         </a>`
      );
    }
    el.modalMeta.innerHTML = meta.join('');

    el.modalMedia.innerHTML = entry.video
      ? `<div class="entry-media" data-video="${escapeHtml(entry.video)}" style="all:unset">
           <button type="button" class="featured-card-play" aria-label="Play demo"></button>
         </div>`
      : '';
    if (entry.video) {
      el.modalMedia.dataset.video = entry.video;
      el.modalMedia.innerHTML = `<button type="button" class="featured-card-play" aria-label="Play demo"></button>`;
      delete el.modalMedia.dataset.mounted;
      mountVideo(el.modalMedia);
    } else {
      delete el.modalMedia.dataset.video;
      delete el.modalMedia.dataset.mounted;
      el.modalMedia.innerHTML = '';
    }

    el.modalBody.innerHTML = `
       ${entry.pitch ? `<div class="modal-pitch">${entry.pitch}</div>` : ''}
       <div class="modal-actions">
         <a class="entry-play is-large" data-entry-launch href="${escapeHtml(entry.href)}"
            ${entry.external ? 'target="_blank" rel="noopener"' : ''}
            aria-label="${escapeHtml(entry.launchLabel)}">
           <span class="play-glyph" aria-hidden="true">▶</span> Play now
         </a>
         <button type="button" class="entry-share is-wide" data-share="${escapeHtml(entry.id)}">
           <span aria-hidden="true">⇪</span> Share
         </button>
       </div>
       ${
         entry.readme
           ? `<details class="modal-notes">
                <summary>Notes, rules &amp; how it works</summary>
                <div class="modal-notes-body">
                  <p class="readme-loading">Loading notes…</p>
                </div>
              </details>`
           : ''
       }`;

    const modalShareBtn = el.modalBody.querySelector('.entry-share');
    if (modalShareBtn) {
      modalShareBtn.addEventListener('click', () => shareEntry(entry, modalShareBtn));
    }

    // The README is secondary now: only fetch it when the reader asks.
    const notes = el.modalBody.querySelector('.modal-notes');
    if (notes) {
      notes.addEventListener('toggle', async () => {
        if (!notes.open || notes.dataset.loaded) return;
        notes.dataset.loaded = '1';
        const body = notes.querySelector('.modal-notes-body');
        const md = await fetchReadme(entry.readme);
        if (md == null) {
          body.innerHTML = `<p class="readme-loading">Notes unavailable — <a href="${escapeHtml(
            entry.readme
          )}">open the raw file</a>.</p>`;
          return;
        }
        body.innerHTML = renderMarkdown(md, entry);
        typesetModal();
      });
    }

    el.overlay.classList.add('open');
    el.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    el.modalCard.scrollTop = 0;
    el.modalClose.focus();
  }

  function typesetModal() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([el.modalBody]).catch(() => {});
    }
    const diagrams = el.modalBody.querySelectorAll('.mermaid');
    if (diagrams.length && window.mermaid) {
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        window.mermaid.init(undefined, diagrams);
      } catch (_) {
        /* diagram rendering is best-effort */
      }
    }
  }

  function closeModal() {
    el.overlay.classList.remove('open');
    el.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    el.modalBody.innerHTML = '';
    el.modalMedia.innerHTML = '';
    currentEntry = null;
    closeShareMenu();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------------------------------------------------------- *
   * Structured data (ItemList) from the manifest
   * ---------------------------------------------------------- */

  function emitItemList() {
    const base = 'https://games.cognotik.com/';
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Mathematical Explorations — all entries',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: ENTRIES.length,
      itemListElement: ENTRIES.map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: e.title,
        url: e.external ? e.href : base + e.href,
      })),
    });
    document.head.appendChild(script);
  }

  /* ---------------------------------------------------------- *
   * Wiring
   * ---------------------------------------------------------- */

  function bind() {
    // Search
    const onSearch = debounce(() => {
      state.q = el.search.value.trim();
      el.searchClear.hidden = !state.q;
      writeUrlState();
      render();
    }, 140);
    el.search.addEventListener('input', onSearch);
    el.searchClear.addEventListener('click', () => {
      el.search.value = '';
      state.q = '';
      el.searchClear.hidden = true;
      writeUrlState();
      render();
      el.search.focus();
    });

    // Category tabs
    el.catTabs.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.cat-tab');
      if (!btn) return;
      state.cat = btn.dataset.cat;
      renderCatTabs();
      renderTagChips();
      writeUrlState();
      render();
    });

    // Tag chips
    el.tagChips.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.tag-chip');
      if (!chip) return;
      const tag = chip.dataset.tag;
      if (state.tags.has(tag)) state.tags.delete(tag);
      else state.tags.add(tag);
      renderTagChips();
      writeUrlState();
      render();
    });
    el.tagMore.addEventListener('click', () => {
      if (el.tagMore.dataset.open) delete el.tagMore.dataset.open;
      else el.tagMore.dataset.open = '1';
      renderTagChips();
    });

    // Sort + view
    el.sort.addEventListener('change', () => {
      state.sort = el.sort.value;
      writeUrlState();
      render();
    });
    $$('.view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        $$('.view-btn').forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.view === state.view))
        );
        writeUrlState();
        render();
      });
    });

    // Reset
    const reset = () => {
      state.q = '';
      state.cat = 'all';
      state.tags.clear();
      el.search.value = '';
      el.searchClear.hidden = true;
      renderCatTabs();
      renderTagChips();
      writeUrlState();
      render();
    };
    el.reset.addEventListener('click', reset);
    el.emptyReset.addEventListener('click', reset);

    // Cards: click / keyboard → modal; the Open button is a real link.
    el.groups.addEventListener('click', (ev) => {
      const more = ev.target.closest('.group-more');
      if (more) {
        state.expanded.add(more.dataset.group);
        render();
        return;
      }
      const shareBtn = ev.target.closest('.entry-share');
      if (shareBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        shareEntry(BY_ID.get(shareBtn.dataset.share), shareBtn);
        return;
      }
      if (ev.target.closest('a, button')) return;
      const card = ev.target.closest('.entry-card');
      if (card) openModal(card.dataset.id);
    });
    el.groups.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('.entry-card');
      if (!card || ev.target !== card) return;
      ev.preventDefault();
      openModal(card.dataset.id);
    });

    // Modal
    el.modalClose.addEventListener('click', closeModal);
    el.overlay.addEventListener('click', (ev) => {
      if (ev.target === el.overlay) closeModal();
    });
    if (el.modalShare) {
      el.modalShare.addEventListener('click', () => shareEntry(currentEntry, el.modalShare));
    }
    // Share the arcade itself from the top nav.
    const shareSite = $('#shareSite');
    if (shareSite) {
      shareSite.addEventListener('click', () => shareEntry(null, shareSite));
    }

    // Nav category jumps
    $$('[data-jump-cat]').forEach((a) => {
      a.addEventListener('click', () => {
        state.cat = a.dataset.jumpCat;
        renderCatTabs();
        renderTagChips();
        writeUrlState();
        render();
      });
    });

    // Global keys
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (shareMenuEl) {
          closeShareMenu();
          return;
        }
        if (el.overlay.classList.contains('open')) closeModal();
        else if (document.activeElement === el.search && state.q) {
          el.search.value = '';
          state.q = '';
          el.searchClear.hidden = true;
          writeUrlState();
          render();
        }
        return;
      }
      if (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        ev.preventDefault();
        el.search.focus();
        el.search.select();
      }
    });

    // Sticky-bar shadow + back-to-top
    const sentinel = document.createElement('div');
    el.browse.prepend(sentinel);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([it]) => el.bar.classList.toggle('is-stuck', !it.isIntersecting), {
        rootMargin: '-70px 0px 0px 0px',
      }).observe(sentinel);
    }

    const toTop = $('#backToTop');
    if (toTop) {
      toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      window.addEventListener(
        'scroll',
        () => toTop.classList.toggle('is-visible', window.scrollY > 600),
        { passive: true }
      );
    }
  }

  /* ---------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------- */

  async function boot() {
    Object.assign(el, {
      browse: $('#browse'),
      bar: $('#browseBar'),
      search: $('#searchInput'),
      searchClear: $('#searchClear'),
      catTabs: $('#catTabs'),
      tagRow: $('#tagRow'),
      tagChips: $('#tagChips'),
      tagMore: $('#tagMore'),
      sort: $('#sortSelect'),
      status: $('#browseStatus'),
      reset: $('#resetFilters'),
      groups: $('#entryGroups'),
      empty: $('#emptyState'),
      emptyReset: $('#emptyReset'),
      overlay: $('#modalOverlay'),
      modalCard: $('#modalCard'),
      modalIcon: $('#modalIcon'),
      modalTitle: $('#modalTitle'),
      modalSubtitle: $('#modalSubtitle'),
      modalMeta: $('#modalMeta'),
      modalMedia: $('#modalMedia'),
      modalBody: $('#modalBody'),
      modalLaunch: $('#modalLaunch'),
      modalShare: $('#modalShare'),
      modalClose: $('#modalClose'),
    });

    // Skeletons while the manifest is in flight.
    el.groups.innerHTML = `<div class="entry-grid">${'<div class="skeleton-card"></div>'.repeat(
      6
    )}</div>`;

    readUrlState();
    el.search.value = state.q;
    el.searchClear.hidden = !state.q;
    el.sort.value = state.sort;
    $$('.view-btn').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view))
    );

    let manifest;
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    } catch (err) {
      el.groups.innerHTML = '';
      el.status.textContent = 'Could not load manifest.json.';
      el.empty.hidden = false;
      $('.empty-title', el.empty).textContent = 'The manifest failed to load.';
      $('.empty-sub', el.empty).innerHTML =
        'Try a hard refresh, or browse <a href="manifest.json">manifest.json</a> directly.';
      return;
    }

    ENTRIES = (manifest.entries || [])
      .filter((e) => e && !e.hidden && e.href && e.title)
      .filter((e) => !ALLOWED_CATEGORIES || ALLOWED_CATEGORIES.has(e.category || 'lab'))
      .map(normalizeEntry);
    ENTRIES.sort(curatedCompare);
    for (const e of ENTRIES) BY_ID.set(e.id, e);
    if (SITE.hideCategoryTabs) document.body.setAttribute('data-single-category', '');

    renderCatTabs();
    renderTagChips();
    bind();
    render();
    emitItemList();

    // Deep link: ?entry=<id> opens that entry's notes immediately.
    const wanted = new URLSearchParams(location.search).get('entry');
    if (wanted && BY_ID.has(wanted)) openModal(wanted);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
