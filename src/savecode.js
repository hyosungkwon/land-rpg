// land-rpg / src/savecode.js — 💾 v3.6.0 세이브 코드(백업/복원). DOM 의존 없음.
// 형식: LANDRPG3:<base64url(payload JSON)>.<checksum 8자리 16진>
//  · payload 는 JSON 을 UTF-8 바이트로 바꾼 뒤 base64url(-, _)로 인코딩한다.
//    (+ / 는 메신저·URL 에서 공백/다른 문자로 바뀌기 쉬워 쓰지 않는다. 패딩 = 도 쓰지 않는다.)
//  · checksum 은 payload 문자열에 대한 FNV-1a 32bit — 한 글자만 달라져도 복원을 거부한다.
//  · 복원 데이터는 normalizeState 로 정규화하므로 손상된 값은 기존 저장과 같은 규칙으로 정리된다.
import { SAVE_VERSION } from './data.js';
import { normalizeState } from './state.js';

export const SAVE_CODE_PREFIX = 'LANDRPG3:';
export const SAVE_CODE_VERSION = SAVE_VERSION;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INV = (() => {
  const m = {};
  for (let i = 0; i < B64.length; i++) m[B64[i]] = i;
  m['+'] = 62; // 표준 base64 로 붙여넣은 코드도 받아준다
  m['/'] = 63;
  return m;
})();

/* ─────────────────────────── UTF-8 · base64url ─────────────────────────── */

function utf8Encode(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i += 1;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function utf8Decode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    let c;
    if (b < 0x80) c = b;
    else if (b >= 0xf0) c = ((b & 0x07) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else if (b >= 0xe0) c = ((b & 0x0f) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else c = ((b & 0x1f) << 6) | (bytes[i++] & 63);
    if (c > 0x10ffff) c = 0xfffd;
    if (c > 0xffff) {
      c -= 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    } else {
      out += String.fromCharCode(c);
    }
  }
  return out;
}

function b64Encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : null;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : null;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 === null ? 0 : b1) >> 4)];
    if (b1 === null) break;
    out += B64[((b1 & 15) << 2) | ((b2 === null ? 0 : b2) >> 6)];
    if (b2 === null) break;
    out += B64[b2 & 63];
  }
  return out;
}

function b64Decode(str) {
  const out = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '=') break; // 패딩은 무시
    const v = B64_INV[ch];
    if (v === undefined) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
    buf &= (1 << bits) - 1;
  }
  return out;
}

/* ─────────────────────────── 체크섬 ─────────────────────────── */

/** FNV-1a 32bit(8자리 16진) — payload 한 글자만 달라져도 값이 바뀐다 */
export function saveChecksum(str) {
  const s = String(str == null ? '' : str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* ─────────────────────────── 저장 → 코드 ─────────────────────────── */

/**
 * 코드에 담을 형태로 저장본을 정리한다(원본은 건드리지 않는다).
 * 시점·화면 의존 값은 담지 않는다 — 복원 직후 방치 보상이나 밀린 임대수익이
 * 한꺼번에 들어오지 않게 하고, 코드 길이도 줄이기 위해서다.
 */
export function compactSave(state) {
  if (!state || typeof state !== 'object') return {};
  let c;
  try {
    c = JSON.parse(JSON.stringify(state));
  } catch (e) {
    return {};
  }
  delete c.lastActiveAt;
  delete c.lastOffline;
  if (c.land && typeof c.land === 'object') {
    c.land.assetHistory = []; // 자산 그래프(최대 288칸)는 기록용 — 코드만 길어진다
    delete c.land.rentAt;
    c.land.page = 1;
    c.land.q = '';
    delete c.land.sub;
    delete c.land.tier;
    delete c.land.sort;
  }
  if (c.news && typeof c.news === 'object') c.news.log = [];
  if (c.gear && typeof c.gear === 'object') delete c.gear.filter; // 화면 필터는 담지 않는다
  // v4.9: 일일 퀘스트는 진행·수령 기록이 없으면 생략해 코드 길이를 줄인다
  if (c.dailyQuests && typeof c.dailyQuests === 'object') {
    const p = c.dailyQuests.progress && typeof c.dailyQuests.progress === 'object' ? c.dailyQuests.progress : {};
    const nonzero = {};
    for (const [k, v] of Object.entries(p)) if (Number(v) > 0) nonzero[k] = Math.floor(Number(v));
    const hasClaim = Array.isArray(c.dailyQuests.claimed) && c.dailyQuests.claimed.length > 0;
    if (!Object.keys(nonzero).length && !hasClaim && !c.dailyQuests.bonusClaimed) delete c.dailyQuests;
    else c.dailyQuests.progress = nonzero;
  }
  return c;
}

/** 저장본 → 코드 문자열 */
export function encodeSave(state) {
  const json = JSON.stringify(compactSave(state));
  const payload = b64Encode(utf8Encode(json));
  return `${SAVE_CODE_PREFIX}${payload}.${saveChecksum(payload)}`;
}

/* ─────────────────────────── 코드 → 저장 ─────────────────────────── */

/** 미리보기용 요약 */
export function summarizeSave(state) {
  const s = state && typeof state === 'object' ? state : {};
  const owned = (s.land && s.land.owned) || {};
  let cities = 0;
  let pyeong = 0;
  for (const key of Object.keys(owned)) {
    const q = Math.floor(Number(owned[key]) || 0);
    if (q > 0) {
      cities += 1;
      pyeong += q;
    }
  }
  const rb = s.rebirth && typeof s.rebirth === 'object' ? s.rebirth : {};
  const equip = s.equip && typeof s.equip === 'object' ? s.equip : {};
  let equipLv = 0;
  for (const k of Object.keys(equip)) equipLv += Math.max(0, Math.floor(Number(equip[k]) || 0));
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  return {
    level: Math.max(1, Math.floor(num(s.level, 1))),
    // 역대 최고(peakStage) · 이번 회차 최고(maxStage) · 현재(stage) 중 가장 높은 곳
    stage: Math.max(1, Math.floor(num(s.peakStage, 1)), Math.floor(num(s.maxStage, 1)), Math.floor(num(s.stage, 1))),
    curStage: Math.max(1, Math.floor(num(s.stage, 1))),
    cities,
    pyeong,
    rebirth: Math.max(0, Math.floor(num(rb.count))),
    points: Math.max(0, Math.floor(num(rb.points))),
    gold: Math.max(0, Math.floor(num(s.gold))),
    shards: Math.max(0, Math.floor(num(s.shards))),
    equipLv,
    kills: Math.max(0, Math.floor(num(s.totalKills))),
  };
}

/**
 * 코드 문자열 → { ok, state?, summary?, reason?, code? }
 * 형식·체크섬·JSON·객체 여부를 모두 통과해야만 state 를 돌려준다(실패 시 state 없음 → 기존 세이브 보존).
 */
export function decodeSave(code, now = Date.now()) {
  const raw = String(code == null ? '' : code).replace(/\s+/g, '');
  if (!raw) return { ok: false, reason: '세이브 코드를 붙여넣어 주세요.', code: 'empty' };
  if (raw.indexOf(SAVE_CODE_PREFIX) !== 0) {
    return {
      ok: false,
      code: 'prefix',
      reason: raw.indexOf('LANDRPG') === 0
        ? '이 버전에서 읽을 수 없는 세이브 코드입니다. (LANDRPG3 형식이 아닙니다)'
        : `세이브 코드가 아닙니다. ${SAVE_CODE_PREFIX} 로 시작해야 합니다.`,
    };
  }
  const body = raw.slice(SAVE_CODE_PREFIX.length);
  const dot = body.lastIndexOf('.');
  if (dot <= 0) return { ok: false, code: 'format', reason: '코드가 잘렸습니다 — 체크섬이 없습니다.' };
  const payload = body.slice(0, dot);
  const sum = body.slice(dot + 1).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(sum)) {
    return { ok: false, code: 'checksum', reason: '코드가 손상되었습니다 — 체크섬 형식이 아닙니다.' };
  }
  if (sum !== saveChecksum(payload)) {
    return { ok: false, code: 'checksum', reason: '코드가 손상되었습니다 (체크섬 불일치). 다시 복사해 주세요.' };
  }
  const bytes = b64Decode(payload);
  if (!bytes) return { ok: false, code: 'decode', reason: '코드를 해석할 수 없습니다 (데이터 손상).' };
  let data;
  try {
    data = JSON.parse(utf8Decode(bytes));
  } catch (e) {
    return { ok: false, code: 'json', reason: '코드 안의 세이브 데이터가 올바른 JSON 이 아닙니다.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, code: 'shape', reason: '세이브 데이터 형식이 아닙니다.' };
  }
  const state = normalizeState(data, now);
  return { ok: true, state, summary: summarizeSave(state) };
}

/** 테스트·검증용: 잘못된 코드를 만들 때 쓰는 내부 인코더 */
export function encodePayload(json) {
  const payload = b64Encode(utf8Encode(String(json)));
  return `${SAVE_CODE_PREFIX}${payload}.${saveChecksum(payload)}`;
}
