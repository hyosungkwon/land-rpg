// land-rpg / src/firebase.js
// korea-land-4e0c2 프로젝트 연동 (korea-land-site/js/firebase.js 와 동일한 설정).
// - Google 로그인 + RTDB 읽기(users/{uid}/state, pending_income/{nickname}, rankings)
// - RPG 저장은 rpg/{uid} 에 시도하고, 보안 규칙 미반영으로 거부되면 localStorage 모드로 폴백.
// - 부동산 매수/매도·임대수익 수령은 users/{uid}/state **전체 트랜잭션**으로 처리해
//   다른 필드(achievements, dm, bank, jobs …)를 한 개도 잃지 않는다. (preserve)
// - 골드→현금 환전은 users/{uid}/state/cash 트랜잭션(원자적).
import { applyTrade, portfolioOf } from './land.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.8.0';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBuNpR-J_BrDQ0-kzG239QAY6IbqG6huz4',
  authDomain: 'korea-land-4e0c2.firebaseapp.com',
  projectId: 'korea-land-4e0c2',
  databaseURL: 'https://korea-land-4e0c2-default-rtdb.firebaseio.com',
  storageBucket: 'korea-land-4e0c2.firebasestorage.app',
  messagingSenderId: '517153683752',
  appId: '1:517153683752:web:936cbe6020d643329cb81d',
};

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label || 'timeout'} 시간 초과`)), ms)),
  ]);
}

export class Cloud {
  constructor() {
    this.status = 'guest'; // guest | loading | sync | local | offline | error
    this.message = '';
    this.user = null;
    this.uid = null;
    this.app = null;
    this.db = null;
    this.auth = null;
    this.f = null; // firebase 함수 묶음
    this.writable = null; // rpg/{uid} 쓰기 가능 여부
    this.prop = null; // 최신 users/{uid}/state
    this.nickname = '';
    this.rankings = [];
    this.rpgRankings = [];
    this.lastSync = 0;
    this.lastError = null;
    this.lastRpg = null;
    this.listeners = new Set();
    this._unsub = null;
    this.saveTimer = null;
    this._preload = null; // SDK 선로딩 promise (탭 즉시 팝업을 열기 위함)
    this._signingIn = false;
    this._handledUid = '';
    this._handledAt = 0;
  }

  get ready() {
    return !!this.f;
  }

  onStatus(fn) {
    this.listeners.add(fn);
    fn(this.statusInfo());
    return () => this.listeners.delete(fn);
  }

  setStatus(status, message = '') {
    this.status = status;
    this.message = message;
    const info = this.statusInfo();
    this.listeners.forEach((fn) => {
      try { fn(info); } catch (e) { /* ignore */ }
    });
  }

  statusInfo() {
    const map = {
      guest: { kind: 'guest', label: '로컬 저장', detail: '로그인하면 부동산과 연동됩니다' },
      loading: { kind: 'loading', label: '연동 확인 중', detail: 'Firebase 연결 중…' },
      sync: { kind: 'sync', label: 'Firebase 동기화됨', detail: 'rpg/' + (this.uid || '') + ' 저장 중' },
      local: { kind: 'local', label: '로컬 테스트 모드', detail: 'rpg 쓰기 권한 없음 · localStorage 저장' },
      offline: { kind: 'offline', label: '오프라인', detail: 'localStorage 로 계속 플레이' },
      error: { kind: 'error', label: '연동 오류', detail: this.message || '로컬로 계속 플레이' },
    };
    const st = map[this.status] || map.guest;
    return { ...st, status: this.status, uid: this.uid, nickname: this.nickname, signedIn: !!this.user };
  }

  get signedIn() {
    return !!this.user;
  }

  /**
   * SDK 를 미리 받아 둔다.
   * 로그인 버튼 탭 → signIn() 이 loadSdk() 를 await 하면 user gesture 가 끊겨
   * 모바일(삼성 인터넷 등)에서 팝업이 차단된다. 그래서 부팅 시점에 미리 받아 두고,
   * 탭 순간에는 await 없이 곧바로 signInWithPopup 을 호출한다.
   */
  prefetch() {
    if (this.f) return Promise.resolve(this.f);
    if (!this._preload) {
      this._preload = this.loadSdk().catch((e) => {
        this._preload = null; // 실패하면 다음 호출에서 다시 시도
        throw e;
      });
    }
    return this._preload;
  }

  async loadSdk() {
    if (this.f) return this.f;
    const [appMod, dbMod, authMod] = await withTimeout(
      Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-database.js`),
        import(`${SDK}/firebase-auth.js`),
      ]),
      12000,
      'Firebase SDK',
    );
    this.app = appMod.initializeApp(FIREBASE_CONFIG);
    this.db = dbMod.getDatabase(this.app);
    this.auth = authMod.getAuth(this.app);
    this.f = { ...dbMod, ...authMod };
    return this.f;
  }

  /**
   * 'loading' 에 갇히지 않도록 지금까지 확인된 정보로 상태를 확정한다.
   * (모바일에서 '연동 확인 중' 이 영구히 남던 문제의 방어선)
   */
  settleStatus(detail = '') {
    if (this.status !== 'loading') return this.statusInfo();
    if (this.user) {
      const local = this.writable === false;
      this.setStatus(local ? 'local' : 'sync', detail || (local ? 'rpg 쓰기 권한이 없어 로컬 저장' : ''));
    } else {
      this.setStatus('guest', detail);
    }
    return this.statusInfo();
  }

  /**
   * 앱 시작 시 1회 호출. 실패해도 예외를 던지지 않고 상태만 바꾼다.
   * 어떤 경우에도 5초 안에 'loading' 에서 벗어난다(무한 '연동 확인 중' 방지).
   */
  async init() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('offline', '네트워크 없음');
      return this.statusInfo();
    }
    this.setStatus('loading');
    const watchdog = setTimeout(() => this.settleStatus('연결 확인 시간 초과'), 5000);
    try {
      const f = await withTimeout(this.prefetch(), 5000, 'Firebase SDK');
      // 리다이렉트로 돌아온 경우가 있으면 안전하게 처리한다(없으면 조용히 지나간다).
      this.checkRedirectResult().catch(() => null);
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        f.onAuthStateChanged(this.auth, (user) => {
          // 세션이 복원되면 부동산/RPG 데이터를 읽는다. 읽기가 늦어도 상태는
          // handleUser 내부의 watchdog 이 먼저 확정하므로 init() 을 붙잡지 않는다.
          if (user) {
            this.handleUser(user).catch((e) => {
              this.lastError = String(e && e.message ? e.message : e);
              this.settleStatus();
            });
          } else {
            this.setStatus('guest');
          }
          finish();
        });
        setTimeout(finish, 4000);
      });
    } catch (e) {
      this.lastError = String(e && e.message ? e.message : e);
      const off = typeof navigator !== 'undefined' && navigator.onLine === false;
      this.setStatus(off ? 'offline' : 'error', off ? '네트워크 없음' : 'Firebase SDK를 불러오지 못했습니다');
    } finally {
      clearTimeout(watchdog);
    }
    return this.settleStatus();
  }

  /** 로그인에 실패했을 때 되돌릴 상태(로그인 전 상태로 복귀) */
  _restoreStatus() {
    if (this.user) this.setStatus(this.writable === false ? 'local' : 'sync', this.writable === false ? 'rpg 쓰기 권한이 없어 로컬 저장' : '');
    else this.setStatus('guest');
  }

  /**
   * 로그인 버튼 탭에서 곧바로 호출된다.
   * - SDK 는 prefetch 되어 있어 await 없이 popup 을 연다(user gesture 유지).
   * - 45초 타임아웃: 응답이 없어도 '연동 확인 중' 에 갇히지 않는다.
   * - 자동 signInWithRedirect 는 하지 않는다(교차 도메인 3rd-party 쿠키 차단 시 무한 루프).
   *   리다이렉트는 사용자가 안내 창에서 명시적으로 고를 때만 signInRedirect() 로 시도한다.
   */
  async signIn() {
    if (this._signingIn) return { ok: false, reason: 'busy', message: '이미 로그인 창을 여는 중입니다.' };
    this._signingIn = true;
    try {
      let f = this.f;
      if (!f) {
        this.setStatus('loading', '로그인 준비 중…');
        try {
          f = await withTimeout(this.prefetch(), 8000, 'Firebase SDK');
        } catch (e) {
          this.lastError = String(e && e.message ? e.message : e);
          this._restoreStatus();
          return { ok: false, reason: 'sdk', message: 'Firebase 연결에 실패했습니다. 네트워크를 확인해 주세요.' };
        }
      }

      this.setStatus('loading', '구글 로그인 중…');
      let result;
      try {
        result = await withTimeout(
          f.signInWithPopup(this.auth, new f.GoogleAuthProvider()),
          45000,
          '구글 로그인',
        );
      } catch (e) {
        const code = String((e && (e.code || e.message)) || e);
        this.lastError = code;
        this._restoreStatus();
        if (/popup-closed-by-user|cancelled-popup-request|popup_closed|cancelled/i.test(code)) {
          return { ok: false, reason: 'cancelled', message: '로그인 창을 닫았습니다.' };
        }
        if (/popup-blocked|popup_blocked/i.test(code)) {
          return { ok: false, reason: 'popup-blocked', message: '브라우저가 로그인 창(팝업)을 차단했습니다.' };
        }
        if (/operation-not-supported|operation_not_supported|disallowed_useragent|in-app|web-storage-unsupported/i.test(code)) {
          return { ok: false, reason: 'unsupported', message: '이 브라우저에서는 팝업 로그인을 지원하지 않습니다.' };
        }
        if (/unauthorized-domain|invalid-api-key|configuration/i.test(code)) {
          return { ok: false, reason: 'config', message: '로그인 설정에 문제가 있습니다(도메인 미승인).' };
        }
        if (/시간 초과|timeout|network/i.test(code)) {
          return { ok: false, reason: 'timeout', message: '로그인 응답이 45초 동안 없었습니다.' };
        }
        return { ok: false, reason: code, message: '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
      }

      if (!result || !result.user) {
        this._restoreStatus();
        return { ok: false, reason: 'no-user', message: '로그인 정보를 받지 못했습니다.' };
      }
      await this.handleUser(result.user);
      return { ok: true, user: this.user };
    } finally {
      this._signingIn = false;
    }
  }

  /** 팝업을 쓸 수 없을 때 사용자가 '같은 창에서 계속' 을 고르면 호출된다. */
  async signInRedirect() {
    try {
      const f = await withTimeout(this.prefetch(), 8000, 'Firebase SDK');
      this.setStatus('loading', '구글 로그인으로 이동 중…');
      await f.signInWithRedirect(this.auth, new f.GoogleAuthProvider());
      return { ok: true, redirect: true };
    } catch (e) {
      this.lastError = String((e && (e.code || e.message)) || e);
      this._restoreStatus();
      return { ok: false, reason: this.lastError };
    }
  }

  /**
   * 리다이렉트 복귀 처리. 대기 중인 결과가 없으면(대부분) 아무 일도 하지 않는다.
   * 실패해도 상태를 건드리지 않는다 — 로그아웃 상태로 조용히 남는다.
   */
  async checkRedirectResult() {
    try {
      const f = await withTimeout(this.prefetch(), 8000, 'Firebase SDK');
      if (typeof f.getRedirectResult !== 'function') return null;
      const r = await withTimeout(f.getRedirectResult(this.auth), 10000, 'redirect');
      if (r && r.user) {
        await this.handleUser(r.user);
        return this.user;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async signOut() {
    try {
      const f = await this.loadSdk();
      await f.signOut(this.auth);
    } catch (e) { /* ignore */ }
    this.user = null;
    this.uid = null;
    this.writable = null;
    this.prop = null;
    this.lastRpg = null;
    this._handledUid = '';
    this.setStatus('guest');
  }

  async handleUser(user) {
    await this.prefetch();
    // 같은 사용자로 중복 호출(세션 복원 + 리다이렉트 결과) 시 데이터를 두 번 읽지 않는다.
    if (user.uid === this._handledUid && Date.now() - this._handledAt < 5000) return this.lastRpg;
    this._handledUid = user.uid;
    this._handledAt = Date.now();
    this.user = user;
    this.uid = user.uid;
    this.nickname = (user.displayName || '').replace(/\s+/g, '').slice(0, 8) || '플레이어';
    this.setStatus('loading', '부동산 데이터 확인 중…');
    // 두 읽기는 서로 독립이므로 병렬로 보내고, 늦어지면 상태를 먼저 확정한다.
    const watchdog = setTimeout(() => this.settleStatus('데이터 응답 지연'), 4500);
    try {
      const [, cloud] = await Promise.all([this.refreshProperty(), this.loadRpg()]);
      this.lastRpg = cloud;
    } catch (e) {
      this.lastError = String(e && (e.code || e.message));
    } finally {
      clearTimeout(watchdog);
    }
    const local = this.writable === false;
    this.setStatus(local ? 'local' : 'sync', local ? 'rpg 쓰기 권한이 없어 로컬 저장' : '');
    this.loadRankings().catch(() => {});
    return this.lastRpg;
  }

  /** users/{uid}/state + pending_income/{nickname} 읽기 */
  async refreshProperty() {
    if (!this.user) return null;
    const f = this.f || (await this.loadSdk());
    try {
      const snap = await withTimeout(f.get(f.ref(this.db, `users/${this.uid}/state`)), 8000, 'users/state');
      const val = snap && snap.exists() ? snap.val() : null;
      let pending = 0;
      const nick = val && val.nickname;
      if (nick) {
        try {
          const pSnap = await f.get(f.ref(this.db, `pending_income/${nick}`));
          if (pSnap && pSnap.exists()) pending = Number(pSnap.val()) || 0;
        } catch (e) { pending = 0; }
      }
      this.prop = val ? { ...val, _pendingIncome: pending } : null;
      return this.prop;
    } catch (e) {
      this.lastError = String(e && (e.code || e.message));
      return this.prop;
    }
  }

  /** rpg/{uid} 읽기 (규칙 적용 전이면 거부 → null) */
  async loadRpg() {
    if (!this.user) return null;
    const f = this.f || (await this.loadSdk());
    try {
      const snap = await withTimeout(f.get(f.ref(this.db, `rpg/${this.uid}`)), 8000, 'rpg read');
      if (snap && snap.exists()) {
        this.writable = true;
        return snap.val();
      }
      this.writable = true; // 읽기는 됐지만 데이터 없음 → 쓰기 시도 가능
      return null;
    } catch (e) {
      this.writable = false;
      this.lastError = String(e && (e.code || e.message));
      return null;
    }
  }

  /** rpg/{uid} 저장. 실패하면 writable=false 로 내려가 로컬 모드 유지 */
  async saveRpg(payload) {
    if (!this.user) {
      this.setStatus('guest');
      return { ok: false, reason: '로그인 안 됨' };
    }
    const f = this.f || (await this.loadSdk());
    try {
      await f.set(f.ref(this.db, `rpg/${this.uid}`), payload);
      this.writable = true;
      this.lastSync = Date.now();
      if (this.status !== 'sync') this.setStatus('sync');
      return { ok: true };
    } catch (e) {
      this.writable = false;
      this.lastError = String(e && (e.code || e.message));
      this.setStatus('local', 'rpg 쓰기 권한 없음 (규칙 미반영)');
      return { ok: false, reason: 'rules', error: this.lastError };
    }
  }

  /**
   * users/{uid}/state 전체를 대상으로 하는 안전한 부분 변경.
   * mutator(curState) 는 새 state 를 반환해야 하며, 기존 필드를 모두 복사해 두어야 한다.
   * (전체 set 이 아니라 트랜잭션이므로 동시에 들어온 다른 변경도 보존된다)
   */
  async mutateState(mutator, fallback = null) {
    if (!this.user) return { ok: false, reason: 'login' };
    const f = this.f || (await this.loadSdk());
    let reason = '';
    try {
      const r = await withTimeout(
        f.runTransaction(f.ref(this.db, `users/${this.uid}/state`), (cur) => {
          // 로컬 캐시가 비어 있으면 cur=null 로 먼저 호출된다. 서버 값이 따로 있으면
          // Firebase 가 서버 값으로 한 번 더 호출하므로, 마지막으로 읽은 사본을 기본값으로 쓴다.
          const hasCur = cur && typeof cur === 'object' && Object.keys(cur).length > 0;
          const base = hasCur ? cur : fallback;
          if (!base || typeof base !== 'object') {
            reason = reason || '부동산 데이터를 읽지 못했습니다.';
            return undefined; // 중단
          }
          const out = mutator(base);
          if (!out || typeof out !== 'object') {
            reason = reason || '변경 내용이 없습니다.';
            return undefined; // 중단
          }
          return out;
        }),
        12000,
        'state transaction',
      );
      const val = r && r.snapshot ? r.snapshot.val() : null;
      if (val) this.setPropertyState(val);
      return { ok: true, state: val };
    } catch (e) {
      this.lastError = String(e && (e.code || e.message));
      return { ok: false, reason: reason || 'rules', error: this.lastError };
    }
  }

  /** 트랜잭션 fallback 용: 로컬 전용 필드(_pendingIncome)를 뺀 state 사본 */
  propSnapshot() {
    if (!this.prop) return null;
    const { _pendingIncome, ...rest } = this.prop; // eslint-disable-line no-unused-vars
    return rest;
  }

  /** 트랜잭션 결과 state 를 로컬 사본에 반영 (pending income 유지) */
  setPropertyState(val) {
    const pending = this.prop && this.prop._pendingIncome ? this.prop._pendingIncome : 0;
    this.prop = val ? { ...val, _pendingIncome: pending } : null;
  }

  /** 부동산 매수/매도 — 표시 가격이 아니라 트랜잭션 시점의 최신 상태로 검증한다. */
  async tradeLand(key, side, qty) {
    if (!this.user) return { ok: false, reason: 'login' };
    const f = this.f || (await this.loadSdk());
    // 트랜잭션은 로컬 캐시를 기준으로 시작하므로, 먼저 최신 state 를 읽어 둔다.
    if (!this.prop) await this.refreshProperty();
    const fallback = this.prop ? this.propSnapshot() : null;
    let applied = null;
    try {
      const r = await withTimeout(
        f.runTransaction(f.ref(this.db, `users/${this.uid}/state`), (cur) => {
          const hasCur = cur && typeof cur === 'object' && Object.keys(cur).length > 0;
          const base = hasCur ? cur : fallback;
          if (!base) {
            applied = { ok: false, reason: '부동산 데이터를 읽지 못했습니다. 새로고침 후 다시 시도해 주세요.' };
            return undefined;
          }
          const out = applyTrade(base, key, side, qty, Date.now());
          applied = out;
          if (!out.ok) return undefined; // 잔여 공급/현금 부족 → 중단
          return out.state;
        }),
        12000,
        'land trade',
      );
      const val = r && r.snapshot ? r.snapshot.val() : null;
      if (val) this.setPropertyState(val);
      if (!applied || !applied.ok) return { ok: false, reason: (applied && applied.reason) || '거래가 취소되었습니다.' };
      return { ok: true, quote: applied.quote, state: val };
    } catch (e) {
      this.lastError = String(e && (e.code || e.message));
      return { ok: false, reason: (applied && applied.reason) || 'rules', error: this.lastError };
    }
  }

  /** 미수령 임대수익 → 부동산 현금 (전체 state 트랜잭션) */
  async claimRent(amount) {
    const amt = Math.floor(Number(amount) || 0);
    if (!this.user) return { ok: false, reason: 'login' };
    if (amt <= 0) return { ok: false, reason: '수령할 수익이 없습니다.' };
    if (!this.prop) await this.refreshProperty();
    const r = await this.mutateState((cur) => {
      const next = { ...cur };
      next.cash = (Number(cur.cash) || 0) + amt;
      const p = portfolioOf(next, Date.now());
      next.bestAsset = Math.max(Number(cur.bestAsset) || 0, Math.floor(p.totalAsset));
      return next;
    }, this.propSnapshot());
    if (!r.ok) return { ok: false, reason: r.reason === 'login' ? 'login' : '거래를 반영하지 못했습니다.', error: r.error };
    return { ok: true, cash: Number((r.state || {}).cash) || 0 };
  }

  /** 새 Google 계정용 부동산 초기 상태 생성 (원작 game.js 의 초기 state 와 같은 스키마) */
  async createPropertyAccount() {
    if (!this.user) return { ok: false, reason: 'login' };
    const f = this.f || (await this.loadSdk());
    const ref = f.ref(this.db, `users/${this.uid}/state`);
    // 이미 기록이 있으면 절대 만들지 않는다(다른 기기의 진행 보호)
    try {
      const snap = await f.get(ref);
      if (snap && snap.exists()) {
        await this.refreshProperty();
        return { ok: false, reason: '이미 부동산 기록이 있습니다.' };
      }
    } catch (e) {
      return { ok: false, reason: 'rules', error: String(e && (e.code || e.message)) };
    }
    const now = Date.now();
    const nickname = this.nickname || '플레이어';
    const initial = {
      nickname,
      cash: 500000,
      version: 3,
      owned: {},
      totalCost: {},
      buildings: {},
      jobs: {},
      upgrades: {},
      bank: { deposits: [], loans: [] },
      bestAsset: 500000,
      tutorialFinished: false,
      globalOwned: {},
      globalTotalCost: {},
      achievements: {},
      tradeCount: 0,
      depCount: 0,
      loanCount: 0,
      listingCount: 0,
      bidCount: 0,
      bestRank: 999,
      assetHistory: [{ t: now, v: 500000 }],
      activeTitle: null,
      krTax: 0,
      globalTax: {},
      landmarks: {},
      lotteryTickets: 0,
      myCompanyId: null,
      stockHoldings: {},
      stockHoldingCost: {},
      totalPlayMinutes: 0,
      stockOrderCount: 0,
      createdAt: now,
    };
    let created = false;
    try {
      const r = await withTimeout(
        f.runTransaction(ref, (cur) => {
          if (cur && typeof cur === 'object' && Object.keys(cur).length) {
            created = false; // 서버에 이미 기록이 있음 → 낙관적 쓰기 취소
            return undefined;
          }
          created = true;
          return initial;
        }),
        12000,
        'create state',
      );
      if (!created) return { ok: false, reason: '이미 부동산 기록이 있습니다.' };
      const val = r && r.snapshot ? r.snapshot.val() : initial;
      this.setPropertyState(val);
      return { ok: true, state: val };
    } catch (e) {
      return { ok: false, reason: 'rules', error: String(e && (e.code || e.message)) };
    }
  }

  /** 골드 → 부동산 현금. users/{uid}/state/cash 원자적 증가 */
  async addCash(cash) {
    if (!this.user) return { ok: false, reason: 'login' };
    const f = this.f || (await this.loadSdk());
    try {
      const r = await withTimeout(
        f.runTransaction(f.ref(this.db, `users/${this.uid}/state/cash`), (cur) => (Number(cur) || 0) + cash),
        10000,
        'cash transaction',
      );
      const newVal = r && r.snapshot ? Number(r.snapshot.val()) || 0 : null;
      if (this.prop) this.prop.cash = newVal === null ? (Number(this.prop.cash) || 0) + cash : newVal;
      return { ok: true, cash: newVal, snapshot: r && r.snapshot ? r.snapshot : null };
    } catch (e) {
      this.lastError = String(e && (e.code || e.message));
      return { ok: false, reason: 'rules', error: this.lastError };
    }
  }

  async loadRankings() {
    if (!this.db) return [];
    const f = this.f;
    try {
      const snap = await withTimeout(f.get(f.ref(this.db, 'rankings')), 8000, 'rankings');
      const data = snap && snap.exists() ? snap.val() : {};
      this.rankings = Object.values(data || {})
        .filter((r) => r && r.name)
        .sort((a, b) => (b.asset || 0) - (a.asset || 0))
        .slice(0, 20);
    } catch (e) { /* 무시 */ }
    try {
      const snap2 = await f.get(f.ref(this.db, 'rpg_rankings'));
      const data2 = snap2 && snap2.exists() ? snap2.val() : {};
      this.rpgRankings = Object.values(data2 || {})
        .filter((r) => r && r.name)
        .sort((a, b) => (b.stage || 0) - (a.stage || 0) || (b.level || 0) - (a.level || 0))
        .slice(0, 20);
    } catch (e) { this.rpgRankings = []; }
    return this.rankings;
  }

  /** rpg_rankings/{uid} 갱신 시도 (규칙 없으면 조용히 실패) */
  async publishRanking(s) {
    if (!this.user) return;
    const f = this.f || (await this.loadSdk());
    try {
      await f.set(f.ref(this.db, `rpg_rankings/${this.uid}`), {
        name: this.prop?.nickname || this.nickname || s.nickname || '플레이어',
        uid: this.uid,
        stage: s.maxStage,
        level: s.level,
        kills: s.totalKills,
        time: Date.now(),
      });
    } catch (e) { /* 규칙 미반영 */ }
  }
}

export const CLOUD = new Cloud();

// 모듈이 로드되는 즉시(Firebase 초기화 타이머를 기다리지 않고) SDK 선로딩을 시작한다.
// → 로그인 버튼 탭 순간에 await 없이 signInWithPopup 을 호출할 수 있다.
if (typeof window !== 'undefined') {
  try { CLOUD.prefetch().catch(() => {}); } catch (e) { /* ignore */ }
}
