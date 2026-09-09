/** toasts.js — transient feedback (§7). */

const host = () => document.getElementById('toasts');

/**
 * @param {string} text
 * @param {'good'|'warn'|'grey'|''} [kind]
 * @param {string} [badge] extra suffix, e.g. bonus icons
 */
export function toast(text, kind = '', badge = '') {
  const root = host();
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = badge ? `${text} ${badge}` : text;
  root.appendChild(el);
  setTimeout(() => el.remove(), 1700);
  while (root.children.length > 4) root.firstChild.remove();
}

export default toast;