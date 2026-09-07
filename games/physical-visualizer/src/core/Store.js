/** Minimal IndexedDB key/value wrapper. Stores: prefs, tracks, skins, presets. */
const DB = 'physviz', VER = 1, STORES = ['prefs', 'tracks', 'skins', 'presets'];

export class Store {
  open() {
    return (this._db ??= new Promise((res, rej) => {
      if (!('indexedDB' in globalThis)) return rej(new Error('no IndexedDB'));
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }

  async _tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => res(req?.result);
      tx.onerror = () => rej(tx.error);
    });
  }

  get(store, key) { return this._tx(store, 'readonly', (s) => s.get(key)); }
  put(store, key, val) { return this._tx(store, 'readwrite', (s) => s.put(val, key)); }
  del(store, key) { return this._tx(store, 'readwrite', (s) => s.delete(key)); }
  keys(store) { return this._tx(store, 'readonly', (s) => s.getAllKeys()); }
  estimate() { return navigator.storage?.estimate?.() ?? Promise.resolve({ usage: 0, quota: Infinity }); }
}