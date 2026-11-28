// land-rpg / src/cloud.js
// v4.8.0 ☁️ 선택적 클라우드 세이브 · 🏆 랭킹 (Firebase Google 로그인)
//
// 설계 원칙
//  - 게스트 플레이가 기본이다. 이 파일은 부팅 경로에서 네트워크를 한 번도 건드리지 않는다.
//    Firebase SDK 는 사용자가 'Google 로그인' 또는 '랭킹' 을 눌렀을 때만 동적 import 한다.
//  - 로그인·동기화가 실패해도 게스트 저장(localStorage)은 그대로 동작한다. 무한 대기는 없다
//    (모든 네트워크 호출에 시간 제한을 두고, 실패는 상태 문자열로만 남긴다).
//  - 기존 korea-land 데이터(users/{uid}/state, rankings, companies …)는 절대 읽거나 쓰지 않는다.
//    전용 경로만 쓴다: rpg/{uid} (본인만 · 비공개 세이브), rpg_rankings/{uid} (공개 랭킹).
//    두 경로는 2026-11-23 에 게시된 RTDB 규칙으로 이미 열려 있어 규칙 변경이 필요 없다.
//
// 이 파일의 순수 함수(buildCloudDoc · compareSaves · rankRows …)는 DOM·네트워크에 의존하지 않아
// tools/verify_v3.py 에서 헤드리스로 검증한다.
import { APP_VERSION } from './data.js';
import { portfolioOf, formatGold } from './land.js';
import { buildSocialPayload } from './social.js';

/** 클라우드 설정 — 경로·시간 제한·표시 규칙을 한곳에 모은다 */
export const CLOUD = {
  sdkVersion: '10.14.1',
  cdn: 'https://www.gstatic.com/firebasejs/10.14.1',
  savePath: (uid) => `rpg/${uid}`,
  rankPath: 'rpg_rankings',
  autoSyncMs: 60000, // 주기 저장(60초)
  netTimeoutMs: 12000, // 읽기/쓰기 한 번의 제한 시간
  sdkTimeoutMs: 25000, // SDK 내려받기 제한 시간
  authTimeoutMs: 180000, // 로그인 창 응답 제한 시간(사용자가 계정을 고르는 시간 포함)
  topN: 20,
  nickMax: 12,
  tsSlackMs: 90000, // 타임스탬프가 이만큼 차이 나야 '더 최신'으로 본다
  resumeDelayMs: 2600, // 부팅 후 세션 복원까지 기다리는 시간(게스트 화면이 먼저 뜬다)
};

/** korea-land-4e0c2 프로젝트의 공개 웹 설정(비밀 키가 아니다 — 보안은 RTDB 규칙이 담당) */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBuNpR-J_BrDQ0-kzG239QAY6IbqG6huz4',
  authDomain: 'korea-land-4e0c2.firebaseapp.com',
  projectId: 'korea-land-4e0c2',
  databaseURL: 'https://korea-land-4e0c2-default-rtdb.firebaseio.com',
  storageBucket: 'korea-land-4e0c2.firebasestorage.app',
  messagingSenderId: '517153683752',
  appId: '1:517153683752:web:936cbe6020d643329cb81d',
};

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : (isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d));
const int = (v, d = 0) => Math.max(0, Math.floor(num(v, d)));

/* ══════════════════════════ 순수 함수 ══════════════════════════ */

/** 문자열 → 32bit 해시(uid 로 기본 닉네임을 만든다) */
export function hash32(str) {
  const s = String(str == null ? '' : str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 로그인만 하고 닉네임을 정하지 않았을 때 쓰는 기본 이름 — 실명을 공개하지 않는다 */
export function defaultNick(uid) {
  const h = hash32(uid || 'guest');
  return `용사${String((h % 9000) + 1000)}`;
}

/** 닉네임 정리 — 공백/제어문자/HTML 문자 제거, 2~12자, 비면 기본 이름 */
export function sanitizeNick(raw, uid = '') {
  let s = String(raw == null ? '' : raw);
  s = s.replace(/[&<>"'`]/g, ''); // 랭킹에 그대로 그려도 안전한 문자만
  // 제어문자·줄바꿈 제거 + 공백 접기
  s = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.slice(0, CLOUD.nickMax).trim();
  if (s.length < 2) return defaultNick(uid);
  return s;
}

/** 저장본에 남은 닉네임(없으면 빈 문자열 → 호출 쪽에서 기본 이름을 쓴다) */
export function nickOf(state) {
  const c = state && state.cloud && typeof state.cloud === 'object' ? state.cloud : {};
  return typeof c.nick === 'string' ? c.nick.slice(0, CLOUD.nickMax) : '';
}

/** 현재 세이브의 요약(비교·랭킹에 쓰는 숫자만) */
export function cloudSummary(state, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : {};
  let totalAsset = 0;
  try {
    totalAsset = Math.round(num(portfolioOf(s, now).totalAsset));
  } catch (e) {
    totalAsset = Math.round(num(s.gold));
  }
  const peak = Math.max(1, int(s.peakStage, 1), int(s.maxStage, 1), int(s.stage, 1));
  const rb = s.rebirth && typeof s.rebirth === 'object' ? s.rebirth : {};
  const owned = (s.land && s.land.owned) || {};
  let cities = 0;
  for (const k of Object.keys(owned)) if (int(owned[k]) > 0) cities += 1;
  return {
    level: Math.max(1, int(s.level, 1)),
    stage: peak,
    curStage: Math.max(1, int(s.stage, 1)),
    gold: int(s.gold),
    totalAsset,
    cities,
    rebirth: int(rb.count),
    towerBest: int(s.tower && s.tower.best),
    dailyBest: int(s.dailyBoss && s.dailyBoss.best),
    dailyGrade: String((s.dailyBoss && s.dailyBoss.bestGrade) || 'D'),
    riftBest: int(s.rift && s.rift.bestWave),
    playMs: int(s.records && s.records.playMs),
    nick: nickOf(s),
    ts: int(s.lastActiveAt),
  };
}

/** undefined/NaN 을 지운 사본(RTDB 는 undefined 를 거부한다) */
export function stripUndefined(v) {
  if (Array.isArray(v)) return v.map((x) => stripUndefined(x)).filter((x) => x !== undefined);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      const x = stripUndefined(v[k]);
      if (x !== undefined) out[k] = x;
    }
    return out;
  }
  if (typeof v === 'number' && !isFinite(v)) return undefined;
  if (typeof v === 'function' || typeof v === 'undefined') return undefined;
  return v;
}

/** 클라우드에 올릴 문서 — 요약 + 세이브 전체(복원용) */
export function buildCloudDoc(state, opts = {}) {
  const now = int(opts.now, Date.now());
  const uid = String(opts.uid || '');
  const sum = cloudSummary(state, now);
  const nick = sanitizeNick(opts.nick || sum.nick, uid);
  return {
    kind: 'land_rpg_save',
    v: APP_VERSION,
    ts: now,
    uid,
    nick,
    level: sum.level,
    stage: sum.stage,
    gold: sum.gold,
    totalAsset: sum.totalAsset,
    cities: sum.cities,
    rebirth: sum.rebirth,
    save: stripUndefined(state),
  };
}

/**
 * 클라우드 문서 해석 — v4.8 문서 · (v2 시절 rpg/{uid}) 옛 페이로드 · 손상 값을 모두 받아 낸다.
 * @returns {{ ok: boolean, doc: object|null, summary: object|null, restorable: boolean, reason?: string }}
 */
export function readCloudDoc(raw) {
  if (raw === null || raw === undefined) return { ok: true, doc: null, summary: null, restorable: false };
  if (typeof raw !== 'object') return { ok: false, doc: null, summary: null, restorable: false, reason: '알 수 없는 형식' };

  const src = raw.save && typeof raw.save === 'object' ? raw.save : null;
  let summary;
  if (src && typeof src === 'object') {
    summary = cloudSummary(src, int(raw.ts, Date.now()));
    if (raw.nick) summary.nick = String(raw.nick);
  } else {
    // 세이브 덩어리 없이 숫자만 남은 옛 기록 → 랭킹 표시용으로만 쓴다
    summary = {
      level: Math.max(1, int(raw.level, 1)),
      stage: Math.max(1, int(raw.stage, int(raw.peakStage, 1))),
      curStage: Math.max(1, int(raw.stage, 1)),
      gold: int(raw.gold),
      totalAsset: int(raw.totalAsset),
      cities: int(raw.cities),
      rebirth: int(raw.rebirth),
      playMs: int(raw.playMs),
      nick: raw.nick ? String(raw.nick) : '',
      ts: int(raw.ts, int(raw.time)),
    };
  }
  // 문서에 남은 요약 숫자가 있으면 그쪽을 우선한다(가격 변동으로 평가액이 흔들리지 않게)
  for (const k of ['level', 'stage', 'gold', 'totalAsset', 'cities', 'rebirth']) {
    const v = raw[k];
    if (typeof v === 'number' && isFinite(v) && v >= 0) summary[k] = Math.max(k === 'stage' || k === 'level' ? 1 : 0, Math.round(v));
  }
  const restorable = !!(src && typeof src === 'object' && (int(src.level, 0) >= 1 || int(src.stage, 0) >= 1));
  return { ok: true, doc: { ...raw, save: src || null }, summary, restorable };
}

/** 두 요약의 진행도 비교 — stage → 총자산 → 레벨 (총자산은 1% 미만 차이를 같게 본다) */
export function compareProgress(a, b) {
  const sa = Math.max(1, int(a && a.stage, 1));
  const sb = Math.max(1, int(b && b.stage, 1));
  if (sb > sa) return -1;
  if (sa > sb) return 1;
  const va = int(a && a.totalAsset);
  const vb = int(b && b.totalAsset);
  const tol = Math.max(1, Math.round(Math.max(va, vb) * 0.01));
  if (vb - va > tol) return -1;
  if (va - vb > tol) return 1;
  const la = Math.max(1, int(a && a.level, 1));
  const lb = Math.max(1, int(b && b.level, 1));
  if (lb > la) return -1;
  if (la > lb) return 1;
  return 0;
}

/**
 * 로컬 세이브와 클라우드 세이브를 비교해 할 일을 고른다.
 *  - 'upload'   : 클라우드가 비었거나 로컬이 더 앞선다
 *  - 'download' : 클라우드가 더 앞서거나 더 최신이다
 *  - 'conflict' : 한쪽이 더 앞서는데 다른 쪽이 더 최근에 플레이했다(양쪽 다 손실 위험)
 *  - 'same'     : 사실상 같은 상태
 * 어느 쪽이든 자동으로 덮어쓰지 않는다 — UI 가 이 값으로 확인 모달을 띄운다.
 */
export function compareSaves(local, cloud, opts = {}) {
  const slack = int(opts.slackMs, CLOUD.tsSlackMs);
  const L = local && typeof local === 'object' ? local : null;
  const C = cloud && typeof cloud === 'object' ? cloud : null;
  if (!C) return { action: 'upload', why: 'cloud-empty', recommend: 'local', local: L, cloud: null };
  if (!L) return { action: 'download', why: 'local-empty', recommend: 'cloud', local: null, cloud: C };
  const lt = int(L.ts);
  const ct = int(C.ts);
  const ahead = compareProgress(L, C); // 1 = 로컬이 앞섬, -1 = 클라우드가 앞섬
  const localNewer = lt - ct > slack;
  const cloudNewer = ct - lt > slack;
  const delta = {
    stage: int(C.stage, 1) - int(L.stage, 1),
    asset: int(C.totalAsset) - int(L.totalAsset),
    level: int(C.level, 1) - int(L.level, 1),
  };
  if (ahead < 0) {
    if (localNewer) return { action: 'conflict', why: 'cloud-ahead-but-local-newer', recommend: 'cloud', local: L, cloud: C, delta };
    return { action: 'download', why: 'cloud-ahead', recommend: 'cloud', local: L, cloud: C, delta };
  }
  if (ahead > 0) {
    if (cloudNewer) return { action: 'conflict', why: 'local-ahead-but-cloud-newer', recommend: 'local', local: L, cloud: C, delta };
    return { action: 'upload', why: 'local-ahead', recommend: 'local', local: L, cloud: C, delta };
  }
  if (cloudNewer) return { action: 'download', why: 'cloud-newer', recommend: 'cloud', local: L, cloud: C, delta };
  if (localNewer) return { action: 'upload', why: 'local-newer', recommend: 'local', local: L, cloud: C, delta };
  return { action: 'same', why: 'equal', recommend: 'none', local: L, cloud: C, delta };
}

/** 랭킹 항목 정리 — 예전 기록(stage/level/kills)도 같은 모양으로 읽는다 */
export const RANK_KEYS = ['stage', 'asset', 'tower', 'daily', 'rift'];

export function normalizeRankKey(key) {
  return RANK_KEYS.includes(key) ? key : 'stage';
}

export function rankEntryOf(state, opts = {}) {
  const uid = String(opts.uid || '');
  const now = int(opts.now, Date.now());
  const sum = cloudSummary(state, now);
  const soc = buildSocialPayload(state, opts.stats || null, now);
  return {
    uid,
    name: sanitizeNick(opts.nick || sum.nick, uid),
    level: sum.level,
    stage: sum.stage,
    gold: sum.gold,
    totalAsset: sum.totalAsset,
    cities: sum.cities,
    rebirth: sum.rebirth,
    towerBest: sum.towerBest,
    dailyBest: sum.dailyBest,
    dailyGrade: sum.dailyGrade,
    riftBest: sum.riftBest,
    // v8.18.0 멀티플레이 소셜 공개 필드 (기존 rpg_rankings/{uid} 규칙 100% 호환)
    raidWeek: soc.raidWeek,
    raidDmg: soc.raidDmg,
    topCities: soc.topCities,
    allyCode: soc.allyCode,
    voteWeek: soc.voteWeek,
    voteRegion: soc.voteRegion,
    snap: soc.snap,
    title: (() => {
      const id = state && state.titles && state.titles.equipped;
      return typeof id === 'string' ? id.slice(0, 20) : '';
    })(),
    time: now,
    v: APP_VERSION,
  };
}

export function normalizeRankRow(entry, uid) {
  const e = entry && typeof entry === 'object' ? entry : {};
  const stage = Math.max(0, int(e.stage, int(e.peakStage, 0)));
  const hasAsset = typeof e.totalAsset === 'number' || typeof e.asset === 'number';
  const hasTower = typeof e.towerBest === 'number';
  const hasDaily = typeof e.dailyBest === 'number';
  const hasRift = typeof e.riftBest === 'number';
  return {
    uid: String(e.uid || uid || ''),
    name: sanitizeNick(e.name || e.nick, String(e.uid || uid || '')),
    level: Math.max(1, int(e.level, 1)),
    stage,
    gold: int(e.gold),
    totalAsset: int(e.totalAsset, int(e.asset)),
    cities: int(e.cities),
    rebirth: int(e.rebirth),
    towerBest: int(e.towerBest),
    dailyBest: int(e.dailyBest),
    dailyGrade: typeof e.dailyGrade === 'string' ? e.dailyGrade.slice(0, 2) : 'D',
    riftBest: int(e.riftBest),
    raidWeek: typeof e.raidWeek === 'string' ? e.raidWeek.slice(0, 16) : '',
    raidDmg: int(e.raidDmg),
    topCities: e.topCities && typeof e.topCities === 'object' ? e.topCities : null,
    allyCode: typeof e.allyCode === 'string' ? e.allyCode.slice(0, 8) : '',
    voteWeek: typeof e.voteWeek === 'string' ? e.voteWeek.slice(0, 16) : '',
    voteRegion: typeof e.voteRegion === 'string' ? e.voteRegion.slice(0, 16) : '',
    snap: e.snap && typeof e.snap === 'object' ? e.snap : null,
    title: typeof e.title === 'string' ? e.title.slice(0, 20) : '',
    time: int(e.time, int(e.ts)),
    hasAsset,
    hasTower,
    hasDaily,
    hasRift,
  };
}

const RANK_METRIC_FIELD = {
  stage: 'stage',
  asset: 'totalAsset',
  tower: 'towerBest',
  daily: 'dailyBest',
  rift: 'riftBest',
};

/** 랭킹 정렬 — key: 'stage' | 'asset' | 'tower' | 'daily' | 'rift'. 동점은 같은 순위(1,2,2,4) 로 묶는다. */
export function rankRows(map, key = 'stage', opts = {}) {
  const k = normalizeRankKey(key);
  const limit = Math.max(1, int(opts.limit, CLOUD.topN));
  const metric = RANK_METRIC_FIELD[k];
  const other = metric === 'stage' ? 'totalAsset' : 'stage';
  const src = map && typeof map === 'object' ? map : {};
  const rows = [];
  for (const uid of Object.keys(src)) {
    const row = normalizeRankRow(src[uid], uid);
    if (row.stage <= 0 && row.totalAsset <= 0 && row.towerBest <= 0 && row.dailyBest <= 0 && row.riftBest <= 0) continue; // 빈 기록은 목록에서 뺀다
    rows.push(row);
  }
  rows.sort((a, b) => {
    if (b[metric] !== a[metric]) return b[metric] - a[metric];
    if (b[other] !== a[other]) return b[other] - a[other];
    if (a.time !== b.time) return a.time - b.time; // 먼저 달성한 기록이 앞
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  let rank = 0;
  let prev = null;
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const val = r[metric];
    if (prev === null || val !== prev) rank = i + 1;
    prev = val;
    out.push({ ...r, rank, metric: k, value: val });
  }
  return { key: k, rows: out.slice(0, limit), all: out, count: out.length };
}

/** 내 순위(전체 기준) — 목록에 없으면 null */
export function rankOf(rows, uid) {
  const id = String(uid || '');
  if (!id || !Array.isArray(rows)) return null;
  for (const r of rows) if (r && r.uid === id) return r;
  return null;
}

/** 총자산 표기 — 억을 넘으면 조 단위로 줄인다(랭킹 표가 넘치지 않게) */
export function formatAsset(n) {
  const v = Math.floor(Number(n) || 0);
  if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(2)}조`;
  return formatGold(v);
}

/** 목록 값 표기 — 최고 스테이지 S24 · 총자산 💰1.2조 · 도전의 탑 🗼42층 · 일일 보스 🌟1.2만 */
export function rankValueText(key, row) {
  const r = row && typeof row === 'object' ? row : {};
  const k = normalizeRankKey(key);
  if (k === 'asset') return r.hasAsset === false ? '—' : `💰${formatAsset(int(r.totalAsset))}`;
  if (k === 'tower') return r.hasTower === false || int(r.towerBest) <= 0 ? '—' : `🗼${int(r.towerBest)}층`;
  if (k === 'daily') return r.hasDaily === false || int(r.dailyBest) <= 0 ? '—' : `🌟${formatAsset(int(r.dailyBest))}`;
  if (k === 'rift') return r.hasRift === false || int(r.riftBest) <= 0 ? '—' : `🌀W${int(r.riftBest)}`;
  return `S${Math.max(0, int(r.stage))}`;
}

/** 랭킹 지표 한글 이름 */
export function rankMetricLabel(key) {
  const k = normalizeRankKey(key);
  if (k === 'asset') return '총자산';
  if (k === 'tower') return '도전의 탑';
  if (k === 'daily') return '일일 보스';
  if (k === 'rift') return '무한 균열';
  return '최고 스테이지';
}

/** HUD·카드에 쓰는 상태 문구 */
export function cloudStatusText(cloud) {
  const c = cloud && typeof cloud === 'object' ? cloud : {};
  const st = c.status || 'guest';
  if (st === 'connecting') return { ico: '☁️', label: '연결 중…', cls: 'warn', tone: 'warn' };
  if (st === 'online') return { ico: '☁️', label: '클라우드 연결됨', cls: 'on', tone: 'on' };
  if (st === 'offline') return { ico: '📴', label: '오프라인 — 게스트 저장 중', cls: 'off', tone: 'off' };
  if (st === 'error') return { ico: '⚠️', label: '클라우드 오류', cls: 'off', tone: 'error' };
  return { ico: '☁️', label: '게스트 (이 기기에만 저장)', cls: 'off', tone: 'guest' };
}

/** 로그인 오류 코드 → 사람이 읽는 문장 */
export function describeAuthError(code, message) {
  const c = String(code || '');
  if (c === 'timeout') return '로그인 응답이 없습니다 — 네트워크를 확인하고 다시 시도해 주세요';
  if (c === 'auth/popup-blocked') return '로그인 창이 차단되었습니다';
  if (c === 'auth/popup-closed-by-user') return '로그인 창을 닫았습니다';
  if (c === 'auth/cancelled-popup-request') return '로그인 창이 취소되었습니다';
  if (c === 'auth/unauthorized-domain') return '이 주소가 Firebase 승인 도메인에 없습니다';
  if (c === 'auth/network-request-failed') return '네트워크 오류 — 연결을 확인해 주세요';
  if (c === 'auth/operation-not-supported-in-this-environment') return '이 브라우저에서는 팝업 로그인을 쓸 수 없습니다';
  if (c === 'auth/account-exists-with-different-credential') return '이미 다른 방식으로 가입된 계정입니다';
  return message ? String(message).slice(0, 120) : '로그인하지 못했습니다';
}

/** 저장/읽기 오류 → 문장 */
export function describeNetError(e) {
  const code = String((e && (e.code || e.name)) || '');
  const msg = String((e && e.message) || '');
  if (code === 'timeout') return '응답이 없습니다 (시간 초과)';
  if (code === 'sdk' || /Failed to fetch|Importing a module|network/i.test(msg)) return '라이브러리를 불러오지 못했습니다 (오프라인?)';
  if (/permission_denied|PERMISSION_DENIED/i.test(code + ' ' + msg)) return '권한이 없습니다 (로그인 상태를 확인해 주세요)';
  return msg ? msg.slice(0, 120) : '클라우드와 통신하지 못했습니다';
}

/** 시간 제한 래퍼 — 모든 네트워크 호출이 여기를 지나 무한 대기를 막는다 */
export function withTimeout(promise, ms, label, timer) {
  const setT = typeof timer === 'function' ? timer : (fn, d) => setTimeout(fn, d);
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setT(() => {
      if (done) return;
      done = true;
      const err = new Error(`${label || '작업'} 시간 초과`);
      err.code = 'timeout';
      reject(err);
    }, Math.max(1, int(ms, 1000)));
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; resolve(v); } },
      (e) => { if (!done) { done = true; reject(e); } },
    );
    if (t && typeof t.then === 'function') t.then(() => {}); // 정리용(취소 지원 타이머)
  });
}

export function sessionFlagStore() {
  try {
    const st = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    if (!st) return null;
    return {
      get: (k) => { try { return st.getItem(k); } catch (e) { return null; } },
      set: (k, v) => { try { st.setItem(k, v); } catch (e) { /* ignore */ } },
      remove: (k) => { try { st.removeItem(k); } catch (e) { /* ignore */ } },
    };
  } catch (e) {
    return null;
  }
}

/** Firebase SDK 동적 로드 — 이 함수는 사용자가 클라우드를 켤 때만 실행된다 */
export async function loadFirebaseSdk() {
  const base = CLOUD.cdn;
  const [appMod, authMod, dbMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-database.js`),
  ]);
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  return {
    app,
    auth: authMod.getAuth(app),
    db: dbMod.getDatabase(app),
    GoogleAuthProvider: authMod.GoogleAuthProvider,
    onAuthStateChanged: authMod.onAuthStateChanged,
    signInWithPopup: authMod.signInWithPopup,
    signInWithRedirect: authMod.signInWithRedirect,
    getRedirectResult: authMod.getRedirectResult,
    signOut: authMod.signOut,
    ref: dbMod.ref,
    get: dbMod.get,
    set: dbMod.set,
  };
}

/* ══════════════════════════ 클라우드 연결 객체 ══════════════════════════ */

/**
 * 로그인·저장·랭킹을 담당한다. 네트워크/브라우저 의존 부분은 생성자 주입으로 바꿀 수 있어
 * (실패·시간 초과 경로까지) 헤드리스에서 검증할 수 있다.
 */
export class CloudSync {
  constructor(opts = {}) {
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.loader = typeof opts.loadSdk === 'function' ? opts.loadSdk : loadFirebaseSdk;
    this.timer = typeof opts.setTimeout === 'function' ? opts.setTimeout : null;
    this.onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
    this.flag = opts.flagStore || sessionFlagStore(); // sessionStorage 대체(리다이렉트 복귀 표시)
    this.status = 'guest'; // guest | connecting | online | offline | error
    this.user = null;
    this.sdk = null;
    this.busy = false;
    this.lastSync = 0;
    this.lastError = '';
    this.rank = { key: 'stage', data: null, rows: [], count: 0, at: 0, loading: false, error: '' };
  }

  get uid() {
    return (this.user && this.user.uid) || '';
  }

  get signedIn() {
    return !!this.uid;
  }

  emit(status, error) {
    if (status) this.status = status;
    if (error !== undefined) this.lastError = String(error || '');
    try {
      this.onChange(this);
    } catch (e) { /* UI 없이도 동작해야 한다 */ }
  }

  /** SDK 준비(동적) — 실패하면 게스트로 남는다 */
  async ensureSdk() {
    if (this.sdk) return this.sdk;
    this.emit('connecting');
    let sdk;
    try {
      sdk = await withTimeout(Promise.resolve().then(() => this.loader()), CLOUD.sdkTimeoutMs, '라이브러리', this.timer);
    } catch (e) {
      e.code = e.code || 'sdk';
      this.emit('offline', describeNetError(e));
      throw e;
    }
    if (!sdk || !sdk.auth || !sdk.db) {
      const err = new Error('라이브러리를 준비하지 못했습니다');
      err.code = 'sdk';
      this.emit('offline', describeNetError(err));
      throw err;
    }
    this.sdk = sdk;
    try {
      sdk.onAuthStateChanged(sdk.auth, (u) => this.noteUser(u));
    } catch (e) { /* 인증 상태 추적 실패는 치명적이지 않다 */ }
    if (this.status === 'connecting') this.emit(this.signedIn ? 'online' : 'guest');
    return sdk;
  }

  noteUser(u) {
    const prev = this.uid;
    this.user = u && u.uid
      ? { uid: String(u.uid), name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' }
      : null;
    if (this.uid) {
      if (this.status !== 'online') this.emit('online');
    } else if (this.status === 'online' || this.status === 'connecting') {
      this.emit('guest');
    } else {
      this.emit();
    }
    if (prev !== this.uid && prev) this.emit(); // 로그아웃/계정 교체
    return this.user;
  }

  /** 저장 세션 살리기 — SDK 를 불러오고 초기 인증 콜백을 잠깐 기다린다(실패하면 게스트 유지) */
  async restoreSession(waitMs = 6000) {
    try {
      await this.ensureSdk();
    } catch (e) {
      return false;
    }
    const started = this.now();
    while (!this.signedIn && this.now() - started < waitMs) {
      await new Promise((res) => (typeof this.timer === 'function' ? this.timer(res, 150) : setTimeout(res, 150)));
    }
    return this.signedIn;
  }

  /** Google 로그인 — 팝업. 차단되면 retryRedirect 를 돌려준다 */
  async signIn() {
    if (this.busy) return { ok: false, code: 'busy', message: '이미 처리 중입니다' };
    this.busy = true;
    try {
      const sdk = await this.ensureSdk();
      let provider;
      try {
        provider = new sdk.GoogleAuthProvider();
        if (provider.setCustomParameters) provider.setCustomParameters({ prompt: 'select_account' });
      } catch (e) {
        provider = new sdk.GoogleAuthProvider();
      }
      const cred = await withTimeout(sdk.signInWithPopup(sdk.auth, provider), CLOUD.authTimeoutMs, '로그인', this.timer);
      const u = (cred && cred.user) || null;
      if (u) this.noteUser(u);
      if (!this.signedIn) {
        this.emit('error', '로그인 정보를 받지 못했습니다');
        return { ok: false, code: 'no-user', message: '로그인 정보를 받지 못했습니다' };
      }
      this.emit('online');
      return { ok: true, user: this.user };
    } catch (e) {
      const code = String((e && (e.code || e.name)) || 'error');
      const message = code === 'sdk' ? describeNetError(e) : describeAuthError(code, e && e.message);
      const retryRedirect = code === 'auth/popup-blocked'
        || code === 'auth/operation-not-supported-in-this-environment'
        || code === 'auth/cancelled-popup-request';
      const offline = code === 'auth/network-request-failed' || code === 'timeout' || code === 'sdk';
      this.emit(offline ? 'offline' : 'error', message);
      return { ok: false, code, message, retryRedirect };
    } finally {
      this.busy = false;
    }
  }

  flagKey() {
    return 'land_rpg_cloud_redirect';
  }

  setFlag(v) {
    try {
      if (this.flag && typeof this.flag.set === 'function') this.flag.set(this.flagKey(), v);
    } catch (e) { /* ignore */ }
  }

  takeFlag() {
    try {
      if (!this.flag || typeof this.flag.get !== 'function') return false;
      const v = this.flag.get(this.flagKey());
      if (typeof this.flag.remove === 'function') this.flag.remove(this.flagKey());
      return v === '1';
    } catch (e) {
      return false;
    }
  }

  /** 리다이렉트 로그인으로 돌아온 상태인지(꾸지 않고 확인만) */
  hasPendingRedirect() {
    try {
      return !!(this.flag && typeof this.flag.get === 'function' && this.flag.get(this.flagKey()) === '1');
    } catch (e) {
      return false;
    }
  }

  /** 팝업이 막히는 환경(일부 인앱 브라우저)의 대안 — 페이지를 떠났다 돌아온다 */
  async signInRedirect() {
    try {
      const sdk = await this.ensureSdk();
      const provider = new sdk.GoogleAuthProvider();
      this.setFlag('1');
      await sdk.signInWithRedirect(sdk.auth, provider);
      return { ok: true, redirecting: true };
    } catch (e) {
      const code = String((e && (e.code || e.name)) || 'error');
      const message = describeAuthError(code, e && e.message);
      this.emit('error', message);
      return { ok: false, code, message };
    }
  }

  /** 리다이렉트로 돌아왔을 때 한 번만 호출 — 표시가 없으면 네트워크를 쓰지 않는다 */
  async completeRedirect() {
    if (!this.takeFlag()) return { ok: false, code: 'no-pending' };
    try {
      const sdk = await this.ensureSdk();
      const cred = await withTimeout(sdk.getRedirectResult(sdk.auth), CLOUD.netTimeoutMs, '로그인 확인', this.timer);
      const u = (cred && cred.user) || null;
      if (u) this.noteUser(u);
      if (!this.signedIn) return { ok: false, code: 'no-user', message: '로그인 정보를 받지 못했습니다' };
      this.emit('online');
      return { ok: true, user: this.user };
    } catch (e) {
      const code = String((e && (e.code || e.name)) || 'error');
      const message = describeAuthError(code, e && e.message);
      this.emit('error', message);
      return { ok: false, code, message };
    }
  }

  async signOut() {
    try {
      const sdk = await this.ensureSdk();
      await withTimeout(sdk.signOut(sdk.auth), CLOUD.netTimeoutMs, '로그아웃', this.timer);
    } catch (e) { /* 로그아웃 실패해도 로컬 상태는 게스트로 되돌린다 */ }
    this.user = null;
    this.lastSync = 0;
    this.rank = { key: this.rank.key, data: null, rows: [], count: 0, at: 0, loading: false, error: '' };
    this.emit('guest');
    return { ok: true };
  }

  /** rpg/{uid} 읽기 — 없으면 doc:null (정상) */
  async readSave(uid = this.uid) {
    const id = String(uid || '');
    if (!id) return { ok: false, code: 'no-user', message: '로그인이 필요합니다' };
    try {
      const sdk = await this.ensureSdk();
      const snap = await withTimeout(sdk.get(sdk.ref(sdk.db, CLOUD.savePath(id))), CLOUD.netTimeoutMs, '클라우드 읽기', this.timer);
      const raw = snap && typeof snap.exists === 'function' && snap.exists() ? snap.val() : null;
      const loaded = readCloudDoc(raw);
      if (!loaded.ok) return { ok: false, code: 'bad-doc', message: loaded.reason || '읽을 수 없는 형식' };
      return { ok: true, loaded, at: this.now() };
    } catch (e) {
      const message = describeNetError(e);
      this.emit(/권한/.test(message) ? 'error' : 'offline', message);
      return { ok: false, code: String((e && e.code) || 'error'), message };
    }
  }

  /** rpg/{uid} 쓰기 */
  async writeSave(doc) {
    const uid = String((doc && doc.uid) || this.uid || '');
    if (!uid) return { ok: false, code: 'no-user', message: '로그인이 필요합니다' };
    if (!doc || typeof doc !== 'object') return { ok: false, code: 'empty', message: '저장할 내용이 없습니다' };
    try {
      const sdk = await this.ensureSdk();
      const payload = { ...doc, uid, ts: int(doc.ts, this.now()) };
      await withTimeout(sdk.set(sdk.ref(sdk.db, CLOUD.savePath(uid)), payload), CLOUD.netTimeoutMs, '클라우드 저장', this.timer);
      this.lastSync = this.now();
      if (this.status !== 'online') this.emit('online');
      return { ok: true, at: this.lastSync };
    } catch (e) {
      const message = describeNetError(e);
      this.emit(/권한/.test(message) ? 'error' : 'offline', message);
      return { ok: false, code: String((e && e.code) || 'error'), message };
    }
  }

  /** rpg_rankings/{uid} 쓰기 — 랭킹 참여 */
  async writeRank(entry) {
    const uid = String((entry && entry.uid) || this.uid || '');
    if (!uid) return { ok: false, code: 'no-user', message: '로그인이 필요합니다' };
    try {
      const sdk = await this.ensureSdk();
      await withTimeout(sdk.set(sdk.ref(sdk.db, `${CLOUD.rankPath}/${uid}`), stripUndefined({ ...entry, uid })), CLOUD.netTimeoutMs, '랭킹 저장', this.timer);
      return { ok: true };
    } catch (e) {
      const message = describeNetError(e);
      return { ok: false, code: String((e && e.code) || 'error'), message };
    }
  }

  /** rpg_rankings 전체 읽기 — 공개 노드라 게스트도 볼 수 있다 */
  async readRank(key = 'stage') {
    const k = normalizeRankKey(key);
    this.rank = { ...this.rank, key: k, loading: true, error: '' };
    this.emit();
    try {
      const sdk = await this.ensureSdk();
      const snap = await withTimeout(sdk.get(sdk.ref(sdk.db, CLOUD.rankPath)), CLOUD.netTimeoutMs, '랭킹 읽기', this.timer);
      const map = snap && typeof snap.val === 'function' ? snap.val() : null;
      const built = rankRows(map, k, { limit: CLOUD.topN });
      this.rank = { ...built, loading: false, at: this.now(), error: '' };
      this.emit(this.signedIn ? 'online' : 'guest');
      return { ok: true, rank: this.rank };
    } catch (e) {
      const message = describeNetError(e);
      this.rank = { ...this.rank, loading: false, error: message };
      this.emit(this.signedIn ? 'error' : 'offline', message);
      return { ok: false, code: String((e && e.code) || 'error'), message };
    }
  }
}
