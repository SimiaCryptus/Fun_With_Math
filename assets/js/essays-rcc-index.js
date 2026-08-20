/**
 * Rational Certificate Complexity - Interactive Article
 *
 * This script provides:
 * - Smooth scrolling navigation
 * - Active section highlighting in nav menu
 * - Scroll-triggered reveal animations
 * - Reading progress indicator
 * - Mobile menu toggle (if applicable)
 * - Copy-to-clipboard for math blocks
 * - Table row interactivity
 * - Complexity class card interaction
 */

(() => {
  'use strict';

  // ============================================
  // 1. INITIALIZATION
  // ============================================
  document.addEventListener('DOMContentLoaded', () => {
    initSmoothScroll();
    initScrollSpy();
    initRevealOnScroll();
    initReadingProgress();
    initMathBlockCopy();
    initTableHover();
    initComplexityCardToggle();
    initMobileNav();
    initBackToTop();
    console.log('[RC Complexity] Article interactivity initialized.');
  });

  // ============================================
  // 2. SMOOTH SCROLL FOR NAV LINKS
  // ============================================
  function initSmoothScroll() {
    const navLinks = document.querySelectorAll('.nav-link, .brand-link');

    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;

        const target = href === '#' ? document.body : document.querySelector(href);
        if (!target) return;

        e.preventDefault();
        const headerOffset = document.querySelector('.site-header')?.offsetHeight || 0;
        const targetPos =
          target.getBoundingClientRect().top + window.pageYOffset - headerOffset - 20;

        window.scrollTo({
          top: targetPos,
          behavior: 'smooth',
        });

        // Close mobile menu if open
        document.querySelector('.nav-menu')?.classList.remove('nav-menu-open');
      });
    });
  }

  // ============================================
  // 3. SCROLLSPY - HIGHLIGHT ACTIVE SECTION
  // ============================================
  function initScrollSpy() {
    const sections = document.querySelectorAll('.article-section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    if (!sections.length || !navLinks.length) return;

    const linkMap = new Map();
    navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        linkMap.set(href.slice(1), link);
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id;
          const link = linkMap.get(id);
          if (!link) return;

          if (entry.isIntersecting) {
            navLinks.forEach((l) => l.classList.remove('nav-link-active'));
            link.classList.add('nav-link-active');
          }
        });
      },
      {
        rootMargin: '-30% 0px -60% 0px',
        threshold: 0,
      }
    );

    sections.forEach((section) => observer.observe(section));
  }

  // ============================================
  // 4. REVEAL ON SCROLL
  // ============================================
  function initRevealOnScroll() {
    const revealTargets = document.querySelectorAll(
      '.article-section, .callout, .series-card, .framework-card, .complexity-class, .math-block, .central-claim, .definition-blockquote'
    );

    if (!revealTargets.length) return;

    // Set initial state via class
    revealTargets.forEach((el) => el.classList.add('reveal-init'));

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
      }
    );

    revealTargets.forEach((el) => revealObserver.observe(el));
  }

  // ============================================
  // 5. READING PROGRESS INDICATOR
  // ============================================
  function initReadingProgress() {
    // Create progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'reading-progress';
    progressBar.setAttribute('aria-hidden', 'true');
    const progressFill = document.createElement('div');
    progressFill.className = 'reading-progress-fill';
    progressBar.appendChild(progressFill);
    document.body.appendChild(progressBar);

    const article = document.querySelector('.article-main');
    if (!article) return;

    const updateProgress = () => {
      const articleTop = article.offsetTop;
      const articleHeight = article.offsetHeight;
      const scrollTop = window.pageYOffset;
      const windowHeight = window.innerHeight;

      const start = articleTop - windowHeight * 0.2;
      const end = articleTop + articleHeight - windowHeight;
      const progress = Math.min(Math.max((scrollTop - start) / (end - start), 0), 1);

      progressFill.style.width = `${progress * 100}%`;
    };

    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            updateProgress();
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );

    updateProgress();
  }

  // ============================================
  // 6. COPY MATH BLOCKS TO CLIPBOARD
  // ============================================
  function initMathBlockCopy() {
    const mathBlocks = document.querySelectorAll('.math-block');

    mathBlocks.forEach((block) => {
      // Wrap in container for positioning the button
      block.classList.add('math-block-interactive');

      const copyBtn = document.createElement('button');
      copyBtn.className = 'math-copy-btn';
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.setAttribute('aria-label', 'Copy formula to clipboard');

      copyBtn.addEventListener('click', async () => {
        const code = block.querySelector('.math-code');
        if (!code) return;

        const text = code.textContent.trim();

        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
          } else {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }

          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('math-copy-btn-success');

          setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('math-copy-btn-success');
          }, 1800);
        } catch (err) {
          console.warn('[RC Complexity] Copy failed:', err);
          copyBtn.textContent = 'Failed';
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
          }, 1800);
        }
      });

      block.appendChild(copyBtn);
    });
  }

  // ============================================
  // 7. TABLE ROW HOVER INTERACTION
  // ============================================
  function initTableHover() {
    const rows = document.querySelectorAll('.complexity-table .table-row');

    rows.forEach((row) => {
      row.addEventListener('mouseenter', () => {
        row.classList.add('table-row-hover');
      });
      row.addEventListener('mouseleave', () => {
        row.classList.remove('table-row-hover');
      });

      // Click to "pin" row highlight
      row.addEventListener('click', () => {
        const wasActive = row.classList.contains('table-row-active');
        rows.forEach((r) => r.classList.remove('table-row-active'));
        if (!wasActive) row.classList.add('table-row-active');
      });
    });
  }

  // ============================================
  // 8. COMPLEXITY CLASS CARD EXPANSION
  // ============================================
  function initComplexityCardToggle() {
    const classes = document.querySelectorAll('.complexity-class');

    classes.forEach((card) => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');

      const toggle = () => {
        const isExpanded = card.classList.toggle('complexity-class-expanded');
        card.setAttribute('aria-expanded', String(isExpanded));
      };

      card.addEventListener('click', toggle);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  // ============================================
  // 9. MOBILE NAVIGATION TOGGLE
  // ============================================
  function initMobileNav() {
    const nav = document.querySelector('.site-nav');
    const menu = document.querySelector('.nav-menu');
    if (!nav || !menu) return;

    // Create toggle button
    const toggle = document.createElement('button');
    toggle.className = 'nav-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Toggle navigation menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML =
      '<span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span>';

    nav.appendChild(toggle);

    toggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('nav-menu-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.classList.toggle('nav-toggle-active', isOpen);
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target) && menu.classList.contains('nav-menu-open')) {
        menu.classList.remove('nav-menu-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.classList.remove('nav-toggle-active');
      }
    });
  }

  // ============================================
  // 10. BACK TO TOP BUTTON
  // ============================================
  function initBackToTop() {
    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '↑';
    document.body.appendChild(btn);

    const toggleVisibility = () => {
      if (window.pageYOffset > 600) {
        btn.classList.add('back-to-top-visible');
      } else {
        btn.classList.remove('back-to-top-visible');
      }
    };

    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            toggleVisibility();
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    toggleVisibility();
  }
})();
