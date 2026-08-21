#!/usr/bin/env bash
# Verifies that every submodule's path, gitdir pointer and core.worktree agree.
set -uo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
rc=0

git config -f .gitmodules --get-regexp '^submodule\..*\.path$' |
while read -r key path; do
  name=${key#submodule.}; name=${name%.path}

  [ -d "$path" ] || { echo "MISSING DIR   $path ($name)"; rc=1; continue; }

  mode=$(git ls-files --stage -- "$path" | awk 'NR==1{print $1}')
  [ "$mode" = "160000" ] || { echo "NOT A GITLINK $path (mode=${mode:-none})"; rc=1; }

  if [ -f "$path/.git" ]; then
    ptr=$(sed -n 's/^gitdir: *//p' "$path/.git")
    if ! (cd "$path" && [ -d "$ptr" ]); then
      echo "BAD GITDIR    $path -> $ptr"; rc=1
    else
      wt=$(git -C "$path" config core.worktree || true)
      real=$(cd "$path" && cd "$ptr" && cd "${wt:-.}" && pwd)
      [ "$real" = "$ROOT/$path" ] || { echo "BAD WORKTREE  $path (core.worktree=$wt)"; rc=1; }
    fi
  elif [ ! -d "$path/.git" ]; then
    echo "UNINITIALISED $path"; rc=1
  fi
done

echo "--- git submodule status ---"
git submodule status
exit $rc