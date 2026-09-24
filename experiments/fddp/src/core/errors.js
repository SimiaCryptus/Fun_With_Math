// §19 Error codes. No code in this table has a defined "best effort" continuation.
export const SPEC_SECTION = Object.freeze({
  FDDP_E_SIGNATURE:        '§15.2',
  FDDP_E_VERSION:          '§20',
  FDDP_E_UNKNOWN_CRITICAL: '§15.3',
  FDDP_E_CRC:              '§15.3',
  FDDP_E_PROFILE:          '§6',
  FDDP_E_PARAM:            '§7.1/§8.1',
  FDDP_E_COLA_VIOLATION:   '§7.4',
  FDDP_E_BAND_DEGENERATE:  '§10.1',
  FDDP_E_LANE_BUDGET:      '§5.3',
  FDDP_E_TOKEN_BUDGET:     '§10.3',
  FDDP_E_NONFINITE:        '§4.3',
  FDDP_E_CODEBOOK_MISSING: '§11.4',
  FDDP_E_COUNT_MISMATCH:   '§18.1',
  FDDP_E_TRUNCATED:        '§15',
  FDDP_E_NO_RECONSTRUCT:   '§13.3',
  FDDP_E_SIGNATURE_INVALID:'§18.4',
});

export const CODES = Object.freeze(Object.keys(SPEC_SECTION));

export class FddpError extends Error {
  constructor(code, detail = '', context = {}) {
    if (!SPEC_SECTION[code]) code = 'FDDP_E_PARAM';
    super(`${code} (${SPEC_SECTION[code]}) — ${detail}`);
    this.name = 'FddpError';
    this.code = code;
    this.section = SPEC_SECTION[code];
    this.detail = detail;
    this.context = context;
  }
}

export function fail(code, detail, context) {
  throw new FddpError(code, detail, context);
}

export function check(cond, code, detail, context) {
  if (!cond) fail(code, detail, context);
}