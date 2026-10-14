# Rotor

### A notebook you can turn around in your hands

Most note-taking tools ask you to decide, at the moment you write something down, where it *lives*. Is it in the "Work" folder or the "Ideas" folder? Under the project or under the person? You pick one, and everything else about the note becomes a label you can search for later.

Rotor starts from a different idea:

> **A note isn't in one place. It sits at a point in a space with several dimensions. You choose which two you look at.**

You write each note once. You describe it along whatever dimensions matter to you (topic, status, person, project, week). Then you look at the whole notebook as a grid and *rotate* it. Put topics down the side and statuses across the top. One click later, flip them. Swap in "person" for "topic". The notes stay the same. Only your point of view changes.

And you can write in any view. Typing into a cell, dragging a note to another cell, or renaming a heading changes your real notes, not a throwaway report.

---

## The idea in plain terms

Think of a cardboard box of index cards. Each card has some words on it, plus a few facts about it:

- **Topic:** AI
- **Status:** In progress
- **Person:** Dana

Those facts are the card's **coordinates**. A set of facts like "Topic, Status, Person" is a **dimension** list, and the possible answers for each (AI, History, Finance…) are its **values**.

Now lay the cards out on a table. You can only show two directions at once, so you choose:

| | Open | In progress | Done |
|---|---|---|---|
| **AI** | card, card | card | card |
| **History** | card | card | card, card |

That is one **view**. Rotate it, and the same cards re-sort into a new arrangement:

| | AI | History |
|---|---|---|
| **Open** | card, card | card |
| **In progress** | card | card |
| **Done** | card | card, card |

Nothing was copied, and nothing went stale. It's the same box of cards seen from another side.

A few consequences follow from this:

- **A note can belong to several places.** A note about both AI and the history of computing shows up under both topics. Rotor marks the extra appearance with a small ↺ symbol, so you know it's the same note and not a duplicate. Edit either one, and both change.
- **A note doesn't have to be filed.** Anything without a value in a dimension lands in a "—" (unassigned) bucket. You can sort it later, or never.
- **Hidden dimensions are left alone.** When you move a note between two columns, only the "column" fact changes. Everything you can't currently see stays exactly as it was. You can rotate, make edits, rotate back, and trust that nothing happened off-screen.
- **Deleting a heading never deletes your notes.** If you remove "Open" as a status, the notes that were Open simply become unassigned.

---

## What it looks like

Rotor is a single page with a few parts.

**The grid.** The main area is a table. The headings along the top and left are values from the dimensions you've chosen, with a count of how many notes sit under each. Each cell holds small note cards showing the first few lines of your writing. Notes support simple Markdown (bold, italics, lists, code, links), so you can format without a toolbar.

**The shelves.** Above the grid are four labeled shelves: **Filter**, **Rows**, **Columns** and **Unused**. Each dimension is a small pill that you can drag between shelves. This is the rotation:

- Drag *Topic* from Rows to Columns, and the grid turns.
- Drag *Person* beside *Topic* on Rows, and people nest inside topics.
- Drop a dimension on **Filter** to look at only some of its values, like "just Dana's notes".
- Drop it on **Unused** to set it aside without losing anything.

There is also a one-click **transpose** button that swaps rows and columns.

**Cell display modes.** Each view can show cells as a stack of cards, a compact list, or just a **count** shaded like a heat map. Count mode turns the notebook into something like a pivot table for a moment. It's a quick way to see where your thinking is thin.

**The note editor.** Click a note and a side panel opens. You edit the text, see a live preview, and tick checkboxes to say which values the note carries in every dimension. Create new values on the spot.

**Quick capture.** A text box at the bottom lets you jot something down without clicking around. You can attach facts inline: typing `Call Bob about budget topic:finance status:open` makes a note that says "Call Bob about budget" and files it under the right topic and status. Anything you don't specify falls in wherever you're currently looking.

**Saved views.** You can keep several named views, such as "Topic × Status", "By person" or "This week's work". Each is just a remembered way of looking. Deleting a view never touches a note. Press `1`–`9` to jump between them, or use Alt + the arrow keys to step backward and forward through the views you've visited. Rotating is treated as navigation, so undoing a typo won't un-rotate your screen.

**The command palette.** Press `/` or `Ctrl/Cmd + K` and type what you want: `rotate`, `rows topic`, `filter status open`, `save`. It's a keyboard shortcut for nearly everything on the screen.

### How you change things

| You do this | This happens to your notes |
|---|---|
| Double-click empty space in a cell | A new note appears with that cell's facts already filled in |
| Drag a note to another cell | It takes on the new cell's values (and only those) |
| Hold Alt while dragging | The note is *added* to the new cell as well, so it now lives in both |
| Drop a note on a heading | It gets that heading's value |
| Double-click a heading | Rename that value everywhere |
| Drag a heading | Reorder values within that dimension |
| Backspace on a focused card | Remove it from this cell (the note survives elsewhere) |
| Shift + Delete | Delete the note entirely (undo is always available) |

Everything can be done from the keyboard too. Arrow keys move around the grid, and `Ctrl/Cmd + Shift + arrow` moves a card to the neighboring cell.

---

## Your notes stay yours

Rotor is deliberately humble in form: **one file**.

- **It works offline.** Double-click the file and it opens in your browser. There is nothing to install, no account and no server.
- **It doesn't phone home.** The current version is locked so that it cannot talk to the internet at all. The first lines of the file say so, and you can check.
- **It saves itself as a file.** "Save HTML" produces a new copy of Rotor with your notes folded inside. You can email it, put it on a USB stick, or tuck it in a drawer. The file is both your notebook and the program needed to read it.
- **It's backed up two ways.** Your notebook is also kept automatically in the browser's own storage while you work. Browsers can clear that storage, so Rotor shows when you last saved to a real file. "Export JSON" gives you a plain, readable copy of everything.
- **It's not a trap.** The saved notes are ordinary text that can be read in any text editor, even if every browser vanished.

When you first open it, you'll find a small starter notebook that explains itself with its own notes ("Drag me to Done", "I'm in two topics: notice the ↺"). A "Start empty" button clears it when you're ready.

---

## A little history

The idea isn't new. It was shipped once and then mostly forgotten.

In 1991, Lotus released **Improv**, a spreadsheet unlike any other. Instead of locking your data into a fixed grid, Improv let you drag categories (months, regions, products) between the sides of the table and watch the whole sheet re-arrange. Names took the place of cell addresses, and the layout was just a way of looking. People admired it. It didn't sell, and it was discontinued within a few years.

Meanwhile Microsoft Excel introduced the **PivotTable**, and the industry settled on that model. Under it, the grid is where the data lives, and rotating is a *report* you generate on top of it. Pivot tables summarize. They are mostly read-only, and no one takes notes in one. Nearly every tool since (Google Sheets, Airtable, Notion databases) has inherited the same split.

Rotor sides with Improv. It also aims the idea at a place Improv never went: **everyday, unstructured notes.** The cells hold sentences instead of numbers. The dimensions are categories of meaning instead of fiscal quarters. And the main action is not "calculate" but "see differently."

---

## Why this is interesting

- **It respects how thoughts actually work.** Ideas don't sit in one folder. A single note can belong to a topic, a project, a person and a moment in time all at once. Rotor stores it that way, instead of pretending otherwise.
- **You don't have to decide in advance.** A folder forces the question "where does this go?" at writing time, when you know the least. With dimensions, you can capture first and organize later, or reorganize completely without moving anything.
- **Changing your view is cheap, so you do it more.** Seeing your notes by *status* and then by *person* and then by *week* regularly surfaces things that no single arrangement would. A stalled project, a person nobody has followed up with, or a topic you keep returning to are all easier to spot.
- **A view you can write in is different from a report.** The grid is the working surface itself. There's no separate "pivot" to rebuild when things change.
- **It's small and permanent.** A single file with no dependencies is about as durable as software gets. There are no servers to shut down and no subscription to lapse. The data is readable text.

---

## Who might find it useful

- **Researchers and students** juggling many sources, themes and stages of reading. Seeing "theme × source" and then "theme × how-far-along" is a natural fit.
- **Writers and journalists** tracking characters, scenes, threads or story leads that all cross each other.
- **Project and product people** who think of the same item as a feature, a risk, a customer request *and* a release milestone.
- **Consultants and anyone with many clients,** who want one notebook seen by client, by deadline or by kind of work.
- **People who keep stalling in a folder system.** If you've ever hesitated over where something should go, or found the same note useful in three places, you'll recognize the problem.
- **Privacy-minded users** who want a notebook that never leaves their own machine, with no account and no tracking.
- **Anyone curious about interfaces.** Rotor is a small, working experiment in a road that software didn't take, and it's fun to play with.

It's probably *not* for you if you want rich-text word processing, real-time team editing, automatic syncing across devices, or number-crunching formulas. Those are deliberately left out.

---

## Where it stands, and where it's headed

**This is an experiment, not a finished product.** What exists today is the foundation: a single-file notebook with all the rotation and editing described above, plus saved views, undo and redo, quick capture, the command palette, keyboard navigation, light and dark themes, and saving to file.

The written specification goes further. The main ideas on the roadmap are:

- **Date dimensions.** Notes automatically grouped by day, week or month from when they were written.
- **Nicer Markdown.** Richer formatting (tables, task lists) when you're online, with the built-in basics always working offline.
- **An installable app version** for people who'd rather have Rotor in their dock than a file in a folder.
- **Optional AI helpers, using your own key.** These would be strictly optional, off until you add a key, and never required. They'd do things like sort your unfiled notes, summarize a cluster, expand or tighten an idea, point out contradictions, or suggest a brand-new dimension you hadn't thought of. A helper would only ever *suggest*. You'd see every proposed change, accept or reject each one, and undo the lot in a single step. They would never delete anything. A fully offline edition with no network access at all would remain available for people who want that guarantee.
- **Smarter dimensions.** Groupings within a dimension (AI → Machine learning, Robotics) and dimensions that update themselves based on rules.

None of that changes the central bet: **notes are a space, not a pile of pages, and the most useful thing a notebook can do is let you turn it around.**

---

*Rotor is a working title, chosen because rotation is the verb at the heart of the idea.*