// Bootstrap: wires the core session, UI layers, and gestures together.

import {GameSession} from '../game/session.js';
import {evaluateStars} from '../game/stars.js';
import {allLevels, findLevel} from '../game/levels/index.js';
import {legalVerbs} from '../core/legality.js';
import {findNode, isNum, isOp} from '../core/expression.js';
import {serialize} from '../core/serialize.js';
import {el, clear} from '../util/dom.js';
import {Stage} from './stage.js';
import {History} from './history.js';
import {RadialMenu} from './radial-menu.js';
import {SplitChooser} from './split-chooser.js';
import {GestureRecognizer} from './gestures.js';
import {celebrate} from './animate.js';

export function boot(mount) {
    const state = {level: null, session: null};

    // Layout scaffold.
    const stageEl = el('div', {class: 'stage', id: 'stage'});
    const menuEl = el('div', {class: 'radial-layer', id: 'radial'});
    const chooserEl = el('div', {class: 'chooser-layer', id: 'chooser'});
    const historyEl = el('div', {class: 'history', id: 'history'});
    const toolbarEl = el('div', {class: 'toolbar', id: 'toolbar'});
    const levelBarEl = el('div', {class: 'level-bar', id: 'levelbar'});
    const statusEl = el('div', {class: 'status', id: 'status'});

    const stageWrap = el('div', {class: 'stage-wrap'}, [stageEl, menuEl, chooserEl]);

    clear(mount);
    mount.append(
        levelBarEl,
        el('div', {class: 'main'}, [
            el('div', {class: 'play-col'}, [statusEl, stageWrap, toolbarEl]),
            historyEl,
        ]),
    );

    const stage = new Stage(stageEl, {onSelect: handleSelect});
    const history = new History(historyEl, {onRewind: handleRewind});
    const radial = new RadialMenu(menuEl, {onVerb: applyVerb});
    const chooser = new SplitChooser(chooserEl, {onChoose: onSplitChoose});

    let selectedId = null;
    let splitTargetId = null;

    new GestureRecognizer(stageEl, {
        onTap: (id, elm, kind) => handleSelect(id, elm),
        onLongPress: (id, elm) => openMenu(id, elm),
        onDragCombine: (fromId, toId) => tryCombine(fromId, toId),
        onDragSwap: (fromId, toId) => trySwap(fromId, toId),
    });

    buildLevelBar();
    buildToolbar();
    loadLevel(allLevels[0].id);

    function buildLevelBar() {
        clear(levelBarEl);
        levelBarEl.appendChild(el('span', {class: 'brand'}, 'Arithmetic Dynamics'));
        const sel = el('select', {
            class: 'level-select',
            onChange: (e) => loadLevel(e.target.value),
        });
        for (const lvl of allLevels) {
            sel.appendChild(el('option', {value: lvl.id}, lvl.id));
        }
        state._levelSelect = sel;
        levelBarEl.appendChild(sel);
    }

    function buildToolbar() {
        clear(toolbarEl);
        const undoBtn = el('button', {
            class: 'tool-btn', type: 'button',
            onClick: () => {
                state.session.undo();
                syncHistoryToSession();
            },
        }, '↶ Undo');
        const redoBtn = el('button', {
            class: 'tool-btn', type: 'button',
            onClick: () => {
                state.session.redo();
                syncHistoryToSession();
            },
        }, '↷ Redo');
        const resetBtn = el('button', {
            class: 'tool-btn', type: 'button',
            onClick: () => {
                state.session.reset();
                history.reset();
            },
        }, '⟲ Reset');
        toolbarEl.append(undoBtn, redoBtn, resetBtn);
    }

    function loadLevel(id) {
        const level = findLevel(id);
        if (!level) return;
        state.level = level;
        state.session = new GameSession(level);
        selectedId = null;
        radial.hide();
        chooser.hide();
        history.reset();
        if (state._levelSelect) state._levelSelect.value = id;

        state.session.on('changed', () => {
            stage.setSelection(selectedId);
            stage.render(state.session.expr);
            updateStatus();
        });
        state.session.on('solved', () => onSolved());

        stage.setSelection(null);
        stage.render(state.session.expr);
        updateStatus();
    }

    function updateStatus() {
        clear(statusEl);
        const s = state.session;
        const hintText = state.level.hint ? ` · Hint: ${state.level.hint}` : '';
        statusEl.appendChild(
            el('span', {}, `Moves: ${s.moveCount}${hintText}`),
        );
    }

    function handleSelect(id, elm) {
        selectedId = selectedId === id ? null : id;
        stage.setSelection(selectedId);
        stage.render(state.session.expr);
        if (!selectedId) {
            radial.hide();
            return;
        }
        openMenu(selectedId, findTileEl(selectedId));
    }

    function findTileEl(id) {
        return stageEl.querySelector(`.tile[data-id="${id}"]`);
    }

    function openMenu(id, elm) {
        const found = findNode(state.session.expr, id);
        if (!found) return;
        const verbs = legalVerbs(state.session.expr, id, state.session.allowedVerbs);
        // A lone number's only verb is split -> open chooser directly.
        if (isNum(found.node) && verbs.includes('split') && verbs.length === 1) {
            openSplit(id, found.node.value);
            return;
        }
        const rect = elm ? elm.getBoundingClientRect() : null;
        radial.show(verbs, rect);
    }

    function applyVerb(verb) {
        const id = selectedId;
        if (!id) return;
        const found = findNode(state.session.expr, id);
        if (!found) return;

        if (verb === 'split') {
            if (isNum(found.node)) openSplit(id, found.node.value);
            return;
        }
        commit(verb, id);
    }

    function openSplit(id, value) {
        splitTargetId = id;
        chooser.show(value);
    }

    function onSplitChoose(into) {
        if (!splitTargetId) return;
        const before = serialize(state.session.expr);
        try {
            state.session.apply('split', splitTargetId, {into});
            history.push(before, 'split');
        } catch (err) {
            flashError(err.message);
        }
        splitTargetId = null;
        selectedId = null;
    }

    function commit(verb, ...args) {
        const before = serialize(state.session.expr);
        try {
            state.session.apply(verb, ...args);
            history.push(before, verb);
            selectedId = null;
            stage.setSelection(null);
            radial.hide();
        } catch (err) {
            flashError(err.message);
        }
    }

    // Drag-driven combine: pick the op that joins the two tiles.
    function tryCombine(fromId, toId) {
        const opId = commonOp(fromId, toId);
        if (opId) commit('combine', opId);
    }

    function trySwap(fromId, toId) {
        const opId = commonOp(fromId, toId);
        if (opId) commit('swap', opId);
    }

    // Find an operator node whose operands include both ids (directly).
    function commonOp(a, b) {
        let result = null;
        const walk = (node) => {
            if (!node || result) return;
            if (isOp(node)) {
                const leftId = node.left.id;
                const rightId = node.right.id;
                if ((leftId === a && rightId === b) || (leftId === b && rightId === a)) {
                    result = node.id;
                    return;
                }
                walk(node.left);
                walk(node.right);
            } else if (node.kind === 'group') {
                walk(node.child);
            }
        };
        walk(state.session.expr);
        return result;
    }

    function syncHistoryToSession() {
        // Keep the ribbon length aligned with the session move count.
        history.truncate(state.session.moveCount);
        selectedId = null;
        stage.setSelection(null);
    }

    function handleRewind(index) {
        // Rewind by undoing until move count matches the target index.
        const target = index; // steps before this row
        while (state.session.moveCount > target && state.session.canUndo()) {
            state.session.undo();
        }
        history.truncate(state.session.moveCount);
    }

    function onSolved() {
        radial.hide();
        const {earned} = evaluateStars(state.session, state.level);
        const banner = el('div', {class: 'solved-banner'}, [
            el('div', {class: 'solved-title'}, `Solved! = ${serialize(state.session.expr)}`),
            el('div', {class: 'solved-stars'},
                state.level.stars.map((star) =>
                    el('span', {
                        class: `star ${earned.includes(star.id) ? 'earned' : ''}`,
                        title: star.label || star.id,
                    }, earned.includes(star.id) ? '★' : '☆'),
                ),
            ),
        ]);
        statusEl.appendChild(banner);
        celebrate(stageEl.querySelector('.tile'));
    }

    function flashError(msg) {
        const note = el('div', {class: 'error-note'}, msg);
        statusEl.appendChild(note);
        setTimeout(() => note.remove(), 1800);
    }
}