'use strict';

const test = require('node:test');
const assert = require('node:assert');
const R = require('../extract_resources.js');

const opts = Object.assign({}, R.DEFAULTS);
const assignAll = (kind) => (kind === 'js' ? 'assets/js/p.js' : 'assets/css/p.css');

test('findBlocks finds script and style, ignores comments', () => {
  const html = '<style>a{}</style><!-- <script>x</script> --><script>y</script>';
  const blocks = R.findBlocks(html);
  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((b) => b.tag),
    ['style', 'script']
  );
});

test('parseAttrs handles quoted, unquoted and boolean attributes', () => {
  const attrs = R.parseAttrs(' type="module" data-x=1 defer');
  assert.equal(R.getAttr(attrs, 'type'), 'module');
  assert.equal(R.getAttr(attrs, 'data-x'), '1');
  assert.equal(R.getAttr(attrs, 'defer'), '');
  assert.equal(R.getAttr(attrs, 'missing'), undefined);
});

test('external, json-ld, template and opted-out blocks stay inline', () => {
  const html = [
    '<script src="a.js"></script>',
    '<script type="application/ld+json">{"a":1}</script>',
    '<script type="text/template"><b></b></script>',
    '<script data-no-extract>keep()</script>',
    '<script>   </script>',
  ].join('');
  const res = R.extract(html, opts, assignAll);
  assert.equal(res.changed, false);
  assert.equal(res.html, html);
  assert.equal(res.extracted.length, 0);
});

test('inline js and css are replaced by references', () => {
  const html =
    '<head>\n  <style media="print">  body { color: red; }\n</style>\n</head>' +
    '<body>\n  <script defer>var a = 1;</script>\n</body>';
  const res = R.extract(html, opts, assignAll);
  assert.equal(res.extracted.length, 2);
  assert.match(res.html, /<link rel="stylesheet" href="assets\/css\/p\.css" media="print">/);
  assert.match(res.html, /<script src="assets\/js\/p\.js" defer><\/script>/);
  assert.ok(!/<style/.test(res.html));
});

test('type="module" is preserved on the generated tag', () => {
  const res = R.extract('<script type="module">import "x";</script>', opts, assignAll);
  assert.match(res.html, /<script src="assets\/js\/p\.js" type="module"><\/script>/);
});

test('cleanContent dedents and strips legacy guards', () => {
  assert.equal(
    R.cleanContent('\n    var a = 1;\n      var b = 2;\n  '),
    'var a = 1;\n  var b = 2;\n'
  );
  assert.equal(R.cleanContent('<!--\nvar a = 1;\n// -->'), 'var a = 1;\n');
  assert.equal(R.cleanContent('//<![CDATA[\nvar a = 1;\n//]]>'), 'var a = 1;\n');
  assert.equal(R.cleanContent('   \n  '), '');
});

test('min-size keeps tiny blocks inline', () => {
  const small = Object.assign({}, opts, { minSize: 100 });
  const res = R.extract('<script>a()</script>', small, assignAll);
  assert.equal(res.changed, false);
  assert.equal(res.skipped[0].reason, 'too small');
});

test('slug produces safe file names', () => {
  assert.equal(R.slug('pages/About Us.html'), 'pages-about-us');
  assert.equal(R.slug('./'), 'index');
});
