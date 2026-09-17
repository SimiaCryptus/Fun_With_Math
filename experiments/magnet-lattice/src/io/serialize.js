// Versioned JSON import/export with schema validation.

const VERSION = 1;

/** Export lattice + params to a pretty-printed JSON string. */
export function exportJSON(lattice, params) {
    const doc = {
        version: VERSION,
        grid: {pitch: lattice.pitch, snap: lattice.snap, extent: lattice.extent},
        params: {
            k: params.k,
            I: params.I,
            gamma: params.gamma,
            m: params.m,
        },
        magnets: lattice.magnets.map((mg) => ({
            id: mg.id,
            cell: [mg.cell[0], mg.cell[1]],
            theta: mg.theta,
        })),
    };
    return JSON.stringify(doc, null, 2);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate a parsed document. Throws Error with a helpful message on failure.
 * Returns the validated doc (with `grid.extent` normalised to a number or null).
 */
export function validate(doc) {
    if (typeof doc !== 'object' || doc === null) throw new Error('Root must be an object');
    if (doc.version !== VERSION)
        throw new Error(`Unsupported version: ${doc.version} (expected ${VERSION})`);
    if (typeof doc.grid !== 'object' || doc.grid === null) throw new Error('Missing "grid"');
    if (!isNum(doc.grid.pitch) || doc.grid.pitch <= 0)
        throw new Error('grid.pitch must be a positive number');
    if (typeof doc.grid.snap !== 'boolean') throw new Error('grid.snap must be boolean');
    if (doc.grid.extent === undefined || doc.grid.extent === null) {
        doc.grid.extent = null;
    } else if (!Number.isInteger(doc.grid.extent) || doc.grid.extent < 0) {
        throw new Error('grid.extent must be null or a non-negative integer');
    }
    if (typeof doc.params !== 'object' || doc.params === null) throw new Error('Missing "params"');
    for (const key of ['k', 'I', 'gamma', 'm']) {
        if (!isNum(doc.params[key])) throw new Error(`params.${key} must be a number`);
    }
    if (!Array.isArray(doc.magnets)) throw new Error('magnets must be an array');
    const seen = new Set();
    doc.magnets.forEach((mg, idx) => {
        if (typeof mg !== 'object' || mg === null) throw new Error(`magnet[${idx}] must be an object`);
        if (!Number.isInteger(mg.id)) throw new Error(`magnet[${idx}].id must be an integer`);
        if (seen.has(mg.id)) throw new Error(`Duplicate magnet id: ${mg.id}`);
        seen.add(mg.id);
        if (!Array.isArray(mg.cell) || mg.cell.length !== 2 || !isNum(mg.cell[0]) || !isNum(mg.cell[1])) {
            throw new Error(`magnet[${idx}].cell must be [number,number]`);
        }
        if (doc.grid.snap && (!Number.isInteger(mg.cell[0]) || !Number.isInteger(mg.cell[1]))) {
            throw new Error(`magnet[${idx}].cell must be [int,int] when grid.snap is true`);
        }
        if (!isNum(mg.theta)) throw new Error(`magnet[${idx}].theta must be a number`);
    });
    return doc;
}

/**
 * Import a JSON string. Returns the validated { version, grid, params, magnets } document.
 * Throws on invalid input.
 */
export function importJSON(text) {
    let doc;
    try {
        doc = JSON.parse(text);
    } catch (e) {
        throw new Error('Invalid JSON: ' + e.message);
    }
    return validate(doc);
}