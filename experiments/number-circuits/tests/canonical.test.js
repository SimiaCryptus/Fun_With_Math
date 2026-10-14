import { test, eq, ok } from './harness.js';
import { parse } from '../src/expr/parser.js';
import { canonicalString } from '../src/expr/canonical.js';

const c = s => canonicalString(parse(s));

test('associativity', () => eq(c('1+(1+1)'), c('(1+1)+1')));
test('commutativity', () => eq(c('(1+1)*(1+1+1)'), c('(1+1+1)*(1+1)')));
test('flatten mixed', () => eq(c('(1+1)*(1+1) + 1'), c('1 + (1+1)*(1+1)')));
test('distinct trees differ', () => ok(c('(1+1)*(1+1)') !== c('1+1+1+1')));
test('canonical sorted output', () => eq(c('(1+1+1)*(1+1)'), '(1+1)*(1+1+1)'));