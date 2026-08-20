site/assets/index.1.css <- the <style> block (dedented)
site/assets/index.1.js <- the type="module" block
site/sub/assets/page.1.css
site/sub/assets/page.1.js

...and index.html now contains:

  <link rel="stylesheet" href="assets/index.1.css">
  <script type="module" defer src="assets/index.1.js"></script>

while `<script src="already-external.js">`, the JSON `<script type="application/json">`,
the empty `<script></script>` and the commented-out block are left untouched.
