#!/usr/bin/env bash
# Repairs the superproject after submodule working trees were moved with
# plain `mv`.  Idempotent: safe to re-run.
#
#   ./fix-submodules.sh                  # keep submodule *names*, fix paths
#   ./fix-submodules.sh --rename-modules # also rename .git/modules/<name>
#
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

RENAME_MODULES=0
[ "${1:-}" = "--rename-modules" ] && RENAME_MODULES=1

# old|new  (no-op moves from the original reorg.sh are omitted)
MOVES=(
  "experiments/static-secrets|tools/static-secrets"
  "experiments/chromatic|tools/chromatic"

  "experiments/symmetry_simple|physics/symmetry_simple"
  "experiments/gravity|physics/gravity"
  "experiments/spacelike-knots|physics/spacelike-knots"
  "experiments/mesh|physics/mesh"
  "experiments/geometric-entropy|physics/geometric-entropy"

  "experiments/markov-analysis|ca/markov-analysis"
  "experiments/pid-ca|ca/pid-ca"
  "experiments/layered_ca|ca/layered_ca"

  "experiments/Pentagon_Lattice_Geometry|quadratics/Pentagon_Lattice_Geometry"
  "experiments/irrational_lattice|quadratics/irrational_lattice"

  "experiments/primegen|numbers/primegen"
  "experiments/nam-calculator|numbers/nam-calculator"
  "essays/TEL|numbers/TEL"
  "essays/NAM|numbers/NAM"
  "essays/RCC|numbers/RCC"
  "essays/PI_RCC|numbers/PI_RCC"

  "experiments/optimization-mechanics|optimization/optimization-mechanics"
  "essays/QQN-Visuals|optimization/QQN-Visuals"
  "essays/QQN|optimization/QQN"
)

# ---------------------------------------------------------------- helpers
relpath() { # relpath TARGET BASE  -> TARGET expressed relative to BASE
  local target=$1 base=$2 up="" b
  if realpath -m --relative-to=/ / >/dev/null 2>&1; then
    realpath -m --relative-to="$base" "$target"; return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import os,sys;print(os.path.relpath(sys.argv[1],sys.argv[2]))' \
            "$target" "$base"; return
  fi
  target=${target%/}; b=${base%/}
  while [ "$target" != "$b" ] && [ "${target#"$b"/}" = "$target" ]; do
    b=$(dirname "$b"); up="../$up"
    [ "$b" = "/" ] && break
  done
  [ "$target" = "$b" ] && printf '%s\n' "${up%/}" \
                       || printf '%s\n' "$up${target#"$b"/}"
}

name_for_path() { # name_for_path PATH -> submodule name, or empty
  git config -f .gitmodules --get-regexp '^submodule\..*\.path$' 2>/dev/null |
    awk -v p="$1" '$2==p {print substr($1, 11, length($1)-15)}'
}

staged_mode() { git ls-files --stage -- "$1" 2>/dev/null | awk 'NR==1{print $1}'; }
# Write a config value into a submodule's git dir WITHOUT letting git run its
# repository setup.  `git --git-dir=<gd> config ...` honours the *existing*
# (stale) core.worktree first and dies with
#   fatal: cannot chdir to '../../../../<old path>'
# before it ever writes the new value.  Editing the file is chdir-free.
gd_config() { # gd_config GITDIR KEY VALUE
   git config --file "$1/config" "$2" "$3"
}

resolve_gitdir() { # resolve_gitdir WORKTREE NAME -> abs path of real git dir
   local wt=$1 nm=$2 p
   if [ -f "$wt/.git" ]; then
     p=$(sed -n 's/^gitdir:[[:space:]]*//p' "$wt/.git" | head -n1)
     case "$p" in
       "") ;;
       /*) [ -d "$p" ] && { printf '%s\n' "$p"; return; } ;;
       *)  [ -d "$wt/$p" ] && { (cd "$wt/$p" && pwd); return; } ;;
     esac
   fi
   [ -d "$ROOT/.git/modules/$nm" ] && printf '%s\n' "$ROOT/.git/modules/$nm"
}
fix_pointers() { # fix_pointers WORKTREE GITDIR
   local wt=$1 gd=$2
   printf 'gitdir: %s\n' "$(relpath "$gd" "$ROOT/$wt")" > "$wt/.git"
    gd_config "$gd" core.worktree "$(relpath "$ROOT/$wt" "$gd")"
}
# A stale core.worktree anywhere under .git/modules makes *any* later
# submodule-aware porcelain (add / status / submodule sync) abort, even for
# submodules we are not touching.  Blank out the dead ones up front; the ones
# we move get a correct value written back by fix_pointers().
scrub_stale_worktrees() {
   local cfg gd wt
   [ -d "$ROOT/.git/modules" ] || return 0
   while IFS= read -r cfg; do
     gd=$(dirname "$cfg")
     wt=$(git config --file "$cfg" --get core.worktree 2>/dev/null || true)
     [ -z "$wt" ] && continue
     case "$wt" in
       /*) [ -d "$wt" ] && continue ;;
       *)  [ -d "$gd/$wt" ] && continue ;;
     esac
     echo "   (clearing stale core.worktree in ${gd#"$ROOT/"})"
     git config --file "$cfg" --unset core.worktree 2>/dev/null || true
   done < <(find "$ROOT/.git/modules" -mindepth 2 -name config -type f)
}


# ------------------------------------------------------------------ main
scrub_stale_worktrees

for entry in "${MOVES[@]}"; do
  old=${entry%%|*}
  new=${entry##*|}
  [ "$old" = "$new" ] && continue

  name=$(name_for_path "$old")
  [ -z "$name" ] && name=$(name_for_path "$new")
  if [ -z "$name" ]; then
    echo "!! no .gitmodules entry for $old / $new -- skipping"
    continue
  fi

  if [ ! -d "$new" ]; then
    echo "!! $new does not exist on disk -- skipping ($name)"
    continue
  fi

  echo "== $name : $old -> $new"



   # 1. gitdir pointer + core.worktree FIRST: until these are correct, any
   #    porcelain command that touches submodules (status/add/rm) dies with
   #    "cannot chdir to '../../../../<old path>'".
   gitdir=""
  if [ -d "$new/.git" ]; then
    echo "   (git dir lives inside the submodule; nothing to re-point)"
  elif [ -f "$new/.git" ]; then
     gitdir=$(resolve_gitdir "$new" "$name" || true)
     if [ -z "$gitdir" ]; then
       echo "!! missing .git/modules/$name -- run: git submodule absorbgitdirs -- $new"
      continue
    fi
     fix_pointers "$new" "$gitdir"
  else
    echo "!! $new has no .git -- run: git submodule update --init -- $new"
     continue
   fi
   # 2. .gitmodules path -- stage it right away, otherwise the next
   #    submodule-aware command refuses to run against a dirty .gitmodules.
   git config -f .gitmodules "submodule.$name.path" "$new"
   git add -- .gitmodules
   # 3. index: move the gitlink with plumbing only.  `git rm --cached` /
   #    `git add` would try to rewrite .gitmodules and abort.
   if [ "$(staged_mode "$old")" = "160000" ]; then
     git update-index --force-remove -- "$old"
   fi
    # read HEAD straight out of the git dir; --git-dir is safe now that
    # core.worktree has been repaired above, and it also works when the
    # submodule's own .git file is still odd.
    sha=""
    if [ -n "$gitdir" ]; then
      sha=$(git --git-dir="$gitdir" rev-parse --verify HEAD 2>/dev/null || true)
    fi
    [ -z "$sha" ] && sha=$(git -C "$new" rev-parse --verify HEAD 2>/dev/null || true)
   if [ -z "$sha" ]; then
     echo "!! cannot read HEAD of $new -- gitlink not staged"
   elif [ "$(git ls-files --stage -- "$new" | awk 'NR==1{print $2}')" != "$sha" ] \
     || [ "$(staged_mode "$new")" != "160000" ]; then
     git update-index --add --cacheinfo "160000,$sha,$new"
  fi

  # optional: make .git/modules/<name> match the new path
  if [ "$RENAME_MODULES" = "1" ] && [ "$name" != "$new" ]; then
    src="$ROOT/.git/modules/$name"
    dst="$ROOT/.git/modules/$new"
    if [ -d "$src" ] && [ ! -e "$dst" ]; then
      mkdir -p "$(dirname "$dst")"
      mv "$src" "$dst"
      git config -f .gitmodules --rename-section "submodule.$name" "submodule.$new"
      git config --rename-section "submodule.$name" "submodule.$new" 2>/dev/null || true
       fix_pointers "$new" "$dst"
       git add -- .gitmodules
      name=$new
    fi
  fi
done

# stale empty parents left behind by mv
for d in experiments essays; do
  [ -d "$d" ] && rmdir "$d" 2>/dev/null && echo "removed empty $d/" || true
done

git add .gitmodules
git submodule sync --recursive >/dev/null 2>&1 || \
   echo "!! 'git submodule sync --recursive' reported errors (continuing)"
git submodule update --init --recursive || \
   echo "!! 'git submodule update --init --recursive' reported errors (continuing)"

echo
echo "---- git submodule status ----"
git submodule status --recursive || true
echo
echo "---- staged changes ----"
git status --short || true
echo
echo 'Review, then:  git commit -m "reorg: move submodules into tools/physics/ca/quadratics/numbers/optimization"'