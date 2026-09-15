#!/usr/bin/env bash
#
# hydrate-repo.sh — initialise/update git submodules, resiliently.
#
# Handles the usual failure modes instead of dying on the first one:
#   * "upload-pack: not our ref <sha>" — the pinned commit was rebased away,
#     is unreachable from any advertised ref, or lives outside a shallow clone.
#   * transient network/proxy errors                 -> retry w/ backoff
#   * .gitmodules URL changed, .git/config stale     -> submodule sync
#   * half-cloned / non-empty non-repo submodule dir -> init + fetch in place
#
# Usage: ./hydrate-repo.sh [options] [--] [<submodule path>...]
#   -j, --jobs N     parallel jobs for the fast path (default 4)
#       --no-recursive
#   -s, --strict     exit non-zero if any submodule could not be pinned exactly
#       --retries N  network retries per step (default 3)
#       --reclone    if the on-disk origin disagrees with .gitmodules, discard
#                    the clone and re-clone from the declared url
#       --doctor     diagnose only: print path/name/url/pin/origin for each
#                    submodule and exit (no network writes, no checkouts)
#   -q, --quiet
#   -h, --help
#
# Exit codes: 0 ok | 1 unrecoverable failure | 2 drift (only with --strict)

set -Eeuo pipefail

PROG=${0##*/}
JOBS=4
RECURSIVE=1
STRICT=0
QUIET=0
RETRIES=3
MAX_DEPTH=10
DOCTOR=0
RECLONE=0
PRIOR_URL=""
PIN_SOURCE=""

declare -a ONLY=()
declare -a DRIFT=()
declare -a MISMATCH=()
declare -a PRIOR_HIT=()
declare -a FAILED=()

log()  { (( QUIET )) || printf '%s\n' "$*" >&2; }
info() { log "==> $*"; }
warn() { printf '%s: warning: %s\n' "$PROG" "$*" >&2; }
err()  { printf '%s: error: %s\n'   "$PROG" "$*" >&2; }
die()  { err "$*"; exit 1; }

usage() { sed -n '2,/^$/s/^# \{0,1\}//p' "$0"; }

trap 'err "aborted at line $LINENO"' ERR

# ---------------------------------------------------------------- arguments
while (( $# )); do
  case $1 in
    -j|--jobs)       JOBS=${2:?missing value};    shift 2 ;;
    --retries)       RETRIES=${2:?missing value}; shift 2 ;;
    -r|--recursive)  RECURSIVE=1; shift ;;
    --no-recursive)  RECURSIVE=0; shift ;;
    -s|--strict)     STRICT=1;    shift ;;
    -q|--quiet)      QUIET=1;     shift ;;
    --doctor)        DOCTOR=1;    shift ;;
     --reclone)       RECLONE=1;   shift ;;
    -h|--help)       usage; exit 0 ;;
    --)              shift; while (( $# )); do ONLY+=("$1"); shift; done ;;
    -*)              die "unknown option: $1 (try --help)" ;;
    *)               ONLY+=("$1"); shift ;;
  esac
done

# ---------------------------------------------------------------- helpers
silent() { "$@" >/dev/null 2>&1; }

retry() {
  local n=1 delay=2
  while true; do
    if "$@"; then return 0; fi
    if (( n >= RETRIES )); then return 1; fi
    warn "attempt $n/$RETRIES failed, retrying in ${delay}s: ${*:1:3} ..."
    sleep "$delay"
    delay=$(( delay * 2 ))
    n=$(( n + 1 ))
  done
}

have_commit() { # <dir> <sha>
  silent git -C "$1" cat-file -e "${2}^{commit}"
}
# Canonical form so that git@github.com:Org/Repo.git and
# https://github.com/org/repo compare equal.
norm_url() { # <url>
  local u=${1,,}
  u=${u#git+ssh://}; u=${u#ssh://}; u=${u#https://}; u=${u#http://}; u=${u#git://}
  if [[ $u == *@* && ${u%%@*} != */* ]]; then u=${u#*@}; fi
  u=${u/:/\/}                 # scp-like  host:org/repo -> host/org/repo
  u=${u%/}; u=${u%.git}; u=${u%/}
  printf '%s\n' "$u"
}
# ../foo.git relative to the superproject's own origin
resolve_relative() { # <base> <rel>
  local base=$1 rel=$2
  base=${base%/}; base=${base%.git}
  while [[ $rel == ./* || $rel == ../* ]]; do
    if [[ $rel == ./* ]]; then
      rel=${rel#./}
    else
      rel=${rel#../}
      [[ $base == *[:/]* ]] && base=${base%/*}
    fi
  done
  printf '%s/%s\n' "$base" "$rel"
}
# Resolve the URL for a submodule, tolerating the usual .gitmodules damage:
#   * url only in .git/config, or only in .gitmodules
#   * [submodule "Foo"] path=... / [submodule "foo"] url=...  (case mismatch)
#   * relative URLs
gm_url() { # <superproject> <name> <path>
     # NB: `local` expands all its words *before* assigning any of them, so
     # anything referring to $sup/$rel must go in a second `local` statement.
     local sup=$1 name=$2 rel=$3
     local gm="$sup/.gitmodules" url k v n
  url=$(git -C "$sup" config --get "submodule.$name.url" 2>/dev/null || true)
  [[ -n $url ]] || url=$(git -C "$sup" config -f "$gm" --get "submodule.$name.url" 2>/dev/null || true)
  if [[ -z $url ]]; then
    # any stanza that declares the same path and does carry a url
    while read -r k v; do
      n=${k#submodule.}; n=${n%.path}
      [[ $v == "$rel" ]] || continue
      url=$(git -C "$sup" config -f "$gm" --get "submodule.$n.url" 2>/dev/null || true)
      [[ -n $url ]] && break
    done < <(git -C "$sup" config -f "$gm" --get-regexp '^submodule\..*\.path$' 2>/dev/null || true)
  fi
  if [[ -z $url ]]; then
    # last resort: a url stanza whose name matches case-insensitively
    while read -r k v; do
      n=${k#submodule.}; n=${n%.url}
      if [[ ${n,,} == "${name,,}" || ${n,,} == "${rel,,}" || ${n,,} == "${rel##*/}" ]]; then
        url=$v; break
      fi
    done < <(git -C "$sup" config -f "$gm" --get-regexp '^submodule\..*\.url$' 2>/dev/null || true)
    [[ -n $url ]] && warn "$rel: url found under a differently-cased section name — fix .gitmodules"
  fi
  if [[ $url == ./* || $url == ../* ]]; then
    local base
    base=$(git -C "$sup" config --get remote.origin.url 2>/dev/null || true)
    [[ -n $base ]] && url=$(resolve_relative "$base" "$url")
  fi
  printf '%s\n' "$url"
}


selected() { # <path>  (top level only)
  if (( ${#ONLY[@]} == 0 )); then return 0; fi
  local o
  for o in "${ONLY[@]}"; do
    o=${o%/}
    if [[ $1 == "$o" || $1 == "$o"/* ]]; then return 0; fi
  done
  return 1
}

# Make sure <dir> is a git repo with an "origin" remote pointing at <url>.
ensure_repo() { # <dir> <url>
  local dir=$1 url=$2
  PRIOR_URL=""
  if silent git -C "$dir" rev-parse --git-dir; then
    PRIOR_URL=$(git -C "$dir" config --get remote.origin.url 2>/dev/null || true)
     if [[ -n $PRIOR_URL ]] && [[ "$(norm_url "$PRIOR_URL")" != "$(norm_url "$url")" ]]; then
       if (( RECLONE )); then
         local gd
         gd=$(git -C "$dir" rev-parse --absolute-git-dir 2>/dev/null || true)
         warn "$dir: origin mismatch and --reclone given — discarding $PRIOR_URL clone"
         rm -rf -- "$dir"
         if [[ -n $gd && $gd != "$dir/.git" && $gd == *"/.git/modules/"* ]]; then
           rm -rf -- "$gd"
         fi
         mkdir -p -- "$(dirname -- "$dir")"
         retry git clone --no-checkout --origin origin -- "$url" "$dir" || return 1
         return 0
       fi
       # Keep the repository the clone really came from reachable: a renamed or
       # split remote is usually the only place the pinned commit still exists.
       if ! silent git -C "$dir" remote set-url prior "$PRIOR_URL"; then
         silent git -C "$dir" remote add prior "$PRIOR_URL" || true
       fi
     fi
    if ! silent git -C "$dir" remote set-url origin "$url"; then
      silent git -C "$dir" remote add origin "$url" || return 1
    fi
    return 0
  fi

  if [[ -d $dir ]] && [[ -n "$(ls -A -- "$dir" 2>/dev/null || true)" ]]; then
    warn "$dir exists but is not a git repository — initialising in place"
    silent git init -q -- "$dir" || return 1
    silent git -C "$dir" remote add origin "$url" || return 1
    retry silent git -C "$dir" fetch --no-recurse-submodules --tags origin || return 1
    return 0
  fi

  mkdir -p -- "$(dirname -- "$dir")"
  retry git clone --no-checkout --origin origin -- "$url" "$dir"
}

# Escalating attempts to make <sha> available locally.
fetch_commit() { # <dir> <sha>
  local dir=$1 sha=$2
   local prior
   PIN_SOURCE=origin

  # 1) ask the server for the exact object (needs allow*SHA1InWant, or a tip)
  if retry silent git -C "$dir" fetch --no-recurse-submodules --tags origin "$sha"; then
    if have_commit "$dir" "$sha"; then return 0; fi
  fi
   # 1b) the clone came from a different repository (rename/split). Ask that
   #     one too — nine times out of ten the pin is over there, which also
   #     proves the .gitmodules url is the thing that is wrong.
   prior=$(git -C "$dir" config --get remote.prior.url 2>/dev/null || true)
   if [[ -n $prior ]]; then
     info "    trying previous origin $prior"
     retry silent git -C "$dir" fetch --no-recurse-submodules --tags prior "$sha" || true
     if have_commit "$dir" "$sha"; then PIN_SOURCE=prior; return 0; fi
     retry silent git -C "$dir" fetch --no-recurse-submodules --force --tags \
           prior '+refs/*:refs/remotes/prior-all/*' || true
     if have_commit "$dir" "$sha"; then PIN_SOURCE=prior; return 0; fi
   fi

  # 2) shallow clones simply don't have the history yet
  if [[ "$(git -C "$dir" rev-parse --is-shallow-repository 2>/dev/null || echo false)" == true ]]; then
    info "    un-shallowing"
    retry silent git -C "$dir" fetch --no-recurse-submodules --unshallow --tags origin || true
    if have_commit "$dir" "$sha"; then return 0; fi
  fi

  # 3) every branch + tag
  info "    fetching all branches and tags"
  retry silent git -C "$dir" fetch --no-recurse-submodules --force --prune --tags \
        origin '+refs/heads/*:refs/remotes/origin/*' || true
  if have_commit "$dir" "$sha"; then return 0; fi

  # 4) every ref the server advertises (refs/pull/*, refs/merge-requests/*, notes…)
  info "    fetching every advertised ref"
  retry silent git -C "$dir" fetch --no-recurse-submodules --force \
        origin '+refs/*:refs/remotes/origin-all/*' || true
  if have_commit "$dir" "$sha"; then return 0; fi

  return 1
}

# Best guess for "where the branch went" when the pin is gone.
fallback_ref() { # <superproject> <name> <dir>
  local sup=$1 name=$2 dir=$3 branch head b
  branch=$(git -C "$sup" config -f "$sup/.gitmodules" --get "submodule.$name.branch" 2>/dev/null || true)
  if [[ $branch == "." ]]; then
    branch=$(git -C "$sup" symbolic-ref --short -q HEAD 2>/dev/null || true)
  fi
  if [[ -n $branch ]] && silent git -C "$dir" rev-parse --verify -q "refs/remotes/origin/$branch"; then
    printf 'origin/%s\n' "$branch"; return 0
  fi

  head=$(git -C "$dir" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true)
  if [[ -z $head ]]; then
    silent git -C "$dir" remote set-head origin --auto || true
    head=$(git -C "$dir" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true)
  fi
  if [[ -n $head ]] && silent git -C "$dir" rev-parse --verify -q "$head"; then
    printf '%s\n' "$head"; return 0
  fi

  for b in main master develop trunk; do
    if silent git -C "$dir" rev-parse --verify -q "refs/remotes/origin/$b"; then
      printf 'origin/%s\n' "$b"; return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------- core
hydrate_one() { # <superproject> <name> <path> <depth> <display-prefix>
  local sup=$1 name=$2 rel=$3 depth=$4 prefix=${5:-}
     # second statement on purpose: $sup/$rel/$prefix are only visible here
  local dir="$sup/$rel" disp="${prefix}${rel}" sha url fallback short

  sha=$(git -C "$sup" rev-parse --verify --quiet "HEAD:$rel" 2>/dev/null || true)
  if [[ -z $sha ]]; then
    sha=$(git -C "$sup" ls-tree HEAD -- "$rel" 2>/dev/null | awk '$2=="commit"{print $3; exit}')
  fi

  silent git -C "$sup" submodule init -- "$rel" || true
  url=$(gm_url "$sup" "$name" "$rel")
  if [[ -z $url ]]; then
    FAILED+=("$disp: [submodule \"$name\"] has a path but no url in $sup/.gitmodules")
    return 1
  fi

  if ! ensure_repo "$dir" "$url"; then
    FAILED+=("$disp: could not clone/initialise from $url")
    return 1
  fi
  # The checkout on disk claims to be a different project than .gitmodules says.
  # This is the #1 cause of "pinned commit unavailable" that never resolves.
  if [[ -n $PRIOR_URL ]] && [[ "$(norm_url "$PRIOR_URL")" != "$(norm_url "$url")" ]]; then
    MISMATCH+=("$disp: existing clone had origin $PRIOR_URL but .gitmodules says $url")
    warn "$disp: IDENTITY MISMATCH — on-disk origin $PRIOR_URL != declared $url"
  fi


  if [[ -n $sha ]] && ! have_commit "$dir" "$sha"; then
    info "    pinned commit ${sha:0:12} missing locally — fetching"
    fetch_commit "$dir" "$sha" || true
     if [[ $PIN_SOURCE == prior && -n $PRIOR_URL ]]; then
       PRIOR_HIT+=("$disp: pin $sha exists in $PRIOR_URL but NOT in the declared $url")
       warn "$disp: pinned commit came from $PRIOR_URL — .gitmodules url is wrong"
     fi
  elif [[ -z $sha ]]; then
    warn "$disp: superproject has no gitlink (not committed?) — using remote HEAD"
    retry silent git -C "$dir" fetch --no-recurse-submodules --force --prune --tags origin || true
  fi

  if [[ -n $sha ]] && have_commit "$dir" "$sha"; then
    git -C "$dir" -c advice.detachedHead=false checkout -q --detach --force "$sha"
    git -C "$dir" reset -q --hard "$sha"
  else
    fallback=$(fallback_ref "$sup" "$name" "$dir" || true)
    if [[ -n $fallback ]] &&
       git -C "$dir" -c advice.detachedHead=false checkout -q --detach --force "$fallback"; then
      short=$(git -C "$dir" rev-parse --short HEAD)
      DRIFT+=("$disp: pinned ${sha:-<none>} is unavailable at $url; using $fallback ($short)")
      warn "$disp: DRIFTED — pinned ${sha:-<none>} unavailable, checked out $fallback ($short)"
    else
      FAILED+=("$disp: pinned ${sha:-<none>} unavailable and no usable fallback ref at $url")
      return 1
    fi
  fi

  # keep git's own bookkeeping consistent (moves .git dir under .git/modules)
  silent git -C "$sup" submodule absorbgitdirs -- "$rel" || true
  silent git -C "$dir" submodule sync || true

  if (( RECURSIVE )); then
    hydrate_repo "$dir" $(( depth + 1 )) "${disp}/"
  fi
  return 0
}

doctor_one() { # <superproject> <name> <path> <display>
     local sup=$1 name=$2 rel=$3 disp=$4
     local dir="$sup/$rel"
   local sha url actual prior head flag='' pin=''
  sha=$(git -C "$sup" rev-parse --verify --quiet "HEAD:$rel" 2>/dev/null || true)
  url=$(gm_url "$sup" "$name" "$rel")
  actual=$(git -C "$dir" config --get remote.origin.url 2>/dev/null || true)
   prior=$(git -C "$dir" config --get remote.prior.url 2>/dev/null || true)
  head=$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || true)
  if [[ -n $actual && -n $url ]] && [[ "$(norm_url "$actual")" != "$(norm_url "$url")" ]]; then
    flag='   <-- MISMATCH'
  fi
  if [[ -n $sha ]]; then
    if have_commit "$dir" "$sha"; then pin='present in local object store'
    else pin='NOT present locally'; fi
  fi
  printf '%s   [submodule "%s"]\n' "$disp" "$name"
  printf '    gitlink : %s  %s\n' "${sha:-<none>}" "$pin"
  printf '    url     : %s\n'     "${url:-<MISSING - broken .gitmodules stanza>}"
  printf '    origin  : %s%s\n'   "${actual:-<not a git repo>}" "$flag"
   if [[ -n $prior ]]; then printf '    prior   : %s\n' "$prior"; fi
  printf '    HEAD    : %s\n'     "${head:-<none>}"
}

hydrate_repo() { # <dir> [depth] [display-prefix]
  local dir=$1 depth=${2:-0} prefix=${3:-} key value name rel pad p
  if (( depth > MAX_DEPTH )); then
    warn "maximum submodule depth ($MAX_DEPTH) reached at $dir"
    return 0
  fi
  [[ -f "$dir/.gitmodules" ]] || return 0

  (( DOCTOR )) || silent git -C "$dir" submodule sync || true
  pad=$(printf '%*s' $(( depth * 2 )) '')
  if (( DOCTOR )); then
    # gitlinks in the index with no .gitmodules stanza at all
    while read -r p; do
      [[ -n $p ]] || continue
      if ! git -C "$dir" config -f "$dir/.gitmodules" --get-regexp '^submodule\..*\.path$' 2>/dev/null \
           | awk '{$1=""; sub(/^ /,""); print}' | grep -qxF -- "$p"; then
        warn "${prefix}${p}: gitlink in index but no .gitmodules stanza"
      fi
    done < <(git -C "$dir" ls-files -s 2>/dev/null | awk '$1=="160000"{ $1=$2=$3=""; sub(/^\t| +/,""); print }')
  fi


  while read -r key value; do
    name=${key#submodule.}; name=${name%.path}
    rel=$value
    [[ -n $rel ]] || continue
    if (( depth == 0 )) && ! selected "$rel"; then continue; fi
    if (( DOCTOR )); then
      doctor_one "$dir" "$name" "$rel" "${prefix}${rel}" || true
      if (( RECURSIVE )) && [[ -f "$dir/$rel/.gitmodules" ]]; then
        hydrate_repo "$dir/$rel" $(( depth + 1 )) "${prefix}${rel}/"
      fi
      continue
    fi
    info "${pad}submodule ${prefix}${rel}"
    hydrate_one "$dir" "$name" "$rel" "$depth" "$prefix" || true
  done < <(git -C "$dir" config -f "$dir/.gitmodules" \
               --get-regexp '^submodule\..*\.path$' 2>/dev/null || true)
}

# ---------------------------------------------------------------- main
command -v git >/dev/null 2>&1 || die "git is not installed"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git work tree"
cd "$ROOT"

if [[ ! -f .gitmodules ]]; then
  info "no .gitmodules — nothing to hydrate"
  exit 0
fi
if (( DOCTOR )); then
  info "diagnostics only (--doctor); no fetches, no checkouts"
  hydrate_repo "$ROOT" 0 ""
  exit 0
fi


# Fast path: let git do the bulk of the work in parallel. Failures are fine,
# the resilient pass below repairs whatever is left.
info "fast path: git submodule update --init (jobs=$JOBS)"
fast=(submodule update --init --jobs "$JOBS")
(( RECURSIVE )) && fast+=(--recursive)
(( ${#ONLY[@]} )) && fast+=(-- "${ONLY[@]}")
if (( QUIET )); then
  silent git "${fast[@]}" || warn "fast path incomplete — falling back to per-submodule repair"
else
  git "${fast[@]}" || warn "fast path incomplete — falling back to per-submodule repair"
fi

info "verifying / repairing submodules"
hydrate_repo "$ROOT" 0 ""

# ---------------------------------------------------------------- summary
status=0
if (( ${#PRIOR_HIT[@]} )); then
   printf '\n%s: %d submodule(s) are pinned to commits that only exist in the\n' \
          "$PROG" "${#PRIOR_HIT[@]}" >&2
   printf '     repository the clone originally came from:\n' >&2
   printf '  - %s\n' "${PRIOR_HIT[@]}" >&2
   cat >&2 <<'EOS'
That is proof the .gitmodules url is stale (the remote was renamed or split).
Point the stanza at the repository that owns the pin and commit the change:
     git config -f .gitmodules submodule.<NAME>.url <url-shown-above>
     git submodule sync -- <path>
     git add .gitmodules && git commit -m 'follow submodule remote rename'
EOS
   (( STRICT )) && status=2
fi

if (( ${#MISMATCH[@]} )); then
  printf '\n%s: %d submodule(s) point at a DIFFERENT repository than .gitmodules declares:\n' \
         "$PROG" "${#MISMATCH[@]}" >&2
  printf '  - %s\n' "${MISMATCH[@]}" >&2
  cat >&2 <<'EOS'
A renamed/split remote (e.g. foo -> foo-tf) with a hand-edited .gitmodules leaves
the path/url/gitlink triple inconsistent, and the pinned commit can never be found.
Decide which repository is authoritative, then either:
* fix the URL and keep the pin:
    git config -f .gitmodules submodule.<NAME>.url <correct-url>
    git submodule sync -- <path> && git add .gitmodules && git commit
* or discard the stale clone and re-pin:
    git submodule deinit -f <path>
    rm -rf .git/modules/<path> <path>
    git submodule update --init <path> && git add <path> && git commit
     Run this script with --doctor to see the full path/name/url/pin/origin table.
EOS
  (( STRICT )) && status=2
fi

if (( ${#DRIFT[@]} )); then
  printf '\n%s: %d submodule(s) could not be pinned exactly:\n' "$PROG" "${#DRIFT[@]}" >&2
  printf '  - %s\n' "${DRIFT[@]}" >&2
  cat >&2 <<'EOS'

The recorded commit no longer exists on the remote (rebase/force-push/GC) or is
not reachable from an advertised ref. Fix it permanently by either:
* re-pinning the superproject:   git add <submodule-path> && git commit -m 'repin submodule'
* or letting the server serve unreachable objects:
    git config --global uploadpack.allowReachableSHA1InWant true   # on the remote
* or restoring the lost commit from a mirror/backup and pushing a ref to it.
EOS
  (( STRICT )) && status=2
fi

if (( ${#FAILED[@]} )); then
  printf '\n%s: %d submodule(s) FAILED:\n' "$PROG" "${#FAILED[@]}" >&2
  printf '  - %s\n' "${FAILED[@]}" >&2
  status=1
fi

if (( status == 0 )); then
  info "all submodules hydrated at their pinned commits"
fi
exit "$status"