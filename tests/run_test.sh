#!/usr/bin/env bash
# Creates a throw-away tree, runs extract_html.sh over it, prints the result.
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

mkdir -p "$work/site/sub"
cat > "$work/site/index.html" <<'HTML'
<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; font-family: sans-serif; }
    </style>
    <link rel="stylesheet" href="keep-me.css">
    <script type="application/json" id="cfg">{"keep": true}</script>
  </head>
  <body>
    <!-- <script>this one is commented out</script> -->
    <script src="already-external.js"></script>
    <script type="module" defer>
      import { go } from './go.js';
      go();
    </script>
    <script></script>
  </body>
</html>
HTML
cp "$work/site/index.html" "$work/site/sub/page.htm"

"$here/../extract_html.sh" -B "$work/site"

echo; echo "== tree =="; (cd "$work" && find site -type f | sort)
echo; echo "== index.html =="; cat "$work/site/index.html"
echo; echo "== assets =="; for f in "$work"/site/assets/*; do echo "--- $f"; cat "$f"; done