import { CONFIG } from '../config.js';

export const DEVICE_TYPES = ['bomb', 'incendiary', 'shapedCharge'];

export class Inventory {
  constructor() {
    this.counts = { bomb: 0, incendiary: 0, shapedCharge: 0 };
    this.selected = 0;
  }
  get selectedType() { return DEVICE_TYPES[this.selected]; }
  add(type, n = 1) {
    const cap = CONFIG.INVENTORY_CAPS[type];
    if (this.counts[type] >= cap) return false;
    this.counts[type] = Math.min(cap, this.counts[type] + n);
    return true;
  }
  select(i) { if (i >= 0 && i < DEVICE_TYPES.length) this.selected = i; }
  cycle() { this.selected = (this.selected + 1) % DEVICE_TYPES.length; }
  consume(type) {
    if (this.counts[type] <= 0) return false;
    this.counts[type]--;
    return true;
  }
}