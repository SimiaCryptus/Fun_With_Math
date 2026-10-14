# Number Circuits

*What is the cheapest way to build a number out of nothing but the digit 1?*

Number Circuits is a small interactive experiment that explores this question. You are given one building block, the number **1**, and two operations, **addition** and **multiplication**. Parentheses are allowed to group things. Nothing else is permitted: no other digits, no subtraction, no division, no powers, and no gluing digits together (so you can't write "11").

Every whole number can be built under these rules. The question is how *cheaply*.

---

## The idea in a minute

The simplest way to build the number 6 is to add six ones together:

    1 + 1 + 1 + 1 + 1 + 1

That uses six 1s. But there is a shorter way:

    (1 + 1) * (1 + 1 + 1)

That is 2 times 3, which also makes 6, and it uses only **five** 1s.

The "price" of an expression is simply **how many 1s it contains**. Operators and parentheses are free. The cheapest price at which a number can be built is called that number's **minimal cost**. For 6 the minimal cost is 5, and no expression with four or fewer 1s can reach 6.

Here is how the first few numbers compare:

| Number | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|--------|---|---|---|---|---|---|---|---|---|----|----|----|
| Cheapest cost | 1 | 2 | 3 | 4 | 5 | 5 | 6 | 6 | 6 | 7 | 8 | 7 |

Notice that cost does not grow smoothly. The number 11 costs 8, yet the larger number 12 costs only 7, because 12 breaks neatly into factors (for example 3 × 4) while 11 does not. Prime numbers and their neighbours tend to be the awkward ones. Numbers with many small factors tend to be cheap.

---

## Some patterns worth knowing

- **Threes are the most efficient way to grow.** Multiplying together groups of `(1+1+1)` gives the biggest numbers for the fewest 1s. With about *k* ones, the largest number you can reach is roughly 3 raised to the power *k/3*.
- **Costs grow slowly.** A number *n* never needs more than about 3 × log₂(*n*) ones, and it always needs at least about 3 × log₃(*n*). Even very large numbers are therefore cheap to build compared to their size.
- **Many recipes, one answer.** A given number usually has several different cheapest expressions. Some of those expressions look quite different from one another, and the project can list all of them.
- **Wasteful tricks don't help.** Multiplying by 1 changes nothing but adds cost, so cheapest expressions never contain it.

---

## What you can do with it

The page has two sections, selected with tabs at the top.

### Calculator

Type an expression made of `1`, `+`, `*`, parentheses and spaces, and the calculator tells you:

- the value of the expression,
- its cost (how many 1s it contains),
- a tidied-up standard form of the expression,
- whether it is the cheapest possible way to make that number and, if not, what the cheapest cost is and an example of a cheaper expression,
- a tree diagram that shows how the expression is put together.

If you make a typo, it shows you where the problem is.

There is also a second mode. Type an ordinary whole number such as `47`, and the calculator shows you its cheapest expressions.

### Browser

The browser lets you explore the whole landscape of numbers at once. You choose how far to look (for example, every number up to 1000) and press **Run**. A progress indicator shows how the search is going while the page stays responsive, and results appear in a table as they are found.

The table lists, for each number:

- its minimal cost,
- how many different cheapest recipes exist,
- an example of one.

You can sort the table and page through it. Clicking a row opens a detail view with every cheapest expression for that number and a breakdown of how many recipes exist at each cost, not only the cheapest.

Beside the table you'll find:

- **A chart** of cost against number, drawn together with the upper and lower theoretical limits so you can see how the real costs sit between them.
- **Records and curiosities**, such as the smallest number that needs a given cost, the largest number reachable for a given cost, and which numbers are cheapest to build as a sum versus a product.
- **Export** buttons to save any table as a file for use in a spreadsheet or other tools.

Advanced options let you cap the numbers examined, limit the cost searched, and switch between a fast mode (finds costs and recipes) and an exhaustive mode (lists every distinct way of building a number, practical only for small costs).

*Note: the page uses modern web features that browsers only allow when it is opened through a web server rather than by double-clicking the file. If it appears blank, ask whoever shared it with you how to serve it locally.*

---

## Background

This puzzle is a known topic in mathematics called **integer complexity**. The cost of a number is its "complexity", and the sequence of costs for 1, 2, 3, … is catalogued in the Online Encyclopedia of Integer Sequences as **A005245**. Related sequences list the smallest and largest numbers for each cost (**A005520** and **A000792**).

Mathematicians have studied this question since at least the mid-twentieth century. The surprising difficulty is that the rules are so simple, yet the exact cost of a number is hard to predict in general. There are bounds, as described above, but there is no simple formula that tells you the cost of an arbitrary number. The reliable method is to search, building cheap expressions first and working upward, and that is exactly what this project does.

The project also double-checks its answers against a separate classic method that works out the cost of each number from the costs of smaller numbers, so the two approaches can confirm each other.

---

## Why it is interesting

- **Simple rules, deep behaviour.** Anyone can understand the game in a minute, yet it connects to open research questions about how addition and multiplication interact.
- **It exposes the tension between sums and products.** Addition and multiplication pull in different directions. Seeing which one wins for each number gives a feel for the structure of the integers.
- **It makes the structure of numbers visible.** Primes, highly factorable numbers and awkward neighbours of nice numbers leave clear fingerprints in the table and chart.
- **It is a playground.** Because the rules are so small, it's easy to ask "what if?" questions, such as what happens if you may also use 2 or 3 as starting blocks, or if you count operators instead of 1s.

---

## Who might find it useful

- **Curious people and puzzle fans**, for whom it's a game of finding the thriftiest recipe for a number.
- **Teachers and students**, as a hands-on way to talk about factors, primes, growth rates, logarithms and the idea that there can be many routes to the same answer.
- **Mathematicians and hobbyist researchers**, as a quick way to look at data, spot patterns and test ideas about integer complexity without writing their own tools.
- **Computer scientists**, as an accessible example of how the cost of computing something can differ depending on the approach. This is close in spirit to how real arithmetic circuits are measured.
- **Anyone who enjoys recreational mathematics** and wants to poke at a small system and see what it does.

---

## Status and where it may go

This is an experiment, built up in stages: first the calculator, then the cost search and browser, then the more exhaustive counting, charts and export features.

Possible future directions include:

- different ways of measuring cost (counting operations, or the depth of the expression),
- extra starting numbers or extra operations, compared against the basic game,
- allowing a sub-expression to be reused at no extra cost, which changes the answers and is closer to how real calculations are shared,
- saving results so that long searches are not lost when the page is closed.