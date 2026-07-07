// AST <-> plain string.
//
//   serialize(ast) -> "4 + 19"
//   parse("4 + 19") -> ast
//
// Grammar (integer literals, standard precedence, parentheses):
//   expr    := term (('+' | '-') term)*
//   term    := factor (('*' | '/') factor)*
//   factor  := number | '(' expr ')'
//
// Parentheses parse into explicit Group nodes so the UI can map them to
// tiles. Redundant/removable grouping is a concern for transformations,
// not the parser.

import { num, op, group, isNum, isOp, isGroup } from './expression.js';

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };

export function serialize(node) {
  return stringify(node, 0);
}

function stringify(node, parentPrec) {
  if (isNum(node)) return String(node.value);
  if (isGroup(node)) return `(${stringify(node.child, 0)})`;
  if (isOp(node)) {
    const prec = PRECEDENCE[node.op];
    const left = stringify(node.left, prec);
    const right = stringify(node.right, prec + 1);
    const s = `${left} ${node.op} ${right}`;
    return prec < parentPrec ? `(${s})` : s;
  }
  throw new Error('serialize: unknown node kind');
}

export function parse(input) {
  const tokens = tokenize(input);
  let pos = 0;

  function peek() {
    return tokens[pos];
  }

  function next() {
    return tokens[pos++];
  }

  function parseExpr() {
    let left = parseTerm();
    while (peek() && (peek() === '+' || peek() === '-')) {
      const operator = next();
      const right = parseTerm();
      left = op(operator, left, right);
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek() && (peek() === '*' || peek() === '/')) {
      const operator = next();
      const right = parseFactor();
      left = op(operator, left, right);
    }
    return left;
  }

  function parseFactor() {
    const t = peek();
    if (t === '(') {
      next();
      const inner = parseExpr();
      if (next() !== ')') throw new Error('Expected closing paren');
      return group(inner);
    }
    if (t === undefined) throw new Error('Unexpected end of input');
    const value = Number(next());
    if (!Number.isFinite(value)) throw new Error(`Bad number: ${t}`);
    return num(value);
  }

  const ast = parseExpr();
  if (pos !== tokens.length) {
    throw new Error(`Trailing tokens starting at "${tokens[pos]}"`);
  }
  return ast;
}

function tokenize(input) {
  const tokens = [];
  const re = /\s*(\d+|[()+\-*/])\s*/y;
  let idx = 0;
  while (idx < input.length) {
    re.lastIndex = idx;
    const m = re.exec(input);
    if (!m) throw new Error(`Unexpected char at ${idx}: "${input[idx]}"`);
    tokens.push(m[1]);
    idx = re.lastIndex;
  }
  return tokens;
}

// Structural equality ignoring ids — handy for round-trip tests.
export function structurallyEqual(a, b) {
  if (isNum(a) && isNum(b)) return a.value === b.value;
  if (isGroup(a) && isGroup(b)) return structurallyEqual(a.child, b.child);
  if (isOp(a) && isOp(b)) {
    return (
      a.op === b.op && structurallyEqual(a.left, b.left) && structurallyEqual(a.right, b.right)
    );
  }
  return false;
}
