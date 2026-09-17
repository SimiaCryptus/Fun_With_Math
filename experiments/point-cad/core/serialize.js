// JSON import/export with versioning hooks.
import { createSketch, cloneDeep } from "./model.js";

export const CURRENT_VERSION = 1;

const MIGRATIONS = {
  // 0 -> 1: pre-release documents had no version field.
  0: (doc) => ({ ...doc, version: 1 }),
};

export function migrate(doc) {
  let out = { ...doc };
  let v = Number.isInteger(out.version) ? out.version : 0;
  while (v < CURRENT_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from document version ${v}`);
    out = step(out);
    v = out.version;
  }
  return out;
}

/** Canonical JSON-serializable document. */
export function toJSON(sketch) {
  const doc = cloneDeep(sketch);
  doc.version = CURRENT_VERSION;
  return doc;
}

export function toJSONString(sketch, space = 2) {
  return JSON.stringify(toJSON(sketch), null, space);
}

export function fromJSON(input) {
  const doc = typeof input === "string" ? JSON.parse(input) : input;
  if (!doc || typeof doc !== "object") throw new Error("Not a sketch document");
  return createSketch(migrate(doc));
}

/** Guess whether a text blob is JSON or a PCS script. */
export function sniffFormat(text) {
  const t = String(text).trimStart();
  return t.startsWith("{") ? "json" : "pcad";
}