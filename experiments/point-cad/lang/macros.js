// def/expand and helper-entity tagging for PCS macros.
import { tokenize } from "./lexer.js";

export function findMacro(sketch, name) {
  return sketch.macros.find((m) => m.name === name) ?? null;
}

export function defineMacro(sketch, def) {
  const i = sketch.macros.findIndex((m) => m.name === def.name);
  const record = { name: def.name, params: def.params.slice(), body: def.body };
  if (i >= 0) sketch.macros[i] = record;
  else sketch.macros.push(record);
  return record;
}

export function nextMacroInstance(sketch, name) {
  let n = 1;
  while (sketch.macroCalls.some((c) => c.id === name + n)) n++;
  return name + n;
}

/**
 * Identifiers declared inside a macro body (`point X …`, `var a, b …`) that
 * are not parameters. They are renamed per instance so helpers don't clash.
 */
export function collectLocals(tokens, params) {
  const locals = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "ident") continue;
    if (t.value === "point") {
      const n = tokens[i + 1];
      if (n?.type === "ident" && !params.has(n.value)) locals.add(n.value);
    } else if (t.value === "var") {
      let j = i + 1;
      for (;;) {
        const n = tokens[j];
        if (n?.type !== "ident") break;
        if (!params.has(n.value)) locals.add(n.value);
        j++;
        while (tokens[j] && !(tokens[j].type === "punct" && tokens[j].value === ",") && tokens[j].type !== "newline" && tokens[j].type !== "eof") j++;
        if (tokens[j]?.type === "punct" && tokens[j].value === ",") {
          j++;
          continue;
        }
        break;
      }
    }
  }
  return locals;
}

/**
 * Expand a macro body into a token stream with parameters replaced by the
 * call's argument tokens and locals renamed `<instance>_<local>`.
 */
export function expandMacroTokens(def, argTokens, instance) {
  const tokens = tokenize(def.body);
  const paramMap = new Map(def.params.map((p, i) => [p, argTokens[i]]));
  const locals = collectLocals(tokens, new Set(def.params));
  return tokens.map((t) => {
    if (t.type !== "ident") return t;
    if (paramMap.has(t.value)) {
      const arg = paramMap.get(t.value);
      return { ...t, type: arg.type, value: arg.value };
    }
    if (locals.has(t.value)) return { ...t, value: `${instance}_${t.value}` };
    return t;
  });
}