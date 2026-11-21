/** Independent oracle, written ONLY from assessment 0.8, section 1.6 (C3).
 * No production imports. All callers use invented JSON data.
 * Document assumptions to preserve for the review:
 * - An unchanged branch is selected whole, including its t. For otherwise equal
 *   branches with different t, the wording does not specify which t; use max.
 * - Tie text is kind + space + canonical JSON of fields (the id and tied t
 *   are identical, so neither can distinguish the candidates).
 * - "4,096 bytes as JSON with its id" does not specify a representation;
 *   measure the documented on-disk entry {id: {k,t,d}}, without the chunk.
 */
export type Rec = { kind: string; t: number; fields: { [name: string]: unknown } };
export type Recs = { [id: string]: Rec };

const absent = Symbol('absent');
type Value = unknown | typeof absent;

// Write sorted JSON directly: constructing a sorted object and JSON.stringify
// would put integer-shaped keys back into numerical rather than text order.
function json(x: unknown): string {
  if (Array.isArray(x)) return '[' + x.map(json).join(',') + ']';
  if (x !== null && typeof x === 'object') {
    const o = x as { [key: string]: unknown };
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + json(o[k])).join(',') + '}';
  }
  return JSON.stringify(x);
}

function equal(a: Value, b: Value): boolean {
  return a === absent || b === absent ? a === b : json(a) === json(b);
}

function same(a: Rec | undefined, b: Rec | undefined): boolean {
  return a === undefined || b === undefined ? a === b
    : a.kind === b.kind && equal(a.fields, b.fields);
}

function winner(a: Rec, b: Rec): Rec {
  if (a.t !== b.t) return a.t > b.t ? a : b;
  return a.kind + ' ' + json(a.fields) > b.kind + ' ' + json(b.fields) ? a : b;
}

function value(o: Rec | undefined, key: string): Value {
  return o !== undefined && Object.hasOwn(o.fields, key) ? o.fields[key] : absent;
}

function field(base: Value, here: Value, there: Value, preferHere: boolean): Value {
  if (equal(here, base)) return there;
  if (equal(there, base) || equal(here, there)) return here;
  return preferHere ? here : there;
}

export function merge(base: Recs | undefined, here: Recs, there: Recs): Recs {
  const out: Recs = Object.create(null);
  for (const id of new Set([...Object.keys(base ?? {}), ...Object.keys(here), ...Object.keys(there)])) {
    const b = base && Object.hasOwn(base, id) ? base[id] : undefined;
    const h = Object.hasOwn(here, id) ? here[id] : undefined;
    const r = Object.hasOwn(there, id) ? there[id] : undefined;
    let chosen: Rec | undefined;
    if (base === undefined && (h === undefined || r === undefined)) chosen = h ?? r;
    else if (same(h, b)) chosen = r;
    else if (same(r, b)) chosen = h;
    else if (same(h, r)) chosen = h && r ? { ...h, t: Math.max(h.t, r.t) } : undefined;
    else if (h !== undefined && r !== undefined) {
      const preferred = winner(h, r);
      const fields: Rec['fields'] = Object.create(null);
      for (const key of new Set([...Object.keys(b?.fields ?? {}), ...Object.keys(h.fields), ...Object.keys(r.fields)])) {
        const merged = field(value(b, key), value(h, key), value(r, key), preferred === h);
        if (merged !== absent) fields[key] = merged;
      }
      chosen = {
        kind: field(b?.kind ?? absent, h.kind, r.kind, preferred === h) as string,
        t: Math.max(h.t, r.t), fields,
      };
      const bytes = new TextEncoder().encode(JSON.stringify({ [id]: { k: chosen.kind, t: chosen.t, d: fields } })).length;
      if (bytes > 4096) chosen = preferred;
    }
    // Otherwise both changed and exactly one removed: removal wins.
    if (chosen !== undefined) out[id] = structuredClone(chosen);
  }
  return out;
}
