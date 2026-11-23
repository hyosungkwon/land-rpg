# ⚔️ 영지 RPG — 모바일 세로형 방치형 RPG + 부동산 양방향 연계 (1차 프로토타입)

`survival-in-korea` 의 도트 캐릭터·몬스터 아트와 `korea-land-4e0c2` Firebase(부동산 거래소)를
결합한 **모바일 세로형 PWA 방치형 RPG** 입니다.

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
│  ├─ char/warrior.png      survival-in-korea 캐릭터 (256px 정규화)
│  ├─ monster/*.png         45종 160×160 투명 스프라이트
│  └─ boss/*.png            7종 480px 보스 일러스트(1408×768 원본 크롭)
├─ src/
│  ├─ data.js               밸런스 상수 · 몬스터 도감 · 22스테이지 · 장비/스킬 정의 · 부동산 버프 규칙
│  ├─ state.js              저장/로드 · 파생 스탯 · 강화 · 오프라인 정산 · 환전 한도
│  ├─ combat.js             자동 전투 시뮬레이션(웨이브 → 보스 → 다음 스테이지, 스킬 자동 시전)
│  ├─ render.js             Canvas 렌더러(배경 패럴랙스 · 스프라이트 · 이펙트 · 보스 바)
│  ├─ property.js           부동산 state → 영구 버프 · 배당 환산
│  ├─ firebase.js           Google 로그인 · users/{uid}/state 읽기 · rpg/{uid} 쓰기 · 현금 트랜잭션
│  └─ ui.js                 하단 4탭 · HUD · 토스트 · 모달
└─ tools/                   검증 도구 (배포물 아님)
   ├─ prepare_assets.py     원본 PNG → 투명 스프라이트/보스 일러스트 정규화
   ├─ make_icons.py         PWA 아이콘 생성
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

### 폴백 표시

상단 배지가 상태를 그대로 말합니다.

- 🟢 **Firebase 동기화됨** — `rpg/{uid}` 쓰기 성공
- 🟡 **로컬 테스트 모드** — 로그인은 됐지만 `rpg` 쓰기 거부(규칙 미반영) → localStorage 저장
- 🔴 **오프라인 / 연동 오류** — SDK·네트워크 실패 → localStorage 저장
- ⚪ **로컬 저장** — 로그인 전

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
- Pages 는 커스텀 헤더를 못 주므로 `sw.js` 캐시 갱신은 `const VERSION` 문자열을 올려 처리합니다(현재 `land-rpg-v1.0.1`).
- Firebase Auth **승인된 도메인**에 `hyosungkwon.github.io` 가 추가되어 있어야 Google 로그인 팝업이 동작합니다(추가 완료).

---

## 7. 검증

```bash
# node 필요 (이 환경에는 없어서 pip nodejs-bin 18.4 로 실행)
npm run check     # node --check : app.js, sw.js, src/*.js 전부
npm test          # 아래 4종
```

| 도구 | 확인 내용 | 결과 |
|---|---|---|
| `npm run check` | ES 모듈 구문 검사 9개 파일 | ✅ 9/9 |
| `tools/smoke-test.mjs` | 몬스터 에셋 **52종** 경로·정의·SW 캐시 전수, 상태/강화/스킬/오프라인/환전/버프 단위 검증, 30분 시뮬레이션, 보스 흐름 | ✅ 387/387 |
| `tools/app-smoke.mjs` | 앱 실제 부팅(60초 구동), 캔버스 drawImage 12,000+ · 텍스트 렌더, HUD/바 갱신, 4탭 렌더(값 누락 `undefined/NaN` 0, 태그 균형), 강화·스킬·토글·수동 스킬·보스 도전·스테이지 진행, localStorage 저장 | ✅ 54/54 |
| `tools/app-offline.mjs` | 20시간 방치 → 12시간 상한 정산, 팝업 표시·저장 | ✅ 11/11 |
| `tools/static-check.mjs` | index.html 참조, JS가 쓰는 id, data-action 핸들러, import/export, CSS 클래스, manifest·SW·rules | ✅ 161/161 |

> 이 검증 환경에는 브라우저 실행 파일이 없어 **실기기 픽셀 확인은 하지 못했습니다.**
> 레이아웃/CSS 와 캔버스 그림은 코드와 렌더 호출로만 검증했으므로, 배포 전 폰에서 한 번 열어
> 세로 화면 비율·안전영역·터치감을 확인해 주세요.

## 8. 알려진 한계 / 다음 단계

- 캐릭터는 원본 `warrior.png` **단일 프레임**이라 이동·공격이 코드 애니메이션(흔들림/돌진/발광)입니다. 프레임 시트로 확장하면 자연스러워집니다.
- 원본 몬스터 52종 중 **7종(1408×768)은 보스 일러스트 전용**으로 쓰고, 나머지 45종이 일반 몹입니다. 원본 `MONSTER_INFO` 에는 있으나 이미지가 없는 7종(Medusa, Chimera, Sphinx, Hydra, Archdemon, Balrog, Bahamut)은 사용하지 않았습니다.
- 사운드/BGM 없음(무음 프로토타입).
- `rpg_rankings` 규칙이 반영되기 전까지 RPG 랭킹은 "규칙 반영 후 표시" 안내만 나옵니다.
- 다음 단계: ① 규칙 반영 + Hosting 배포 ② 실기기 확인 후 밸런스 미세 조정 ③ 프레임 애니메이션·사운드 ④ 부동산 측 화면에 "영지 RPG" 진입 버튼 추가
