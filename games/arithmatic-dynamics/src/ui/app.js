// Bootstrap: wires the core session, UI layers, and gestures together.

import { GameSession } from '../game/session.js';
import { evaluateStars } from '../game/stars.js';
import { allLevels, findLevel } from '../game/levels/index.js';
import { generateRandom } from '../game/generator.js';
import { legalVerbs } from '../core/legality.js';
import { findNode, isNum, isSum, isProduct, isGroup, membersOf } from '../core/expression.js';
import { serialize } from '../core/serialize.js';
import { el, clear } from '../util/dom.js';
import { Stage } from './stage.js';
import { History } from './history.js';
import { RadialMenu } from './radial-menu.js';
import { SplitChooser } from './split-chooser.js';
import { GestureRecognizer } from './gestures.js';
import { celebrate } from './animate.js';
import { SettingsMenu, DEFAULT_SETTINGS } from './settings.js';

export function boot(mount) {
  console.log('[app] booting Arithmetic Dynamics');
  const state = { level: null, session: null, settings: { ...DEFAULT_SETTINGS } };

  // Layout scaffold.
  const stageEl = el('div', { class: 'stage', id: 'stage' });
  const menuEl = el('div', { class: 'radial-layer', id: 'radial' });
  const chooserEl = el('div', { class: 'chooser-layer', id: 'chooser' });
  const historyEl = el('div', { class: 'history', id: 'history' });
  const toolbarEl = el('div', { class: 'toolbar', id: 'toolbar' });
  const levelBarEl = el('div', { class: 'level-bar', id: 'levelbar' });
  const settingsEl = el('div', { class: 'settings', id: 'settings-menu' });
  const statusEl = el('div', { class: 'status', id: 'status' });

  const stageWrap = el('div', { class: 'stage-wrap' }, [stageEl, menuEl, chooserEl]);

  clear(mount);
  mount.append(
    levelBarEl,
    el('div', { class: 'main' }, [
      el('div', { class: 'play-col' }, [statusEl, stageWrap, toolbarEl]),
      historyEl,
    ]),
  );

  const stage = new Stage(stageEl, { onSelect: handleSelect });
  const history = new History(historyEl, { onRewind: handleRewind });
  const radial = new RadialMenu(menuEl, { onVerb: applyVerb });
  const chooser = new SplitChooser(chooserEl, { onChoose: onSplitChoose });
  const settings = new SettingsMenu(settingsEl, {
    settings: state.settings,
    onChange: (s) => {
      state.settings = s;
    },
  });

  // selection is an array of 0..2 ids.
  let selection = [];
  let splitTargetId = null;
  let splitMode = 'split';
  // Clicking/tapping empty gamespace clears the current selection.
  stageEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.tile')) return;
    if (selection.length) clearSelection();
  });

  new GestureRecognizer(stageEl, {
    onTap: (id, elm, kind) => handleSelect(id, elm),
    onLongPress: (id, elm) => openMenu([id], elm),
    onDragCombine: (fromId, toId) => tryPair(fromId, toId, 'combine'),
    onDragSwap: (fromId, toId) => tryPair(fromId, toId, 'swap'),
  });

  buildLevelBar();
  buildToolbar();
  loadLevel(allLevels[0].id);

  function buildLevelBar() {
    clear(levelBarEl);
    levelBarEl.appendChild(el('span', { class: 'brand' }, 'Arithmetic Dynamics'));
    const sel = el('select', {
      class: 'level-select',
      onChange: (e) => loadLevel(e.target.value),
    });
    for (const lvl of allLevels) {
      sel.appendChild(el('option', { value: lvl.id }, lvl.id));
    }
    state._levelSelect = sel;
    const randBtn = el(
      'button',
      {
        class: 'tool-btn',
        type: 'button',
        onClick: () => loadGenerated(),
      },
      '🎲 Random',
    );
    levelBarEl.append(sel, randBtn, settingsEl);
  }

  function buildToolbar() {
    clear(toolbarEl);
    const undoBtn = el(
      'button',
      {
        class: 'tool-btn',
        type: 'button',
        onClick: () => {
          state.session.undo();
          syncHistoryToSession();
        },
      },
      '↶ Undo',
    );
    const redoBtn = el(
      'button',
      {
        class: 'tool-btn',
        type: 'button',
        onClick: () => {
          state.session.redo();
          syncHistoryToSession();
        },
      },
      '↷ Redo',
    );
    const resetBtn = el(
      'button',
      {
        class: 'tool-btn',
        type: 'button',
        onClick: () => {
          state.session.reset();
          history.reset();
        },
      },
      '⟲ Reset',
    );
    toolbarEl.append(undoBtn, redoBtn, resetBtn);
  }

  function bindSession() {
    state.session.on('changed', () => {
      stage.setSelection(selection.length ? selection : null);
      stage.render(state.session.expr);
      updateStatus();
    });
    state.session.on('solved', () => onSolved());
  }

  function loadLevel(id) {
    const level = findLevel(id);
    if (!level) {
      console.warn(`[app] loadLevel: no level found for id "${id}"`);
      return;
    }
    console.log(`[app] loadLevel`, { id });
    startLevel(level, id);
  }

  function loadGenerated() {
    const s = state.settings || {};
    const level = generateRandom({
      allowMultiply: s.allowMultiply !== undefined ? s.allowMultiply : true,
      minTerm: s.minTerm,
      maxTerm: s.maxTerm,
      ops: s.ops,
    });
    startLevel(level, null);
  }

  function startLevel(level, id) {
    console.log(`[app] startLevel`, { id, start: level.start, allowedVerbs: level.allowedVerbs });
    state.level = level;
    state.session = new GameSession(level);
    selection = [];
    radial.hide();
    chooser.hide();
    history.reset();
    if (id && state._levelSelect) state._levelSelect.value = id;
    bindSession();
    stage.setSelection(null);
    stage.render(state.session.expr);
    updateStatus();
  }

  function updateStatus() {
    clear(statusEl);
    const s = state.session;
    const hintText = state.level.hint ? ` · Hint: ${state.level.hint}` : '';
    statusEl.appendChild(el('span', {}, `Moves: ${s.moveCount}${hintText}`));
  }
  // Resolve the difficulty passed to legality checks. For 'custom' we pass a
  // parameter object { threshold, factors } that difficultyAllows understands;
  // named difficulties are passed through as strings.
  function resolveDifficulty() {
    const s = state.settings || {};
    if (s.difficulty === 'custom') {
      return {
        threshold: s.customThreshold !== null ? s.customThreshold : 10,
        factors: s.customFactors && s.customFactors.length ? s.customFactors : [2, 5],
      };
    }
    return s.difficulty;
  }

  // Tap: build up a selection of up to two adjacent siblings.
  function handleSelect(id, elm) {
    if (selection.includes(id)) {
      selection = selection.filter((x) => x !== id);
    } else if (selection.length === 0) {
      selection = [id];
    } else if (selection.length === 1) {
      // Only extend to a second id if it is an adjacent sibling.
      if (areAdjacentSiblings(selection[0], id)) {
        selection = [selection[0], id];
      } else {
        selection = [id];
      }
    } else {
      selection = [id];
    }
    stage.setSelection(selection.length ? selection : null);
    stage.render(state.session.expr);
    if (!selection.length) {
      radial.hide();
      return;
    }
    openMenu(selection, findTileEl(selection[selection.length - 1]));
  }

  function areAdjacentSiblings(aId, bId) {
    const fa = findNode(state.session.expr, aId);
    const fb = findNode(state.session.expr, bId);
    if (!fa || !fb || !fa.parent || fa.parent !== fb.parent) return false;
    if (!(isSum(fa.parent) || isProduct(fa.parent))) return false;
    // Members of the same commutative container may be paired even when
    // they are not physically adjacent.
    return true;
  }

  function findTileEl(id) {
    return stageEl.querySelector(`.tile[data-id="${id}"]`);
  }
  function clearSelection() {
    selection = [];
    stage.setSelection(null);
    stage.render(state.session.expr);
    radial.hide();
  }

  function openMenu(ids, elm) {
    const verbs = legalVerbs(state.session.expr, ids, state.session.allowedVerbs, {
      difficulty: resolveDifficulty(),
    });
    if (verbs.length === 0) {
      radial.hide();
      return;
    }
    const rect = elm ? elm.getBoundingClientRect() : null;
    radial.show(verbs, rect);
  }

  function applyVerb(verb) {
    if (!selection.length) return;

    if (verb === 'split') {
      const id = selection[0];
      const found = findNode(state.session.expr, id);
      if (found && isNum(found.node)) openSplit(id, found.node.value, 'split');
      return;
    }
    if (verb === 'factorize') {
      const id = selection[0];
      const found = findNode(state.session.expr, id);
      if (found && isNum(found.node)) openSplit(id, found.node.value, 'factor');
      return;
    }
    if (verb === 'ungroup') {
      commit('ungroup', selection[0]);
      return;
    }
    if (verb === 'group') {
      commit('group', selection.slice());
      return;
    }
    // combine / swap / cancel need two ids.
    if (selection.length === 2) {
      commit(verb, selection[0], selection[1]);
    }
  }

  function openSplit(id, value, mode = 'split') {
    splitTargetId = id;
    splitMode = mode;
    chooser.show(value, mode);
  }

  function onSplitChoose(into) {
    if (!splitTargetId) return;
    const before = serialize(state.session.expr);
    const verb = splitMode === 'factor' ? 'factorize' : 'split';
    try {
      state.session.apply(verb, splitTargetId, { into });
      history.push(before, verb);
      maybeAutoUngroup();
    } catch (err) {
      flashError(err.message);
    }
    splitTargetId = null;
    selection = [];
  }
  // After a split/factorize, the replacement is wrapped in a group to
  // preserve unambiguity. If that group carries no neg/recip flag it is
  // safe to splice inline immediately, so do so automatically.
  function maybeAutoUngroup() {
    const found = findNode(state.session.expr, splitTargetId);
    // The split target id no longer exists; instead locate the new group
    // by scanning for a plain (non-inverse) group whose parent is a
    // matching container. Simpler: attempt ungroup on every plain group
    // that is a direct member of a sum/product and collapses cleanly.
    void found;
    const gid = findPlainSplicableGroup(state.session.expr);
    if (!gid) return;
    try {
      const before = serialize(state.session.expr);
      state.session.apply('ungroup', gid);
      history.push(before, 'ungroup');
    } catch {
      // If ungrouping would change value or is otherwise illegal, leave
      // the group in place.
    }
  }
  // Find a group that is a direct member of a matching container
  // (sum-in-sum or product-in-product) and carries no neg/recip flag.
  function findPlainSplicableGroup(root, parent = null) {
    if (!root) return null;
    if (isGroup(root)) {
      const inline =
        parent &&
        !root.neg &&
        !root.recip &&
        ((isSum(parent) && isSum(root.child)) || (isProduct(parent) && isProduct(root.child)));
      if (inline) return root.id;
      return findPlainSplicableGroup(root.child, root);
    }
    if (isSum(root) || isProduct(root)) {
      for (const m of membersOf(root)) {
        const hit = findPlainSplicableGroup(m, root);
        if (hit) return hit;
      }
    }
    return null;
  }

  function commit(verb, ...args) {
    const before = serialize(state.session.expr);
    try {
      state.session.apply(verb, ...args);
      history.push(before, verb);
      selection = [];
      stage.setSelection(null);
      radial.hide();
    } catch (err) {
      console.warn(`[app] commit "${verb}" failed`, err);
      flashError(err.message);
    }
  }

  // Drag-driven pairing: attempt the given verb on two dragged atoms if
  // they are adjacent siblings; combine falls back to cancel when apt.
  function tryPair(fromId, toId, preferred) {
    if (!areAdjacentSiblings(fromId, toId)) return;
    const verbs = legalVerbs(state.session.expr, [fromId, toId], state.session.allowedVerbs, {
      difficulty: resolveDifficulty(),
    });
    let verb = preferred;
    if (preferred === 'combine' && !verbs.includes('combine') && verbs.includes('cancel')) {
      verb = 'cancel';
    }
    if (!verbs.includes(verb)) return;
    commit(verb, fromId, toId);
  }

  function syncHistoryToSession() {
    history.truncate(state.session.moveCount);
    selection = [];
    stage.setSelection(null);
  }

  function handleRewind(index) {
    const target = index;
    while (state.session.moveCount > target && state.session.canUndo()) {
      state.session.undo();
    }
    history.truncate(state.session.moveCount);
  }

  function onSolved() {
    radial.hide();
    const { earned } = evaluateStars(state.session, state.level);
    const banner = el('div', { class: 'solved-banner' }, [
      el('div', { class: 'solved-title' }, `Solved! = ${serialize(state.session.expr)}`),
      el(
        'div',
        { class: 'solved-stars' },
        state.level.stars.map((star) =>
          el(
            'span',
            {
              class: `star ${earned.includes(star.id) ? 'earned' : ''}`,
              title: star.label || star.id,
            },
            earned.includes(star.id) ? '★' : '☆',
          ),
        ),
      ),
    ]);
    statusEl.appendChild(banner);
    celebrate(stageEl.querySelector('.tile'));
  }

  function flashError(msg) {
    console.error(`[app] error:`, msg);
    const note = el('div', { class: 'error-note' }, msg);
    statusEl.appendChild(note);
    setTimeout(() => note.remove(), 1800);
  }
}
