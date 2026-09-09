// base: credits per tonne at scarcity 1.0.  vol: relative bulkiness (unused
// for now, reserved for a volume-limited hold).

export const COMMODITIES = [
  { id: 'ice',         name: 'Dirty Ice',       base: 200,     cls: 'bulk' },
  { id: 'water',       name: 'Potable Water',   base: 320,     cls: 'bulk' },
  { id: 'o2',          name: 'LOX',             base: 450,     cls: 'bulk' },
  { id: 'h2',          name: 'Liquid Hydrogen', base: 950,     cls: 'fuel' },
  { id: 'ch4',         name: 'Methane',         base: 700,     cls: 'fuel' },
  { id: 'nh3',         name: 'Ammonia',         base: 820,     cls: 'bulk' },
  { id: 'silicates',   name: 'Regolith Agg.',   base: 150,     cls: 'bulk' },
  { id: 'iron',        name: 'Iron-Nickel',     base: 1200,    cls: 'metal' },
  { id: 'polymers',    name: 'Polymer Feed',    base: 9000,    cls: 'goods' },
  { id: 'd2',          name: 'Deuterium',       base: 34000,   cls: 'fuel' },
  { id: 'food',        name: 'Foodstuffs',      base: 40000,   cls: 'goods' },
  { id: 'ree',         name: 'Rare Earths',     base: 45000,   cls: 'metal' },
  { id: 'machinery',   name: 'Heavy Machinery', base: 90000,   cls: 'goods' },
  { id: 'pgm',         name: 'Platinum Group',  base: 130000,  cls: 'metal' },
  { id: 'electronics', name: 'Electronics',     base: 260000,  cls: 'tech' },
  { id: 'meds',        name: 'Pharmaceuticals', base: 410000,  cls: 'tech' },
  { id: 'he3',         name: 'Helium-3',        base: 1900000, cls: 'exotic' },
];

export const COMMODITY_BY_ID = Object.fromEntries(COMMODITIES.map((c) => [c.id, c]));