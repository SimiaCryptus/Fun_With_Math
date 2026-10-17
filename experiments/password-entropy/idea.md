# Honest Password Entropy: Minimum Description Length & Adversarial Modeling

## 1. Core Concept

Traditional password strength meters either use naive Shannon entropy (which vastly overestimates strength by assuming uniform character randomness) or ad-hoc penalty heuristics (which lack mathematical rigor). 

This project proposes an **honest accounting of password entropy** by framing password strength as an information-theoretic compression problem under **Kerckhoffs's Principle**. We assume an adversary possesses a comprehensive library of human behavior models, linguistic patterns, and keyboard mechanics. The true entropy of a password is the **Minimum Description Length (MDL)** required to generate that password using an optimal ensemble of these known generator modules, including the information cost of specifying the ensemble itself.

---

## 2. Mathematical Framework

### 2.1. The Minimum Description Length (MDL) Principle
Given a password string $S$, and a universal library of generator modules $\mathcal{M}$, an adversary attempts to find a derivation path $\pi$ (a sequence of module invocations and transitions) that generates $S$.

The total information cost $L(S, \pi)$ in bits is the sum of the **Model Cost** (the bits required to describe which generators and transitions are used) and the **Data Cost** (the bits required to parameterize those generators to output $S$):

$$L(S, \pi) = L(\pi) + L(S \mid \pi)$$

The **Honest Entropy** $H^*(S)$ is the minimum possible description length across all valid derivations $\Pi(S)$:

$$H^*(S) = \min_{\pi \in \Pi(S)} \left( L(\pi) + L(S \mid \pi) \right)$$

### 2.2. State-Space & Transition Mechanics
A password is generated as a path through a directed graph where nodes are generator states and edges are transitions. 
For a derivation $\pi = (m_1, m_2, \dots, m_k)$ that segments the password into $S = s_1 s_2 \dots s_k$:

1. **Transition Cost $L(\pi)$**: Governed by a Markov transition matrix $P(m_i \mid m_{i-1})$ representing typical human password structures (e.g., transitioning from a *Dictionary Word* to *Digits* is high probability / low bit-cost):
   $$L(\pi) = \sum_{i=1}^k -\log_2 P(m_i \mid m_{i-1})$$

2. **Emission Cost $L(S \mid \pi)$**: Each module $m_i$ defines a probability distribution over strings or transformations $P_{m_i}(s_i)$. The emission cost is:
   $$L(S \mid \pi) = \sum_{i=1}^k -\log_2 P_{m_i}(s_i)$$

### 2.3. Generator Module Library ($\mathcal{M}$)

#### A. Character-Level Generators (Zero-Order & First-Order)
* **Uniform Charset ($m_{\text{unif}}$)**: Assumes uniform selection from an active character set $C$ (e.g., lowercase, digits, symbols).
  $$\text{Cost per char} = \log_2 |C|$$
* **Corpus-Weighted Charset ($m_{\text{freq}}$)**: Characters weighted by natural language or leaked password frequency $P_{\text{corpus}}(c)$.
  $$\text{Cost per char} = -\log_2 P_{\text{corpus}}(c)$$

#### B. Lexical & Dictionary Generators
* **Uniform Dictionary ($m_{\text{dict-u}}$)**: Picks a word from a dictionary $D$ of size $|D|$ with equal probability.
  $$\text{Cost} = \log_2 |D|$$
* **Frequency-Weighted Dictionary ($m_{\text{dict-f}}$)**: Words weighted by corpus frequency (e.g., Zipf's Law distribution). Common words cost significantly fewer bits than obscure words.
  $$\text{Cost}(w) = -\log_2 P_{\text{dict}}(w)$$

#### C. Keyboard & Spatial Generators
Models the physical layout of a keyboard as a coordinate grid $G = (V, E)$.
* **Geometric Walk ($m_{\text{walk}}$)**: Defines a path via a starting key $v_0$, a direction vector $\vec{d}$, and a run length $n$ (e.g., `qwerty`, `12345`, `zaq1`).
  $$\text{Cost} = \underbrace{\log_2 |V|}_{\text{Start key}} + \underbrace{\log_2 (\text{deg}(v))}_{\text{Direction}} + \underbrace{L_{\mathbb{N}}(n)}_{\text{Length encoding}}$$
* **State Modifiers ($m_{\text{mod}}$)**: Models sticky keys or shift-patterns (e.g., Capitalizing the first letter, holding Shift for a run of characters). Pay a small transition cost to toggle the modifier state rather than paying for a larger character set.

#### D. Common Pattern Generators
* **Repetition ($m_{\text{rep}}$)**: Repeats the previous token or character $n$ times (e.g., `aaaa`, `passpass`).
  $$\text{Cost} = L_{\mathbb{N}}(n)$$
* **Sequences ($m_{\text{seq}}$)**: Ascii or logical sequences (`abcd`, `9876`, months, days) parameterized by start, step, and length.

#### E. Contextual & User-Specific Priors
* **Personal Information ($m_{\text{pii}}$)**: A small, high-probability dictionary populated by user metadata (username, name, birth year, email segments, pet names, previous passwords).
  $$\text{Cost}(w) = -\log_2 P_{\text{pii}}(w) \quad (\text{typically } \ll 5 \text{ bits})$$

#### F. Relational & Mutation Operators (Transducers)
Instead of generating characters from scratch, transducers modify the output of another generator $s \to s'$. The cost is the base generator cost plus the mutation cost.
* **L33t / Common Substitutions ($T_{\text{sub}}$)**: Applies a probabilistic substitution table (e.g., $a \to @$, $s \to \$$, $o \to 0$).
  $$\text{Cost}(s' \mid s) = \sum_{j} -\log_2 P_{\text{sub}}(s'_j \mid s_j)$$
* **Edit / Hamming Distance ($T_{\text{edit}}$)**: Models a password as a minor mutation (insertion, deletion, swap) of a known word or previous password.
  $$\text{Cost}(s' \mid s) = \underbrace{L_{\mathbb{N}}(d)}_{\text{Num edits}} + d \cdot (\underbrace{\log_2 |s|}_{\text{Position}} + \underbrace{\log_2 |\Sigma|}_{\text{New char}})$$

---

## 3. User Interface (UI) & Experience Design

The UI is designed not just to judge a password, but to **demystify how an attacker "sees" the password**, making the modeling choices transparent and interactive.

### 3.1. Primary Input & The "Entropy Ledger"
* **Password Input Field**: Supports toggleable visibility and real-time evaluation.
* **Comparison Bar (Naive vs. Honest)**: 
  * A dual-layered horizontal meter.
  * The background ghost-bar shows **Naive Entropy** (e.g., *"95 bits — assuming pure randomness"*).
  * The foreground solid bar shows **Honest MDL Entropy** (e.g., *"21.4 bits — accounting for patterns"*).
  * The gap between them is labeled **"The Human Predictability Tax"**.

### 3.2. The Parse Tree & Segmentation Ribbon
Directly below the input field, the password characters are visually segmented into blocks corresponding to the optimal derivation $\pi^*$.
* **Visual Segmentation**: Characters are grouped into color-coded pills based on their generator (e.g., Blue = Dictionary, Orange = Keyboard Walk, Purple = Mutation, Green = True Random).
* **Multi-Layer Stacked Tags**: If a segment uses a relational operator (like a mutated dictionary word `P@ssw0rd`), the UI shows a vertical stack under those characters:
  * *Layer 1 (Base)*: Dictionary word `"password"` ($6.2 \text{ bits}$)
  * *Layer 2 (Modifier)*: Title Case `P` ($1.5 \text{ bits}$)
  * *Layer 3 (Transducer)*: L33t substitutions `a->@`, `o->0` ($3.1 \text{ bits}$)
* **Bit-Cost Annotations**: Each segment and transition arrow displays its exact bit cost, summing visually from left to right to equal the total score.

### 3.3. Interactive "Attacker Knowledge" Panel (Model Awareness)
To highlight how modeling choices affect entropy, users can manipulate the adversary's assumptions in real-time:
* **Personal Context Sandbox**: Text fields where users can type mock personal data (Name, Birthdate, Username, Previous Password). Typing a previous password that is similar to the current password will immediately trigger the *Edit Distance Transducer*, visibly collapsing the entropy bar.
* **Adversary Sophistication Toggles**: Checkboxes allowing the user to enable/disable specific generator modules in $\mathcal{M}$:
  * `[x] Knows English Dictionary & Frequencies`
  * `[x] Knows QWERTY / Dvorak Keyboard Layouts`
  * `[x] Knows L33tspeak Substitutions`
  * `[x] Knows My Personal Info`
  * *Effect*: Unchecking a box forces the model to fall back to more expensive generators, illustrating *why* a password is weak (e.g., *"Your password is only strong if the attacker doesn't know what a QWERTY keyboard looks like"*).

### 3.4. Competing Hypotheses Explorer
Because finding the minimal encoding involves evaluating many possible ensembles, the UI exposes the **runner-up interpretations**:
* An accordion view titled **"How an attacker models this:"**
  * **#1 Optimal Model (21.4 bits - Selected)**: `[Dict: "correct"] + [Dict: "horse"]`
  * **#2 Runner-up Model (34.8 bits)**: `[Dict: "cor"] + [Random: "recth"] + [Dict: "orse"]`
  * **#3 Naive Model (72.0 bits)**: `[Random Lowercase x 12]`
* Hovering over an alternative model temporarily re-renders the Segmentation Ribbon to show that model's breakdown.

### 3.5. Actionable Counterfactual Feedback
Instead of generic rules (*"Add a symbol"*), the system computes gradients on the parse tree to suggest high-entropy edits:
* Identifies the "cheapest" segment in the user's password and explains how to break the pattern (e.g., *"The segment `1234` costs only 3.2 bits because it is a sequence. Replacing `3` with `9` breaks the sequence and adds 8.1 bits."*).