/* kids-app/js/data.js — 놀이 데이터(퍼즐 30 · 학습 카드 · 낚시 도감 · 꾸미기 아이템)
   (원본 kids-app/index.html 에서 그대로 옮긴 표입니다. 화면 로직은 각 모듈에 있습니다.) */
(function () {
  'use strict';
const CHAR_STAGES=[
  {emoji:'🐣',name:'아기 병아리',msg:'안녕! 나는 병아리야! 같이 공부하자! 💪',need:3},
  {emoji:'🐥',name:'아기 닭',msg:'조금씩 자라고 있어요! 더 힘내봐요! 🌱',need:5},
  {emoji:'🐔',name:'닭',msg:'많이 컸죠? 공부가 재밌어요! 😊',need:7},
  {emoji:'🦢',name:'우아한 백조',msg:'우아하게 날아오를 준비 중이에요! 🌸',need:10},
  {emoji:'🦋',name:'예쁜 나비',msg:'꽃처럼 피어났어요! 정말 예뻐요! 🌺',need:12},
  {emoji:'🦄',name:'유니콘',msg:'마법같은 친구가 됐어요! 최고예요! ✨',need:15},
  {emoji:'🐉',name:'멋진 용',msg:'전설의 용! 이제 뭐든 할 수 있어요! 🔥',need:999},
];
const ALL_STICKERS=['🌟','❤️','🎀','🌸','🦋','⭐','🏆','🎉','🌈','🍀','🎠','🎪','🧸','🪄','🎭','🌺','🦄','🐣','🍭','💖','🎨','🎵','🎯','🏅','🌙','☀️','🌻','🍓','🎁','🔮'];
const ACHIEVEMENTS=[
  {id:'first',icon:'🌱',name:'첫 발걸음',desc:'처음으로 활동 완료!',check:s=>(s.totalStickers||0)>=1},
  {id:'puzzle1',icon:'🧩',name:'퍼즐 마스터',desc:'퍼즐 처음 완성!',check:s=>(s.puzzleDone||0)>=1},
  {id:'puzzle5',icon:'🧩',name:'퍼즐 달인',desc:'퍼즐 5번 완성!',check:s=>(s.puzzleDone||0)>=5},
  {id:'math1',icon:'🔢',name:'수학 천재',desc:'수학 카드 처음 완주!',check:s=>(s.mathDone||0)>=1},
  {id:'eng1',icon:'🔤',name:'영어 박사',desc:'영어 카드 처음 완주!',check:s=>(s.engDone||0)>=1},
  {id:'draw1',icon:'🎨',name:'꼬마 화가',desc:'그림 처음 저장!',check:s=>(s.drawSaved||0)>=1},
  {id:'draw3',icon:'🎨',name:'예술가',desc:'그림 3번 저장!',check:s=>(s.drawSaved||0)>=3},
  {id:'memory1',icon:'🃏',name:'기억력 왕',desc:'기억력 게임 처음 완주!',check:s=>(s.memDone||0)>=1},
  {id:'clock5',icon:'🕐',name:'시계 박사',desc:'시계 퀴즈 5번 정답!',check:s=>(s.clockCorrect||0)>=5},
  {id:'clock20',icon:'🕐',name:'시계 천재',desc:'시계 퀴즈 20번 정답!',check:s=>(s.clockCorrect||0)>=20},
  {id:'diff3',icon:'🔍',name:'매의 눈',desc:'틀린그림찾기 3번 완료!',check:s=>(s.diffDone||0)>=3},
  {id:'piano1',icon:'🎹',name:'꼬마 음악가',desc:'피아노 10번 이상 연주!',check:s=>(s.pianoPlayed||0)>=10},
  {id:'fish1',icon:'🎣',name:'첫 낚시!',desc:'물고기 처음 잡기!',check:s=>(s.fishCaught||0)>=1},
  {id:'fish10',icon:'🎣',name:'낚시 달인',desc:'물고기 10마리 잡기!',check:s=>(s.fishCaught||0)>=10},
  {id:'maze1',icon:'🌀',name:'미로 탈출!',desc:'미로 처음 탈출!',check:s=>(s.mazeDone||0)>=1},
  {id:'maze5',icon:'🌀',name:'미로 달인',desc:'미로 5번 탈출!',check:s=>(s.mazeDone||0)>=5},
  {id:'stk10',icon:'🏷️',name:'스티커 수집가',desc:'스티커 10개!',check:s=>(s.totalStickers||0)>=10},
  {id:'stk20',icon:'🏷️',name:'스티커 왕',desc:'스티커 20개!',check:s=>(s.totalStickers||0)>=20},
  {id:'lv3',icon:'🦢',name:'레벨 3 달성',desc:'캐릭터 레벨 3!',check:s=>(s.charLv||1)>=3},
  {id:'lv5',icon:'🦋',name:'레벨 5 달성',desc:'캐릭터 레벨 5!',check:s=>(s.charLv||1)>=5},
  {id:'lv7',icon:'🐉',name:'최고 레벨!',desc:'전설의 용이 됐어요! 🔥',check:s=>(s.charLv||1)>=7},
];
const P_WORLDS=[
  {name:'🌍 동물 왕국',color:'#4CAF50',stages:[
    {n:1,grid:2,subject:'고양이',emoji:'🐱',img:'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&h=400&fit=crop&auto=format'},
    {n:2,grid:2,subject:'강아지',emoji:'🐶',img:'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&h=400&fit=crop&auto=format'},
    {n:3,grid:2,subject:'아기 판다',emoji:'🐼',img:'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=400&h=400&fit=crop&auto=format'},
    {n:4,grid:3,subject:'사자',emoji:'🦁',img:'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=400&h=400&fit=crop&auto=format'},
    {n:5,grid:3,subject:'토끼',emoji:'🐰',img:'https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=400&h=400&fit=crop&auto=format'},
    {n:6,grid:3,subject:'코끼리',emoji:'🐘',img:'https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=400&h=400&fit=crop&auto=format'},
  ]},
  {name:'🌊 바다 세계',color:'#0288d1',stages:[
    {n:7,grid:3,subject:'열대어',emoji:'🐠',img:'https://images.unsplash.com/photo-1544552866-d3ed42536cfd?w=400&h=400&fit=crop&auto=format'},
    {n:8,grid:3,subject:'돌고래',emoji:'🐬',img:'https://images.unsplash.com/photo-1607153333879-c174d265f1d2?w=400&h=400&fit=crop&auto=format'},
    {n:9,grid:3,subject:'문어',emoji:'🐙',img:'https://images.unsplash.com/photo-1545671913-b89ac1b4ac10?w=400&h=400&fit=crop&auto=format'},
    {n:10,grid:3,subject:'고래',emoji:'🐋',img:'https://images.unsplash.com/photo-1568430462989-44163eb1752f?w=400&h=400&fit=crop&auto=format'},
    {n:11,grid:4,subject:'상어',emoji:'🦈',img:'https://images.unsplash.com/photo-1560275619-4cc5fa59d3ae?w=400&h=400&fit=crop&auto=format'},
    {n:12,grid:4,subject:'바닷속',emoji:'🌊',img:'https://images.unsplash.com/photo-1504472478235-9bc48ba4d60f?w=400&h=400&fit=crop&auto=format'},
  ]},
  {name:'🦋 동물 친구들',color:'#9c27b0',stages:[
    {n:13,grid:4,subject:'말',emoji:'🐴',img:'https://images.unsplash.com/photo-1534326960597-fe0b2a0ab50c?w=400&h=400&fit=crop&auto=format'},
    {n:14,grid:4,subject:'나비',emoji:'🦋',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop&auto=format'},
    {n:15,grid:4,subject:'앵무새',emoji:'🦜',img:'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=400&h=400&fit=crop&auto=format'},
    {n:16,grid:4,subject:'기린',emoji:'🦒',img:'https://images.unsplash.com/photo-1547721064-da6cfb341d50?w=400&h=400&fit=crop&auto=format'},
    {n:17,grid:4,subject:'독수리',emoji:'🦅',img:'https://images.unsplash.com/photo-1611689342806-0863700e0b78?w=400&h=400&fit=crop&auto=format'},
    {n:18,grid:4,subject:'호랑이',emoji:'🐯',img:'https://images.unsplash.com/photo-1549366021-9f761d040a94?w=400&h=400&fit=crop&auto=format'},
  ]},
  {name:'❄️ 극지 탐험',color:'#3f51b5',stages:[
    {n:19,grid:4,subject:'펭귄',emoji:'🐧',img:'https://images.unsplash.com/photo-1598439210625-5067c578f3f6?w=400&h=400&fit=crop&auto=format'},
    {n:20,grid:4,subject:'북극곰',emoji:'🐻‍❄️',img:'https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=400&h=400&fit=crop&auto=format'},
    {n:21,grid:4,subject:'여우',emoji:'🦊',img:'https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=400&h=400&fit=crop&auto=format'},
    {n:22,grid:5,subject:'올빼미',emoji:'🦉',img:'https://images.unsplash.com/photo-1579607364943-caa3b8e2a4a5?w=400&h=400&fit=crop&auto=format'},
    {n:23,grid:5,subject:'사슴',emoji:'🦌',img:'https://images.unsplash.com/photo-1484406566174-9da000fda645?w=400&h=400&fit=crop&auto=format'},
    {n:24,grid:5,subject:'홍학',emoji:'🦩',img:'https://images.unsplash.com/photo-1497206365907-f5e630693df0?w=400&h=400&fit=crop&auto=format'},
  ]},
  {name:'🌿 자연 세상',color:'#ff9800',stages:[
    {n:25,grid:5,subject:'코알라',emoji:'🐨',img:'https://images.unsplash.com/photo-1459262838948-3e2de6c1ec80?w=400&h=400&fit=crop&auto=format'},
    {n:26,grid:5,subject:'치타',emoji:'🐆',img:'https://images.unsplash.com/photo-1557769132-42a04063b07f?w=400&h=400&fit=crop&auto=format'},
    {n:27,grid:5,subject:'카멜레온',emoji:'🦎',img:'https://images.unsplash.com/photo-1518611507436-f9221403cca2?w=400&h=400&fit=crop&auto=format'},
    {n:28,grid:5,subject:'해바라기',emoji:'🌻',img:'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=400&h=400&fit=crop&auto=format'},
    {n:29,grid:5,subject:'벚꽃',emoji:'🌸',img:'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=400&h=400&fit=crop&auto=format'},
    {n:30,grid:5,subject:'오로라',emoji:'🌌',img:'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=400&h=400&fit=crop&auto=format'},
  ]},
];
const MATH_CATS={'덧셈➕':[{q:'1+1=?',a:'2'},{q:'2+3=?',a:'5'},{q:'4+5=?',a:'9'},{q:'6+7=?',a:'13'},{q:'8+4=?',a:'12'},{q:'9+9=?',a:'18'},{q:'10+5=?',a:'15'},{q:'7+8=?',a:'15'},{q:'3+9=?',a:'12'},{q:'11+6=?',a:'17'},{q:'15+4=?',a:'19'},{q:'12+8=?',a:'20'}],'뺄셈➖':[{q:'5-2=?',a:'3'},{q:'9-4=?',a:'5'},{q:'10-3=?',a:'7'},{q:'8-5=?',a:'3'},{q:'12-6=?',a:'6'},{q:'15-8=?',a:'7'},{q:'20-9=?',a:'11'},{q:'18-7=?',a:'11'},{q:'14-6=?',a:'8'},{q:'11-4=?',a:'7'},{q:'17-9=?',a:'8'},{q:'16-7=?',a:'9'}],'곱셈✖️':[{q:'2×2=?',a:'4'},{q:'2×3=?',a:'6'},{q:'3×3=?',a:'9'},{q:'4×2=?',a:'8'},{q:'5×2=?',a:'10'},{q:'3×4=?',a:'12'},{q:'5×3=?',a:'15'},{q:'4×4=?',a:'16'},{q:'6×2=?',a:'12'},{q:'5×4=?',a:'20'},{q:'3×6=?',a:'18'},{q:'7×2=?',a:'14'}],'숫자읽기🔢':[{q:'17은?',a:'십칠'},{q:'25는?',a:'이십오'},{q:'30은?',a:'삼십'},{q:'48은?',a:'사십팔'},{q:'100은?',a:'백'},{q:'12는?',a:'십이'},{q:'99는?',a:'구십구'},{q:'50은?',a:'오십'},{q:'33은?',a:'삼십삼'},{q:'71은?',a:'칠십일'}]};
const ENG_CATS={'알파벳🔤':[{emoji:'🅰️',word:'A a',ko:'에이',ex:'A is for Apple.\n사과는 A로 시작해요.'},{emoji:'🐝',word:'B b',ko:'비',ex:'B is for Bee.'},{emoji:'🐱',word:'C c',ko:'씨',ex:'C is for Cat.'},{emoji:'🐶',word:'D d',ko:'디',ex:'D is for Dog.'},{emoji:'🐘',word:'E e',ko:'이',ex:'E is for Elephant.'},{emoji:'🐸',word:'F f',ko:'에프',ex:'F is for Frog.'},{emoji:'🦒',word:'G g',ko:'쥐',ex:'G is for Giraffe.'},{emoji:'🏠',word:'H h',ko:'에이치',ex:'H is for House.'},{emoji:'🍦',word:'I i',ko:'아이',ex:'I is for Ice cream.'},{emoji:'🃏',word:'J j',ko:'제이',ex:'J is for Jump.'}],'동물🐾':[{emoji:'🐱',word:'cat',ko:'고양이',ex:'The cat is cute.\n고양이는 귀여워요.'},{emoji:'🐶',word:'dog',ko:'강아지',ex:'The dog runs fast.'},{emoji:'🐸',word:'frog',ko:'개구리',ex:'The frog jumps.'},{emoji:'🦊',word:'fox',ko:'여우',ex:'The fox is clever.'},{emoji:'🐼',word:'panda',ko:'판다',ex:'The panda is big.'},{emoji:'🦁',word:'lion',ko:'사자',ex:'The lion is strong.'},{emoji:'🐧',word:'penguin',ko:'펭귄',ex:'The penguin waddles.'},{emoji:'🐠',word:'fish',ko:'물고기',ex:'The fish swims.'},{emoji:'🦋',word:'butterfly',ko:'나비',ex:'The butterfly is pretty.'},{emoji:'🐮',word:'cow',ko:'소',ex:'The cow says Moo!'}],'색깔🎨':[{emoji:'🔴',word:'red',ko:'빨강',ex:'The apple is red.'},{emoji:'🟠',word:'orange',ko:'주황',ex:'The orange is orange.'},{emoji:'🟡',word:'yellow',ko:'노랑',ex:'The sun is yellow.'},{emoji:'🟢',word:'green',ko:'초록',ex:'The grass is green.'},{emoji:'🔵',word:'blue',ko:'파랑',ex:'The sky is blue.'},{emoji:'🟣',word:'purple',ko:'보라',ex:'The grape is purple.'},{emoji:'🩷',word:'pink',ko:'분홍',ex:'The flower is pink.'},{emoji:'⚫',word:'black',ko:'검정',ex:'The night is black.'},{emoji:'⚪',word:'white',ko:'하양',ex:'The snow is white.'},{emoji:'🟤',word:'brown',ko:'갈색',ex:'The bear is brown.'}],'숫자🔢':[{emoji:'1️⃣',word:'one',ko:'하나(1)',ex:'I have one cat.'},{emoji:'2️⃣',word:'two',ko:'둘(2)',ex:'Two dogs run.'},{emoji:'3️⃣',word:'three',ko:'셋(3)',ex:'Three frogs jump.'},{emoji:'4️⃣',word:'four',ko:'넷(4)',ex:'Four birds sing.'},{emoji:'5️⃣',word:'five',ko:'다섯(5)',ex:'Five stars shine.'},{emoji:'6️⃣',word:'six',ko:'여섯(6)',ex:'Six flowers bloom.'},{emoji:'7️⃣',word:'seven',ko:'일곱(7)',ex:'Seven days a week.'},{emoji:'8️⃣',word:'eight',ko:'여덟(8)',ex:'Eight legs on a spider.'},{emoji:'9️⃣',word:'nine',ko:'아홉(9)',ex:'Nine planets exist.'},{emoji:'🔟',word:'ten',ko:'열(10)',ex:'Ten fingers on hands.'}]};
const COL_PALETTE=['#FF0000','#FF6600','#FFCC00','#00BB00','#0066FF','#9900CC','#FF66CC','#00CCCC','#FF9999','#99CCFF','#FFCC99','#99FF99','#A0522D','#000000','#ffffff'];
const DRESS_CATS=[{id:'hat',label:'🎩 모자',layerId:'dr-hat'},{id:'acc',label:'💍 악세서리',layerId:'dr-acc'},{id:'bg',label:'🌈 배경',layerId:'dr-bg-em'}];
const DRESS_ITEMS={hat:[{id:'h1',em:'🎀',name:'리본',price:0,free:true},{id:'h2',em:'👑',name:'왕관',price:2},{id:'h3',em:'🎩',name:'마법모자',price:3},{id:'h4',em:'⛑️',name:'헬멧',price:2},{id:'h5',em:'🌸',name:'꽃핀',price:1},{id:'h6',em:'🎓',name:'박사모',price:4},{id:'h7',em:'🧢',name:'야구모',price:2},{id:'h8',em:'🪄',name:'마법봉',price:5}],acc:[{id:'a1',em:'🌟',name:'반짝이',price:0,free:true},{id:'a2',em:'🦋',name:'나비',price:2},{id:'a3',em:'❤️',name:'하트',price:1},{id:'a4',em:'🌈',name:'무지개',price:3},{id:'a5',em:'⭐',name:'별',price:1},{id:'a6',em:'🌙',name:'달',price:2},{id:'a7',em:'🍀',name:'클로버',price:3},{id:'a8',em:'💎',name:'다이아',price:6}],bg:[{id:'b1',em:'🌸',name:'벚꽃',price:0,free:true},{id:'b2',em:'🌈',name:'무지개',price:2},{id:'b3',em:'⭐',name:'별',price:1},{id:'b4',em:'🌺',name:'꽃밭',price:3},{id:'b5',em:'🎆',name:'불꽃',price:4},{id:'b6',em:'🌊',name:'파도',price:2},{id:'b7',em:'🏔️',name:'산',price:3},{id:'b8',em:'🌙',name:'밤하늘',price:5}]};
const WQ_CATS={'동물🐾':[{em:'🐱',word:'고양이',hint:'야옹 해요'},{em:'🐶',word:'강아지',hint:'멍멍 짖어요'},{em:'🐸',word:'개구리',hint:'개굴개굴 해요'},{em:'🦊',word:'여우',hint:'꼬리가 길어요'},{em:'🐼',word:'판다',hint:'흑백 무늬예요'},{em:'🦁',word:'사자',hint:'숲의 왕이에요'},{em:'🐮',word:'소',hint:'음매 해요'},{em:'🐧',word:'펭귄',hint:'남극에 살아요'},{em:'🦋',word:'나비',hint:'꽃에 앉아요'},{em:'🐠',word:'물고기',hint:'헤엄쳐요'}],'과일🍎':[{em:'🍎',word:'사과',hint:'빨갛고 달콤해요'},{em:'🍌',word:'바나나',hint:'노랗고 길어요'},{em:'🍇',word:'포도',hint:'작은 알이 모여요'},{em:'🍓',word:'딸기',hint:'빨갛고 작아요'},{em:'🍊',word:'귤',hint:'주황색이에요'},{em:'🍉',word:'수박',hint:'초록 껍질이에요'},{em:'🍋',word:'레몬',hint:'새콤해요'},{em:'🍑',word:'복숭아',hint:'분홍색 과일이에요'},{em:'🥝',word:'키위',hint:'갈색 껍질이에요'},{em:'🍒',word:'체리',hint:'빨간 작은 과일이에요'}],'탈것🚗':[{em:'🚗',word:'자동차',hint:'도로를 달려요'},{em:'🚌',word:'버스',hint:'여러 사람을 태워요'},{em:'🚂',word:'기차',hint:'레일 위를 달려요'},{em:'✈️',word:'비행기',hint:'하늘을 날아요'},{em:'🚢',word:'배',hint:'바다를 다녀요'},{em:'🚲',word:'자전거',hint:'페달을 밟아요'},{em:'🚀',word:'로켓',hint:'우주로 날아요'},{em:'🚁',word:'헬리콥터',hint:'프로펠러가 돌아요'},{em:'🚒',word:'소방차',hint:'불을 꺼요'},{em:'🚑',word:'구급차',hint:'아픈 사람을 도와요'}],'음식🍕':[{em:'🍕',word:'피자',hint:'이탈리아 음식이에요'},{em:'🍔',word:'햄버거',hint:'빵 사이에 패티가 있어요'},{em:'🍜',word:'라면',hint:'후루룩 먹어요'},{em:'🍦',word:'아이스크림',hint:'차갑고 달콤해요'},{em:'🎂',word:'케이크',hint:'생일에 먹어요'},{em:'🍩',word:'도넛',hint:'동그란 구멍 빵이에요'},{em:'🍫',word:'초콜릿',hint:'달콤한 갈색 과자예요'},{em:'🍣',word:'초밥',hint:'일본 음식이에요'},{em:'🌮',word:'타코',hint:'멕시코 음식이에요'},{em:'🍱',word:'도시락',hint:'상자에 담긴 밥이에요'}],'가족👨‍👩‍👧':[{em:'👩',word:'엄마',hint:'매일 맛있는 밥을 해 줘요'},{em:'👨',word:'아빠',hint:'같이 놀아 주는 분이에요'},{em:'👵',word:'할머니',hint:'아빠의 엄마예요'},{em:'👴',word:'할아버지',hint:'아빠의 아빠예요'},{em:'👧',word:'언니',hint:'나보다 나이가 많은 여자아이예요'},{em:'👦',word:'오빠',hint:'나보다 나이가 많은 남자아이예요'},{em:'🧒',word:'동생',hint:'나보다 나이가 어려요'},{em:'👶',word:'아기',hint:'아주 조그맣고 귀여워요'},{em:'👨‍👩‍👧',word:'가족',hint:'함께 사는 사람들이에요'},{em:'🧑',word:'삼촌',hint:'아빠의 형제예요'}],'학교🏫':[{em:'🏫',word:'학교',hint:'매일 가서 공부해요'},{em:'👩‍🏫',word:'선생님',hint:'칠판 앞에서 가르쳐 주세요'},{em:'👦',word:'친구',hint:'같이 놀고 싶은 사람이에요'},{em:'🪑',word:'의자',hint:'앉아서 공부해요'},{em:'🎒',word:'가방',hint:'책을 넣고 다녀요'},{em:'✏️',word:'연필',hint:'글씨를 쓸 때 써요'},{em:'📚',word:'책',hint:'읽으면 재미있어요'},{em:'🖍️',word:'크레용',hint:'색칠할 때 써요'},{em:'🏃',word:'운동장',hint:'뛰어 놀 수 있는 넓은 곳이에요'},{em:'🍚',word:'급식',hint:'학교에서 먹는 점심이에요'}],'자연🌿':[{em:'☀️',word:'해',hint:'아침에 하늘에서 빛나요'},{em:'🌙',word:'달',hint:'밤하늘에 떠 있어요'},{em:'⭐',word:'별',hint:'밤에 반짝반짝 빛나요'},{em:'☁️',word:'구름',hint:'하늘에 둥실둥실 떠 있어요'},{em:'🌈',word:'무지개',hint:'비가 온 뒤에 보여요'},{em:'🌊',word:'바다',hint:'넓고 물이 짜요'},{em:'🌳',word:'나무',hint:'키가 아주 커요'},{em:'🌸',word:'꽃',hint:'예쁘고 향기가 나요'},{em:'🌧️',word:'비',hint:'하늘에서 물이 내려요'},{em:'🍃',word:'바람',hint:'보이지 않지만 느껴져요'}],'생활용품🧦':[{em:'☂️',word:'우산',hint:'비 올 때 써요'},{em:'👟',word:'신발',hint:'발에 신어요'},{em:'🧦',word:'양말',hint:'발에 신는 옷이에요'},{em:'🥄',word:'숟가락',hint:'밥을 떠요'},{em:'🥢',word:'젓가락',hint:'반찬을 집어요'},{em:'🥛',word:'컵',hint:'물을 마셔요'},{em:'🪥',word:'칫솔',hint:'이를 닦아요'},{em:'🧼',word:'비누',hint:'손을 씻을 때 써요'},{em:'🧻',word:'수건',hint:'손을 닦아요'},{em:'👓',word:'안경',hint:'눈이 나쁠 때 써요'}]};
const DICT_CATS={'동물🐾':[{word:'고양이',em:'🐱',hint:'야옹 하고 울어요'},{word:'강아지',em:'🐶',hint:'멍멍 하고 짖어요'},{word:'코끼리',em:'🐘',hint:'코가 아주 길어요'},{word:'기린',em:'🦒',hint:'목이 아주 길어요'},{word:'토끼',em:'🐰',hint:'귀가 길고 껑충 뛰어요'},{word:'원숭이',em:'🐒',hint:'나무에 올라가요'},{word:'펭귄',em:'🐧',hint:'남극에 살아요'},{word:'호랑이',em:'🐯',hint:'줄무늬가 있어요'},{word:'곰',em:'🐻',hint:'겨울잠을 자요'},{word:'여우',em:'🦊',hint:'꼬리가 길어요'}],'과일🍎':[{word:'사과',em:'🍎',hint:'빨갛고 달콤해요'},{word:'바나나',em:'🍌',hint:'노랗고 길쭉해요'},{word:'포도',em:'🍇',hint:'작은 알이 모여요'},{word:'딸기',em:'🍓',hint:'빨갛고 달콤해요'},{word:'수박',em:'🍉',hint:'초록 껍질이에요'},{word:'복숭아',em:'🍑',hint:'분홍색이에요'},{word:'레몬',em:'🍋',hint:'새콤해요'},{word:'망고',em:'🥭',hint:'열대 과일이에요'},{word:'체리',em:'🍒',hint:'빨간 작은 과일'},{word:'멜론',em:'🍈',hint:'초록색 달콤한 과일'}],'색깔🎨':[{word:'빨강',em:'🔴',hint:'사과 색깔'},{word:'파랑',em:'🔵',hint:'하늘 색깔'},{word:'노랑',em:'🟡',hint:'태양 색깔'},{word:'초록',em:'🟢',hint:'풀 색깔'},{word:'보라',em:'🟣',hint:'포도 색깔'},{word:'주황',em:'🟠',hint:'오렌지 색깔'},{word:'분홍',em:'🩷',hint:'꽃 색깔'},{word:'검정',em:'⚫',hint:'밤 색깔'},{word:'하양',em:'⚪',hint:'눈 색깔'},{word:'갈색',em:'🟤',hint:'흙 색깔'}],'탈것🚗':[{word:'자동차',em:'🚗',hint:'도로를 달려요'},{word:'버스',em:'🚌',hint:'여러 사람 태워요'},{word:'기차',em:'🚂',hint:'레일 위 달려요'},{word:'비행기',em:'✈️',hint:'하늘을 날아요'},{word:'배',em:'🚢',hint:'바다를 다녀요'},{word:'자전거',em:'🚲',hint:'페달을 밟아요'},{word:'로켓',em:'🚀',hint:'우주로 날아요'},{word:'헬리콥터',em:'🚁',hint:'프로펠러가 돌아요'},{word:'소방차',em:'🚒',hint:'불을 꺼요'},{word:'구급차',em:'🚑',hint:'아픈 사람 도와요'}],'가족👨‍👩‍👧':[{word:'엄마',em:'👩',hint:'매일 맛있는 밥을 해 줘요'},{word:'아빠',em:'👨',hint:'같이 놀아 주는 분이에요'},{word:'할머니',em:'👵',hint:'아빠의 엄마예요'},{word:'할아버지',em:'👴',hint:'아빠의 아빠예요'},{word:'언니',em:'👧',hint:'나보다 나이가 많은 여자아이예요'},{word:'오빠',em:'👦',hint:'나보다 나이가 많은 남자아이예요'},{word:'동생',em:'🧒',hint:'나보다 나이가 어려요'},{word:'가족',em:'👨‍👩‍👧',hint:'함께 사는 사람들이에요'}],'학교🏫':[{word:'학교',em:'🏫',hint:'매일 가서 공부해요'},{word:'선생님',em:'👩‍🏫',hint:'칠판 앞에서 가르쳐 주세요'},{word:'친구',em:'👦',hint:'같이 놀고 싶은 사람이에요'},{word:'가방',em:'🎒',hint:'책을 넣고 다녀요'},{word:'연필',em:'✏️',hint:'글씨를 쓸 때 써요'},{word:'크레용',em:'🖍️',hint:'색칠할 때 써요'},{word:'운동장',em:'🏃',hint:'뛰어 놀 수 있는 넓은 곳이에요'},{word:'급식',em:'🍚',hint:'학교에서 먹는 점심이에요'}],'자연🌿':[{word:'해',em:'☀️',hint:'아침에 하늘에서 빛나요'},{word:'달',em:'🌙',hint:'밤하늘에 떠 있어요'},{word:'별',em:'⭐',hint:'밤에 반짝반짝 빛나요'},{word:'구름',em:'☁️',hint:'하늘에 둥실둥실 떠 있어요'},{word:'무지개',em:'🌈',hint:'비가 온 뒤에 보여요'},{word:'바다',em:'🌊',hint:'넓고 물이 짜요'},{word:'나무',em:'🌳',hint:'키가 아주 커요'},{word:'바람',em:'🍃',hint:'보이지 않지만 느껴져요'}],'생활용품🧦':[{word:'우산',em:'☂️',hint:'비 올 때 써요'},{word:'신발',em:'👟',hint:'발에 신어요'},{word:'양말',em:'🧦',hint:'발에 신는 옷이에요'},{word:'숟가락',em:'🥄',hint:'밥을 떠요'},{word:'젓가락',em:'🥢',hint:'반찬을 집어요'},{word:'컵',em:'🥛',hint:'물을 마셔요'},{word:'칫솔',em:'🪥',hint:'이를 닦아요'},{word:'비누',em:'🧼',hint:'손을 씻을 때 써요'}]};
const FISH_TYPES=[
  {id:'f1',em:'🐟',name:'파랑 물고기',pts:10,spd:1.0,rare:0,w:40},
  {id:'f2',em:'🐡',name:'복어',pts:15,spd:.7,rare:0,w:30},
  {id:'f3',em:'🦀',name:'게',pts:12,spd:.8,rare:0,w:35},
  {id:'f4',em:'🦑',name:'오징어',pts:18,spd:1.4,rare:0,w:28},
  {id:'f5',em:'🐚',name:'소라',pts:20,spd:.4,rare:0,w:20},
  {id:'f6',em:'🐠',name:'열대어',pts:30,spd:1.3,rare:1,w:15},
  {id:'f7',em:'🐙',name:'문어',pts:35,spd:.9,rare:1,w:12},
  {id:'f8',em:'🦞',name:'랍스터',pts:40,spd:1.1,rare:1,w:10},
  {id:'f9',em:'🐬',name:'돌고래',pts:50,spd:2.0,rare:1,w:8},
  {id:'f10',em:'🦈',name:'상어',pts:60,spd:1.8,rare:1,w:6},
  {id:'f11',em:'🐋',name:'고래',pts:80,spd:.6,rare:2,w:4},
  {id:'f12',em:'🦭',name:'물개',pts:70,spd:1.5,rare:2,w:4},
  {id:'f13',em:'🐊',name:'악어',pts:90,spd:1.2,rare:2,w:3},
  {id:'f14',em:'🦦',name:'수달',pts:75,spd:1.6,rare:2,w:3},
  {id:'f15',em:'🪸',name:'산호',pts:65,spd:.3,rare:2,w:3},
  {id:'f16',em:'🐲',name:'바다 용',pts:200,spd:2.5,rare:3,w:2},
  {id:'f17',em:'⭐',name:'황금 불가사리',pts:150,spd:.5,rare:3,w:2},
  {id:'f18',em:'🌊',name:'파도 정령',pts:180,spd:3.0,rare:3,w:1},
  {id:'f19',em:'💎',name:'다이아 물고기',pts:300,spd:2.8,rare:3,w:1},
  {id:'f20',em:'🏆',name:'황금 물고기',pts:500,spd:3.5,rare:3,w:1},
];
const FISH_RARITY=['일반','희귀✨','슈퍼레어💫','전설⚡'];
const TRASH=[{em:'👢',name:'장화'},{em:'🪣',name:'양동이'},{em:'🧦',name:'양말'},{em:'🎏',name:'쓰레기'}];
/* 🧠 생활·상식 퀴즈 — 7세(예비 초1) 눈높이 안전·생활·자연 상식 25문항.
   c 는 보기 배열에서 정답의 위치(0부터). 보기가 2개면 OX 퀴즈입니다. */
const LIFE_QUIZ=[
  {em:'🚦',q:'횡단보도에서 초록불이 깜빡깜빡할 때는 어떻게 할까요?',a:['빨리 뛰어서 건너요','다음 신호를 기다려요','눈을 감고 건너요','친구를 밀고 건너요'],c:1,why:'깜빡이면 곧 건너지 말고 다음 초록불을 기다려요!'},
  {em:'☔',q:'비 오는 날 밖에 나갈 때 필요한 것은 무엇일까요?',a:['우산','부채','셀매','선풍기'],c:0,why:'비를 막아 주는 우산을 써요.'},
  {em:'🐜',q:'개미는 어디에 살까요?',a:['땅속 개미집','바닷속','하늘 위','나무 꼭대기'],c:0,why:'개미는 땅을 파서 만든 개미집에 모여 살아요.'},
  {em:'🐧',q:'펭귄은 어디에 살까요?',a:['따뜻한 사막','남극 얼음 나라','열대 숲','높은 산 꼭대기'],c:1,why:'펭귄은 아주 추운 남극에 살아요.'},
  {em:'🐮',q:'소는 어떻게 울까요?',a:['야옹','음매','멍멍','꿀꿀'],c:1,why:'소는 “음매~” 하고 울어요.'},
  {em:'🐱',q:'고양이는 어떻게 울까요?',a:['야옹','개굴개굴','짹짹','어흥'],c:0,why:'고양이는 “야옹~” 하고 울어요.'},
  {em:'🚒',q:'불이 났을 때 불러야 하는 번호는?',a:['119','112','1339','111'],c:0,why:'불이 나면 119에 전화해요. 어른에게 바로 알려요!'},
  {em:'🟢',q:'초록불이 켜지면 길을 건너도 돼요.',a:['맞아요','아니예요'],c:0,why:'초록불은 건너도 된다는 신호예요.'},
  {em:'🙅',q:'모르는 사람이 “같이 가자” 하면 따라가도 돼요.',a:['맞아요','아니예요'],c:1,why:'모르는 사람을 따라가면 안 돼요. 바로 어른에게 알려요.'},
  {em:'🍚',q:'손을 꼭 씻어야 하는 때는 언제일까요?',a:['밥을 먹기 전','TV를 볼 때','잠을 잘 때','그림을 그릴 때'],c:0,why:'밥을 먹기 전과 밖에서 놀다 들어왔을 때 손을 씻어요.'},
  {em:'🦷',q:'이가 아플 때 가는 곳은 어디일까요?',a:['치과','미용실','문방구','은행'],c:0,why:'이가 아프면 치과에 가서 선생님께 보여 드려요.'},
  {em:'🥛',q:'우유는 어디에서 나올까요?',a:['소','닭','벌','물고기'],c:0,why:'소가 주는 우유로 마시고 치즈도 만들어요.'},
  {em:'🐝',q:'꿀을 만드는 곤충은 무엇일까요?',a:['벌','개미','나비','거미'],c:0,why:'벌이 꽃에서 꿀을 모아요.'},
  {em:'🚗',q:'차가 다니는 도로에서 공놀이를 해도 돼요.',a:['맞아요','아니예요'],c:1,why:'도로에서는 절대 놀면 안 돼요. 위험해요!'},
  {em:'🪜',q:'사다리를 타고 올라갈 때는 어떻게 할까요?',a:['한 칸씩 천천히','두 칸씩 뛰어서','뒤로 걸어서','손을 놓고'],c:0,why:'한 칸씩, 두 손으로 잡고 천천히 올라가요.'},
  {em:'👕',q:'더운 여름에 입기 좋은 옷은 무엇일까요?',a:['시원한 반팔','두꺼운 패딩','털모자','장갑'],c:0,why:'여름에는 시원하고 얇은 옷을 입어요.'},
  {em:'❄️',q:'추운 겨울에 하늘에서 내리는 하얀 것은?',a:['눈','모래','나무잎','별'],c:0,why:'겨울에는 눈이 내려서 세상이 하얗게 돼요.'},
  {em:'🌱',q:'사과 씨를 땅에 심으면 무엇이 자랄까요?',a:['사과나무','돌','구름','자동차'],c:0,why:'씨를 심으면 싹이 나고 나무가 자라요.'},
  {em:'🧼',q:'음식을 먹기 전에 손을 씻으면 좋아요.',a:['맞아요','아니예요'],c:0,why:'손을 씻으면 병균이 몸에 들어가지 않아요.'},
  {em:'🤕',q:'다친 친구를 보면 어떻게 할까요?',a:['어른에게 바로 알려요','보고 웃어요','도망가요','숨겨요'],c:0,why:'다친 친구는 선생님이나 어른에게 바로 알려요.'},
  {em:'🔴',q:'신호등에서 “멈춤”을 알리는 색은 무엇일까요?',a:['빨강','초록','파랑','하양'],c:0,why:'빨간불은 멈추라는 신호예요.'},
  {em:'🐟',q:'물고기는 무엇으로 숨을 쉬까요?',a:['아가미','코','날개','발'],c:0,why:'물고기는 아가미로 물속에서 숨을 쉬어요.'},
  {em:'🪥',q:'이를 하루에 한 번도 안 닦아도 돼요.',a:['맞아요','아니예요'],c:1,why:'이를 아침저녁으로 닦아야 이가 아프지 않아요.'},
  {em:'🐌',q:'달팽이는 무엇을 등에 지고 다녀요?',a:['집(껍데기)','가방','우산','모자'],c:0,why:'달팽이는 동그란 집을 등에 지고 천천히 걸어요.'},
  {em:'🌈',q:'비가 온 뒤 하늘에 뜨는 것은 무엇일까요?',a:['무지개','눈사람','별똥별','연'],c:0,why:'해가 나면 물방울에 빛이 부서져 무지개가 보여요.'},
  {em:'🚑',q:'구급차는 무슨 일을 할까요?',a:['아픈 사람을 병원에 데려가요','편지를 배달해요','요리를 해요','불을 꺼요'],c:0,why:'구급차는 아픈 사람을 빠르게 병원으로 데려가요.'},
  {em:'🌙',q:'해가 지고 밤이 되면 무엇이 보일까요?',a:['달과 별','무지개','나비','눈사람'],c:0,why:'밤하늘에는 달과 별이 빛나요.'},
  {em:'👪',q:'엄마 아빠 허락 없이 혼자 밖에 나가도 돼요.',a:['맞아요','아니예요'],c:1,why:'어디를 가든 꼭 어른에게 말하고 허락을 받아요.'}
];
const ROD_LEVELS=[{lv:1,name:'나무 낚싯대',em:'🎣',bonus:0,needExp:5},{lv:2,name:'대나무 낚싯대',em:'🎋',bonus:10,needExp:10},{lv:3,name:'카본 낚싯대',em:'🏹',bonus:20,needExp:18},{lv:4,name:'황금 낚싯대',em:'✨',bonus:35,needExp:30},{lv:5,name:'전설 낚싯대',em:'🌟',bonus:60,needExp:999}];
  window.KD = { CHAR_STAGES, ALL_STICKERS, ACHIEVEMENTS, P_WORLDS, MATH_CATS, ENG_CATS, WQ_CATS, DICT_CATS, LIFE_QUIZ, FISH_TYPES, FISH_RARITY, TRASH, ROD_LEVELS, COL_PALETTE, DRESS_CATS, DRESS_ITEMS };
  window.KD.P_STAGES = P_WORLDS.flatMap(w => w.stages.map(s => Object.assign({}, s, { worldName: w.name, worldColor: w.color })));
})();
