import { test, eq, ok } from './harness.js';
import { parse, ParseError } from '../src/expr/parser.js';
import { evaluate, cost } from '../src/expr/ast.js';
import { print } from '../src/expr/printer.js';

test('parse atom', () => eq(evaluate(parse('1')), 1));
test('precedence', () => eq(evaluate(parse('1+1*(1+1)')), 3));
test('cost', () => eq(cost(parse('(1+1)*(1+1+1)')), 5));
test('whitespace', () => eq(evaluate(parse(' ( 1 + 1 ) * ( 1 + 1 ) ')), 4));
test('print minimal parens', () => eq(print(parse('((1+1))*(1+(1))')), '(1+1)*(1+1)'));
test('print full parens', () => eq(print(parse('1+1+1'), { full: true }), '(1+1)+1'));

const errAt = (src, pos) => {
  try { parse(src); } catch (e) { ok(e instanceof ParseError); eq(e.pos, pos); return; }
  throw new Error('expected error');
};
test('error: trailing +', () => errAt('1+', 2));
test('error: concatenation', () => errAt('11', 1));
test('error: bad char', () => errAt('1+2', 2));
test('error: unclosed', () => errAt('(1+1', 4));
test('power', () => eq(evaluate(parse('(1+1)^(1+1+1)')), 8));
test('power right-assoc', () => eq(evaluate(parse('(1+1)^(1+1)^(1+1+1)')), 256));
test('power precedence', () => eq(evaluate(parse('1+1^1+1')), 3));
test('factorial', () => eq(evaluate(parse('(1+1+1)!')), 6));
test('factorial binds tighter than ^', () => eq(evaluate(parse('(1+1)^(1+1+1)!')), 64));
test('print power parens', () => eq(print(parse('((1+1)^(1+1))^(1+1)')), '((1+1)^(1+1))^(1+1)'));
test('print factorial', () => eq(print(parse('((1+1+1)!)!')), '(1+1+1)!!'));
test('error: pow disabled', () => {
   try { parse('1^1', { pow: false, fact: true }); } catch (e) { eq(e.pos, 1); return; }
   throw new Error('expected error');
});
test('error: fact disabled', () => {
   try { parse('1!', { pow: true, fact: false }); } catch (e) { eq(e.pos, 1); return; }
   throw new Error('expected error');
});