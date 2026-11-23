# ⚔️ 영지 RPG — 모바일 세로형 방치형 RPG + 부동산 게임 통합 (v2.1)

`survival-in-korea` 의 Firebase(부동산 거래소 `korea-land-4e0c2`)를 결합한 **모바일 세로형 PWA** 입니다.

**v2.1 (2026-11-23)**: **Google 로그인 1회**로 RPG(`rpg/{uid}`)와 부동산 게임(`users/{uid}/state`)이 동시에 연결됩니다.
부동산 탭이 단순 연계를 넘어 **실제 korea-land 플레이**(전국 229개 시군구 매물 시세·매수/매도·임대수익 수령)를
할 수 있는 3개 서브탭 `[🏠 내 부동산 | 🛒 매물 투자 | ⚡ RPG 연계]` 으로 확장됐고,
부동산 화면을 보는 동안에도 RPG 자동사냥 루프는 멈추지 않습니다.

**v2 (2026-11-23)**: 통일된 SD 2D 판타지 스프라이트로 전면 교체(플레이어 3프레임 + 몬스터 12종 + 보스 7종),
공격 모션·검기·타격 이펙트 추가, 그리고 **"몹이 오면 멈추는" 모바일 프리즈 버그 수정**(아래 9장).

- **라이브**: https://hyosungkwon.github.io/land-rpg/ (GitHub Pages · `main` / root)
- **저장소**: https://github.com/hyosungkwon/land-rpg (Public)
- **Firebase**: `korea-land-4e0c2` — 승인된 도메인 `hyosungkwon.github.io` 추가, RTDB 규칙에 `rpg`·`rpg_rankings` 게시 완료
  (기존 노드 규칙은 그대로 보존)

---

## 1. 실행해 보기

정적 파일만으로 동작합니다(빌드 없음). ES 모듈이라 `file://` 로 열면 동작하지 않으므로 로컬 서버로 엽니다.

```bash
cd land-rpg
python3 -m http.server 8080      # 또는: npx serve .
# 폰과 같은 Wi‑Fi 에서 http://<PC IP>:8080 접속 → Chrome 메뉴 → "홈 화면에 추가"
```

- 안드로이드 Chrome 기준: 주소창 없이 전체 화면(`standalone`), 세로 고정, 하단 안전영역 대응.
- 서비스 워커가 첫 방문 후 앱 셸과 에셋 68개(스프라이트 52 + 아이콘 3 포함)를 캐시하므로 **비행기 모드에서도 실행**됩니다.

---

## 2. 파일 구조

```
land-rpg/
├─ index.html               세로형 앱 셸 (HUD · 캔버스 · 탭 · 모달)
├─ style.css                다크 네이비 + 골드 테마, 100dvh, 터치 최적화
├─ app.js                   부트스트랩 · 메인 루프 · 액션 · 파이어베이스 연결
├─ manifest.json            PWA (standalone/portrait, 192·512·maskable)
├─ sw.js                    오프라인 캐시 (앱 셸 + 스프라이트, Firebase 요청은 통과)
├─ database.rules.json      RTDB 규칙 초안 (rpg/$uid, rpg_rankings 추가)
├─ package.json             로컬 검증용(node) 설정 — 배포와 무관
├─ icons/                   icon-192 · icon-512 · icon-maskable-512
├─ assets/
│  ├─ sprites/
│  │  ├─ hero_idle.png       플레이어 대기 (대검 내려놓은 자세)
│  │  ├─ hero_attack.png     플레이어 공격 (전진 베기 + 검기)
│  │  ├─ hero_skill.png      플레이어 스킬 (돌진 + 마력 오라)
│  │  ├─ monster/*.png       일반 몬스터 12종 256px 투명 PNG
│  │  └─ boss/*.png          보스 7종 384px 투명 PNG
│  ├─ char/, monster/, boss/ v1 도트 아트(미사용, 기록용으로 보존)
├─ src/
│  ├─ data.js               밸런스 상수 · 몬스터 도감 · 21스테이지 · 장비/스킬 정의 · 부동산 버프 규칙
│  ├─ state.js              저장/로드 · 파생 스탯 · 강화 · 오프라인 정산 · 환전 한도
│  ├─ combat.js             자동 전투 시뮬레이션(웨이브 → 보스 → 다음 스테이지, 스킬 자동 시전)
│  ├─ render.js             Canvas 렌더러(배경 패럴랙스 · 스프라이트 · 이펙트 · 보스 바)
│  ├─ property.js           부동산 state → 영구 버프 · 배당 환산
│  ├─ land-data.js          (자동 생성) 전국 229개 시군구 초기가·분당 수익·공급·지역 특성
│  ├─ land.js                부동산 게임 엔진: 시세 모델 · 수익/지분 배율 · 매수/매도 · 임대 적립
│  ├─ firebase.js           Google 로그인 · users/{uid}/state 읽기/트랜잭션 · rpg/{uid} 쓰기
│  └─ ui.js                 하단 4탭 · 부동산 서브탭 3종 · HUD · 토스트 · 모달
└─ tools/                   검증 도구 (배포물 아님)
   ├─ prepare_assets.py     원본 PNG → 투명 스프라이트/보스 일러스트 정규화
   ├─ make_icons.py         PWA 아이콘 생성
   ├─ build_land_data.py    korea-land-site/js/game.js 의 TIER 데이터를 src/land-data.js 로 추출
   ├─ land_check.py         부동산 엔진 검증(QuickJS): 데이터·가격·거래·필드 보존·임대수익
   ├─ ui_check.py           부동산 서브탭 3종 템플릿 렌더 검증(게스트/빈 계정/보유 계정)
   ├─ smoke-test.mjs        코어 로직 + 30분 자동 플레이 시뮬레이션
   ├─ app-smoke.mjs         DOM 흉내 위에서 앱 부팅·60초 구동·탭·액션 통합 검증
   ├─ app-offline.mjs       20시간 방치 후 재접속(12시간 상한) 시나리오
   ├─ dom-shim.mjs          위 테스트용 최소 DOM/Canvas 구현
   └─ static-check.mjs      id · data-action · import/export · CSS · PWA 정합성
```

---

## 3. 화면 구성

| 영역 | 내용 |
|---|---|
| 상단 상태줄 | **동기화 배지**(`Firebase 동기화됨` / `로컬 테스트 모드` / `오프라인` / `로컬 저장`) · 💰 골드 · 💎 강화석 |
| 상단 42% 캔버스 | 자동 이동·자동 공격·자동 스킬. 테마별 배경 8종, 스테이지/테마 칩, **👑 보스 버튼**, 처치 게이지 10칸, HP·EXP 바, 우측 퀵 스킬 4개(쿨타임 오버레이) |
| 하단 탭 | ⚔️ **사냥/스킬** · 🎒 **장비/강화** · 🏢 **부동산 연계** · 🏆 **랭킹/설정** |

- **사냥/스킬**: 사냥터 진행도 · 보스 도전 · 자동 보스 토글 · 전투 스탯 6종(공격력/체력/치명타/골드/드롭/공속 + 예상 DPS) · 스킬 4종(즉시 시전·강화) · 전투 기록 로그
- **장비/강화**: 5부위 카드(현재 → 다음 수치), 💎비용, ×10 연속 강화, 부위별 효과표
- **부동산 연계**: 계정 카드 · 건물주 버프 4종(진행 게이지) · 배당→강화석 · 골드→현금 환전(한도/미리보기)
- **랭킹/설정**: 내 기록 · 부동산 자산 랭킹(RTDB `rankings`) · RPG 랭킹(`rpg_rankings`) · 설정/초기화/앱 정보

---

## 4. 코어 루프와 수치

| 항목 | 값 (모두 `src/data.js` 의 `ECON` 에서 조정) |
|---|---|
| 일반 사냥 | 3마리까지 동시 등장, 0.75초 간격 리스폰, 처치 시 골드·EXP·(18%) 강화석 |
| 보스 | **10마리 처치마다** 도전 가능 → 자동 토글 ON 이면 1.4초 뒤 자동 진입, 60초 제한, HP ×9 · 공격 ×1.45 |
| 보스 실패 | 4마리 더 처치하면 재도전 (수동 모드에선 일반 사냥 계속) |
| 스테이지 | 보스 처치 시 +1, 첫 클리어 보너스 💎(10 + 스테이지×2). 22스테이지 이후는 순환하며 난이도만 상승 |
| 사망 | 3초 후 50% 체력 부활(패널티 없음, 방치 친화) |
| 오프라인 | `lastActiveAt` 기준, **최대 12시간**, 초당 0.22킬 × 50% 효율로 골드·EXP·강화석 정산 후 팝업 |
| 장비 | 5부위 × 최대 +50. 실패 없음. 비용 `ceil(2 × 1.105^lv)` 강화석 |
| 스킬 | 강격(5s) / 범위 베기(9s) / 광폭(22s, 7초 +60%) / 회복(16s, 28%). 레벨 1당 효과 +12%, 최대 20 |
| 레벨 | 필요 EXP `60 × 1.16^(Lv-1)`, 레벨업 시 체력 완충 |

**30분 자동 플레이 시뮬레이션 결과** (`node tools/smoke-test.mjs`, 10초마다 자동 강화하는 적극 플레이 가정)

| 경과 | 스테이지 | 레벨 | 공격력 | DPS | 골드 |
|---|---|---|---|---|---|
| 5분 | S6 | 11 | 91 | 163 | 1,245 |
| 10분 | S11 | 17 | 144 | 267 | 3,594 |
| 20분 | S18 | 25 | 213 | 412 | 13,564 |
| 30분 | S18 | 28 | 232 | 454 | 21,518 |

→ 30분에 17회 클리어·보스 24회 도전, 약 2.5만 골드(환전 시 ₩4.3만). 이후는 장비 강화 속도가 진행을 결정합니다.

---

## 5. Firebase 연동 (`korea-land-4e0c2`)

`downloads/korea-land-site/js/firebase.js` 와 **동일한 프로젝트 설정**(apiKey/authDomain/databaseURL 등)을
`src/firebase.js` 에 그대로 사용합니다. SDK 는 10.8.0 gstatic 모듈을 **동적 import** 하므로
오프라인·차단 환경에서도 앱이 뜨고 로컬로 계속 플레이됩니다.

| 방향 | 경로 | 동작 |
|---|---|---|
| 읽기 | `users/{uid}/state` | `nickname`, `cash`, `bestAsset`, `owned`(지역·평수), `pending_income/{nickname}` 을 읽어 표시·버프 계산 |
| 읽기 | `rankings`, `rpg_rankings` | 랭킹 탭 표시(실패 시 안내 문구) |
| 쓰기 | `rpg/{uid}` | 45초마다·화면 이탈 시·스테이지 클리어 시 저장. **거부되면** `writable=false` 로 내려가 `localStorage` 저장 유지 |
| 쓰기 | `users/{uid}/state` (**전체 트랜잭션**) | 매수/매도·임대수익 수령. 받은 state 사본에서 `cash`·`owned`·`totalCost`·`krTax`·`tradeCount`·`assetHistory`·`bestAsset` 만 바꾸고 나머지 필드는 그대로 반환(preserve) |
| 쓰기 | `users/{uid}/state/cash` | 환전 시 `runTransaction` 으로 원자적 증가 |
| 쓰기 | `rpg_rankings/{uid}` | 최고 스테이지 공개(규칙 없으면 조용히 실패) |

### 부동산 → RPG (영구 패시브)

| 버프 | 계산식 | 상한 |
|---|---|---|
| 공격력 | 보유 지역 1곳당 +2% | +40% |
| 골드 획득 | 최고 자산 1억당 +10% | +100% |
| 체력 | 보유 100평당 +5% | +40% |
| 강화석 드롭 | 보유 500평당 +1% | +50% |

- **배당 보너스**: `pending_income/{nickname}` 의 **수령 기록(watermark) 이후 늘어난 금액**만
  ₩30,000 당 💎1(최대 500)로 환산합니다. 원본 배당은 지우지 않아 부동산 앱에서 그대로 수령할 수 있습니다.
- **환전(RPG→부동산)**: **1골드 = ₩2**, 최소 500골드, **1일 ₩200,000 한도**(날짜가 바뀌면 자동 리셋).
  환전은 확인 모달 → `runTransaction` 성공 후에만 골드를 차감합니다(실패 시 골드 보존).

### 부동산 게임 통합 (v2.1)

**Google 로그인 1회** — 상단 HUD 의 배지가 그대로 로그인 버튼입니다. 한 번 누르면 `firebase.auth()` 단일 세션으로
`users/{uid}/state`(부동산)와 `rpg/{uid}`(RPG)를 함께 읽고, 이후 부동산 탭에서 곧바로 플레이할 수 있습니다.
로그인 진입점은 앱 전체에서 이 버튼 하나뿐입니다.

부동산 탭은 3개 서브탭으로 나뉩니다.

| 서브탭 | 내용 |
|---|---|
| 🏠 내 부동산 | 총자산(현금+매물 평가)·보유 지역/면적·시간당 임대수익·**미수령 임대수익 수령**·보유 매물 판매 |
| 🛒 매물 투자 | 전국 229개 시군구 매물 목록(검색·군/시/구/보유 필터·회수 빠른순/가격/급등/이름 정렬), 평단가·등락률·시간 수익·회수 시간·잔여 공급, 매수/매도 모달(수량·총액·거래세·거래 후 현금) |
| ⚡ RPG 연계 | 건물주 버프 게이지, 배당→강화석, 골드→현금 환전, 계정/동기화 상태 |

**데이터** — `downloads/korea-land-site/js/game.js` 의 `TIER`(229개 시군구: 초기가 `p`, 분당 수익 `i`, 최대 공급 `ms`, 지역 특성)를
`tools/build_land_data.py` 가 `src/land-data.js` 로 그대로 추출합니다(수기 입력 없음).

**시세** — 원작 v3 는 싱글모드라 기기마다 시세를 따로 굴리므로 "공유 시세"가 없습니다. 이 앱은 같은 초기가와
같은 규칙(09:00 일일 기준가, 일일 ±30% 밴드, 초기가 30% 하한, 6시간 계절 특성, 성장/테크 특성 변동성 확대)을 쓰되,
**시간 기반 결정론 모델**로 계산해 모든 기기가 같은 순간 같은 가격을 보도록 했습니다(저장할 시세 상태 없음).

**거래** — 원작 `confirmTrade` 와 동일: 거래세 0.01%, 보유 지분 20/40/60/80% 구간별 한계 수익 배율,
부분 매도 시 취득원가 비례 유지. 매수/매도는 `users/{uid}/state` **전체 트랜잭션** 안에서 최신 값으로 재검증합니다.

**임대수익** — 접속 중 100%, 앱을 닫아둔 동안은 원작처럼 5%(최대 12시간) 적립해 RPG 저장소에 함께 보관하고,
수령할 때 `state/cash` 에 반영합니다. 배당 원본(`pending_income`)은 건드리지 않습니다.

**DB 보존** — 원작 앱은 자기 state 를 `set()` 으로 통째로 씁니다. 이 앱은 절대 전체를 덮어쓰지 않고
`runTransaction` 으로 받은 사본에서 아래 필드만 바꿔 돌려줍니다:
`cash`, `owned`, `totalCost`, `krTax`, `tradeCount`, `assetHistory`, `bestAsset`.
`nickname`, `achievements`, `dm`, `bank`, `jobs`, `version`, `lastCollect` 등 나머지는 값 하나도 바뀌지 않습니다(테스트로 확인).

### 폴백 표시

상단 배지가 상태를 그대로 말합니다(게스트일 때는 배지가 **Google 로그인** 버튼).

- 🟢 **닉네임 · 동기화** — `rpg/{uid}` 쓰기 성공
- 🟡 **닉네임 · 로컬** — 로그인은 됐지만 `rpg` 쓰기 거부(규칙 미반영) → localStorage 저장
- 🔴 **오프라인 / 연동 오류** — SDK·네트워크 실패 → localStorage 저장

---

## 6. 배포 상태

### 6-1. RTDB 규칙 — 적용 완료 ✅

2026-11-23, 라이브 규칙을 **읽은 그대로 보존**한 상태에서 아래 두 노드만 추가해 게시했습니다.
기존 노드(users, rankings, companies, board, chat, global_supply, global_listings, pending_income,
activity_feed, lottery, global_event, auctions, stockOrders, stockTrades, ai_bot_lock, notices)는
값·조건 모두 변경 없음.

```json
"rpg": {
  "$uid": {
    ".read":  "auth != null && auth.uid == $uid",
    ".write": "auth != null && auth.uid == $uid"
  }
},
"rpg_rankings": {
  ".read": true,
  "$uid": { ".write": "auth != null && auth.uid == $uid" }
}
```

- 게시 후 비로그인 REST 검증: `GET /rpg.json` → **401 Permission denied**(본인만), `GET /rpg_rankings.json` → **200 null**(전체 읽기).
- `database.rules.json` 은 현재 적용된 규칙과 동일한 내용입니다(콘솔 편집기가 줄바꿈을 받지 않아 라이브는 한 줄 형태).
- `.validate` 는 넣지 않았습니다(쓰기 필드가 늘어나도 저장이 막히지 않도록). 필요하면 콘솔에서 추가하세요.

### 6-2. Firebase Hosting (권장: 같은 프로젝트 = 같은 authDomain)

```bash
# land-rpg/ 에서
firebase init hosting           # 기존 korea-land-4e0c2 프로젝트 선택, public 디렉터리 = .
firebase deploy --only hosting
```

`firebase.json` 예시:

```json
{ "hosting": { "public": ".", "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "tools/**"],
               "rewrites": [{ "source": "**", "destination": "/index.html" }] } }
```

별도 사이트로 올릴 경우 `https://<site>.web.app` 도메인을
Firebase Auth → 승인된 도메인에 추가해야 Google 팝업 로그인이 동작합니다.

### 6-3. GitHub Pages — 배포 완료 ✅

- 저장소: `hyosungkwon/land-rpg` (Public) · 브랜치 `main` 루트를 그대로 서빙
- Settings → Pages → Source: **Deploy from a branch**, `main` / `/ (root)`, Enforce HTTPS 켜짐
- 라이브: **https://hyosungkwon.github.io/land-rpg/** (200 OK 확인)
- `start_url`·`scope`·`sw.js`·모든 `src`/`assets` 경로가 **상대 경로**라 `/land-rpg/` 서브패스에서 그대로 동작합니다.
- `package.json`·`tools/`·`node_modules/` 는 `.gitignore` 로 제외되어 배포에 섞이지 않습니다.
- Pages 는 커스텀 헤더를 못 주므로 `sw.js` 캐시 갱신은 `const VERSION` 문자열을 올려 처리합니다(현재 `land-rpg-v2.0.0`, `skipWaiting()`+`clients.claim()` 로 즉시 교체).
- Firebase Auth **승인된 도메인**에 `hyosungkwon.github.io` 가 추가되어 있어야 Google 로그인 팝업이 동작합니다(추가 완료).

---

## 7. 검증

### 7-1. v1 도구 (node 필요 — 이 작업 환경에는 node 가 없어 미실행)

```bash
npm run check     # node --check : app.js, sw.js, src/*.js 전부
npm test          # smoke-test / app-smoke / app-offline / static-check
```

| 도구 | 확인 내용 | v1 결과 |
|---|---|---|
| `npm run check` | ES 모듈 구문 검사 | ✅ 9/9 |
| `tools/smoke-test.mjs` | 에셋 경로·정의·SW 캐시 전수, 상태/강화/스킬/오프라인/환전/버프, 30분 시뮬레이션 | ✅ 387/387 |
| `tools/app-smoke.mjs` | DOM 흔내 위에서 앱 부팅·60초 구동·탭·액션 통합 | ✅ 54/54 |
| `tools/app-offline.mjs` | 20시간 방치 → 12시간 상한 정산 | ✅ 11/11 |
| `tools/static-check.mjs` | id·data-action·import/export·CSS·PWA 정합성 | ✅ 161/161 |

> v2 에서는 `tools/smoke-test.mjs` 의 **52종 에셋 전수 검사/스테이지 22개 가정**이 맞지 않습니다(라인업 교체).
> node 환경에서 돌릴 때는 해당 단계만 걸러내거나 라인업 기대값을 고쳐 주세요.

### 7-2. v2 / v2.1 검증 (실제로 실행함)

| 도구 | 확인 내용 | 결과 |
|---|---|---|
| `tools/headless_check.py` (QuickJS) | data/state/combat/render/ui/app/sw 7파일 구법 검사 + **10분 전투 시뮬레이션** + 비정상 dt(`NaN`/음수/`Infinity`) 스트레스 | ✅ PASS — 10분에 S12·Lv.18·일반 121처치·보스 11격파·사망 0 |
| `tools/land_check.py` (QuickJS, v2.1) | 데이터 229개·키 중복·가격 결정론·±30% 밴드·30% 하한 · 매수/매도 계산·공급/현금 검증·**다른 필드 보존**·전량매도 정리 · 임대 5%/12시간 캡 | ✅ PASS 28/28 |
| `tools/ui_check.py` (QuickJS, v2.1) | 부동산 서브탭 3종을 게스트/빈 계정/보유 계정 × 검색/정렬/더보기 조합으로 렌더 | ✅ PASS 12/12 |
| 브라우저 라이브 검증 (모바일 390×844 뷰포트) | RPG 전투가 돌아가는 상태에서 탭 4개 + 부동산 서브탭 3개 전환, 스크롤·검색·모달 | ✅ 라이브 |
| 콘솔/네트워크 | 앱 내부 예외 카운터(`_errCounts`)·미처리 예외·4xx/5xx 요청 | ✅ **0건** (로드 리소스 19건 모두 성공) |
| SW 갱신 | 새 버전 배포 → `skipWaiting`/`clients.claim` → 자동 새로고침 | ✅ 배포 후 페이지가 스스로 새 버전으로 교체됨 |

## 8. 알려진 한계 / 다음 단계

- 캐릭터는 **3프레임(대기/공격/스킬)** 전환 방식입니다. 공격은 240ms, 스킬은 460ms 동안 해당 프레임으로 바뀌고
  이후 대기 프레임으로 돌아갑니다(프레임 시트 애니메이션이 아니라 포즈 전환).
- 몬스터는 일반 12종 + 보스 7종으로 통일했습니다. 스테이지는 이 19종을 21스테이지에 돌려 쓰며 난이도만 계속 오릅니다.
- v1 도트 에셋(`assets/char`, `assets/monster`, `assets/boss`)은 롤백 대비 **파일만 보존**하고 SW 캐시에서는 제외했습니다.
- 사운드/BGM 없음(무음 프로토타입).
- `rpg_rankings` 규칙이 반영되기 전까지 RPG 랭킹은 "규칙 반영 후 표시" 안내만 나옵니다.
- 다음 단계: ① 실기기(삼성 인터넷) 재확인 ② 프레임 시트 애니메이션·사운드 ③ 부동산 측 화면에 "영지 RPG" 진입 버튼 추가

---

## 9. v2 수정 내역 (멈춤 버그 · 연출)

### 9-1. "몹이 오면 멈춘다" 원인과 수정

- **원인 1 (치명)**: `app.loop()` 이 `requestAnimationFrame` 을 **맨 마지막에** 예약했습니다.
  `battle.tick` · `renderer.frame` · `ui.refreshLive` 중 어느 하나라도 예외를 던지면(모바일 Safari/삼성 인터넷의
  캔버스·DOM 편차, 이미지 디코드 실패 등) 다음 프레임 예약이 실행되지 않아 **루프가 영구히 죽었습니다.**
  화면은 마지막 프레임에 멈추고 몹도 캐릭터도 더 움직이지 않습니다 → 사용자가 본 화면과 정확히 일치.
- **수정**: 프레임을 **먼저 예약**하고, 전투/이펙트/렌더/UI/저장을 각각 `try/catch` 로 분리했습니다.
  렌더가 실패해도 전투·보상은 계속되고, 캔버스 상태가 깨지면 `recoverRender()` 가 변환을 되돌립니다.
  전투 상태가 깨지면(`NaN` 좌표 등) `recoverBattle()` 이 해당 엔티티를 정리하고 자동 재스폰합니다.
- **원인 2**: `tick()` 이 `dt` 를 `Math.max(0, dtMs)` 로만 정리해 `NaN` 이 섞이면 몬스터 좌표가 `NaN` 이 되고
  이후 모든 거리 비교가 `false` 가 되어 **영원히 이동·공격하지 않는 상태**가 될 수 있었습니다.
  → `Number.isFinite` 방어 + 좌표 이상 시 스폰 위치로 복구.
- **원인 3**: 렌더러가 rAF 타임스탬프(`performance.now` 기준)를 전투 시각(`Date.now` 기준)과 비교해
  공격·피격 효과의 경과시간이 **음수**가 되었습니다(공격 검기가 아예 안 보이고 피격 플래시가 항상 켜짐).
  → 루프가 `Date.now()` 기준 시각을 렌더러에 넘기도록 통일.
- **추가 방어**: `ctx.roundRect` 폴리필, 캔버스 0크기 가드, 잦은 DOM 갱신 최소화,
  배경을 오프스크린 캔버스에 1회만 그리도록 변경(모바일 GPU/발열 부담 감소).
  예외가 3회 반복되면 화면 하단에 짧은 ⚠ 배지로 원인 문자열을 표시합니다(다시 발생 시 진단용).

### 9-2. 전투 연출

| 대상 | 연출 |
|---|---|
| 플레이어 공격 | 전진 스텝 + `hero_attack` 프레임 + **황금 검기 아크 3겹**(글로우/본체/코어) |
| 치명타 | 화면 플래시 + 진동 + 큰 데미지 숫자(팝 애니메이션) |
| 플레이어 피격 | 붉은 비네트 + 몬스터 할퀴기 아크 + 진동 |
| 몬스터 피격 | **흰 실루엣 플래시** + 뒤로 넉백 + 스케일 팝 + 스파크 |
| 몬스터 사망 | 파티클 버스트 + 페이드/가라앉기, 보스는 강한 진동·플래시 |
| 강격 | 대상 위로 내리꽂는 거대 황금 참격 + 충격 고리 |
| 범위 베기 | 캐릭터 주위를 도는 청록 아크 3겹 + 지면 확산 고리 |
| 광폭 | 붉은 아우라 + 불티 상승 |
| 치유 | 초록 고리 + 상승 입자 + 회복 숫자 |
| 보스 등장 | 진동 + 플래시 + 보스 HP바 |

### 9-3. 모바일 배치 조정

- 캐릭터·몬스터 스프라이트가 겹치지 않도록 **몬스터 대기열** 방식으로 바꿨습니다.
  맨 앞 몬스터만 캐릭터 앞(월드 260)에 붙고 나머지는 뒤에 줄을 서며(간격 300), 뒤에 선 몬스터는 때리지 않고 기다립니다.
- 동시 등장은 2마리, 화면 밖(월드 780 이상)에 줄이 길어지면 스폰을 잠시 멈춥니다.
- 캐릭터는 화면 높이의 44%(최대 118×scale)로 줄이고, 몬스터는 아주 얇은 깊이차를 줘 겹쳐도 자연스럽게 보입니다.
