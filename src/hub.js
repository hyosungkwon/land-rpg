// land-rpg / src/hub.js
// v7.0.0 📋 오늘의 할 일 원탭 통합 수령 허브 — 전 시스템 보상 집계 및 1탭 일괄 수령.
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { portfolioOf, claimRent } from './land.js';
import { bankStatus, claimDeposit } from './bank.js';
import { expeditionStatus, claimAllExpeditions } from './expedition.js';
import { invasionStatus } from './invasion.js';
import {
  attendanceInfo, claimAttendance, weeklyBossInfo, claimWeeklyMilestone,
} from './daily.js';
import {
  currentQuest, questProgress, claimQuest,
  dailyQuestStatus, claimDailyQuest, claimDailyQuestBonus,
} from './quests.js';
import { passInfo, claimAllPassTiers } from './pass.js';
import { towerSweepInfo, towerSweepClaim } from './tower.js';
import { raidStatus, claimRaidPhase } from './guild.js';
import { riftStatus } from './rift.js';
import {
  estateDividendInfo, claimEstateDividend, seasonChallengeStatus, claimSeasonChallenges,
} from './season.js';

/** 지금 수령 가능한 보상 + 바로 진행할 수 있는 주요 이벤트 집계 */
export function collectTodoSummary(state, battleStats = null, now = Date.now()) {
  const items = [];
  const alerts = [];

  // 1) 임대수익
  const pf = portfolioOf(state, now);
  if (pf.accruedRent >= 1) {
    items.push({ id: 'rent', icon: '💰', label: '미수령 임대수익', detail: `💰${Math.floor(pf.accruedRent).toLocaleString()}`, count: 1 });
  }
  // 2) 영지 은행 만기 예금
  const bk = bankStatus(state, now);
  if (bk.readyCount > 0) {
    items.push({ id: 'bank', icon: '🏦', label: '영지 은행 만기 예금', detail: `${bk.readyCount}건 수령 가능`, count: bk.readyCount });
  }
  // 3) 펫 영지 파견 완료
  const ex = expeditionStatus(state, now);
  if (ex.readyCount > 0) {
    items.push({ id: 'expedition', icon: '🧭', label: '영지 파견 완료', detail: `${ex.readyCount}팀 복귀`, count: ex.readyCount });
  }
  // 4) 7일 출석 체크
  const att = attendanceInfo(state, now);
  if (att.canClaim) {
    items.push({ id: 'attendance', icon: '🗓️', label: '7일 출석 체크', detail: `${att.nextDay}일차 보상`, count: 1 });
  }
  // 5) 일일 퀘스트 + 올클리어
  const dq = dailyQuestStatus(state, now);
  if (dq.readyCount > 0) {
    items.push({ id: 'dailyQuest', icon: '📅', label: '일일 퀘스트', detail: `${dq.readyCount}개 완료`, count: dq.readyCount });
  }
  // 6) 영지 성장 패스
  const ps = passInfo(state, now);
  if (ps.readyCount > 0) {
    items.push({ id: 'pass', icon: '🎖️', label: '영지 성장 패스', detail: `${ps.readyCount}단계 수령 가능`, count: ps.readyCount });
  }
  // 7) 도전의 탑 일일 소탕
  const sw = towerSweepInfo(state, now);
  if (sw.available) {
    items.push({ id: 'towerSweep', icon: '🗼', label: '도전의 탑 일일 소탕', detail: `${sw.floor}층 기준 보상`, count: 1 });
  }
  // 8) 주간 보스 마일스톤
  const wb = weeklyBossInfo(state, now);
  if (wb.readyCount > 0) {
    items.push({ id: 'weeklyBoss', icon: '🏆', label: '주간 보스 보상', detail: `${wb.readyCount}단계 수령 가능`, count: wb.readyCount });
  }
  // 9) 주간 거대 레이드 페이즈 보상
  const rd = raidStatus(state, battleStats, now);
  if (rd.readyCount > 0) {
    items.push({ id: 'raidPhase', icon: '🐉', label: '거대 레이드 페이즈', detail: `${rd.readyCount}개 상자`, count: rd.readyCount });
  }
  // 10) 순차 미션 완료
  const q = currentQuest(state);
  if (q && questProgress(state, q.id).done) {
    items.push({ id: 'quest', icon: '🎯', label: `미션 완료 · ${q.title}`, detail: '즉시 수령 가능', count: 1 });
  }
  // 11) v8.5.0 일일 영지 배당 (S70+ 부동산 초월석·훈장·보석 배당)
  const dv = estateDividendInfo(state, now);
  if (dv.canClaim && dv.cur) {
    items.push({
      id: 'dividend',
      icon: dv.cur.icon,
      label: `일일 영지 배당 · ${dv.cur.name}`,
      detail: `✨${dv.cur.points}P 💎${dv.cur.shards}${dv.cur.medals ? ` 🏅${dv.cur.medals}` : ''}${dv.cur.gemLv ? ` 💠Lv.${dv.cur.gemLv}` : ''}`,
      count: 1,
    });
  }
  // 12) v8.5.0 월간 시즌 도전 완료
  const sc = seasonChallengeStatus(state, now);
  if (sc.readyCount > 0) {
    items.push({ id: 'season', icon: '🏆', label: `월간 시즌 도전 (${sc.month})`, detail: `${sc.readyCount}개 달성`, count: sc.readyCount });
  }

  // 바로 출격할 수 있는 주요 콘텐츠 알림
  const inv = invasionStatus(state, now);
  if (inv.hasLand && inv.available) {
    alerts.push({ id: 'invasion', icon: '🚨', label: `${inv.city.name} 침공 경보`, action: 'invasion' });
  }
  if (!rd.defeated && rd.leftTickets > 0) {
    alerts.push({ id: 'raidAttack', icon: '🐉', label: `거대 레이드 출격 (${rd.leftTickets}회 남음)`, action: 'raid-attack' });
  }
  const rf = riftStatus(state, now);
  if (rf.ready && (state.totalKills || 0) > 0) {
    alerts.push({ id: 'rift', icon: '🌀', label: '무한 균열 입장 가능', action: 'rift-start' });
  }

  const totalClaimable = items.reduce((a, x) => a + x.count, 0);
  return { totalClaimable, totalAlerts: alerts.length, items, alerts };
}

/** ⚡ 원탭 일괄 수령 — 즉시 수령 가능한 모든 보상을 한 번에 정리 */
export function claimAllReady(state, battleStats = null, now = Date.now(), rng = Math.random) {
  if (!state) return { ok: false, count: 0, claimed: [], reason: '상태 정보가 없습니다.' };
  const g0 = Math.floor(Number(state.gold) || 0);
  const s0 = Math.floor(Number(state.shards) || 0);
  const p0 = Math.floor(Number(state.rebirth && state.rebirth.points) || 0);
  const m0 = Math.floor(Number(state.invasion && state.invasion.medals) || 0);
  const claimed = [];
  let count = 0;

  // 1) 임대수익
  const pf = portfolioOf(state, now);
  if (pf.accruedRent >= 1) {
    const r = claimRent(state, now);
    if (r && r.claimed > 0) { claimed.push('💰 임대수익'); count += 1; }
  }
  // 2) 만기 예금
  const bk = bankStatus(state, now);
  for (const sl of bk.slots) {
    if (!sl.ready) continue;
    const r = claimDeposit(state, sl.id, now);
    if (r.ok) { claimed.push('🏦 만기 예금'); count += 1; }
  }
  // 3) 영지 파견
  const ex = expeditionStatus(state, now);
  if (ex.readyCount > 0) {
    const r = claimAllExpeditions(state, now, rng);
    if (r.ok && r.count > 0) { claimed.push(`🧭 영지 파견 ${r.count}팀`); count += r.count; }
  }
  // 4) 7일 출석
  if (attendanceInfo(state, now).canClaim) {
    const r = claimAttendance(state, now, rng);
    if (r.ok) { claimed.push(`🗓️ 출석 ${r.day}일차`); count += 1; }
  }
  // 5) 일일 퀘스트 + 올클리어
  const dq = dailyQuestStatus(state, now);
  let dqCnt = 0;
  for (const it of dq.items) {
    if (it.claimable) {
      const r = claimDailyQuest(state, it.id, now);
      if (r.ok) { dqCnt += 1; count += 1; }
    }
  }
  if (dailyQuestStatus(state, now).bonusReady) {
    const rb = claimDailyQuestBonus(state, now);
    if (rb.ok) { dqCnt += 1; count += 1; }
  }
  if (dqCnt > 0) claimed.push(`📅 일일 퀘스트 ${dqCnt}건`);
  // 6) 영지 성장 패스
  if (passInfo(state, now).readyCount > 0) {
    const r = claimAllPassTiers(state, now, rng);
    if (r.ok && r.count > 0) { claimed.push(`🎖️ 성장 패스 ${r.count}단계`); count += r.count; }
  }
  // 7) 도전의 탑 일일 소탕
  if (towerSweepInfo(state, now).available) {
    const r = towerSweepClaim(state, now);
    if (r.ok) { claimed.push('🗼 탑 일일 소탕'); count += 1; }
  }
  // 8) 주간 보스 마일스톤
  const wb = weeklyBossInfo(state, now);
  let wbCnt = 0;
  for (const m of wb.milestones) {
    if (m.claimable) {
      const r = claimWeeklyMilestone(state, m.idx, now, rng);
      if (r.ok) { wbCnt += 1; count += 1; }
    }
  }
  if (wbCnt > 0) claimed.push(`🏆 주간 보스 ${wbCnt}건`);
  // 9) 거대 레이드 페이즈
  const rd = raidStatus(state, battleStats, now);
  let rdCnt = 0;
  for (const ph of rd.phases) {
    if (ph.claimable) {
      const r = claimRaidPhase(state, ph.idx, now, rng);
      if (r.ok) { rdCnt += 1; count += 1; }
    }
  }
  if (rdCnt > 0) claimed.push(`🐉 거대 레이드 ${rdCnt}건`);
  // 10) 순차 미션 (연속 완료 시 최대 5건)
  let qCnt = 0;
  for (let i = 0; i < 5; i++) {
    const q = currentQuest(state);
    if (!q || !questProgress(state, q.id).done) break;
    const r = claimQuest(state, q.id);
    if (!r.ok) break;
    qCnt += 1; count += 1;
  }
  if (qCnt > 0) claimed.push(`🎯 미션 ${qCnt}건`);
  // 11) v8.5.0 일일 영지 배당
  if (estateDividendInfo(state, now).canClaim) {
    const r = claimEstateDividend(state, now, rng);
    if (r.ok) { claimed.push(`${r.tier.icon} 영지 배당`); count += 1; }
  }
  // 12) v8.5.0 월간 시즌 도전
  if (seasonChallengeStatus(state, now).readyCount > 0) {
    const r = claimSeasonChallenges(state, now);
    if (r.ok && r.count > 0) { claimed.push(`🏆 시즌 도전 ${r.count}건`); count += r.count; }
  }

  if (count === 0) return { ok: false, count: 0, claimed: [], reason: '지금 수령할 수 있는 보상이 없습니다.' };
  return {
    ok: true,
    count,
    claimed,
    goldDelta: Math.max(0, Math.floor(Number(state.gold) || 0) - g0),
    shardsDelta: Math.max(0, Math.floor(Number(state.shards) || 0) - s0),
    pointsDelta: Math.max(0, Math.floor(Number(state.rebirth && state.rebirth.points) || 0) - p0),
    medalsDelta: Math.max(0, Math.floor(Number(state.invasion && state.invasion.medals) || 0) - m0),
  };
}
