# Honest Password Entropy: How an Attacker Actually Sees Your Password

## Brief Background: The Flaw in Traditional Password Meters

For decades, we have been taught to create passwords using arbitrary complexity rules: *at least eight characters, one uppercase letter, one number, and one symbol*. Traditional password strength meters judge these passwords in one of two deeply flawed ways:

1. **The Naive Math Approach (Shannon Entropy):** Many meters calculate strength by simply looking at the length of your password and the pool of character types you used. If you type `P@ssw0rd123!`, a naive calculator sees uppercase letters, lowercase letters, numbers, and symbols, and assumes you pulled 12 characters completely at random out of a bag of 95 possible symbols. It awards the password ~78 bits of entropy—declaring it virtually uncrackable.
2. **The Guesswork Approach (Ad-Hoc Penalties):** Other meters realize `P@ssw0rd123!` is weak, so they subtract arbitrary points for dictionary words or common substitutions. While closer to reality, these rules are patchwork heuristics rather than rigorous math.

In reality, human beings are terrible at being random. Meanwhile, modern attackers do not guess passwords character by character at random; they use sophisticated models of human behavior, language, and even the physical shape of your keyboard.

---

## The Theory: Password Strength as Compression

**Honest Password Entropy** replaces guesswork with a rigorous concept from information theory called **Minimum Description Length (MDL)**, combined with a foundational rule of cryptography known as **Kerckhoffs’s Principle** (which states that you must always assume the adversary knows the system and methods you are using).

Instead of asking, *"How many random combinations could make this password?"*, this project asks:

> **"What is the shortest set of instructions (in bits) required to describe this password to a smart attacker?"**

If a password can be described using a very short recipe, it has **low entropy** (it is easy to guess). If the shortest way to describe a password is simply to spell it out letter by letter, it has **high entropy** (it is genuinely random).

### The Attacker’s Toolkit (Generator Modules)
We assume the attacker has a library of "generators" that model how humans actually think and type:
* **Dictionaries & Word Frequencies:** Choosing a word from the English language—especially a common one like `dragon` or `shadow`—takes far fewer bits of information than typing random letters.
* **Keyboard Geometry:** Sliding a finger down a keyboard to type `qwerty` or `1qaz2wsx` isn't eight random characters; it is simply *a starting key, a direction, and a length*.
* **Sequences & Repetitions:** Patterns like `1234`, `abcd`, or `aaaa` require almost no information to describe.
* **Personal Context:** Names, birth years, usernames, or slight variations of a previous password (e.g., changing `Summer2024!` to `Summer2025!`) cost an attacker almost nothing to guess if they know who you are.
* **Mutations (Transducers):** Humans often take a simple word and disguise it—capitalizing the first letter or swapping `a` for `@` and `o` for `0` (L33tspeak). Our model treats these as thin layers on top of a base word rather than truly random symbols.

### The Equation of "Honest Entropy"
When you type a password, the system searches through every possible combination of these generators to find the most compact recipe that builds your password. 

$$\text{Honest Entropy} = \text{Model Cost (the recipe)} + \text{Data Cost (the ingredients)}$$

It even accounts for **Transitions**—because humans predictably put words first, numbers second, and a single `!` at the very end, moving between those steps in that order costs almost no extra bits.

---

## Inside the Interactive Interface

The user interface is designed as an **Adversarial Lab** that lets you look through the eyes of a password-cracking algorithm in real time.

### 1. The Entropy Ledger & "The Human Predictability Tax"
At the top of the screen, a dual-layered meter compares two numbers side by side:
* **The Ghost Bar (Naive Entropy):** What a traditional calculator *thinks* your password is worth if it were pure random noise.
* **The Solid Bar (Honest MDL Entropy):** What your password is *actually* worth once human patterns are compressed away.
* **The Human Predictability Tax:** The visual gap between the two bars, showing exactly how many bits of security were lost to predictable human habits.

### 2. The Parse Tree & Multi-Layer Segmentation Ribbon
Directly beneath your password, the interface breaks your text into color-coded building blocks showing the exact recipe the attacker used to compress it:
* **Stacked Layers:** If you type `P@ssw0rd`, you won't just see a single block. You will see a vertical stack under those characters:
  1. *Base Layer:* Dictionary word `"password"` (~6.4 bits)
  2. *Modifier Layer:* Capitalize first letter (~1.5 bits)
  3. *Substitution Layer:* Swap `a → @` and `o → 0` (~3.2 bits)
* **Bit-by-Bit Accounting:** Every block and every arrow connecting them shows its exact cost in bits, adding up from left to right so you can see where your strength actually comes from.

### 3. The "Attacker Knowledge" Sandbox
Security depends entirely on what your adversary knows. This interactive panel lets you manipulate the attacker's brain in real time:
* **Personal Context Fields:** Type in a mock name, birth year, or "previous password." If your current password is a minor tweak of your "previous password," you will watch the entire parse tree collapse into a single "Edit Distance" block costing just a few bits.
* **Sophistication Toggles:** Checkboxes allow you to turn the attacker's capabilities on and off (e.g., *Uncheck "Knows QWERTY Keyboard Layout"* or *Uncheck "Knows L33tspeak"*). Watching your score jump when you blind the attacker illustrates a powerful truth: *your keyboard walk is only clever if the attacker has never seen a keyboard.*

### 4. Competing Hypotheses Explorer
Because there is more than one way to interpret a string of characters, the system shows the **runner-up interpretations** it considered before settling on the cheapest one. Hovering over a runner-up hypothesis temporarily re-draws the visual ribbon, letting you compare different ways an algorithm attempts to break down your password.

### 5. Counterfactual Advisor (Smart Feedback)
Instead of generic, unhelpful rules like *"Add a special character,"* the advisor pinpoints the weakest link in your password's chain and calculates the single character change that will cause the biggest jump in real entropy—such as breaking a `1234` sequence in the middle or disrupting a spatial keyboard walk.

---

## Why Is This Interesting?

* **No Magic Numbers:** Most password tools rely on arbitrary point deductions invented by their creators. Here, every single penalty is derived from pure information theory—the actual mathematical cost of encoding data.
* **Exposing the "Cleverness" Trap:** It visually demonstrates why the tricks people think make them safe (like `Tr0ub4dor&3` or `1qaz2wsx`) barely move the needle against a model that understands language and geometry.
* **Making Invisible Math Tangible:** Information theory and Minimum Description Length can feel abstract. Seeing a password physically sliced into stacked layers of base words, mutations, and transition arrows turns abstract math into an intuitive visual puzzle.

---

## Who Might Find This Useful?

* **Everyday Internet Users:** Anyone who wants to build a genuine intuition for what makes a passphrase strong—and learn why a four-word phrase or a password manager is vastly superior to struggling with `P@ssw0rd1!`.
* **Educators & Students:** Teachers of cybersecurity, cryptography, linguistics, or information theory looking for an interactive, hands-on demonstration of Shannon entropy, compression, and Kerckhoffs’s Principle.
* **Security Communicators & Trainers:** IT and security professionals who need a compelling visual tool to show employees *why* incremental password rotations (`Fall2024!` → `Winter2024!`) and keyboard patterns are dangerous.
* **Product Designers & UX Researchers:** Anyone designing authentication flows who wants to see how transparent, educational feedback can guide users toward better security habits without frustrating, arbitrary rules.