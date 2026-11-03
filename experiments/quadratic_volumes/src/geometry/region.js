// A Region is a root box intersected with a list of field constraints.

export const IN = 'IN';
export const OUT = 'OUT';
export const UNKNOWN = 'UNKNOWN';

/** kind: 'lt' (f < t) | 'ge' (f >= t) | 'slabIn' (t<=f<t2) | 'slabOut' */
export function constraint(field, kind, t, t2 = null) {
  return { field, kind, t, t2 };
}

export function constraintStatus(con, box) {
   if (con.kind === 'contract') {
     let status = IN;
     for (const c of con.constraints) {
       const s = constraintStatus(c, box);
       if (s === OUT) return OUT;
       if (s === UNKNOWN) status = UNKNOWN;
     }
     return status;
   }
  const r = con.field.range(box);
  switch (con.kind) {
    case 'lt':
      if (r.hi < con.t) return IN;
      if (r.lo >= con.t) return OUT;
      return UNKNOWN;
    case 'ge':
      if (r.lo >= con.t) return IN;
      if (r.hi < con.t) return OUT;
      return UNKNOWN;
    case 'slabIn':
      if (r.lo >= con.t && r.hi < con.t2) return IN;
      if (r.hi < con.t || r.lo >= con.t2) return OUT;
      return UNKNOWN;
    case 'slabOut':
      if (r.hi < con.t || r.lo >= con.t2) return IN;
      if (r.lo >= con.t && r.hi < con.t2) return OUT;
      return UNKNOWN;
    default:
      throw new Error('unknown constraint kind ' + con.kind);
  }
}

export function constraintHolds(con, x) {
   if (con.kind === 'contract') {
     return con.constraints.every((c) => constraintHolds(c, x));
   }
  const v = con.field.eval(x);
  switch (con.kind) {
    case 'lt': return v < con.t;
    case 'ge': return v >= con.t;
    case 'slabIn': return v >= con.t && v < con.t2;
    case 'slabOut': return v < con.t || v >= con.t2;
    default: return false;
  }
}

  export function constraintText(con) {
   if (!con) return '?';
   if (con.kind === 'contract') {
     return (con.constraints || []).map(constraintText).join('  ∧  ') || 'contract';
   }
   if (!con.field) return String(con.kind);
  const f = con.field.text ? con.field.text() : 'f';
  switch (con.kind) {
    case 'lt': return `${f} < ${con.t.toFixed(4)}`;
    case 'ge': return `${f} >= ${con.t.toFixed(4)}`;
    case 'slabIn': return `${con.t.toFixed(4)} <= ${f} < ${con.t2.toFixed(4)}`;
    case 'slabOut': return `NOT(${con.t.toFixed(4)} <= ${f} < ${con.t2.toFixed(4)})`;
    default: return f;
  }
}
/** The complementary constraint, used to build the right child's region. */
export function complementConstraint(con) {
  switch (con.kind) {
    case 'lt': return { ...con, kind: 'ge' };
    case 'ge': return { ...con, kind: 'lt' };
    case 'slabIn': return { ...con, kind: 'slabOut' };
    case 'slabOut': return { ...con, kind: 'slabIn' };
    default: throw new Error('cannot complement ' + con.kind);
  }
}

export class Region {
  constructor(box, constraints = []) {
    this.box = box;
    this.constraints = constraints;
  }
  with(con) {
    return new Region(this.box, this.constraints.concat([con]));
  }
  withAll(cons) {
    return new Region(this.box, this.constraints.concat(cons));
  }
  contains(x) {
    const b = this.box;
    for (let i = 0; i < b.lo.length; i++) {
      if (x[i] < b.lo[i] || x[i] > b.hi[i]) return false;
    }
    for (const c of this.constraints) if (!constraintHolds(c, x)) return false;
    return true;
  }
  text() {
    return this.constraints.map(constraintText).join('  ∧  ') || 'root box';
  }
}