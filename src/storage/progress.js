// Local-first progress: which dive steps you have visited and your display
// preferences. Stored only in this browser (localStorage); nothing is sent
// anywhere. Every access is wrapped because storage can be blocked or
// unavailable (private windows, strict privacy settings).

const KEY = 'anatomy-odyssey:v1';

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: progress simply is not remembered */
  }
}

export const progress = {
  visited() {
    const v = read().visited;
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  },
  markVisited(stepId) {
    const data = read();
    const set = new Set(Array.isArray(data.visited) ? data.visited : []);
    set.add(stepId);
    write({ ...data, visited: [...set] });
  },
  pref(name, fallback) {
    const p = read().prefs;
    return p && name in p ? p[name] : fallback;
  },
  setPref(name, value) {
    const data = read();
    write({ ...data, prefs: { ...(data.prefs || {}), [name]: value } });
  },
  clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
