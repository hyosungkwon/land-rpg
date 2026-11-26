# 🌟 유아의 놀이터 (`kids-app/`)

7세 아이가 폰에서 바로 켜서 노는 놀이 앱입니다. 설치 없이 링크만 누르면 됩니다.

- 놀이 링크: **https://hyosungkwon.github.io/land-rpg/kids-app/**
- 모바일 미리보기(390×844): `preview.html`
- 예전 `../yua-draw/` 주소는 이 앱의 **그림 놀이** 화면(`?screen=ydraw`)으로 안내합니다.

## 폴더 구조

| 파일 | 설명 |
| --- | --- |
| `index.html` | 화면 뼈대(홈·게임·학습·창작·내 방 + 팝업). 로직은 아래 JS 모듈에 있습니다 |
| `style.css` | 전체 스타일. 옛 `yua-draw/style.css` 는 `#ydraw` 범위로 감싸 합쳤습니다 |
| `js/data.js` | 퍼즐 30스테이지 · 학습 카드 · 낚시 도감 · 꾸미기 아이템 표 |
| `js/topics.js` | 그림 놀이 주제 26개와 참조 도형(0~100 좌표계) |
| `js/core.js` | 세이브(`localStorage` 키 `kidsapp4`) · 보상/레벨 · 화면 전환 · 음성(TTS) · 효과음 |
| `js/draw.js` | 🎨 그림 놀이(자유 그리기 · 주제 일치율). 원래 `yua-draw` 앱 엔진 |
| `js/puzzle.js` | 🧩 퍼즐 |
| `js/fun.js` | 🃏 기억력 카드 · 🎈 풍선 · 🔍 틀린그림찾기 · 🌀 미로 |
| `js/music.js` | 🎹 미니 피아노(동요 5곡 따라치기 · 음색 3종) |
| `js/art.js` | 🖍️ 색칠하기(도안 12종, 영역 채우기) · 👗 캐릭터 꾸미기 |
| `js/learn.js` | 🔢 수학 · 🔤 영어 · 🕐 시계 · 📝 단어 · 🔊 받아쓰기 · ⚡ 빠른 덧셈 |
| `js/fishing.js` | 🎣 낚시 게임 |
| `sw.js` | 이 폴더 전용 서비스워커(네트워크 우선, 화면 요청은 `no-cache` 재확인) |
| `tools/stamp.py` | `index.html` 이 부르는 `js/*.js`·`style.css` 주소에 내용 해시를 붙임 |

## 자주 쓰는 작업

```bash
# 자산을 고친 뒤 (주소 해시를 새로 붙인다)
python3 kids-app/tools/stamp.py

# git 커밋/푸시 → GitHub Pages 자동 배포
git add -A && git commit -m "..." && git push origin main
```

- **세이브**: `localStorage` 의 `kidsapp4` 하나. 예전 kids-app 저장본과 그대로 호환됩니다.
- **그림 갤러리/설정**: 그림 놀이는 예전과 같이 `yua-draw-gallery-v1`, `yua-draw-prefs-v1` 을 씁니다.
- **보상**: `App.earnReward(이모지, 문구)` → 스티커 + 캐릭터 경험치. 스티커가 필요 없는 안내는 `App.showTip`.
- **자체 점검 손잡이**(화면에는 영향 없음): `Puzzle`, `Memory._qa()`, `Balloon._qa()`, `DiffGame._qa()`,
  `Maze._qa()`/`_grid()`/`_drag(x,y)`, `Piano._qa()`, `Coloring._qa()`, `Clock._qa()`, `Word._qa()`,
  `Dict._qa()`, `Addq._qa()`, 그림 놀이는 `window.__yua`.

## 2026-11-26 통합 메모

- 앱 이름을 **🌟 유아의 놀이터**로 바꾸고, 창작 탭의 `그림 그리기` + `그림 놀이(일치율)` 두 카드를
  **그림 놀이(자유 그리기 · 주제 일치율)** 하나로 합쳤습니다(상단 토글로 모드 전환).
- 주제 도전에서 **일치율 70% 이상**이거나 **그림을 저장**하면 스티커·경험치를 바로 줍니다.
- 퍼즐 판에 `display:grid` 가 빠져 조각 칸이 한 줄로 쌓이던 문제를 고쳤습니다.
