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

    declare -a ONLY=()
    declare -a DRIFT=()
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
      if silent git -C "$dir" rev-parse --git-dir; then
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

      # 1) ask the server for the exact object (needs allow*SHA1InWant, or a tip)
      if retry silent git -C "$dir" fetch --no-recurse-submodules --tags origin "$sha"; then
        if have_commit "$dir" "$sha"; then return 0; fi
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
    hydrate_one() { # <superproject> <name> <path> <depth>
      local sup=$1 name=$2 rel=$3 depth=$4
      local dir="$sup/$rel" sha url fallback short

      sha=$(git -C "$sup" rev-parse --verify --quiet "HEAD:$rel" 2>/dev/null || true)
      if [[ -z $sha ]]; then
        sha=$(git -C "$sup" ls-tree HEAD -- "$rel" 2>/dev/null | awk '$2=="commit"{print $3; exit}')
      fi

      silent git -C "$sup" submodule init -- "$rel" || true
      url=$(git -C "$sup" config --get "submodule.$name.url" 2>/dev/null || true)
      if [[ -z $url ]]; then
        url=$(git -C "$sup" config -f "$sup/.gitmodules" --get "submodule.$name.url" 2>/dev/null || true)
      fi
      if [[ -z $url ]]; then
        FAILED+=("$rel: no URL configured in .gitmodules")
        return 1
      fi

      if ! ensure_repo "$dir" "$url"; then
        FAILED+=("$rel: could not clone//initialise from $url")
        return 1
      fi

      if [[ -n $sha ]] && ! have_commit "$dir" "$sha"; then
        info "    pinned commit ${sha:0:12} missing locally — fetching"
        fetch_commit "$dir" "$sha" || true
      elif [[ -z $sha ]]; then
        warn "$rel: superproject has no gitlink (not committed?) — using remote HEAD"
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
          DRIFT+=("$rel: pinned ${sha:-<none>} is unavailable at $url; using $fallback ($short)")
          warn "$rel: DRIFTED — pinned ${sha:-<none>} unavailable, checked out $fallback ($short)"
        else
          FAILED+=("$rel: pinned ${sha:-<none>} unavailable and no usable fallback ref at $url")
          return 1
        fi
      fi

      # keep git's own bookkeeping consistent (moves .git dir under .git/modules)
      silent git -C "$sup" submodule absorbgitdirs -- "$rel" || true
      silent git -C "$dir" submodule sync || true

      if (( RECURSIVE )); then
        hydrate_repo "$dir" $(( depth + 1 ))
      fi
      return 0
    }

    hydrate_repo() { # <dir> [depth]
      local dir=$1 depth=${2:-0} key value name rel pad
      if (( depth > MAX_DEPTH )); then
        warn "maximum submodule depth ($MAX_DEPTH) reached at $dir"
        return 0
      fi
      [[ -f "$dir/.gitmodules" ]] || return 0

      silent git -C "$dir" submodule sync || true
      pad=$(printf '%*s' $(( depth * 2 )) '')

      while read -r key value; do
        name=${key#submodule.}; name=${name%.path}
        rel=$value
        [[ -n $rel ]] || continue
        if (( depth == 0 )) && ! selected "$rel"; then continue; fi
        info "${pad}submodule $rel"
        hydrate_one "$dir" "$name" "$rel" "$depth" || true
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
    hydrate_repo "$ROOT" 0

    # ---------------------------------------------------------------- summary
    status=0
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