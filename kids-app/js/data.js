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
const WQ_CATS={'동물🐾':[{em:'🐱',word:'고양이',hint:'야옹 해요'},{em:'🐶',word:'강아지',hint:'멍멍 짖어요'},{em:'🐸',word:'개구리',hint:'개굴개굴 해요'},{em:'🦊',word:'여우',hint:'꼬리가 길어요'},{em:'🐼',word:'판다',hint:'흑백 무늬예요'},{em:'🦁',word:'사자',hint:'숲의 왕이에요'},{em:'🐮',word:'소',hint:'음매 해요'},{em:'🐧',word:'펭귄',hint:'남극에 살아요'},{em:'🦋',word:'나비',hint:'꽃에 앉아요'},{em:'🐠',word:'물고기',hint:'헤엄쳐요'}],'과일🍎':[{em:'🍎',word:'사과',hint:'빨갛고 달콤해요'},{em:'🍌',word:'바나나',hint:'노랗고 길어요'},{em:'🍇',word:'포도',hint:'작은 알이 모여요'},{em:'🍓',word:'딸기',hint:'빨갛고 작아요'},{em:'🍊',word:'귤',hint:'주황색이에요'},{em:'🍉',word:'수박',hint:'초록 껍질이에요'},{em:'🍋',word:'레몬',hint:'새콤해요'},{em:'🍑',word:'복숭아',hint:'분홍색 과일이에요'},{em:'🥝',word:'키위',hint:'갈색 껍질이에요'},{em:'🍒',word:'체리',hint:'빨간 작은 과일이에요'}],'탈것🚗':[{em:'🚗',word:'자동차',hint:'도로를 달려요'},{em:'🚌',word:'버스',hint:'여러 사람을 태워요'},{em:'🚂',word:'기차',hint:'레일 위를 달려요'},{em:'✈️',word:'비행기',hint:'하늘을 날아요'},{em:'🚢',word:'배',hint:'바다를 다녀요'},{em:'🚲',word:'자전거',hint:'페달을 밟아요'},{em:'🚀',word:'로켓',hint:'우주로 날아요'},{em:'🚁',word:'헬리콥터',hint:'프로펠러가 돌아요'},{em:'🚒',word:'소방차',hint:'불을 꺼요'},{em:'🚑',word:'구급차',hint:'아픈 사람을 도와요'}],'음식🍕':[{em:'🍕',word:'피자',hint:'이탈리아 음식이에요'},{em:'🍔',word:'햄버거',hint:'빵 사이에 패티가 있어요'},{em:'🍜',word:'라면',hint:'후루룩 먹어요'},{em:'🍦',word:'아이스크림',hint:'차갑고 달콤해요'},{em:'🎂',word:'케이크',hint:'생일에 먹어요'},{em:'🍩',word:'도넛',hint:'동그란 구멍 빵이에요'},{em:'🍫',word:'초콜릿',hint:'달콤한 갈색 과자예요'},{em:'🍣',word:'초밥',hint:'일본 음식이에요'},{em:'🌮',word:'타코',hint:'멕시코 음식이에요'},{em:'🍱',word:'도시락',hint:'상자에 담긴 밥이에요'}]};
const DICT_CATS={'동물🐾':[{word:'고양이',em:'🐱',hint:'야옹 하고 울어요'},{word:'강아지',em:'🐶',hint:'멍멍 하고 짖어요'},{word:'코끼리',em:'🐘',hint:'코가 아주 길어요'},{word:'기린',em:'🦒',hint:'목이 아주 길어요'},{word:'토끼',em:'🐰',hint:'귀가 길고 껑충 뛰어요'},{word:'원숭이',em:'🐒',hint:'나무에 올라가요'},{word:'펭귄',em:'🐧',hint:'남극에 살아요'},{word:'호랑이',em:'🐯',hint:'줄무늬가 있어요'},{word:'곰',em:'🐻',hint:'겨울잠을 자요'},{word:'여우',em:'🦊',hint:'꼬리가 길어요'}],'과일🍎':[{word:'사과',em:'🍎',hint:'빨갛고 달콤해요'},{word:'바나나',em:'🍌',hint:'노랗고 길쭉해요'},{word:'포도',em:'🍇',hint:'작은 알이 모여요'},{word:'딸기',em:'🍓',hint:'빨갛고 달콤해요'},{word:'수박',em:'🍉',hint:'초록 껍질이에요'},{word:'복숭아',em:'🍑',hint:'분홍색이에요'},{word:'레몬',em:'🍋',hint:'새콤해요'},{word:'망고',em:'🥭',hint:'열대 과일이에요'},{word:'체리',em:'🍒',hint:'빨간 작은 과일'},{word:'멜론',em:'🍈',hint:'초록색 달콤한 과일'}],'색깔🎨':[{word:'빨강',em:'🔴',hint:'사과 색깔'},{word:'파랑',em:'🔵',hint:'하늘 색깔'},{word:'노랑',em:'🟡',hint:'태양 색깔'},{word:'초록',em:'🟢',hint:'풀 색깔'},{word:'보라',em:'🟣',hint:'포도 색깔'},{word:'주황',em:'🟠',hint:'오렌지 색깔'},{word:'분홍',em:'🩷',hint:'꽃 색깔'},{word:'검정',em:'⚫',hint:'밤 색깔'},{word:'하양',em:'⚪',hint:'눈 색깔'},{word:'갈색',em:'🟤',hint:'흙 색깔'}],'탈것🚗':[{word:'자동차',em:'🚗',hint:'도로를 달려요'},{word:'버스',em:'🚌',hint:'여러 사람 태워요'},{word:'기차',em:'🚂',hint:'레일 위 달려요'},{word:'비행기',em:'✈️',hint:'하늘을 날아요'},{word:'배',em:'🚢',hint:'바다를 다녀요'},{word:'자전거',em:'🚲',hint:'페달을 밟아요'},{word:'로켓',em:'🚀',hint:'우주로 날아요'},{word:'헬리콥터',em:'🚁',hint:'프로펠러가 돌아요'},{word:'소방차',em:'🚒',hint:'불을 꺼요'},{word:'구급차',em:'🚑',hint:'아픈 사람 도와요'}]};
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
const ROD_LEVELS=[{lv:1,name:'나무 낚싯대',em:'🎣',bonus:0,needExp:5},{lv:2,name:'대나무 낚싯대',em:'🎋',bonus:10,needExp:10},{lv:3,name:'카본 낚싯대',em:'🏹',bonus:20,needExp:18},{lv:4,name:'황금 낚싯대',em:'✨',bonus:35,needExp:30},{lv:5,name:'전설 낚싯대',em:'🌟',bonus:60,needExp:999}];
  window.KD = { CHAR_STAGES, ALL_STICKERS, ACHIEVEMENTS, P_WORLDS, MATH_CATS, ENG_CATS, WQ_CATS, DICT_CATS, FISH_TYPES, FISH_RARITY, TRASH, ROD_LEVELS, COL_PALETTE, DRESS_CATS, DRESS_ITEMS };
  window.KD.P_STAGES = P_WORLDS.flatMap(w => w.stages.map(s => Object.assign({}, s, { worldName: w.name, worldColor: w.color })));
})();
