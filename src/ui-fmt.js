// land-rpg / src/ui-fmt.js
// v5.0.0 UI 공용 포맷·이스케이프 유틸 (ui.js · ui-cloud.js · ui-gear.js 공용)

export const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('ko-KR');

export const pct = (v) => `${Math.max(0, Math.min(100, v)).toFixed(0)}%`;

export const hhmmss = (d = new Date()) =>
  [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');

export const mmss = (ms) => {
  const sec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export const relTime = (ts, now = Date.now()) => {
  const t = Number(ts) || 0;
  if (!t) return '아직 없음';
  const d = Math.max(0, now - t);
  if (d < 60000) return '방금 전';
  if (d < 3600000) return `${Math.floor(d / 60000)}분 전`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}시간 전`;
  return `${Math.floor(d / 86400000)}일 전`;
};
