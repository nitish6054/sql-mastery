// Small UI toolkit (no framework). Views render HTML strings and wire events after insertion.
import { displayCell } from './grader.js';
import { TOPIC_BY_ID } from './content/curriculum.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const pct = (x, d = 0) => x == null ? '—' : `${(x * 100).toFixed(d)}%`;
export const mins = (ms) => { if (ms == null) return '—'; const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ' ' + (s % 60) + 's' : ''}`; };
export const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const date = (t) => t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (t) => t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const rel = (t) => {
  if (!t) return '—'; const d = Math.round((t - Date.now()) / 86400000);
  if (d === 0) return 'today'; if (d === 1) return 'tomorrow'; if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
};
export const diffBadge = (d) => `<span class="badge d-${esc(d).replace(' ', '-')}">${esc(d)}</span>`;
export const statusBadge = (s) => `<span class="st st-${esc(s).replace(' ', '-')}">${esc(s)}</span>`;
export const topicName = (id) => TOPIC_BY_ID[id]?.name || id;
export const bar = (v, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;

const NUM = new Set([20, 21, 23, 700, 701, 1700]);
export function resultTable(res, { maxRows = 200, highlight } = {}) {
  if (!res || !res.fields?.length) return `<p class="muted small">Statement executed${res?.command ? ` (${esc(res.command)})` : ''}; no rows returned.</p>`;
  const head = res.fields.map(f => `<th class="${NUM.has(f.dataTypeID) ? 'num' : ''}">${esc(f.name)}</th>`).join('');
  const rows = res.rows.slice(0, maxRows).map((r, i) => `<tr class="${highlight?.[i] || ''}">${r.map((v, j) => {
    const d = displayCell(v, res.fields[j]?.dataTypeID);
    return d === null ? '<td class="null">NULL</td>' : `<td class="${NUM.has(res.fields[j]?.dataTypeID) ? 'num' : ''}">${esc(d)}</td>`;
  }).join('')}</tr>`).join('');
  const more = res.rows.length > maxRows ? `<p class="small muted">Showing ${maxRows} of ${res.rows.length} rows.</p>` : '';
  return `<div class="tbl-wrap"><table class="tbl mono"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>${more}`;
}

export function rowsTable(fields, rows, cls) {
  return resultTable({ fields, rows }, { highlight: rows.map(() => cls) });
}

export function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

export function modal(html, { onMount, dismissable = true } = {}) {
  return new Promise((resolve) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(bg);
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(null); };
    document.addEventListener('keydown', onKey);
    if (dismissable) bg.addEventListener('click', (e) => { if (e.target === bg) close(null); });
    $$('[data-close]', bg).forEach(b => b.addEventListener('click', () => close(b.dataset.close === '' ? null : b.dataset.close)));
    onMount?.(bg.querySelector('.modal'), close);
    bg.querySelector('button, input, textarea')?.focus();
  });
}

export const confirmDialog = (title, body, okLabel = 'Confirm', danger = false) => modal(`
  <h2>${esc(title)}</h2><p>${body}</p>
  <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Cancel</button>
  <button class="btn ${danger ? 'danger' : 'primary'}" data-close="ok">${esc(okLabel)}</button></div>`).then(v => v === 'ok');

// Typed confirmation for destructive actions.
export function typedConfirm(title, body, word) {
  return modal(`<h2>${esc(title)}</h2><p>${body}</p><p class="small">Type <code>${esc(word)}</code> to confirm.</p>
    <input type="text" id="tc" style="width:100%" autocomplete="off">
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-close="">Cancel</button>
    <button class="btn danger" id="tc-ok" disabled>${esc(title)}</button></div>`, {
    onMount: (m, close) => {
      const inp = $('#tc', m), ok = $('#tc-ok', m);
      inp.addEventListener('input', () => ok.disabled = inp.value.trim() !== word);
      ok.addEventListener('click', () => close('ok'));
    },
  }).then(v => v === 'ok');
}

// Minimal SVG line chart: series = [{ name, values:[{x:label,y}], color }]
export function lineChart(series, { height = 180, yMax = 100, ySuffix = '' } = {}) {
  const pts = series[0]?.values || [];
  if (pts.length < 2) return '<div class="empty small">Progress charts appear after two days of practice.</div>';
  const W = 640, H = height, pad = 32;
  const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1);
  const y = (v) => H - 22 - ((v ?? 0) / yMax) * (H - 40);
  const grid = [0, 25, 50, 75, 100].filter(v => v <= yMax).map(v => `<line x1="${pad}" x2="${W - pad}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="4" y="${y(v) + 4}" font-size="10" fill="var(--ink-3)">${v}${ySuffix}</text>`).join('');
  const lines = series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${s.values.map((p, i) => `${x(i)},${y(p.y)}`).join(' ')}"/>`).join('');
  const labels = pts.map((p, i) => (i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 6) === 0) ? `<text x="${x(i)}" y="${H - 4}" font-size="10" text-anchor="middle" fill="var(--ink-3)">${esc(p.x)}</text>` : '').join('');
  const legend = series.map(s => `<span class="small" style="color:${s.color}">■ ${esc(s.name)}</span>`).join(' &nbsp; ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Progress chart">${grid}${lines}${labels}</svg><div>${legend}</div>`;
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// Very small markdown: paragraphs, numbered lists, `code`, **bold**.
export function md(text) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return text.split(/\n\n+/).map(block => {
    const lines = block.split('\n');
    if (lines.every(l => /^\d+\.\s/.test(l))) return `<ol>${lines.map(l => `<li>${inline(l.replace(/^\d+\.\s/, ''))}</li>`).join('')}</ol>`;
    if (lines.length > 1 && lines.slice(1).every(l => /^\d+\.\s/.test(l))) return `<p>${inline(lines[0])}</p><ol>${lines.slice(1).map(l => `<li>${inline(l.replace(/^\d+\.\s/, ''))}</li>`).join('')}</ol>`;
    return `<p>${inline(block).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

export const prefs = {
  get(k, d) { try { const v = localStorage.getItem('pref:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pref:' + k, JSON.stringify(v)); } catch {} },
};
export const drafts = {
  get(id) { try { return localStorage.getItem('draft:' + id); } catch { return null; } },
  set(id, v) { try { localStorage.setItem('draft:' + id, v); } catch {} },
  clear(id) { try { localStorage.removeItem('draft:' + id); } catch {} },
};

export function applyTheme() {
  const t = prefs.get('theme', 'system');
  const dark = t === 'dark' || (t === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--editor-size', (prefs.get('editorSize', 14) / 16) + 'rem');
}
