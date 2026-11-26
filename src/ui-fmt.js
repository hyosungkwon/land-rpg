// land-rpg / src/ui-fmt.js
// v5.0.0 UI 공용 포맷·이스케이프 유틸 (ui.js · ui-cloud.js · ui-gear.js 공용)
// v8.0.0: Intl(toLocaleString) 비의존 천단위 구분 — QuickJS 등 Intl 이 없는 환경에서도 같은 결과

export const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 천단위 콤마 — Intl 없이 직접 계산(환경 의존 없음) */
export const group = (n) => {
  const v = Math.floor(Number(n) || 0);
  const neg = v < 0;
  const s = String(Math.abs(v));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return (neg ? '-' : '') + out;
};

export const fmt = (n) => group(n);

/** 상단 HUD·요약용 축약 숫자 — 1.84억 / 198만 / 1,234 */
export const compact = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e8) {
    const s = (v / 1e8).toFixed(2).replace(/\.?0+$/, '');
    return `${s}억`;
  }
  if (abs >= 1e4) return `${Math.floor(v / 1e4)}만`;
  return group(v);
};

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
