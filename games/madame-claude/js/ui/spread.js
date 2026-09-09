import { prefersReducedMotion } from './parlor.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Renders the dealt cards face-down and wires reveal interactions.
 * Returns { revealAll(), destroy() }.
 */
export function renderSpread({ container, statusEl, spread, dealt, onReveal, onAllRevealed }) {
  container.innerHTML = '';
  container.className = `spread spread--${spread.id}`;
  container.hidden = false;
  container.setAttribute('aria-label', `${spread.name} spread: ${dealt.length} card${dealt.length > 1 ? 's' : ''} face down`);

  let revealedCount = 0;
  const slots = [];

  const reveal = ({ d, slot, btn }) => {
    if (slot.classList.contains('is-revealed')) return;
    slot.classList.add('is-revealed');
    btn.classList.add('is-revealed');
    const orient = d.reversed ? 'reversed' : 'upright';
    const kws = d.card.keywords[orient].join(', ');
    btn.setAttribute('aria-label', `${d.position.label}: ${d.card.name}, ${orient}. ${kws}.`);
    btn.setAttribute('aria-pressed', 'true');
    revealedCount++;
    const done = revealedCount === dealt.length;
    statusEl.textContent = `${d.position.label}: ${d.card.name}, ${orient}.${done ? ' All cards revealed.' : ''}`;
    onReveal?.(d);
    if (done) onAllRevealed?.();
  };

  dealt.forEach((d) => {
    const orient = d.reversed ? 'reversed' : 'upright';
    const slot = el('div', 'card-slot' + (d.position.rotate ? ' card-slot--rotated' : ''));
    slot.style.setProperty('--x', `${d.position.x}%`);
    slot.style.setProperty('--y', `${d.position.y}%`);

    const label = el('span', 'card-slot__label', d.position.label);

    const btn = el('button', 'card' + (d.reversed ? ' is-reversed' : ''));
    btn.type = 'button';
    btn.title = d.position.description;
    btn.setAttribute('aria-label', `${d.position.label}: face-down card. Press to reveal.`);
    btn.setAttribute('aria-pressed', 'false');

    const inner = el('span', 'card__inner');
    const back = el('span', 'card__face card__face--back');
    back.setAttribute('aria-hidden', 'true');
    const front = el('span', 'card__face card__face--front');
    const fallback = el('span', 'card__fallback', d.card.name);
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = d.card.image;
    img.addEventListener('error', () => img.remove(), { once: true });
    front.append(fallback, img);
    inner.append(back, front);
    btn.append(inner);

    const caption = el('div', 'card__caption');
    caption.append(
      el('strong', 'card__name', d.card.name),
      el('em', 'card__orient', orient),
      el('span', 'card__keywords', d.card.keywords[orient].join(' · ')),
    );

    const entry = { d, slot, btn };
    btn.addEventListener('click', () => reveal(entry));
    slot.append(label, btn, caption);
    container.append(slot);
    slots.push(entry);
  });

  return {
    revealAll() {
      const step = prefersReducedMotion() ? 0 : 180;
      slots.forEach((entry, i) => setTimeout(() => reveal(entry), i * step));
    },
    destroy() {
      container.innerHTML = '';
      container.hidden = true;
      statusEl.textContent = '';
    },
  };
}