// Nodes: { type: '1' }
//      | { type: '+' | '*', children: Node[] }  (binary from parser, n-ary after canonicalization)
//      | { type: '^', children: [base, exponent] }
//      | { type: '!', children: [operand] }
export const Atom = () => ({ type: '1' });
export const Add = (...children) => ({ type: '+', children });
export const Mul = (...children) => ({ type: '*', children });
export const Pow = (base, exp) => ({ type: '^', children: [base, exp] });
export const Fact = x => ({ type: '!', children: [x] });
export const node = (op, children) => ({ type: op, children });

export const ALL_OPS = { pow: true, fact: true };

export function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) {
    r *= i;
    if (!Number.isFinite(r)) return Infinity;
  }
  return r;
}

export function evaluate(n) {
  switch (n.type) {
    case '1': return 1;
    case '!': return factorial(evaluate(n.children[0]));
    case '^': return evaluate(n.children[0]) ** evaluate(n.children[1]);
  }
  let acc = n.type === '+' ? 0 : 1;
  for (const c of n.children) acc = n.type === '+' ? acc + evaluate(c) : acc * evaluate(c);
  return acc;
}

export function cost(n) {
  if (n.type === '1') return 1;
  let s = 0;
  for (const c of n.children) s += cost(c);
  return s;
}