/** Title / pause / level-complete / game-over overlay (SPEC §17.2). Reuses the #overlay markup from index.html. */
export class Menus {
  constructor() {
    this.el = document.getElementById('overlay');
    this.h1 = this.el.querySelector('h1');
    this.intro = Array.from(this.el.querySelectorAll('p')).map((p) => p.innerHTML);
  }

  show({ title, lines = [], buttons = [] }) {
    this.el.innerHTML = '';
    this.h1.textContent = title;
    this.el.appendChild(this.h1);
    for (const l of lines) {
      const p = document.createElement('p');
      p.innerHTML = l;
      this.el.appendChild(p);
    }
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.gap = '12px'; row.style.flexWrap = 'wrap'; row.style.justifyContent = 'center';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.addEventListener('click', () => { btn.blur(); b.onClick(); });
      row.appendChild(btn);
    }
    this.el.appendChild(row);
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }

  get visible() { return !this.el.classList.contains('hidden'); }
}