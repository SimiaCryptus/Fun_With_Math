window.MathJax = {
  tex: {
    inlineMath: [
      ['\\(', '\\)'],
      ['$', '$'],
    ],
    displayMath: [
      ['\\[', '\\]'],
      ['$$', '$$'],
    ],
    processEscapes: true,
    packages: { '[+]': ['ams'] },
  },
  options: {
    enableMenu: false,
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
  },
  startup: { typeset: false },
};
function loadMathJaxFallback() {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
  s.async = false;
  document.head.appendChild(s);
}
function loadMarkedFallback() {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  s.async = false;
  document.head.appendChild(s);
}
