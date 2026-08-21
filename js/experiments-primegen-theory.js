/* Theory Browser integration for the primegen lab index.
 *
 *  - injects a "Theory Browser" card into #cards (idempotent; survives a late
 *    or repeated rebuild of the grid by experiments-primegen-index-3.js)
 *  - lazy-loads the #theory iframe the first time it scrolls into view
 *  - "reload ↻" re-mounts the iframe; hotkey 4 focuses/embeds the browser
 *
 *  Everything here degrades quietly: if the host page changed, we bail out
 *  instead of throwing.
 */
(function () {
  'use strict';

  var SRC = './analysis/theory_browser.html';
  var CARD_KEY = 'theory-browser';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  /* ---------------------------------------------------------------- embed */

  function mountFrame(force) {
    var f = $('#tbFrame');
    if (!f) return null;
    var want = f.getAttribute('data-src') || SRC;
    var cur = f.getAttribute('src') || '';
    if (force || cur === '' || cur === 'about:blank') {
      f.setAttribute('src', want);
    }
    return f;
  }

  function lazyMount() {
    var f = $('#tbFrame');
    if (!f) return;

    if (!('IntersectionObserver' in window)) {
      mountFrame(false);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            mountFrame(false);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: '300px 0px' }
    );
    io.observe(f);

    // if the page loads with #theory in the hash, mount immediately
    if (location.hash === '#theory') mountFrame(false);
  }

  function wireReload() {
    var btn = $('#tbReload');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var f = mountFrame(true);
      if (!f) return;
      // force a real reload even when the src is unchanged
      var s = f.getAttribute('data-src') || SRC;
      f.setAttribute('src', 'about:blank');
      window.setTimeout(function () {
        f.setAttribute('src', s + '?t=' + Date.now());
      }, 0);
    });
  }

  /* ------------------------------------------------------- viewer bridge */

  // Re-use the generic embed panel at the top of the page when it exists.
  function openInViewer(name, path) {
    var panel = $('#viewer');
    var frame = $('#frame');
    if (!panel || !frame) return false;

    var nameEl = $('#vName');
    var pathEl = $('#vPath');
    var openEl = $('#vOpen');
    if (nameEl) nameEl.textContent = name;
    if (pathEl) pathEl.textContent = path;
    if (openEl) openEl.setAttribute('href', path);

    panel.classList.remove('hidden');
    panel.removeAttribute('hidden');
    frame.setAttribute('src', path);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function reveal() {
    if (openInViewer('Theory Browser', SRC)) return;
    var sec = $('#theory');
    if (!sec) {
      window.open(SRC, '_blank', 'noopener');
      return;
    }
    mountFrame(false);
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ------------------------------------------------------------- the card */

  function buildCard() {
    var card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('data-rr-card', CARD_KEY);
    card.setAttribute('data-view', SRC);

    var kicker = document.createElement('div');
    kicker.className = 'k';
    kicker.textContent = 'graph view';

    var h = document.createElement('h3');
    h.textContent = 'Theory Browser';

    var p = document.createElement('p');
    p.textContent =
      'Navigate the derivation graph: definitions, lemmas and their dependencies, ' +
      'a map of the corpus, and the list of still-unresolved claims.';

    var row = document.createElement('div');
    row.className = 'row';

    var embed = document.createElement('button');
    embed.type = 'button';
    embed.className = 'btn primary';
    embed.textContent = 'open here';
    embed.addEventListener('click', function (e) {
      e.preventDefault();
      reveal();
    });

    var tab = document.createElement('a');
    tab.className = 'btn';
    tab.href = SRC;
    tab.target = '_blank';
    tab.rel = 'noopener';
    tab.textContent = 'new tab ↗';

    row.appendChild(embed);
    row.appendChild(tab);

    card.appendChild(kicker);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(row);
    return card;
  }

  function ensureCard() {
    var cards = $('#cards');
    if (!cards) return;
    if (cards.querySelector('[data-rr-card="' + CARD_KEY + '"]')) return;
    // the card builder may already know about the browser — do not duplicate
    if (cards.querySelector('a[href*="theory_browser"], [data-view*="theory_browser"]')) return;
    cards.appendChild(buildCard());
  }

  function watchCards() {
    var cards = $('#cards');
    if (!cards || !('MutationObserver' in window)) return;
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      window.setTimeout(function () {
        pending = false;
        ensureCard();
      }, 0);
    });
    mo.observe(cards, { childList: true });
  }

  /* -------------------------------------------------------------- hotkey */

  function wireHotkey() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== '4' || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable))
        return;
      e.preventDefault();
      reveal();
    });
  }

  /* ---------------------------------------------------------------- boot */

  function boot() {
    ensureCard();
    watchCards();
    // the grid is sometimes built asynchronously; re-check a couple of times
    window.setTimeout(ensureCard, 250);
    window.setTimeout(ensureCard, 1000);

    lazyMount();
    wireReload();
    wireHotkey();

    window.addEventListener('hashchange', function () {
      if (location.hash === '#theory') mountFrame(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
