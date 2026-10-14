const PREC = { '+': 1, '*': 2, '^': 3, '!': 4, '1': 5 };

// full=true: parenthesize every non-root operator node.
export function print(n, { full = false } = {}) {
  return str(n, full);
}

function wrap(c, need, full) {
  const s = str(c, full);
  return need ? `(${s})` : s;
}

function str(n, full) {
  if (n.type === '1') return '1';
  const nonAtom = c => c.type !== '1';
  const pc = c => PREC[c.type];
  switch (n.type) {
    case '!': {
      const c = n.children[0];
      return wrap(c, full ? nonAtom(c) : pc(c) < 4, full) + '!';
    }
    case '^': {
      const [b, e] = n.children;
      const lb = wrap(b, full ? nonAtom(b) : pc(b) <= 3, full);
      const re = wrap(e, full ? nonAtom(e) : pc(e) < 3, full);
      return `${lb}^${re}`;
    }
    case '*':
      return n.children.map(c => wrap(c, full ? nonAtom(c) : c.type === '+', full)).join('*');
    default:
      return n.children.map(c => wrap(c, full && nonAtom(c), full)).join('+');
  }
}