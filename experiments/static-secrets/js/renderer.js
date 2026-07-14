// Content-type dispatch: HTML (sandboxed iframe), Markdown (marked),
// Binary (download wrapper).
import { CONTENT_TYPE } from './format.js';

// marked is loaded globally via vendor/marked.min.js (UMD build).
function renderMarkdownToHtml(text) {
  if (typeof globalThis.marked !== 'undefined') {
    const m = globalThis.marked;
    if (typeof m.parse === 'function') return m.parse(text);
    if (typeof m === 'function') return m(text);
  }
  // Fallback: escape + preformat.
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre>${esc}</pre>`;
}

function clear(container) {
  while (container.firstChild) container.removeChild(container.firstChild);
}

function renderHtmlDocument(container, htmlString, onLinkClick) {
  clear(container);
  const iframe = document.createElement('iframe');
  iframe.className = 'ss-content-frame';
  // Restrict capabilities; allow scripts but keep it cross-origin (no
  // allow-same-origin) so it can't touch our localStorage / keychain.
  iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms');
  iframe.srcdoc = htmlString;
  container.appendChild(iframe);
  // Link interception for in-content navigation is handled by the
  // router via message passing when needed; sandboxed frames can't
  // access parent directly. (See router.js rewriteLinks.)
}

function renderBinary(container, inner) {
  clear(container);
  const mime = 'application/octet-stream';
  const blob = new Blob([inner.content], { type: mime });
  const url = URL.createObjectURL(blob);
  const wrap = document.createElement('div');
  wrap.className = 'ss-binary';
  const name = inner.filename || 'download.bin';
  const p = document.createElement('p');
  p.textContent = `Decrypted binary file: ${name} (${inner.content.length} bytes)`;
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.className = 'ss-download-btn';
  a.textContent = `Download ${name}`;
  a.addEventListener('click', () => {
    // Revoke shortly after the click to allow the download to start.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  wrap.appendChild(p);
  wrap.appendChild(a);
  container.appendChild(wrap);
}

// Rewrite relative links so they route back through the proxy.
// baseUrl: the URL the content was fetched from.
// proxyBase: function(targetUrl) => href for our app.
function rewriteHtmlLinks(htmlString, baseUrl, proxyBase) {
  try {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    doc.querySelectorAll('a[href]').forEach((a) => {
      const raw = a.getAttribute('href');
      if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;
      try {
        const abs = new URL(raw, baseUrl).href;
        a.setAttribute('href', proxyBase(abs));
        a.setAttribute('target', '_top');
      } catch {
        /* leave as-is */
      }
    });
    return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  } catch {
    return htmlString;
  }
}

export function render(container, inner, { baseUrl, proxyBase } = {}) {
  const decoder = new TextDecoder();
  switch (inner.contentType) {
    case CONTENT_TYPE.html: {
      let html = decoder.decode(inner.content);
      if (baseUrl && proxyBase) {
        html = rewriteHtmlLinks(html, baseUrl, proxyBase);
      }
      renderHtmlDocument(container, html);
      break;
    }
    case CONTENT_TYPE.markdown: {
      const md = decoder.decode(inner.content);
      let html = renderMarkdownToHtml(md);
      if (baseUrl && proxyBase) {
        html = rewriteHtmlLinks(html, baseUrl, proxyBase);
      }
      renderHtmlDocument(
        container,
        `<!DOCTYPE html><html><head><meta charset="utf-8">
             <style>body{font-family:system-ui,sans-serif;max-width:46rem;
             margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}
             pre{background:#f4f4f4;padding:1rem;overflow:auto}
             code{background:#f4f4f4;padding:.1em .3em}
             img{max-width:100%}</style></head><body>${html}</body></html>`
      );
      break;
    }
    case CONTENT_TYPE.binary:
    default:
      renderBinary(container, inner);
      break;
  }
}
