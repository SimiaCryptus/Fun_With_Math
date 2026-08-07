// shortcuts.js — full keyboard navigation (§5.9). Deterministic, inertia-free.
export function bindShortcuts(target, handlers) {
    target.addEventListener('keydown', (e) => {
        if (e.target.matches('input, select, textarea')) return;
        const step = e.shiftKey ? 160 : 40;
        switch (e.key) {
            case 'ArrowLeft':
                handlers.pan(-step, 0);
                break;
            case 'ArrowRight':
                handlers.pan(step, 0);
                break;
            case 'ArrowUp':
                handlers.pan(0, -step);
                break;
            case 'ArrowDown':
                handlers.pan(0, step);
                break;
            case '+':
            case '=':
                handlers.zoom(1.25);
                break;
            case '-':
            case '_':
                handlers.zoom(0.8);
                break;
            case 'f':
                handlers.fit();
                break;
            case 'g':
                handlers.toggle('grid');
                break;
            case 'd':
                handlers.toggle('density');
                break;
            case 'r':
                handlers.toggle('rings');
                break;
            case 'j':
                handlers.topk(1);
                break;
            case 'k':
                handlers.topk(-1);
                break;
            default:
                return;
        }
        e.preventDefault();
    });
}