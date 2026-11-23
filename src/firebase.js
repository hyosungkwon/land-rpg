// land-rpg / src/firebase.js
// korea-land-4e0c2 프로젝트 연동 (korea-land-site/js/firebase.js 와 동일한 설정).
// - Google 로그인 + RTDB 읽기(users/{uid}/state, pending_income/{nickname}, rankings)
// - RPG 저장은 rpg/{uid} 에 시도하고, 보안 규칙 미반영으로 거부되면 localStorage 모드로 폴백.
// - 골드→현금 환전은 users/{uid}/state/cash 트랜잭션(원자적).

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
    this.listeners = new Set();
    this._unsub = null;
    this.saveTimer = null;
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

  /** 앱 시작 시 1회 호출. 실패해도 예외를 던지지 않고 상태만 바꾼다. */
  async init() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('offline', '네트워크 없음');
      return this.statusInfo();
    }
    this.setStatus('loading');
    try {
      const f = await this.loadSdk();
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        f.onAuthStateChanged(this.auth, async (user) => {
          finish();
          if (user) await this.handleUser(user);
          else this.setStatus('guest');
        });
        setTimeout(finish, 4000);
      });
    } catch (e) {
      this.lastError = String(e && e.message ? e.message : e);
      const off = typeof navigator !== 'undefined' && navigator.onLine === false;
      this.setStatus(off ? 'offline' : 'error', off ? '네트워크 없음' : 'Firebase SDK를 불러오지 못했습니다');
    }
    return this.statusInfo();
  }

  async signIn() {
    try {
      const f = await this.loadSdk();
      this.setStatus('loading', '구글 로그인 중…');
      let result;
      try {
        result = await f.signInWithPopup(this.auth, new f.GoogleAuthProvider());
      } catch (e) {
        // 팝업 차단/인앱 브라우저 → 리다이렉트 시도
        if (e && /popup|blocked|cancelled|closed/i.test(String(e.code || e.message))) {
          await f.signInWithRedirect(this.auth, new f.GoogleAuthProvider());
          return { ok: true, redirect: true };
        }
        throw e;
      }
      await this.handleUser(result.user);
      return { ok: true, user: this.user };
    } catch (e) {
      this.lastError = String((e && (e.code || e.message)) || e);
      this.setStatus(this.signedIn ? 'local' : 'guest', '로그인 실패');
      return { ok: false, reason: this.lastError };
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
    this.setStatus('guest');
  }

  async handleUser(user) {
    const f = await this.loadSdk();
    this.user = user;
    this.uid = user.uid;
    this.nickname = (user.displayName || '').replace(/\s+/g, '').slice(0, 8) || '플레이어';
    this.setStatus('loading', '부동산 데이터 확인 중…');
    await this.refreshProperty();
    const cloud = await this.loadRpg();
    this.lastRpg = cloud;
    this.setStatus(this.writable ? 'sync' : 'local', this.writable ? '' : 'rpg 쓰기 권한이 없어 로컬 저장');
    this.loadRankings().catch(() => {});
    return cloud;
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
      return { ok: true, cash: newVal };
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
