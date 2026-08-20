// Initialize Mermaid in manual mode once the script has loaded.
// Using defer keeps execution order: mermaid script → this block.
document.addEventListener('DOMContentLoaded', function () {
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }
});
