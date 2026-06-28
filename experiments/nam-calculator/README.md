# nam — the interactive numbers-as-machines lab

> **Numbers as Machines (`nam`)** is a C++ library where every
> number is a deterministic, forkable virtual machine that emits an infinite
> digit stream on demand. This is the **interactive lab** built on
> top of it: a browser-based calculator plus a matching
> Node REPL, both speaking the same command grammar over the WebAssembly
> build of the library.

---

## TL;DR — open the calculator

The calculator is a visual REPL over the ergonomic `Number` user layer. It
never lies about cost or decidability: comparison is tri-state, fork cost is
annotated by tier, and a digit that cannot be _proven_ renders as honest
`pending (null)` rather than a fabricated value.

---

## Background: what makes these numbers "machines"

Classical numerics stores a number as a value in a register. `nam` instead
treats a number as a tiny program implementing one primitive:

```
step : (NumberSpace, State) → (digit, State)
```

Everything else — base conversion, comparison, arithmetic, p-adic metrics,
skip-ahead — is a combinator over that single step. Three consequences shape
the entire calculator experience:

1. **The base is a codec, not a property.** Changing base re-projects the
   same machine; it does not create a new number. In the GUI this is the
   `in_base` / `base→` operation.
2. **Fork has an honest cost tier.**
   - _Automaton tier_ (rationals, √2, φ, periodic p-adics): **O(1)** — a
     literal struct copy.
   - _Series tier_ (π/4, e, ln 2, 1/e, Catalan): **O(log n)** — an explicit
     deep copy of growing accumulators.
     The display shows `fork cost …` for the targeted register, and `fork`
     reports the tier when it splits.
3. **Equality is undecidable, so the lab refuses to fake it.** Comparison
   returns `Less | Greater | Indistinguishable`, `definitely_less_than`
   returns `true | false | pending`, and `agrees_with(N)` checks only a
   finite digit prefix.

---

## The lab surface

`index.html` is a single self-contained module that loads the WASM
build and exposes three coordinated interfaces, all driving the same
evaluator:

| Surface       | What it is                                                                |
| ------------- | ------------------------------------------------------------------------- |
| **Display**   | shows the last result (register `_`), its base, and fork cost             |
| **Keypad**    | one-tap operations on a _target register_ (digit count in N)              |
| **Panels**    | constructors, inspect/transform, comparison, arithmetic, scoped precision |
| **Console**   | free-form command grammar (identical to the Node REPL)                    |
| **Registers** | named variables; click to retarget, ✕ to drop                             |

Every GUI button is just a translation into the console grammar, so anything
you can click you can also type — and vice versa.

### Registers and the `_` convention

Numbers live in named registers (variables). The special register `_` always
holds the **last produced** result. `fork` additionally writes its two halves
into registers `a` and `b`. Click any register on the right to make it the
keypad's target.

---

## Command grammar (console = REPL = GUI)

Tokens are whitespace-separated. A trailing `>name` stores the result into a
register.

### Constructors

```
rational P Q [BASE]       e.g.  rational 1 7 10
sqrt D [BASE]             e.g.  sqrt 2 10
padic A B P               e.g.  padic 1 3 7      ( = 1/3 in Z_7 )
e [BASE]                  ln2 [BASE]   one_over_e [BASE]
pi_quarter [BASE]         catalan [BASE]
```

`let NAME = CONSTRUCTOR…` is also accepted as an explicit binding form.

### Inspect / transform

```
digits REG [N]            string REG [N]
base REG                  in_base REG B [>name]
tier REG                  gen REG            bitwidth REG
histogram REG [N]         tojson REG         fromjson JSON [>name]
fork REG                  fork_cost REG
skip REG K [>name]        streaming REG [>name]    cached REG N [>name]
```

### Honest comparison (tri-state over `MAXD` digits)

```
compare A B [MAXD]        less A B [MAXD]        agrees A B [MAXD]
```

### Interval-honest arithmetic (operands in `[0, 1)`)

```
add A B [>name]   sub …   mul …   div …        ipart REG
```

> **Caveat, surfaced in the UI:** arithmetic is _fractional-only_. Integer or
> improper operands stream as `0.000…`, so combining them is meaningless. The
> lab prints a yellow honesty note whenever you run an arithmetic op.

### Scoped precision

```
precision                 -> report current precision
precision N COMMAND…      -> run COMMAND at precision N, then restore
```

In the GUI this is the "Precision context (scoped)" panel — a real scoped
context, not a global mutation.

---

## A guided session

```text
nam> rational 1 7 10 >seventh
seventh := 0.(142857)…

nam> digits seventh 12
[1, 4, 2, 8, 5, 7, 1, 4, 2, 8, 5, 7]

nam> in_base seventh 2 >seventh2
seventh2 := …                       # same number, new projection

nam> skip seventh 1000 >jumped      # O(1) periodic fast-forward
jumped := …                         # 1000 % 6 == 4 phase

nam> e 10 >euler
euler := 2.718281…

nam> fork euler                     # series tier
forked (cost O(log n)) into a, b

nam> skip euler 10
skip pending (null) — no fast-forward path (non-periodic tier)

nam> rational 2 14 10 >z            # z == 1/7
nam> compare seventh z 30
compare: pending (null)             # honest: indistinguishable so far

nam> agrees seventh z 30
agrees: true                        # exact on the finite prefix
```

The two `pending (null)` lines above are the whole point of the lab: the
machinery _could_ keep streaming forever, but it will not claim a definite
answer it cannot prove.

---

## How the lab maps onto the library

| Lab concept              | Library mechanism (see LIBRARY.md)                    |
| ------------------------ | ----------------------------------------------------- |
| keypad `base→`           | codec / base-as-projection (`codec.hpp`)              |
| `skip K`                 | O(1) periodic skip + modular matrix exp (`skip.hpp`)  |
| `compare / less`         | interval-honest predicates (`compare.hpp`)            |
| `add/sub/mul/div`        | interval-honest arithmetic (`arith.hpp`)              |
| `fork` cost tiers        | automaton vs series tier (`series.hpp`)               |
| `cached N` / `streaming` | explicit bounded LRU memo (`memo.hpp`)                |
| `tojson` / `fromjson`    | lossless serialization (`serialize.hpp` / `json.hpp`) |
| `padic`, p-adic metric   | local digit commitment (`padic.hpp`, `metric.hpp`)    |

---

## Running the bindings directly

The calculator is the **WASM / JavaScript** binding. There is also a Python
binding with the same ergonomic surface:

```sh
cmake -S . -B build -DNAM_BUILD_PYTHON=ON && cmake --build build
PYTHONPATH=build/bindings python bindings/python/example.py
```

```python
import nam
with nam.precision_context(digits=8):
    print(nam.rational(1, 7).digits())
print(nam.catalan(10).digits(8))
```

In both bindings the tri-state comparison maps naturally to the host
language: `True | False | None` in Python, `true | false | null` in JS.

---

## Files in this directory

| File         | Role                                                         |
| ------------ | ------------------------------------------------------------ |
| `index.html` | the interactive browser lab (this README's main subject)     |
| `LIBRARY.md` | the `nam` library reference / module map                     |
| `THEORY.md`  | the design essay: numbers-as-machines, codecs, tiers, limits |
| `README.md`  | you are here                                                 |

> The browser lab expects `nam_wasm.js`, `nam_wasm.wasm`, and `nam.js` to sit
> beside `index.html` (the WASM build output). Serve over HTTP — opening
> the file via `file://` will not load the WASM module.

---

## The honesty contract (why this lab is worth your trust)

Borrowed verbatim from the library's non-negotiable commitments, and visible
on every screen of the calculator:

1. **Comparison is interval-honest** — tri-state / optional, never a false
   definite answer.
2. **Fork cost is annotated by tier** — O(1) automaton vs O(log n) series.
3. **Memoization is explicit** — `streaming` / `cached N`; no hidden global
   cache.
4. **Base is a codec** — changing it changes the projection, not the number.
5. **Pending is honest** — when a digit cannot be proven, the lab shows
   `pending (null)` rather than fabricating one.

Play freely: nothing the calculator shows you is a comfortable lie.
