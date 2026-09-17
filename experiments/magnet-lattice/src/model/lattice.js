// Lattice: source of truth for the magnet set and grid <-> world mapping.
//
// Positions are stored as grid cells. Physics works in *cell units*
// (see cellPositions()); `pitch` only scales the drawing.

export class Lattice {
    /**
     * @param {number} pitch   grid pitch in world px (visual only)
     * @param {boolean} snap   snap placement to integer cells
     * @param {number|null} extent  half-size in cells (|cx|,|cy| <= extent) or null = unbounded
     */
    constructor(pitch = 48, snap = true, extent = null) {
        this.pitch = pitch;
        this.snap = snap;
        this.extent = extent;
        /** Minimum allowed separation between magnets, in cells. */
        this.minSeparation = 0.5;
        /** @type {{id:number, cell:[number,number], theta:number}[]} */
        this.magnets = [];
        this._nextId = 0;
        /** Incremented whenever the magnet *set* (not angles) changes; used for caching. */
        this.version = 0;
    }

    /** World coordinates (px) of a grid cell. */
    cellToWorld(cell) {
        return [cell[0] * this.pitch, cell[1] * this.pitch];
    }

    /** Convert world (px) to a cell; integer when snapping, else quantised to 1e-3 cells. */
    worldToCell(x, y) {
        const cx = x / this.pitch,
            cy = y / this.pitch;
        if (this.snap) return [Math.round(cx), Math.round(cy)];
        return [Math.round(cx * 1000) / 1000, Math.round(cy * 1000) / 1000];
    }

    inBounds(cell) {
        return (
            this.extent === null ||
            (Math.abs(cell[0]) <= this.extent && Math.abs(cell[1]) <= this.extent)
        );
    }

    /**
     * Check whether a magnet may be placed at `cell`.
     * Returns null if OK, otherwise a human-readable reason.
     */
    canPlace(cell) {
        if (!Array.isArray(cell) || !Number.isFinite(cell[0]) || !Number.isFinite(cell[1]))
            return 'Invalid cell';
        if (!this.inBounds(cell))
            return `Cell (${cell[0]}, ${cell[1]}) is outside the grid extent ±${this.extent}`;
        for (const mg of this.magnets) {
            const d = Math.hypot(mg.cell[0] - cell[0], mg.cell[1] - cell[1]);
            if (d < this.minSeparation) return `Too close to magnet #${mg.id}`;
        }
        return null;
    }

    /** Find a magnet exactly occupying the given cell, or undefined. */
    atCell(cell) {
        return this.magnets.find((mg) => mg.cell[0] === cell[0] && mg.cell[1] === cell[1]);
    }

    indexOfCell(cell) {
        return this.magnets.findIndex((mg) => mg.cell[0] === cell[0] && mg.cell[1] === cell[1]);
    }

    /**
     * Nearest magnet to a world point within `radius` (world px).
     * Returns { mg, idx, dist } or null.
     */
    nearest(wx, wy, radius = Infinity) {
        let best = null;
        for (let i = 0; i < this.magnets.length; i++) {
            const [cx, cy] = this.cellToWorld(this.magnets[i].cell);
            const d = Math.hypot(wx - cx, wy - cy);
            if (d <= radius && (!best || d < best.dist)) best = {mg: this.magnets[i], idx: i, dist: d};
        }
        return best;
    }

    /** Toggle a magnet at a cell. Returns 'added' | 'removed' | reason string on failure. */
    toggle(cell, theta = 0) {
        const idx = this.indexOfCell(cell);
        if (idx >= 0) {
            this.remove(idx);
            return 'removed';
        }
        const why = this.canPlace(cell);
        if (why) return why;
        this.add(cell, theta);
        return 'added';
    }

    /** Add a magnet. Throws if placement is invalid (check canPlace() first). */
    add(cell, theta = 0, id = undefined) {
        const why = this.canPlace(cell);
        if (why) throw new Error(why);
        const useId = Number.isInteger(id) ? id : this._nextId;
        const mg = {id: useId, cell: [cell[0], cell[1]], theta};
        this.magnets.push(mg);
        this._nextId = Math.max(this._nextId, useId + 1);
        this.version++;
        return mg;
    }

    remove(idx) {
        if (idx < 0 || idx >= this.magnets.length) return undefined;
        const [mg] = this.magnets.splice(idx, 1);
        this.version++;
        return mg;
    }

    clear() {
        this.magnets = [];
        this._nextId = 0;
        this.version++;
    }

    /** Change the extent; removes magnets that fall outside. Returns the number removed. */
    setExtent(extent) {
        this.extent = extent;
        const before = this.magnets.length;
        this.magnets = this.magnets.filter((mg) => this.inBounds(mg.cell));
        const removed = before - this.magnets.length;
        if (removed) this.version++;
        return removed;
    }

    get count() {
        return this.magnets.length;
    }

    /** Current orientation angles as a Float64Array. */
    angles() {
        return Float64Array.from(this.magnets.map((m) => m.theta));
    }

    setAngles(theta) {
        for (let i = 0; i < this.magnets.length; i++) this.magnets[i].theta = theta[i];
    }

    /** Positions in grid-cell units (what the physics uses). */
    cellPositions() {
        return this.magnets.map((m) => [m.cell[0], m.cell[1]]);
    }

    /** World positions (px) as array of [x,y] — for rendering only. */
    positions() {
        return this.magnets.map((m) => this.cellToWorld(m.cell));
    }
}