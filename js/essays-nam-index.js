// ============================================================
// NUMBERS AS MACHINES — Interactive JavaScript
// ============================================================

(function () {
  'use strict';

  // ============================================================
  // UTILITY HELPERS
  // ============================================================

  /**
   * Throttle a function to run at most once per `limit` ms.
   */
  function throttle(fn, limit) {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= limit) {
        lastCall = now;
        fn.apply(this, args);
      }
    };
  }

  /**
   * Debounce a function — only call after `delay` ms of silence.
   */
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ============================================================
  // 1. MOBILE NAVIGATION TOGGLE
  // ============================================================

  function initMobileNav() {
    const toggle = document.querySelector('.mobile-menu-toggle');
    const nav = document.querySelector('.header-nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isExpanded));
      nav.classList.toggle('header-nav--open', !isExpanded);
      toggle.classList.toggle('mobile-menu-toggle--active', !isExpanded);
    });

    // Close nav when a link is clicked (mobile UX)
    nav.querySelectorAll('.header-nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('header-nav--open');
        toggle.classList.remove('mobile-menu-toggle--active');
      });
    });

    // Close nav on outside click
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) {
        toggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('header-nav--open');
        toggle.classList.remove('mobile-menu-toggle--active');
      }
    });
  }

  // ============================================================
  // 2. STICKY HEADER — shrink on scroll
  // ============================================================

  function initStickyHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const onScroll = throttle(() => {
      header.classList.toggle('site-header--scrolled', window.scrollY > 60);
    }, 100);

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ============================================================
  // 3. READING PROGRESS BAR
  // ============================================================

  function initReadingProgress() {
    const bar = document.querySelector('.toc-progress-bar');
    if (!bar) return;

    const onScroll = throttle(() => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
      bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }, 50);

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ============================================================
  // 4. TABLE OF CONTENTS — active section highlighting
  // ============================================================

  function initTocHighlight() {
    const tocLinks = document.querySelectorAll('.toc-link');
    const sections = document.querySelectorAll('.article-section[id]');
    if (!tocLinks.length || !sections.length) return;

    // Build a map: section id → toc link(s)
    const linkMap = new Map();
    tocLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const id = href.slice(1);
        if (!linkMap.has(id)) linkMap.set(id, []);
        linkMap.get(id).push(link);
      }
    });

    let activeId = null;

    const onScroll = throttle(() => {
      const scrollY = window.scrollY;
      const offset = 120; // header height buffer

      let currentId = null;

      sections.forEach((section) => {
        const top = section.getBoundingClientRect().top + scrollY - offset;
        if (scrollY >= top) {
          currentId = section.id;
        }
      });

      if (currentId !== activeId) {
        activeId = currentId;

        // Remove all active states
        tocLinks.forEach((link) => link.classList.remove('toc-link--active'));

        // Set active state on matching links
        if (activeId && linkMap.has(activeId)) {
          linkMap.get(activeId).forEach((link) => link.classList.add('toc-link--active'));
        }
      }
    }, 80);

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once on load
  }

  // ============================================================
  // 5. SMOOTH SCROLL for anchor links
  // ============================================================

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href').slice(1);
        const target = document.getElementById(targetId);
        if (!target) return;

        e.preventDefault();

        const headerHeight = document.querySelector('.site-header')?.offsetHeight ?? 0;
        const targetTop = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;

        window.scrollTo({ top: targetTop, behavior: 'smooth' });

        // Update URL hash without jumping
        history.pushState(null, '', `#${targetId}`);

        // Move focus to target for accessibility
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      });
    });
  }

  // ============================================================
  // 6. SECTION ENTRANCE ANIMATIONS (IntersectionObserver)
  // ============================================================

  function initSectionAnimations() {
    if (!('IntersectionObserver' in window)) return;

    const animatables = document.querySelectorAll(
      '.article-section, .property-card, .roadmap-phase, .classification-card, ' +
        '.primitive-block, .hero-stat-badge, .api-layer, .ontology-item'
    );

    // Add initial hidden state via JS (so CSS-only users still see content)
    animatables.forEach((el) => el.classList.add('js-animate-hidden'));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove('js-animate-hidden');
            entry.target.classList.add('js-animate-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    animatables.forEach((el) => observer.observe(el));
  }

  // ============================================================
  // 7. CODE BLOCK — COPY TO CLIPBOARD
  // ============================================================

  function initCodeCopy() {
    document.querySelectorAll('.code-block').forEach((block) => {
      // Wrap in a relative container if not already
      const figure = block.closest('.code-figure');
      const wrapper = figure || block.parentElement;

      // Avoid adding duplicate buttons
      if (wrapper.querySelector('.code-copy-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      btn.textContent = 'Copy';

      btn.addEventListener('click', async () => {
        const code = block.querySelector('.code-content')?.textContent ?? block.textContent;
        try {
          await navigator.clipboard.writeText(code.trim());
          btn.textContent = 'Copied!';
          btn.classList.add('code-copy-btn--success');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('code-copy-btn--success');
          }, 2000);
        } catch {
          btn.textContent = 'Failed';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 2000);
        }
      });

      // Position button inside the figure/wrapper
      if (figure) {
        figure.style.position = 'relative';
        figure.appendChild(btn);
      } else {
        block.style.position = 'relative';
        block.appendChild(btn);
      }
    });
  }

  // ============================================================
  // 8. COLLAPSIBLE TABLE OF CONTENTS (mobile sidebar toggle)
  // ============================================================

  function initTocCollapse() {
    const tocInner = document.querySelector('.toc-inner');
    const tocHeading = document.querySelector('.toc-heading');
    if (!tocInner || !tocHeading) return;

    // Only activate on smaller screens
    const mq = window.matchMedia('(max-width: 1024px)');

    function applyCollapse(matches) {
      if (matches) {
        tocHeading.setAttribute('role', 'button');
        tocHeading.setAttribute('tabindex', '0');
        tocHeading.setAttribute('aria-expanded', 'false');
        tocHeading.setAttribute('aria-controls', 'toc-nav-list');

        const tocNav = tocInner.querySelector('.toc-nav');
        if (tocNav) {
          tocNav.id = 'toc-nav-list';
          tocNav.classList.add('toc-nav--collapsible');
          tocNav.classList.remove('toc-nav--expanded');
        }

        function toggleToc() {
          const isExpanded = tocHeading.getAttribute('aria-expanded') === 'true';
          tocHeading.setAttribute('aria-expanded', String(!isExpanded));
          tocNav?.classList.toggle('toc-nav--expanded', !isExpanded);
        }

        tocHeading.addEventListener('click', toggleToc);
        tocHeading.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleToc();
          }
        });
      } else {
        // Reset for desktop
        tocHeading.removeAttribute('role');
        tocHeading.removeAttribute('tabindex');
        tocHeading.removeAttribute('aria-expanded');
        tocHeading.removeAttribute('aria-controls');
        const tocNav = tocInner.querySelector('.toc-nav');
        if (tocNav) {
          tocNav.classList.remove('toc-nav--collapsible', 'toc-nav--expanded');
        }
      }
    }

    applyCollapse(mq.matches);
    mq.addEventListener('change', (e) => applyCollapse(e.matches));
  }

  // ============================================================
  // 9. HERO DIGIT STREAM ANIMATION
  // ============================================================

  function initHeroAnimation() {
    const primitiveCode = document.querySelector('.hero-primitive-block .primitive-code code');
    if (!primitiveCode) return;

    const originalText = primitiveCode.textContent;

    // Simulate a "typing" reveal on first load
    primitiveCode.textContent = '';
    primitiveCode.setAttribute('aria-label', originalText);

    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.textContent = '▌';
    primitiveCode.appendChild(cursor);

    const typeInterval = setInterval(() => {
      if (i < originalText.length) {
        primitiveCode.insertBefore(document.createTextNode(originalText[i]), cursor);
        i++;
      } else {
        clearInterval(typeInterval);
        // Blink cursor then fade it out
        setTimeout(() => {
          cursor.classList.add('typing-cursor--fade');
          setTimeout(() => cursor.remove(), 1000);
        }, 1500);
      }
    }, 38);
  }

  // ============================================================
  // 10. STAT BADGE COUNTER ANIMATION
  // ============================================================

  function initStatBadges() {
    // The stat badges have symbolic values (∞, O(1), etc.) — we animate
    // their entrance with a subtle scale+fade rather than counting.
    const badges = document.querySelectorAll('.hero-stat-badge');
    if (!badges.length || !('IntersectionObserver' in window)) return;

    badges.forEach((badge, i) => {
      badge.style.opacity = '0';
      badge.style.transform = 'translateY(16px)';
      badge.style.transition = `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    badges.forEach((badge) => observer.observe(badge));
  }

  // ============================================================
  // 11. ROADMAP PHASE — expand/collapse deliverables on mobile
  // ============================================================

  function initRoadmapPhases() {
    const phases = document.querySelectorAll('.roadmap-phase');
    if (!phases.length) return;

    phases.forEach((phase) => {
      const header = phase.querySelector('.roadmap-phase-header');
      const deliverables = phase.querySelector('.phase-deliverables');
      const desc = phase.querySelector('.phase-desc');
      if (!header || !deliverables) return;

      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', 'true');

      const phaseId = `phase-deliverables-${phase.id || Math.random().toString(36).slice(2)}`;
      deliverables.id = phaseId;
      if (desc) desc.id = `${phaseId}-desc`;
      header.setAttribute('aria-controls', phaseId);

      function togglePhase() {
        const isExpanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(!isExpanded));
        deliverables.classList.toggle('phase-deliverables--collapsed', isExpanded);
        if (desc) desc.classList.toggle('phase-desc--collapsed', isExpanded);
      }

      header.addEventListener('click', togglePhase);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          togglePhase();
        }
      });
    });
  }

  // ============================================================
  // 12. DATA TABLE — highlight row on hover/focus
  // ============================================================

  function initTableInteractions() {
    document.querySelectorAll('.data-table tbody tr').forEach((row) => {
      row.setAttribute('tabindex', '0');

      row.addEventListener('mouseenter', () => row.classList.add('table-row--highlighted'));
      row.addEventListener('mouseleave', () => row.classList.remove('table-row--highlighted'));
      row.addEventListener('focus', () => row.classList.add('table-row--highlighted'));
      row.addEventListener('blur', () => row.classList.remove('table-row--highlighted'));
    });
  }

  // ============================================================
  // 13. CALLOUT BLOCKS — dismiss optional callouts
  // ============================================================

  function initCalloutDismiss() {
    // Only dismissible callouts get a close button (info and caveat types)
    document.querySelectorAll('.callout--info, .callout--caveat').forEach((callout) => {
      const btn = document.createElement('button');
      btn.className = 'callout-dismiss';
      btn.setAttribute('aria-label', 'Dismiss this note');
      btn.innerHTML = '&times;';

      btn.addEventListener('click', () => {
        callout.classList.add('callout--dismissed');
        setTimeout(() => callout.remove(), 300);
      });

      callout.appendChild(btn);
    });
  }

  // ============================================================
  // 14. BACK TO TOP BUTTON
  // ============================================================

  function initBackToTop() {
    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '↑';
    document.body.appendChild(btn);

    const onScroll = throttle(() => {
      btn.classList.toggle('back-to-top--visible', window.scrollY > 500);
    }, 150);

    window.addEventListener('scroll', onScroll, { passive: true });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ============================================================
  // 15. KEYBOARD NAVIGATION — skip to main content
  // ============================================================

  function initSkipLink() {
    const skip = document.createElement('a');
    skip.href = '#main-content';
    skip.className = 'skip-link';
    skip.textContent = 'Skip to main content';
    document.body.insertBefore(skip, document.body.firstChild);
  }

  // ============================================================
  // 16. SECTION NUMBER TOOLTIP on hover
  // ============================================================

  function initSectionNumberTooltips() {
    document.querySelectorAll('.section-number').forEach((num) => {
      const section = num.closest('.article-section');
      const title = section?.querySelector('.section-title')?.textContent?.trim();
      if (!title) return;

      num.setAttribute('title', `Section: ${title}`);
      num.setAttribute('aria-label', `Section number for: ${title}`);
    });
  }

  // ============================================================
  // 17. PRIMITIVE BLOCKS — subtle hover effect with keyboard support
  // ============================================================

  function initPrimitiveBlocks() {
    document.querySelectorAll('.primitive-block').forEach((block) => {
      block.setAttribute('tabindex', '0');

      block.addEventListener('mouseenter', () => block.classList.add('primitive-block--active'));
      block.addEventListener('mouseleave', () => block.classList.remove('primitive-block--active'));
      block.addEventListener('focus', () => block.classList.add('primitive-block--active'));
      block.addEventListener('blur', () => block.classList.remove('primitive-block--active'));
    });
  }

  // ============================================================
  // 18. ONTOLOGY BREAKDOWN — staggered entrance
  // ============================================================

  function initOntologyAnimation() {
    const items = document.querySelectorAll('.ontology-item');
    if (!items.length || !('IntersectionObserver' in window)) return;

    items.forEach((item, i) => {
      item.style.opacity = '0';
      item.style.transform = 'translateX(-20px)';
      item.style.transition = `opacity 0.4s ease ${i * 0.15}s, transform 0.4s ease ${i * 0.15}s`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateX(0)';
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );

    items.forEach((item) => observer.observe(item));
  }

  // ============================================================
  // 19. MANIFESTO LIST — staggered entrance
  // ============================================================

  function initManifestoAnimation() {
    const items = document.querySelectorAll('.manifesto-item');
    if (!items.length || !('IntersectionObserver' in window)) return;

    items.forEach((item, i) => {
      item.style.opacity = '0';
      item.style.transform = 'translateX(-12px)';
      item.style.transition = `opacity 0.35s ease ${i * 0.07}s, transform 0.35s ease ${i * 0.07}s`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Trigger all items in the list together when the list enters view
            const list = entry.target.closest('.manifesto-list');
            if (list) {
              list.querySelectorAll('.manifesto-item').forEach((item) => {
                item.style.opacity = '1';
                item.style.transform = 'translateX(0)';
              });
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    // Observe the first item as a proxy for the whole list
    if (items[0]) observer.observe(items[0]);
  }

  // ============================================================
  // 20. ACTIVE HEADER NAV LINK based on scroll position
  // ============================================================

  function initHeaderNavHighlight() {
    const navLinks = document.querySelectorAll('.header-nav-link');
    if (!navLinks.length) return;

    const sectionIds = Array.from(navLinks)
      .map((link) => link.getAttribute('href')?.slice(1))
      .filter(Boolean);

    const onScroll = throttle(() => {
      const scrollY = window.scrollY;
      const offset = 140;
      let activeId = null;

      sectionIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const top = el.getBoundingClientRect().top + scrollY - offset;
        if (scrollY >= top) activeId = id;
      });

      navLinks.forEach((link) => {
        const href = link.getAttribute('href')?.slice(1);
        link.classList.toggle('header-nav-link--active', href === activeId);
      });
    }, 100);

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ============================================================
  // 21. INJECT NECESSARY CSS for JS-driven features
  // ============================================================

  function injectDynamicStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Skip link */
        .skip-link {
          position: fixed;
          top: -100%;
          left: 1rem;
          z-index: 9999;
          padding: 0.5rem 1rem;
          background: #1a1a2e;
          color: #fff;
          border-radius: 4px;
          font-size: 0.875rem;
          text-decoration: none;
          transition: top 0.2s;
        }
        .skip-link:focus { top: 1rem; }
  
        /* Mobile nav open state */
        .header-nav--open {
          display: flex !important;
          flex-direction: column;
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--color-surface, #0f0f1a);
          padding: 1rem;
          border-top: 1px solid rgba(255,255,255,0.08);
          z-index: 100;
        }
  
        /* Scrolled header */
        .site-header--scrolled {
          box-shadow: 0 2px 20px rgba(0,0,0,0.4);
        }
  
        /* Active TOC link */
        .toc-link--active {
          color: var(--color-accent, #7c6af7) !important;
          font-weight: 600;
        }
  
        /* Active header nav link */
        .header-nav-link--active {
          color: var(--color-accent, #7c6af7) !important;
        }
  
        /* Hamburger active */
        .mobile-menu-toggle--active .hamburger-line:nth-child(1) {
          transform: translateY(7px) rotate(45deg);
        }
        .mobile-menu-toggle--active .hamburger-line:nth-child(2) {
          opacity: 0;
        }
        .mobile-menu-toggle--active .hamburger-line:nth-child(3) {
          transform: translateY(-7px) rotate(-45deg);
        }
  
        /* JS animation classes */
        .js-animate-hidden {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.55s ease, transform 0.55s ease;
        }
        .js-animate-visible {
          opacity: 1;
          transform: translateY(0);
        }
  
        /* Code copy button */
        .code-copy-btn {
          position: absolute;
          top: 0.6rem;
          right: 0.6rem;
          padding: 0.25rem 0.6rem;
          font-size: 0.7rem;
          font-family: inherit;
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.6);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
          z-index: 10;
        }
        .code-copy-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
        .code-copy-btn--success { background: rgba(100,220,120,0.2); color: #6ddc78; border-color: #6ddc78; }
  
        /* Typing cursor */
        .typing-cursor {
          display: inline-block;
          animation: blink 0.8s step-end infinite;
          color: var(--color-accent, #7c6af7);
        }
        .typing-cursor--fade { animation: none; opacity: 0; transition: opacity 1s; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  
        /* Back to top */
        .back-to-top {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 50%;
          background: var(--color-accent, #7c6af7);
          color: #fff;
          border: none;
          font-size: 1.1rem;
          cursor: pointer;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.3s, transform 0.3s;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(124,106,247,0.4);
        }
        .back-to-top--visible { opacity: 1; transform: translateY(0); }
        .back-to-top:hover { background: var(--color-accent-light, #9b8df9); }
  
        /* Highlighted table row */
        .table-row--highlighted { background: rgba(124,106,247,0.08) !important; }
  
        /* Callout dismiss button */
        .callout-dismiss {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: none;
          border: none;
          color: inherit;
          opacity: 0.5;
          cursor: pointer;
          font-size: 1.1rem;
          line-height: 1;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          transition: opacity 0.2s;
        }
        .callout-dismiss:hover { opacity: 1; }
        .callout--dismissed { opacity: 0; transform: translateY(-8px); transition: opacity 0.3s, transform 0.3s; }
  
        /* Collapsible TOC on mobile */
        .toc-nav--collapsible { overflow: hidden; max-height: 0; transition: max-height 0.35s ease; }
        .toc-nav--collapsible.toc-nav--expanded { max-height: 2000px; }
  
        /* Collapsible phase deliverables */
        .phase-deliverables--collapsed,
        .phase-desc--collapsed { display: none; }
  
        /* Primitive block active */
        .primitive-block--active { outline: 2px solid var(--color-accent, #7c6af7); outline-offset: 2px; }
  
        /* Callout position for dismiss button */
        .callout--info, .callout--caveat { position: relative; }
      `;
    document.head.appendChild(style);
  }

  // ============================================================
  // INIT — run all modules after DOM is ready
  // ============================================================

  function init() {
    injectDynamicStyles();
    initSkipLink();
    initMobileNav();
    initStickyHeader();
    initReadingProgress();
    initTocHighlight();
    initTocCollapse();
    initSmoothScroll();
    initSectionAnimations();
    initCodeCopy();
    initHeroAnimation();
    initStatBadges();
    initRoadmapPhases();
    initTableInteractions();
    initCalloutDismiss();
    initBackToTop();
    initSectionNumberTooltips();
    initPrimitiveBlocks();
    initOntologyAnimation();
    initManifestoAnimation();
    initHeaderNavHighlight();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
