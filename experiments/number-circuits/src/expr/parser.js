import { Atom, Add, Mul, Pow, Fact, ALL_OPS } from './ast.js';

export class ParseError extends Error {
  constructor(message, pos) { super(message); this.pos = pos; }
}

// expr    := term ('+' term)*
// term    := power ('*' power)*
// power   := postfix ('^' power)?        (right-associative)
// postfix := factor '!'*
// factor  := '1' | '(' expr ')'
export function parse(src, ops = ALL_OPS) {
  let i = 0;
  const skip = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const peek = () => { skip(); return src[i]; };

  function expr() {
    let left = term();
    while (peek() === '+') { i++; left = Add(left, term()); }
    return left;
  }
  function term() {
    let left = power();
    while (peek() === '*') { i++; left = Mul(left, power()); }
    return left;
  }
  function power() {
    const base = postfix();
    if (peek() === '^') {
      if (!ops.pow) throw new ParseError(`'^' (exponent) is not enabled`, i);
      i++;
      return Pow(base, power());
    }
    return base;
  }
  function postfix() {
    let e = factor();
    while (peek() === '!') {
      if (!ops.fact) throw new ParseError(`'!' (factorial) is not enabled`, i);
      i++;
      e = Fact(e);
    }
    return e;
  }
  function factor() {
    const ch = peek();
    if (ch === '1') { i++; return Atom(); }
    if (ch === '(') {
      i++;
      const e = expr();
      if (peek() !== ')') throw new ParseError(`Expected ')'`, i);
      i++;
      return e;
    }
    if (ch === undefined) throw new ParseError('Unexpected end of input', i);
    throw new ParseError(`Unexpected '${ch}'`, i);
  }

  const result = expr();
  if (peek() !== undefined) {
    const ch = src[i];
    const hint = ch === '1' ? ' (digit concatenation is not allowed)' : '';
    throw new ParseError(`Unexpected '${ch}'${hint}`, i);
  }
  return result;
}