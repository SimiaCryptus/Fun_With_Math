window.MathJax = {
  tex: {
    inlineMath: [
      ['$', '$'],
      ['\\(', '\\)'],
    ],
    displayMath: [
      ['$$', '$$'],
      ['\\[', '\\]'],
    ],
    processEscapes: true,
    processEnvironments: true,
  },
  options: {
    // Do NOT skip 'code' globally — formula blocks use <code> tags.
    // We still skip the standard noise tags.
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre'],
  },
  startup: {
    // Don't typeset the whole page on load; we'll call it manually.
    typeset: false,
  },
};
