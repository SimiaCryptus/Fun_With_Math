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
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
  },
  startup: {
    // Don't typeset the whole page on load; we'll call it manually.
    typeset: false,
  },
};
