// Initialize Mermaid in manual mode; we'll call mermaid.run() ourselves
// after each markdown render so dynamically-injected diagrams get drawn.
if (window.mermaid) {
  window.mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
  });
}
