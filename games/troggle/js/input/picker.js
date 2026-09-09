/**
 * picker.js — turns camera-control gestures into Selection calls (§4.1).
 * The raycast itself lives in the view; arbitration lives in controls.js.
 *
 * Selection is tap-only: trail-dragging was removed because it fought the
 * orbit gesture. Hit-testing still prefers cubes the player can legally act
 * on (legal next cubes, the last cube to backtrack, the first cube to clear)
 * over whatever glyph happens to be nearest along the ray.
 */

export function attachPicker(view, selection) {
  const preferred = () => {
    const p = selection.path;
    if (!p.length) return null;
    const set = selection.legal();
    set.add(p[0]);
    set.add(p[p.length - 1]);
    if (p.length > 1) set.add(p[p.length - 2]);
    return set;
  };
  view.controls.hooks = {
    hitTest: (x, y) => view.hitTest(x, y, preferred()),
    onTap: (index) => selection.tap(index),
    onTapEmpty: () => selection.clear(),
  };
  return () => { view.controls.hooks = {}; };
}

export default attachPicker;