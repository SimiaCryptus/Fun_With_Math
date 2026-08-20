// ============================================================
// MATHEMATICAL CONTINUA - Interactive Article JavaScript
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // ============================================================
  // 1. MOBILE NAVIGATION TOGGLE
  // ============================================================
  const menuToggle = document.querySelector('.site-nav__menu-toggle');
  const navLinks = document.querySelector('.site-nav__links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isExpanded));
      navLinks.classList.toggle('site-nav__links--open');
      menuToggle.classList.toggle('site-nav__menu-toggle--active');
    });

    // Close menu when a nav link is clicked
    navLinks.querySelectorAll('.site-nav__link').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('site-nav__links--open');
        menuToggle.classList.remove('site-nav__menu-toggle--active');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ============================================================
  // 2. SMOOTH SCROLL FOR ALL ANCHOR LINKS
  // ============================================================
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerHeight = document.querySelector('.site-header')?.offsetHeight || 0;
        const targetTop = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    });
  });

  // ============================================================
  // 3. ACTIVE SECTION HIGHLIGHTING IN TABLE OF CONTENTS
  // ============================================================
  const tocLinks = document.querySelectorAll('.table-of-contents__link');
  const articleSections = document.querySelectorAll('.article-section, .article-subsection');
  const headerHeight = document.querySelector('.site-header')?.offsetHeight || 0;

  const setActiveTocLink = () => {
    let currentId = '';
    articleSections.forEach((section) => {
      const sectionTop = section.getBoundingClientRect().top;
      if (sectionTop <= headerHeight + 80) {
        currentId = section.getAttribute('id');
      }
    });

    tocLinks.forEach((link) => {
      link.classList.remove('table-of-contents__link--active');
      if (link.getAttribute('href') === `#${currentId}`) {
        link.classList.add('table-of-contents__link--active');
      }
    });
  };

  window.addEventListener('scroll', setActiveTocLink, { passive: true });
  setActiveTocLink();

  // ============================================================
  // 4. ACTIVE NAV LINK HIGHLIGHTING ON SCROLL
  // ============================================================
  const navSectionLinks = document.querySelectorAll('.site-nav__link');

  const setActiveNavLink = () => {
    let currentId = '';
    document.querySelectorAll('section[id], div[id]').forEach((section) => {
      const sectionTop = section.getBoundingClientRect().top;
      if (sectionTop <= headerHeight + 100) {
        currentId = section.getAttribute('id');
      }
    });

    navSectionLinks.forEach((link) => {
      link.classList.remove('site-nav__link--active');
      if (link.getAttribute('href') === `#${currentId}`) {
        link.classList.add('site-nav__link--active');
      }
    });
  };

  window.addEventListener('scroll', setActiveNavLink, { passive: true });

  // ============================================================
  // 5. SCROLL-TRIGGERED SECTION REVEAL ANIMATIONS
  // ============================================================
  const revealElements = document.querySelectorAll(
    '.article-section, .convergence-visual, .derivation-block, ' +
      '.verification-block, .engine-taxonomy, .continua-tower, ' +
      '.key-demonstrations, .closing-principle, .design-template, ' +
      '.definition-block, .general-template, .minimal-expansion, ' +
      '.research-question, .practical-example, .insight-callout, ' +
      '.technical-note, .comparison-note'
  );

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.08,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  revealElements.forEach((el) => {
    el.classList.add('reveal-on-scroll');
    revealObserver.observe(el);
  });

  // ============================================================
  // 6. CONVERGENCE STEPS STAGGERED ANIMATION
  // ============================================================
  const convergenceSteps = document.querySelectorAll('.convergence-step');
  const convergenceObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          convergenceSteps.forEach((step, index) => {
            setTimeout(() => {
              step.classList.add('convergence-step--animated');
            }, index * 200);
          });
          convergenceObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  const convergenceVisual = document.querySelector('.convergence-visual');
  if (convergenceVisual) {
    convergenceObserver.observe(convergenceVisual);
  }

  // ============================================================
  // 7. CONDITIONS LIST STAGGERED REVEAL
  // ============================================================
  const conditionItems = document.querySelectorAll('.conditions-list__item');
  const conditionsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          conditionItems.forEach((item, index) => {
            setTimeout(() => {
              item.classList.add('conditions-list__item--visible');
            }, index * 250);
          });
          conditionsObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  const conditionsList = document.querySelector('.conditions-list');
  if (conditionsList) {
    conditionsObserver.observe(conditionsList);
  }

  // ============================================================
  // 8. VERIFICATION CHECKS STAGGERED ANIMATION
  // ============================================================
  const verificationChecks = document.querySelectorAll('.verification-check');
  const verificationObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          verificationChecks.forEach((check, index) => {
            setTimeout(() => {
              check.classList.add('verification-check--revealed');
            }, index * 300);
          });
          verificationObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  const verificationBlock = document.querySelector('.verification-block');
  if (verificationBlock) {
    verificationObserver.observe(verificationBlock);
  }

  // ============================================================
  // 9. ENGINE CARDS STAGGERED ANIMATION
  // ============================================================
  const engineCards = document.querySelectorAll('.engine-card');
  const engineObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          engineCards.forEach((card, index) => {
            setTimeout(() => {
              card.classList.add('engine-card--visible');
            }, index * 150);
          });
          engineObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  const engineTaxonomy = document.querySelector('.engine-taxonomy__grid');
  if (engineTaxonomy) {
    engineObserver.observe(engineTaxonomy);
  }

  // ============================================================
  // 10. TOWER LAYERS STAGGERED ANIMATION
  // ============================================================
  const towerLayers = document.querySelectorAll('.tower-layer');
  const towerObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          towerLayers.forEach((layer, index) => {
            setTimeout(() => {
              layer.classList.add('tower-layer--visible');
            }, index * 180);
          });
          towerObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  const continuaTower = document.querySelector('.continua-tower__layers');
  if (continuaTower) {
    towerObserver.observe(continuaTower);
  }

  // ============================================================
  // 11. DERIVATION STEPS SEQUENTIAL REVEAL
  // ============================================================
  const derivationSteps = document.querySelectorAll('.derivation-block__step');
  const derivationObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          derivationSteps.forEach((step, index) => {
            setTimeout(() => {
              step.classList.add('derivation-block__step--visible');
            }, index * 350);
          });
          derivationObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  const derivationBlock = document.querySelector('.derivation-block');
  if (derivationBlock) {
    derivationObserver.observe(derivationBlock);
  }

  // ============================================================
  // 12. DEMONSTRATIONS STAGGERED ANIMATION
  // ============================================================
  const demonstrations = document.querySelectorAll('.demonstration');
  const demoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          demonstrations.forEach((demo, index) => {
            setTimeout(() => {
              demo.classList.add('demonstration--visible');
            }, index * 200);
          });
          demoObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  const keyDemonstrations = document.querySelector('.key-demonstrations');
  if (keyDemonstrations) {
    demoObserver.observe(keyDemonstrations);
  }

  // ============================================================
  // 13. CONSTANT CARDS INTERACTIVE HOVER EFFECT
  // ============================================================
  const constantCards = document.querySelectorAll('.constant-card');
  constantCards.forEach((card) => {
    card.addEventListener('mouseenter', () => {
      card.classList.add('constant-card--hovered');
    });
    card.addEventListener('mouseleave', () => {
      card.classList.remove('constant-card--hovered');
    });
  });

  // ============================================================
  // 14. MATH BLOCKS CLICK-TO-COPY
  // ============================================================
  const mathBlocks = document.querySelectorAll('.math-block__expression');
  mathBlocks.forEach((block) => {
    block.setAttribute('title', 'Click to copy expression');
    block.style.cursor = 'pointer';

    block.addEventListener('click', async () => {
      const text = block.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        showCopyFeedback(block);
      } catch {
        // Fallback for older browsers
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(block);
        selection.removeAllRanges();
        selection.addRange(range);
        showCopyFeedback(block);
      }
    });
  });

  /**
   * Shows a brief "Copied!" tooltip on a math expression element.
   * @param {Element} element - The element to show feedback on
   */
  function showCopyFeedback(element) {
    const existing = element.querySelector('.copy-feedback');
    if (existing) return;

    const feedback = document.createElement('span');
    feedback.className = 'copy-feedback';
    feedback.textContent = 'Copied!';
    feedback.setAttribute('aria-live', 'polite');
    element.appendChild(feedback);

    setTimeout(() => {
      feedback.classList.add('copy-feedback--visible');
    }, 10);

    setTimeout(() => {
      feedback.classList.remove('copy-feedback--visible');
      setTimeout(() => feedback.remove(), 300);
    }, 1500);
  }

  // ============================================================
  // 15. READING PROGRESS INDICATOR
  // ============================================================
  const progressBar = document.createElement('div');
  progressBar.className = 'reading-progress-bar';
  progressBar.setAttribute('role', 'progressbar');
  progressBar.setAttribute('aria-label', 'Reading progress');
  progressBar.setAttribute('aria-valuemin', '0');
  progressBar.setAttribute('aria-valuemax', '100');
  document.body.prepend(progressBar);

  const updateReadingProgress = () => {
    const articleMain = document.querySelector('.article-main');
    if (!articleMain) return;

    const articleTop = articleMain.offsetTop;
    const articleHeight = articleMain.offsetHeight;
    const windowHeight = window.innerHeight;
    const scrolled = window.scrollY;

    const progress = Math.min(
      Math.max(((scrolled - articleTop + windowHeight * 0.5) / articleHeight) * 100, 0),
      100
    );

    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', Math.round(progress));
  };

  window.addEventListener('scroll', updateReadingProgress, { passive: true });
  updateReadingProgress();

  // ============================================================
  // 16. STICKY HEADER SHADOW ON SCROLL
  // ============================================================
  const siteHeader = document.querySelector('.site-header');
  const handleHeaderScroll = () => {
    if (window.scrollY > 10) {
      siteHeader?.classList.add('site-header--scrolled');
    } else {
      siteHeader?.classList.remove('site-header--scrolled');
    }
  };

  window.addEventListener('scroll', handleHeaderScroll, { passive: true });
  handleHeaderScroll();

  // ============================================================
  // 17. TABLE OF CONTENTS TOGGLE (MOBILE)
  // ============================================================
  const tocContainer = document.querySelector('.table-of-contents');
  const tocHeading = document.querySelector('.table-of-contents__heading');

  if (tocContainer && tocHeading) {
    const tocList = document.querySelector('.table-of-contents__list');
    tocHeading.setAttribute('role', 'button');
    tocHeading.setAttribute('tabindex', '0');
    tocHeading.setAttribute('aria-expanded', 'true');
    tocHeading.setAttribute('aria-controls', 'toc-list');
    if (tocList) tocList.setAttribute('id', 'toc-list');

    const toggleToc = () => {
      const isExpanded = tocHeading.getAttribute('aria-expanded') === 'true';
      tocHeading.setAttribute('aria-expanded', String(!isExpanded));
      tocList?.classList.toggle('table-of-contents__list--collapsed');
      tocContainer.classList.toggle('table-of-contents--collapsed');
    };

    tocHeading.addEventListener('click', toggleToc);
    tocHeading.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleToc();
      }
    });
  }

  // ============================================================
  // 18. INSIGHT CALLOUT EXPAND/COLLAPSE ON MOBILE
  // ============================================================
  const insightCallouts = document.querySelectorAll('.insight-callout');
  insightCallouts.forEach((callout) => {
    const content = callout.querySelector('.insight-callout__content');
    const icon = callout.querySelector('.insight-callout__icon');
    if (!content || !icon) return;

    icon.setAttribute('role', 'button');
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('aria-label', 'Toggle insight');

    const toggleCallout = () => {
      callout.classList.toggle('insight-callout--expanded');
    };

    icon.addEventListener('click', toggleCallout);
    icon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCallout();
      }
    });
  });

  // ============================================================
  // 19. CONCEPT TAGS FILTER / HIGHLIGHT IN ARTICLE
  // ============================================================
  const conceptTags = document.querySelectorAll('.concept-tag');
  const articleBody = document.querySelector('.article-body');

  // Map concept tags to keywords to highlight
  const conceptKeywordMap = {
    'Cubic Convergence': ['cubic convergence', 'cubic'],
    'Fixed-Point Theory': ['fixed point', 'fixed-point'],
    'Taylor Series': ['Taylor series', 'Taylor'],
    'Rational Certificate Complexity': ['rational certificate', 'RCC'],
    'Derivative Engineering': ['derivative engineering'],
    'Closure Operators': ['closure operator', 'closure mechanism'],
    'Validated Numerics': ['validated numerics', 'interval arithmetic'],
    'Transcendental Numbers': ['transcendental'],
    'Error Analysis': ['error map', 'error bound'],
    'Interval Arithmetic': ['interval arithmetic'],
  };

  conceptTags.forEach((tag) => {
    tag.setAttribute('role', 'button');
    tag.setAttribute('tabindex', '0');
    tag.setAttribute('title', `Highlight "${tag.textContent}" in article`);

    const activate = () => {
      const isActive = tag.classList.contains('concept-tag--active');

      // Deactivate all tags
      conceptTags.forEach((t) => t.classList.remove('concept-tag--active'));
      document.querySelectorAll('.concept-highlight').forEach((h) => {
        h.outerHTML = h.textContent;
      });

      if (!isActive) {
        tag.classList.add('concept-tag--active');
      }
    };

    tag.addEventListener('click', activate);
    tag.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  // ============================================================
  // 20. BACK-TO-TOP BUTTON
  // ============================================================
  const backToTopBtn = document.createElement('button');
  backToTopBtn.className = 'back-to-top-btn';
  backToTopBtn.setAttribute('aria-label', 'Back to top');
  backToTopBtn.innerHTML = '↑';
  document.body.appendChild(backToTopBtn);

  const handleBackToTopVisibility = () => {
    if (window.scrollY > 600) {
      backToTopBtn.classList.add('back-to-top-btn--visible');
    } else {
      backToTopBtn.classList.remove('back-to-top-btn--visible');
    }
  };

  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', handleBackToTopVisibility, { passive: true });
  handleBackToTopVisibility();

  // ============================================================
  // 21. FORMULA SHOWCASE ANIMATED COUNTER (HERO)
  // ============================================================
  const formulaShowcase = document.querySelector('.hero-section__formula-showcase');
  if (formulaShowcase) {
    const formulaObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            formulaShowcase.classList.add('formula-showcase--animated');
            formulaObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    formulaObserver.observe(formulaShowcase);
  }

  // ============================================================
  // 22. PRACTICAL EXAMPLE STATS COUNT-UP ANIMATION
  // ============================================================
  const practicalStats = document.querySelectorAll('.practical-example__stat-value');
  const statsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          practicalStats.forEach((stat, index) => {
            setTimeout(() => {
              stat.classList.add('practical-example__stat-value--visible');
            }, index * 200);
          });
          statsObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  const practicalExample = document.querySelector('.practical-example__stats');
  if (practicalExample) {
    statsObserver.observe(practicalExample);
  }

  // ============================================================
  // 23. SECTION NUMBER HOVER EFFECT
  // ============================================================
  const sectionNumbers = document.querySelectorAll('.article-section__number');
  sectionNumbers.forEach((num) => {
    num.addEventListener('mouseenter', () => {
      num.classList.add('article-section__number--hovered');
    });
    num.addEventListener('mouseleave', () => {
      num.classList.remove('article-section__number--hovered');
    });
  });

  // ============================================================
  // 24. KEYBOARD NAVIGATION SUPPORT FOR TOWER LAYERS
  // ============================================================
  towerLayers.forEach((layer) => {
    layer.setAttribute('tabindex', '0');
    layer.addEventListener('focus', () => {
      layer.classList.add('tower-layer--focused');
    });
    layer.addEventListener('blur', () => {
      layer.classList.remove('tower-layer--focused');
    });
  });

  // ============================================================
  // 25. INJECT DYNAMIC STYLES FOR JS-DRIVEN FEATURES
  // ============================================================
  const dynamicStyles = document.createElement('style');
  dynamicStyles.textContent = `
          /* Reading Progress Bar */
          .reading-progress-bar {
              position: fixed;
              top: 0;
              left: 0;
              height: 3px;
              width: 0%;
              background: linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa);
              z-index: 9999;
              transition: width 0.1s linear;
              border-radius: 0 2px 2px 0;
          }
  
          /* Back to Top Button */
          .back-to-top-btn {
              position: fixed;
              bottom: 2rem;
              right: 2rem;
              width: 3rem;
              height: 3rem;
              border-radius: 50%;
              border: none;
              background: #6366f1;
              color: white;
              font-size: 1.25rem;
              cursor: pointer;
              opacity: 0;
              transform: translateY(1rem);
              transition: opacity 0.3s ease, transform 0.3s ease, background 0.2s ease;
              pointer-events: none;
              z-index: 1000;
              box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
          }
          .back-to-top-btn--visible {
              opacity: 1;
              transform: translateY(0);
              pointer-events: auto;
          }
          .back-to-top-btn:hover {
              background: #4f46e5;
          }
  
          /* Sticky Header Shadow */
          .site-header--scrolled {
              box-shadow: 0 2px 20px rgba(0, 0, 0, 0.15);
          }
  
          /* Mobile Nav Open State */
          .site-nav__links--open {
              display: flex !important;
              flex-direction: column;
              position: absolute;
              top: 100%;
              left: 0;
              right: 0;
              background: inherit;
              padding: 1rem;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
              z-index: 100;
          }
  
          /* Active Nav Link */
          .site-nav__link--active {
              color: #6366f1 !important;
              font-weight: 600;
          }
  
          /* Active TOC Link */
          .table-of-contents__link--active {
              color: #6366f1 !important;
              font-weight: 600;
              border-left: 2px solid #6366f1;
              padding-left: 0.5rem;
          }
  
          /* TOC Collapsed */
          .table-of-contents__list--collapsed {
              display: none;
          }
  
          /* Reveal on Scroll */
          .reveal-on-scroll {
              opacity: 0;
              transform: translateY(24px);
              transition: opacity 0.6s ease, transform 0.6s ease;
          }
          .reveal-on-scroll.is-visible {
              opacity: 1;
              transform: translateY(0);
          }
  
          /* Convergence Step Animation */
          .convergence-step {
              opacity: 0;
              transform: scale(0.9);
              transition: opacity 0.4s ease, transform 0.4s ease;
          }
          .convergence-step--animated {
              opacity: 1;
              transform: scale(1);
          }
  
          /* Conditions List Item Animation */
          .conditions-list__item {
              opacity: 0;
              transform: translateX(-20px);
              transition: opacity 0.4s ease, transform 0.4s ease;
          }
          .conditions-list__item--visible {
              opacity: 1;
              transform: translateX(0);
          }
  
          /* Verification Check Animation */
          .verification-check {
              opacity: 0;
              transform: translateY(10px);
              transition: opacity 0.4s ease, transform 0.4s ease;
          }
          .verification-check--revealed {
              opacity: 1;
              transform: translateY(0);
          }
  
          /* Engine Card Animation */
          .engine-card {
              opacity: 0;
              transform: translateY(20px);
              transition: opacity 0.4s ease, transform 0.4s ease;
          }
          .engine-card--visible {
              opacity: 1;
              transform: translateY(0);
          }
  
          /* Tower Layer Animation */
          .tower-layer {
              opacity: 0;
              transform: translateX(-16px);
              transition: opacity 0.4s ease, transform 0.4s ease;
          }
          .tower-layer--visible {
              opacity: 1;
              transform: translateX(0);
          }
          .tower-layer--focused {
              outline: 2px solid #6366f1;
              outline-offset: 2px;
          }
  
          /* Derivation Step Animation */
          .derivation-block__step {
              opacity: 0;
              transform: translateY(12px);
              transition: opacity 0.4s ease, transform 0.4s ease;
          }
          .derivation-block__step--visible {
              opacity: 1;
              transform: translateY(0);
          }
  
          /* Demonstration Animation */
          .demonstration {
              opacity: 0;
              transform: translateY(20px);
              transition: opacity 0.5s ease, transform 0.5s ease;
          }
          .demonstration--visible {
              opacity: 1;
              transform: translateY(0);
          }
  
          /* Copy Feedback */
          .copy-feedback {
              position: absolute;
              top: -2rem;
              left: 50%;
              transform: translateX(-50%) translateY(4px);
              background: #1e1b4b;
              color: #e0e7ff;
              font-size: 0.7rem;
              padding: 0.2rem 0.6rem;
              border-radius: 4px;
              pointer-events: none;
              opacity: 0;
              transition: opacity 0.2s ease, transform 0.2s ease;
              white-space: nowrap;
              z-index: 10;
          }
          .copy-feedback--visible {
              opacity: 1;
              transform: translateX(-50%) translateY(0);
          }
          .math-block__expression {
              position: relative;
          }
  
          /* Concept Tag Active State */
          .concept-tag--active {
              background: #6366f1 !important;
              color: white !important;
              transform: scale(1.05);
          }
  
          /* Constant Card Hover */
          .constant-card--hovered {
              transform: scale(1.08) translateY(-2px);
          }
  
          /* Formula Showcase Animation */
          .formula-showcase--animated .formula-showcase__expression {
              animation: formulaPulse 0.6s ease forwards;
          }
          @keyframes formulaPulse {
              0% { transform: scale(1); }
              50% { transform: scale(1.03); }
              100% { transform: scale(1); }
          }
  
          /* Practical Stats Visible */
          .practical-example__stat-value {
              opacity: 0;
              transform: translateY(8px);
              transition: opacity 0.4s ease, transform 0.4s ease;
          }
          .practical-example__stat-value--visible {
              opacity: 1;
              transform: translateY(0);
          }
  
          /* Section Number Hover */
          .article-section__number--hovered {
              transform: scale(1.1);
              transition: transform 0.2s ease;
          }
  
          /* Hamburger Active State */
          .site-nav__menu-toggle--active .site-nav__hamburger-bar:nth-child(1) {
              transform: translateY(8px) rotate(45deg);
          }
          .site-nav__menu-toggle--active .site-nav__hamburger-bar:nth-child(2) {
              opacity: 0;
          }
          .site-nav__menu-toggle--active .site-nav__hamburger-bar:nth-child(3) {
              transform: translateY(-8px) rotate(-45deg);
          }
          .site-nav__hamburger-bar {
              transition: transform 0.3s ease, opacity 0.3s ease;
          }
      `;
  document.head.appendChild(dynamicStyles);

  // ============================================================
  // 26. INITIALIZE: TRIGGER VISIBLE ELEMENTS ALREADY IN VIEWPORT
  // ============================================================
  // Small delay to allow CSS to apply before triggering initial state
  setTimeout(() => {
    revealElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('is-visible');
      }
    });
  }, 100);
});
