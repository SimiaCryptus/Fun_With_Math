import { evaluate } from '../expr/ast.js';
const SYM = { '+': '+', '*': '×', '^': '^', '!': '!' };


export function renderTree(ast) {
  const root = document.createElement('div');
  root.className = 'tree';
  const ul = document.createElement('ul');
  ul.appendChild(item(ast));
  root.appendChild(ul);
  return root;
}

function item(n) {
  const li = document.createElement('li');
  if (n.type === '1') { li.textContent = '1'; return li; }
   li.innerHTML = `<span class="op">${SYM[n.type]}</span> <span class="val">= ${evaluate(n)}</span>`;
  const ul = document.createElement('ul');
  for (const c of n.children) ul.appendChild(item(c));
  li.appendChild(ul);
  return li;
}