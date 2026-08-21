#!/usr/bin/env bash
# Reorganise submodules.  Uses `git mv` so the superproject stays consistent.
# Requires every submodule to be initialised (git mv fails on empty ones):
#   git submodule update --init --recursive
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

move() { # move SRC DST
  local src=$1 dst=$2
  [ "$src" = "$dst" ] && return 0
  if [ -e "$dst" ] && [ ! -e "$src" ]; then
    echo "skip (already moved): $dst"; return 0
  fi
  if [ ! -e "$src" ]; then
    echo "skip (missing): $src"; return 0
  fi
  mkdir -p "$(dirname "$dst")"
  git mv -- "$src" "$dst"
  echo "moved: $src -> $dst"
}

mkdir -p tools physics ca quadratics numbers optimization

# games/* stay where they are

move experiments/static-secrets            tools/static-secrets
move experiments/chromatic                 tools/chromatic

# fractal_learning, no3sieve, 3inline stay in experiments/

move experiments/symmetry_simple           physics/symmetry_simple
move experiments/gravity                   physics/gravity
move experiments/spacelike-knots           physics/spacelike-knots
move experiments/mesh                      physics/mesh
move experiments/geometric-entropy         physics/geometric-entropy

move experiments/markov-analysis           ca/markov-analysis
move experiments/pid-ca                    ca/pid-ca
move experiments/layered_ca                ca/layered_ca

move experiments/Pentagon_Lattice_Geometry quadratics/Pentagon_Lattice_Geometry
move experiments/irrational_lattice        quadratics/irrational_lattice

move experiments/primegen                  numbers/primegen
move experiments/nam-calculator            numbers/nam-calculator
move essays/TEL                            numbers/TEL
move essays/NAM                            numbers/NAM
move essays/RCC                            numbers/RCC
move essays/PI_RCC                         numbers/PI_RCC

move experiments/optimization-mechanics    optimization/optimization-mechanics
move essays/QQN-Visuals                    optimization/QQN-Visuals
move essays/QQN                            optimization/QQN

rmdir essays 2>/dev/null || true   # only if now empty

git submodule sync --recursive >/dev/null
git status --short