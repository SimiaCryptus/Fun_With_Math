import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256, sha256Text, canonicalJson, configHash, pointsHash} from '../js/util/sha256.js';
import {rng, randInt} from './helpers.js';

test('sha256 matches the published vectors', () => {
    assert.equal(sha256Text(''),
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256Text('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(sha256Text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});

test('sha256 matches node:crypto on random buffers (including block boundaries)', () => {
    const rand = rng(101);
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 1000]) {
        const b = new Uint8Array(n);
        for (let i = 0; i < n; i++) b[i] = randInt(rand, 0, 255);
        assert.equal(sha256(b), createHash('sha256').update(b).digest('hex'), `length ${n}`);
    }
});

test('sha256 accepts views/buffers and rejects everything else', () => {
    const u8 = Uint8Array.from([1, 2, 3, 4]);
    const expected = createHash('sha256').update(u8).digest('hex');
    assert.equal(sha256(u8.buffer), expected);
    assert.equal(sha256(new Int32Array(u8.buffer)), expected);
    assert.throws(() => sha256('abc'), TypeError);
    assert.throws(() => sha256([1, 2, 3]), TypeError);
    assert.throws(() => sha256Text(7), TypeError);
});

test('canonicalJson sorts keys and is order-independent', () => {
    assert.equal(canonicalJson({b: 1, a: 2}), '{"a":2,"b":1}');
    assert.equal(canonicalJson({a: 2, b: 1}), canonicalJson({b: 1, a: 2}));
    assert.equal(canonicalJson([1, 'x', true, null]), '[1,"x",true,null]');
    assert.equal(canonicalJson(Int32Array.from([1, 2])), '[1,2]');
    assert.equal(canonicalJson({n: {z: 1, a: [3, {q: 0, p: 1}]}}),
        '{"n":{"a":[3,{"p":1,"q":0}],"z":1}}');
});

test('canonicalJson refuses anything that would poison a digest', () => {
    assert.throws(() => canonicalJson(undefined), TypeError);
    assert.throws(() => canonicalJson({a: undefined}), TypeError);
    assert.throws(() => canonicalJson(NaN), TypeError);
    assert.throws(() => canonicalJson(Infinity), TypeError);
    assert.throws(() => canonicalJson(() => {
    }), TypeError);
    assert.throws(() => canonicalJson(10n), TypeError);
    const cyc = {a: 1};
    cyc.self = cyc;
    assert.throws(() => canonicalJson(cyc), /cyclic/);
    // the same object twice is not a cycle
    const shared = {x: 1};
    assert.equal(canonicalJson({a: shared, b: shared}), '{"a":{"x":1},"b":{"x":1}}');
});

test('configHash is stable, key-order independent, and version sensitive', () => {
    const a = {rMax: 4, version: 'v1', order: 'clockwise'};
    const b = {order: 'clockwise', version: 'v1', rMax: 4};
    assert.equal(configHash(a), configHash(b));
    assert.match(configHash(a), /^[0-9a-f]{64}$/);
    assert.notEqual(configHash(a), configHash({...a, version: 'v2'}));
    assert.throws(() => configHash(null), TypeError);
    assert.throws(() => configHash({rMax: 1}), TypeError);
});

test('pointsHash hashes the byte layout and needs a typed array', () => {
    const p = Int32Array.from([0, 0, 1, 2]);
    assert.equal(pointsHash(p),
        createHash('sha256').update(new Uint8Array(p.buffer, p.byteOffset, p.byteLength)).digest('hex'));
    assert.notEqual(pointsHash(p), pointsHash(Int32Array.from([0, 0, 2, 1])));
    assert.throws(() => pointsHash([0, 0]), TypeError);
});