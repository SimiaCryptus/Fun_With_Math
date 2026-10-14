export class Store {
  constructor() {
    this.byValue = new Map(); // value -> Map<cost, Entry>
    this.byCost = new Map();  // cost  -> Map<value, Entry>
  }
  add(e) {
    if (!this.byValue.has(e.value)) this.byValue.set(e.value, new Map());
    if (!this.byCost.has(e.cost)) this.byCost.set(e.cost, new Map());
    this.byValue.get(e.value).set(e.cost, e);
    this.byCost.get(e.cost).set(e.value, e);
  }
  get(value, cost) {
    return this.byValue.get(value)?.get(cost);
  }
  minCost(value) {
    const m = this.byValue.get(value);
    if (!m) return undefined;
    return Math.min(...m.keys());
  }
}