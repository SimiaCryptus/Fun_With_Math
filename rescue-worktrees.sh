#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
git config -f .gitmodules --get-regexp '^submodule\..*\.path$' |
while read -r key path; do
  name=${key#submodule.}; name=${name%.path}
  gd="$ROOT/.git/modules/$name"
  [ -d "$gd" ] || { echo "skip $name (no module dir)"; continue; }
  [ -d "$ROOT/$path" ] || { echo "skip $name (no worktree $path)"; continue; }
  git --git-dir="$gd" config core.worktree \
      "$(python3 -c 'import os,sys;print(os.path.relpath(*sys.argv[1:3]))' \
         "$ROOT/$path" "$gd")"
  python3 - "$gd" "$ROOT/$path" <<'PY'
import os,sys
gd,wt=sys.argv[1],sys.argv[2]
open(os.path.join(wt,'.git'),'w').write('gitdir: %s\n'%os.path.relpath(gd,wt))
PY
  echo "fixed $name -> $path"
done