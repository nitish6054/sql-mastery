// Main-thread client for the SQL worker. Every call has a timeout; a stuck query (e.g. infinite
// recursion) terminates the worker, which is then restarted transparently.
let worker = null, readyP = null, seq = 0, version = null;
const pending = new Map();
const listeners = new Set();
export const onEngineEvent = (fn) => listeners.add(fn);
const emit = (e) => listeners.forEach(fn => fn(e));

function spawn() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  readyP = new Promise((resolve, reject) => {
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'ready') { version = m.version; emit({ type: 'ready', version }); resolve(); return; }
      if (m.type === 'fatal') { emit({ type: 'fatal', message: m.message }); reject(new Error(m.message)); return; }
      if (m.type === 'notice') { emit(m); return; }
      const p = pending.get(m.id); if (!p) return;
      pending.delete(m.id); clearTimeout(p.timer);
      if (m.ok) p.resolve(m.result); else { const e = new Error(m.error.message); Object.assign(e, m.error); p.reject(e); }
    };
    worker.onerror = (e) => { emit({ type: 'fatal', message: e.message || 'Worker failed to load' }); reject(new Error(e.message || 'Worker failed')); };
  });
  emit({ type: 'loading' });
}

function restart() {
  try { worker?.terminate(); } catch {}
  for (const [, p] of pending) { clearTimeout(p.timer); }
  pending.clear(); spawn();
}

export function initEngine() { if (!worker) spawn(); return readyP; }
export const engineVersion = () => version;

function call(op, sql, timeoutMs) {
  if (!worker) spawn();
  return readyP.then(() => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      const e = new Error(`Query stopped after ${Math.round(timeoutMs / 1000)}s. Check for a recursive CTE that never ends or a join without a condition. The SQL engine was restarted.`);
      e.timeout = true; e.code = 'TIMEOUT';
      restart(); reject(e);
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, op, sql });
  }));
}

// Exclusive sections: grading does reset → run → reset → run…; nothing else may interleave.
let chain = Promise.resolve();
export function exclusive(fn) {
  const next = chain.then(() => fn(runner));
  chain = next.catch(() => {});
  return next;
}

export const runner = {
  reset: (sql) => call('reset', sql, 20000),
  run: (sql) => call('run', sql, 8000),
  explainCost: (sql) => call('explain', sql, 5000),
};
