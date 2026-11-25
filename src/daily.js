// land-rpg / src/daily.js
// v4.5 🌟 일일 보스 — 하루 2회, 30초 타임어택. 입힌 누적 피해량으로 등급(S~D)을 매겨 보상을 준다.
//   · 보스 체력은 '내 DPS × 150초' — 30초 안에 잡히지 않는다. 즉 '얼마나 넣었나'만 겨룬다.
//   · 등급 기준은 '기본 공격 DPS × 30초' 대비 비율 — 스테이지·스펙이 달라도 같은 잣대다.
//     스킬·펫·장비 옵션이 더해지면 100%를 넘고, 그만큼 등급이 올라간다.
//   · 날짜는 KST(UTC+9) 기준 — 자정에 도전 횟수가 다시 채워진다.
//   · 보상은 골드·강화석·초월석 → S27~S40+ 캐릭터도 매일 조금씩 성장한다.
// DOM 의존 없음 → 헤드리스 검증 가능.
import { stageGoldBase } from './data.js';
import { rebirthBonus } from './rebirth.js';

export const DAILY = {
  attempts: 2, // 하루 도전 횟수
  durationMs: 30000, // 30초 타임어택
  bossHpSec: 150, // 보스 체력 = 내 DPS × 150초(30초 안에 못 잡는다)
  atkOfHpPct: 1.9, // 보스 1대 = 내 최대 체력의 1.9%
  attackGapMs: 2000, // 보스 공격 간격
  minStage: 1, // 스테이지 조건 없음 — 시작한 날부터 매일
};

/* 등급 — ratio = 누적 피해 / (기본 공격 DPS × 30초).
 * 스킬·펫·장비 옵션·치명타가 더해지면 100%를 넘는다 → 좋은 빌드일수록 등급이 높다. */
export const DAILY_GRADES = [
  { id: 'S', min: 1.45, label: 'S', icon: '👑', color: '#ffd76a', goldMul: 180, shards: 70, points: 3 },
  { id: 'A', min: 1.22, label: 'A', icon: '🥇', color: '#8fe3a8', goldMul: 120, shards: 45, points: 2 },
  { id: 'B', min: 0.95, label: 'B', icon: '🥈', color: '#7fd3ff', goldMul: 80, shards: 28, points: 1 },
  { id: 'C', min: 0.6, label: 'C', icon: '🥉', color: '#c8b08a', goldMul: 45, shards: 14, points: 0 },
  { id: 'D', min: 0, label: 'D', icon: '🎖️', color: '#9aa4b2', goldMul: 20, shards: 6, points: 0 },
];

/** 요일마다 다른 보스 — 날짜(KST)만으로 정해져 저장 없이도 같은 날엔 같은 보스 */
export const DAILY_BOSSES = [
  { key: 'Seraphim', ko: '세라핌', title: '빛의 심판', theme: 'ruins' }, // 일
  { key: 'AbyssLord', ko: '아비스 로드', title: '심연의 군주', theme: 'abyss' }, // 월
  { key: 'IceGiant', ko: '아이스 자이언트', title: '빙결의 거인', theme: 'ice' }, // 화
  { key: 'Cerberus', ko: '케르베로스', title: '지옥의 문지기', theme: 'volcano' }, // 수
  { key: 'VoidWalker', ko: '보이드 워커', title: '공허의 방랑자', theme: 'abyss' }, // 목
  { key: 'DeathLord', ko: '데스로드', title: '망자의 왕', theme: 'cave' }, // 금
  { key: 'Ifrit', ko: '이프리트', title: '용암의 화신', theme: 'volcano' }, // 토
];

const pad2 = (v) => String(v).padStart(2, '0');

/** KST(UTC+9) 날짜 조각 — 서버·기기 시간대와 무관하게 같은 날짜를 쓴다 */
export function kstParts(now = Date.now()) {
  const d = new Date((Number(now) || 0) + 9 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() };
}

/** 'YYYY-MM-DD' (KST) */
export function kstDateKey(now = Date.now()) {
  const p = kstParts(now);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** 다음 자정(KST)까지 남은 ms — 일일 리셋까지 */
export function kstResetMs(now = Date.now()) {
  const dayMs = 86400000;
  const shifted = (Number(now) || 0) + 9 * 3600 * 1000;
  return dayMs - (shifted % dayMs);
}

/** 오늘(KST)의 일일 보스 */
export function dailyBossFor(now = Date.now()) {
  const p = kstParts(now);
  const b = DAILY_BOSSES[p.wd % DAILY_BOSSES.length];
  return { ...b, date: kstDateKey(now) };
}

export function defaultDailyState() {
  return { date: '', used: 0, best: 0, bestGrade: 'D', bestDate: '', runs: 0, last: null };
}

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gradeById = (id) => DAILY_GRADES.find((g) => g.id === id) || DAILY_GRADES[DAILY_GRADES.length - 1];

/**
 * 저장본 정규화 — 날짜가 바뀌었으면 도전 횟수만 0으로 되돌리고, 최고 기록은 남긴다.
 * 기존(v4.4 이하) 세이브는 오늘 날짜·0회로 안전하게 시작한다.
 */
export function normalizeDailyState(raw, now = Date.now()) {
  const date = kstDateKey(now);
  const base = { ...defaultDailyState(), date };
  if (!raw || typeof raw !== 'object') return base;
  const rawDate = typeof raw.date === 'string' ? raw.date.slice(0, 10) : '';
  const used = rawDate === date ? clamp(Math.floor(num(raw.used, 0)), 0, DAILY.attempts) : 0;
  const lastRaw = raw.last && typeof raw.last === 'object' ? raw.last : null;
  const last = lastRaw && DAILY_GRADES.some((g) => g.id === lastRaw.grade)
    ? {
      at: Math.max(0, num(lastRaw.at, 0)),
      dmg: Math.max(0, Math.round(num(lastRaw.dmg, 0))),
      grade: lastRaw.grade,
      how: typeof lastRaw.how === 'string' ? lastRaw.how.slice(0, 12) : 'timeout',
      gold: Math.max(0, Math.floor(num(lastRaw.gold, 0))),
      shards: Math.max(0, Math.floor(num(lastRaw.shards, 0))),
      points: Math.max(0, Math.floor(num(lastRaw.points, 0))),
      ratio: clamp(round(num(lastRaw.ratio, 0), 3), 0, 3),
    }
    : null;
  const bestGrade = DAILY_GRADES.some((g) => g.id === raw.bestGrade) ? raw.bestGrade : 'D';
  return {
    date,
    used,
    best: Math.max(0, Math.round(num(raw.best, 0))),
    bestGrade,
    bestDate: typeof raw.bestDate === 'string' ? raw.bestDate.slice(0, 10) : '',
    runs: Math.max(0, Math.floor(num(raw.runs, 0))),
    last,
  };
}

const round = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);

/** state.dailyBoss 보장(없으면 오늘 날짜로 새로 만든다) */
export function dailyState(state, now = Date.now()) {
  if (!state || typeof state !== 'object') return defaultDailyState();
  state.dailyBoss = normalizeDailyState(state.dailyBoss, now);
  return state.dailyBoss;
}

/** 오늘의 진행 상황 — UI·검증 공용 */
export function dailyInfo(state, now = Date.now()) {
  const st = dailyState(state, now);
  return {
    date: st.date,
    attempts: DAILY.attempts,
    used: st.used,
    left: Math.max(0, DAILY.attempts - st.used),
    best: st.best,
    bestGrade: st.bestGrade,
    bestDate: st.bestDate,
    runs: st.runs,
    last: st.last,
    grade: gradeById(st.bestGrade),
    boss: dailyBossFor(now),
    resetMs: kstResetMs(now),
  };
}

/** 도전 1회 차감(입장 시점) — 오늘 횟수가 없으면 거부 */
export function consumeDailyAttempt(state, now = Date.now()) {
  const st = dailyState(state, now);
  if (st.used >= DAILY.attempts) {
    return { ok: false, reason: '오늘 도전 횟수를 모두 사용했습니다 — 내일 00:00(KST)에 다시 채워집니다.' };
  }
  st.used += 1;
  st.runs += 1;
  return { ok: true, used: st.used, left: Math.max(0, DAILY.attempts - st.used) };
}

/** 비율 → 등급 */
export function dailyGradeAt(ratio) {
  const r = Math.max(0, Number(ratio) || 0);
  return DAILY_GRADES.find((g) => r >= g.min) || DAILY_GRADES[DAILY_GRADES.length - 1];
}

/** 이론 최대 피해(내 DPS × 30초) — 등급 기준 */
export function dailyDpsCap(dps) {
  return Math.max(1, Math.round((Number(dps) || 1) * (DAILY.durationMs / 1000)));
}

/**
 * 보상 계산 — 등급별 골드·강화석·초월석.
 * @param run { dmg, dps }  ratio 를 직접 줘도 된다.
 */
export function dailyReward(state, run = {}, rng = Math.random) {
  const dps = Math.max(1, Number(run.dps) || Math.max(1, Number(state && state._dailyDps) || 1));
  const cap = dailyDpsCap(dps);
  const dmg = Math.max(0, Number(run.dmg) || 0);
  const ratio = Number.isFinite(Number(run.ratio)) && run.ratio != null
    ? Math.max(0, Math.min(3, Number(run.ratio)))
    : Math.max(0, Math.min(3, dmg / cap));
  const grade = dailyGradeAt(ratio);
  const stage = Math.max(1, Math.floor(Number(state && state.stage) || 1));
  const rb = rebirthBonus(state);
  const swing = typeof rng === 'function' ? 0.94 + rng() * 0.12 : 1;
  const gold = Math.max(0, Math.round(stageGoldBase(stage) * grade.goldMul * (1 + rb.goldPct / 100) * swing));
  const shards = Math.max(0, Math.round(grade.shards * (1 + rb.shardPct / 100)));
  return { grade, ratio: round(ratio, 3), gold, shards, points: grade.points };
}

/** 한 판 기록 — 최고 피해·등급 갱신 */
export function recordDailyRun(state, run = {}, now = Date.now()) {
  const st = dailyState(state, now);
  const dmg = Math.max(0, Math.round(Number(run.dmg) || 0));
  const grade = DAILY_GRADES.some((g) => g.id === run.grade) ? run.grade : 'D';
  st.last = {
    at: now,
    dmg,
    grade,
    how: typeof run.how === 'string' ? run.how.slice(0, 12) : 'timeout',
    gold: Math.max(0, Math.floor(Number(run.gold) || 0)),
    shards: Math.max(0, Math.floor(Number(run.shards) || 0)),
    points: Math.max(0, Math.floor(Number(run.points) || 0)),
    ratio: clamp(round(Number(run.ratio) || 0, 3), 0, 3),
  };
  const isBest = dmg > st.best;
  if (isBest) {
    st.best = dmg;
    st.bestGrade = grade;
    st.bestDate = st.date;
  }
  return { isBest, best: st.best, bestGrade: st.bestGrade };
}

/** 등급 한 줄 — \"👑 S · 92%\" */
export function dailyGradeText(grade, ratio) {
  const g = typeof grade === 'string' ? gradeById(grade) : grade;
  const pct = Math.round(Math.max(0, Math.min(3, Number(ratio) || 0)) * 100);
  return `${g.icon} ${g.id} · ${pct}%`;
}
