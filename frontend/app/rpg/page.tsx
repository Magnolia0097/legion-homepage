'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CharacterDef {
  name: string
  role: string
  nameColor: string
  avatarBg: string
  initial: string
}

interface Choice {
  label: string
  to: string
  aff?: Record<string, number>
  reset?: boolean
}

interface Scene {
  id: string
  speaker?: string
  expression?: string
  text: string
  next?: string
  choices?: Choice[]
  bg?: string
  bgm?: string
  shake?: boolean
  skipIfVisited?: string   // 이 캐릭터를 이미 방문했으면 자동 스킵
}

// ─────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────

const BG_IMAGES: Record<string, string> = {
  village_day:   '/vn/backgrounds/village_day.png',
  village_night: '/vn/backgrounds/village_night.png',
}

const BGM_TRACKS: Record<string, string> = {
  village_day:   '/vn/bgm/village_day.mp3',
  village_night: '/vn/bgm/village_night.mp3',
}

const CHAR_IMAGES: Record<string, Record<string, string>> = {
  mask: {
    normal: '/vn/characters/mask/nomal.png',
    cool:   '/vn/characters/mask/cool.png',
    smirk:  '/vn/characters/mask/smirk.png',
  },
}

// ─────────────────────────────────────────────────────────────
// Characters
// ─────────────────────────────────────────────────────────────

const CHARS: Record<string, CharacterDef> = {
  chan: {
    name: '찬', role: '군단장',
    nameColor: '#FFD700', avatarBg: '#8B2020', initial: '찬',
  },
  jinny: {
    name: '지니', role: '명예장교',
    nameColor: '#90EE90', avatarBg: '#1A5A70', initial: '지',
  },
  jonguri: {
    name: '종으리', role: '엘리트장교',
    nameColor: '#FF9900', avatarBg: '#1A3080', initial: '종',
  },
  mask: {
    name: '질투마스크', role: '엘리트장교',
    nameColor: '#FF9900', avatarBg: '#5B0082', initial: '질',
  },
  candy: {
    name: '캔디', role: '엘리트장교',
    nameColor: '#FF9900', avatarBg: '#8B205A', initial: '캔',
  },
  hilbbang: {
    name: '성심당힐빵', role: '엘리트장교',
    nameColor: '#FF9900', avatarBg: '#1A6B2A', initial: '힐',
  },
  nolulu: {
    name: '노룰루', role: '명예장교',
    nameColor: '#90EE90', avatarBg: '#2A4A6B', initial: '노',
  },
  irin: {
    name: '이린', role: '명예장교',
    nameColor: '#90EE90', avatarBg: '#2A2A4A', initial: '이',
  },
  jujang: {
    name: '주장', role: '명예장교',
    nameColor: '#90EE90', avatarBg: '#3A3A2A', initial: '주',
  },
  claire: {
    name: '클레어', role: '명예장교',
    nameColor: '#90EE90', avatarBg: '#703040', initial: '클',
  },
}

// ─────────────────────────────────────────────────────────────
// Hub Config — 방문 가능한 캐릭터 목록
// ─────────────────────────────────────────────────────────────

const HUB_CHARS = [
  { key: 'jinny',    label: '지니',              icon: '🏃', arrive: 'jini_arrive',    first: 'jinny_first'    },
  { key: 'jonguri',  label: '종으리',            icon: '🌳', arrive: 'jong_arrive',    first: 'jong_first'     },
  { key: 'mask',     label: '질투마스크',         icon: '🎭', arrive: 'mask_arrive',    first: 'mask_first'     },
  { key: 'candy',    label: '캔디',              icon: '🍬', arrive: 'candy_arrive',   first: 'candy_first'    },
  { key: 'hilbbang', label: '성심당힐빵',        icon: '💫', arrive: 'hil_arrive',     first: 'hilbbang_first' },
  { key: 'nolulu',   label: '노룰루',            icon: '🌀', arrive: 'nolulu_arrive',  first: 'nolulu_first'   },
  { key: 'irin',     label: '이린',              icon: '🌸', arrive: 'irin_arrive',    first: 'irin_first'     },
  { key: 'jujang',   label: '주장',              icon: '🗡️', arrive: 'jujang_arrive',  first: 'jujang_first'   },
  { key: 'claire',   label: '클레어',            icon: '🌅', arrive: 'claire_arrive',  first: 'claire_first'   },
]

// ─────────────────────────────────────────────────────────────
// Story
// ─────────────────────────────────────────────────────────────

const STORY: Record<string, Scene> = {

  // ── 프롤로그 ──────────────────────────────────────────────
  prologue_1: {
    id: 'prologue_1',
    bg: 'village_day', bgm: 'village_day',
    text: '노을이 물드는 저녁, 당신은 한 마을 앞에 멈춰 선다.\n\n마을 입구의 낡은 표지판에는 이렇게 적혀 있었다.\n\n「 성심당 마을 — 친목 · 라이트유저 · 매너 플레이 」',
    next: 'prologue_2',
  },
  prologue_2: {
    id: 'prologue_2',
    text: '오늘, 당신은 아이온2에서 처음으로 레기온에 들어왔다.',
    next: 'prologue_3',
  },
  prologue_3: {
    id: 'prologue_3',
    text: '🔔  [성심당] 레기온이 가입을 승인했습니다.',
    next: 'prologue_4',
  },
  prologue_4: {
    id: 'prologue_4',
    text: '안쪽에서 발소리가 들려온다.\n\n누군가 당신을 향해 걸어오고 있었다.',
    next: 'prologue_5',
  },
  prologue_5: {
    id: 'prologue_5',
    text: '그 전에, 채팅창 한 구석에 메시지가 하나 이미 떠 있었다.',
    next: 'prologue_6',
  },
  prologue_6: {
    id: 'prologue_6',
    speaker: 'chan',
    text: '어... 어서 오세요..!! 저 군단장 찬이에요..ㅎ 기다리고 있었어요..!',
    next: 'prologue_7',
  },
  prologue_7: {
    id: 'prologue_7',
    text: '가입 승인과 동시에 날아온 귓속말.\n이 사람, 채팅창을 계속 보고 있었던 것인가.',
    next: 'chan_1',
  },

  // ── Chapter 1: 찬 ──────────────────────────────────────────
  chan_1: {
    id: 'chan_1',
    speaker: 'chan',
    text: '어.. 어서 오세요! 저 군단장 찬이에요.',
    next: 'chan_2',
  },
  chan_2: {
    id: 'chan_2',
    speaker: 'chan',
    text: '...뭐, 군단장이라고 하기엔 좀 약하지만. 하하.',
    next: 'chan_3',
  },
  chan_3: {
    id: 'chan_3',
    speaker: 'chan',
    text: '성심당 마을에 온 것을 환영해요! 우리 멤버들 잘 부탁드려요 ㅎㅎ',
    choices: [
      { label: '😊  반갑습니다! 잘 부탁드려요!', to: 'chan_a', aff: { chan: 2 } },
      { label: '🤔  군단장이 약하다고요?', to: 'chan_b', aff: { chan: 1 } },
    ],
  },
  chan_a: {
    id: 'chan_a',
    speaker: 'chan',
    text: '하하! 좋아요 좋아요. 마음이 따뜻한 분이군요.\n우리 멤버들이랑 분명 잘 어울릴 것 같아요. (눈가가 살짝 촉촉해진다)\n아 아니 울려던 건 아닌데.. 그냥 반가워서..',
    next: 'chan_4',
  },
  chan_b: {
    id: 'chan_b',
    speaker: 'chan',
    text: '(살짝 당황하며) 아, 그... 실력이 중요한 게 아니라 마음이 중요한 거잖아요...ㅎㅎ',
    next: 'chan_b2',
  },
  chan_b2: {
    id: 'chan_b2',
    speaker: 'chan',
    text: '뭐, 그래도 우리 멤버들이 든든하니까 괜찮아요! 진짜예요.',
    next: 'chan_4',
  },
  chan_4: {
    id: 'chan_4',
    speaker: 'chan',
    text: '오늘은 제가 직접 멤버들 소개시켜 드릴게요. 다들 개성이 좀 많이 넘치거든요.',
    next: 'chan_5',
  },
  chan_5: {
    id: 'chan_5',
    speaker: 'chan',
    text: '아, 그리고... 특이한 분들을 만나더라도 당황하지 마세요 !',
    choices: [
      { label: '😂  특이한 분이요?', to: 'chan_c', aff: { chan: 1 } },
      { label: '😌  걱정 마세요, 저 적응력 좋아요', to: 'chan_d', aff: { chan: 2 } },
    ],
  },
  chan_c: {
    id: 'chan_c',
    speaker: 'chan',
    text: '곧 알게 되실 거예요. 네. 하하...',
    next: 'chan_6',
  },
  chan_d: {
    id: 'chan_d',
    speaker: 'chan',
    text: '아 진짜요?! 그거 다행이다... (또 눈물 찔끔)\n아 아니 이게 왜 감동이냐고... 저도 모르겠어요..',
    next: 'chan_6',
  },
  chan_6: {
    id: 'chan_6',
    speaker: 'chan',
    text: '자! 그럼 출발해볼게요. 누구를 만나러 가볼까요?',
    next: 'hub',
  },

  // ── 허브 (Hub) — 특수 씬, 엔진에서 별도 렌더링 ─────────────────
  hub: {
    id: 'hub',
    text: '',
  },

  // ── First-visit 특별 대사 ─────────────────────────────────────

  jinny_first: {
    id: 'jinny_first',
    speaker: 'jinny',
    text: '잠깐, 나한테 제일 먼저 왔어?!',
    next: 'jinny_first_2',
  },
  jinny_first_2: {
    id: 'jinny_first_2',
    speaker: 'jinny',
    text: '어어어어어!!! 진짜?!?!\n나 진짜 너무 좋아!! 이거 완전 좋은 선택이야!! 확실해!!!',
    next: 'jini_arrive',
  },

  jong_first: {
    id: 'jong_first',
    text: '나무 뒤에서 슬그머니 고개를 내밀었다.',
    next: 'jong_first_2',
  },
  jong_first_2: {
    id: 'jong_first_2',
    speaker: 'jonguri',
    text: '...나한테 제일 먼저 온 거야?',
    next: 'jong_first_3',
  },
  jong_first_3: {
    id: 'jong_first_3',
    speaker: 'jonguri',
    text: '(잠깐 침묵)\n...뭐. 싫진 않아.',
    next: 'jong_arrive',
  },

  mask_first: {
    id: 'mask_first',
    speaker: 'mask',
    expression: 'smirk',
    text: '오... 나한테 제일 먼저 왔어?',
    next: 'mask_first_2',
  },
  mask_first_2: {
    id: 'mask_first_2',
    speaker: 'mask',
    expression: 'smirk',
    text: '(마스크 뒤로 흐뭇한 기색이 스멀스멀)\n뭐... 보는 눈이 있군.',
    next: 'mask_arrive',
  },

  candy_first: {
    id: 'candy_first',
    speaker: 'candy',
    text: '어멋-!!! 나한테 제일 먼저 왔어요?!?! 어멋어멋!!!!!',
    next: 'candy_first_2',
  },
  candy_first_2: {
    id: 'candy_first_2',
    speaker: 'candy',
    text: '(뿅뿅 하트가 터지는 이펙트)\n너무너무 반가워요!!!',
    next: 'candy_arrive',
  },

  hilbbang_first: {
    id: 'hilbbang_first',
    speaker: 'hilbbang',
    text: '어머~ 저한테 제일 먼저 오셨어요?',
    next: 'hilbbang_first_2',
  },
  hilbbang_first_2: {
    id: 'hilbbang_first_2',
    speaker: 'hilbbang',
    text: '(환하게 웃으며) 감사해요~!! 사실 채팅창 보면서 기다리고 있었어요~',
    next: 'hil_arrive',
  },

  nolulu_first: {
    id: 'nolulu_first',
    speaker: 'nolulu',
    text: '오오!! 나한테 먼저!! 좋아 마음에 든다!!',
    next: 'nolulu_first_2',
  },
  nolulu_first_2: {
    id: 'nolulu_first_2',
    speaker: 'nolulu',
    shake: true,
    text: '호칸의—',
    next: 'nolulu_first_3',
  },
  nolulu_first_3: {
    id: 'nolulu_first_3',
    speaker: 'chan',
    text: '(재빠르게 막으며) 잠깐만요잠깐만요!! 아직 소개도 안 했는데!!',
    next: 'nolulu_arrive',
  },

  irin_first: {
    id: 'irin_first',
    speaker: 'irin',
    text: '어? 나한테 먼저 왔어?',
    next: 'irin_first_2',
  },
  irin_first_2: {
    id: 'irin_first_2',
    speaker: 'irin',
    text: '...헤헤. 좋아.\n그럼 썰자~!',
    next: 'irin_arrive',
  },

  jujang_first: {
    id: 'jujang_first',
    text: '벽에 기댄 사람이 잠깐 고개를 들었다.',
    next: 'jujang_first_2',
  },
  jujang_first_2: {
    id: 'jujang_first_2',
    speaker: 'jujang',
    text: '...나한테 먼저 왔어?',
    next: 'jujang_first_3',
  },
  jujang_first_3: {
    id: 'jujang_first_3',
    speaker: 'jujang',
    text: '(조용히) ...나쁘지 않네.',
    next: 'jujang_arrive',
  },

  claire_first: {
    id: 'claire_first',
    text: '🔔  클레어 님이 접속했습니다.',
    next: 'claire_first_2',
  },
  claire_first_2: {
    id: 'claire_first_2',
    speaker: 'claire',
    text: '어머~ 저한테 제일 먼저 오셨군요.',
    next: 'claire_first_3',
  },
  claire_first_3: {
    id: 'claire_first_3',
    speaker: 'claire',
    text: '오늘은 조금 더 있을 수 있을 것 같아요.\n마침 잘 됐네요. 반가워요~',
    next: 'claire_arrive',
  },

  // ── Chapter 2: 지니 ──────────────────────────────────────────
  jini_arrive: {
    id: 'jini_arrive',
    text: '광장 쪽으로 발걸음을 떼자마자, 저 멀리서 누군가가 이쪽으로 달려오는 것이 보였다.',
    next: 'jini_1',
  },
  jini_1: {
    id: 'jini_1',
    speaker: 'jinny',
    text: '어어어 새 멤버다!! 안녕하세요!! 반가워요!!!!',
    next: 'jini_2',
  },
  jini_2: {
    id: 'jini_2',
    speaker: 'jinny',
    text: '저 지니예요!! 성심당 오신 거 정말 잘하셨어요 진짜!!',
    next: 'jini_3',
  },
  jini_3: {
    id: 'jini_3',
    speaker: 'chan',
    text: '(귓속말) 지니는 원래 저래요. 당황하지 마세요.',
    next: 'jini_4',
  },
  jini_4: {
    id: 'jini_4',
    speaker: 'jinny',
    text: '나 여기 성심당 영업왕이야! 멤버 엄청 많이 데려왔거든?\n어쩌다 오게 됐어? 아이온 얼마나 했어? 어디서 알고 왔어?',
    next: 'jini_5',
  },
  jini_5: {
    id: 'jini_5',
    text: '질문이 세 개가 동시에 날아왔다.',
    choices: [
      { label: '💬  천천히 여쭤봐 주시면...', to: 'jini_c_a', aff: { jinny: 1 } },
      { label: '😵  (말을 못 하겠다)', to: 'jini_c_b', aff: { jinny: 2 } },
    ],
  },
  jini_c_a: {
    id: 'jini_c_a',
    speaker: 'jinny',
    text: '아 맞다!! 미안미안 내가 좀 빠른 편이라!! 하하!!\n아무튼 환영해!! 무조건 재밌을 거야!!',
    next: 'jini_6',
  },
  jini_c_b: {
    id: 'jini_c_b',
    speaker: 'jinny',
    text: '왜 그런 얼굴이야 ㅋㅋㅋ 내가 좀 많이 빠르긴 하지 ㅋㅋ\n걱정 마! 익숙해지면 돼!!',
    next: 'jini_c_b2',
  },
  jini_c_b2: {
    id: 'jini_c_b2',
    speaker: 'chan',
    text: '(귓속말) 저도 아직 익숙하지 않아요..',
    next: 'jini_6',
  },
  jini_6: {
    id: 'jini_6',
    speaker: 'jinny',
    text: '마을 곳곳에 숨겨진 아이템이 있다던데... 찾아봐! (사실 나도 어딘지 몰라)',
    next: 'jini_7',
  },
  jini_7: {
    id: 'jini_7',
    speaker: 'chan',
    text: '(귓속말) 하하... 지니는 언제나 저래.\n근데 이상하게 주변이 밝아지는 느낌이 있어요.',
    next: 'jini_8',
  },
  jini_8: {
    id: 'jini_8',
    speaker: 'jinny',
    text: '아참, 나 루드라 심장과 루드라 무기도 있다구! 내 힘이 필요하면 말해!',
    choices: [
      { label: '😮  루드라 심장을요?! 거기다 무기까지..!? 어떻게 얻으신거에요?!', to: 'jini_c2_a', aff: { jinny: 1, chan: 1 } },
      { label: '🙏  나중에 꼭 도움 받고 싶어요', to: 'jini_c2_b', aff: { jinny: 2 } },
    ],
  },
  jini_c2_a: {
    id: 'jini_c2_a',
    speaker: 'jinny',
    text: '헤헤~ 뭐 그때는 좀 운이 좋았달까 ~ 그랬지~',
    next: 'jini_c2_a2',
  },
  jini_c2_a2: {
    id: 'jini_c2_a2',
    speaker: 'chan',
    text: '(눈물 한 방울) 우리 지니가 진짜 강해..',
    next: 'jini_end',
  },
  jini_c2_b: {
    id: 'jini_c2_b',
    speaker: 'jinny',
    text: '오케이오케이!! 부르면 달려갈게!!\n아 근데 나니한테 걸리면 못 갈 수도 있어.. 할 일을 자꾸 미루다보니 그만.. ㅠ',
    next: 'jini_end',
  },
  jini_end: {
    id: 'jini_end',
    speaker: 'chan',
    text: '자, 다음 가보자고요. 지니, 나중에 또 봐요.',
    next: 'jini_bye',
  },
  jini_bye: {
    id: 'jini_bye',
    speaker: 'jinny',
    text: '또 봐~~!! (신나게 손 흔들며 사라짐)',
    next: 'hub',
  },

  // ── Chapter 3: 종으리 ──────────────────────────────────────────
  jong_arrive: {
    id: 'jong_arrive',
    speaker: 'chan',
    text: '다음은 종으리예요. 어... 어디 있지?',
    next: 'jong_arrive2',
  },
  jong_arrive2: {
    id: 'jong_arrive2',
    text: '사방이 고요하다.\n\n주미온 나무 뒤에서 인기척이 느껴진다.',
    choices: [
      { label: '👀  나무 뒤를 살짝 들여다본다', to: 'jong_look', aff: { jonguri: 1 } },
      { label: '😶  못 본 척하고 지나간다', to: 'jong_ignore', aff: { jonguri: 2 } },
    ],
  },
  jong_look: {
    id: 'jong_look',
    speaker: 'jonguri',
    text: '...!\n\n...보고 있었던 거 아님. 그냥 서 있었던 거임.',
    next: 'jong_intro',
  },
  jong_ignore: {
    id: 'jong_ignore',
    speaker: 'jonguri',
    text: '...알아챘지? 알아챈 거지?',
    next: 'jong_ignore2',
  },
  jong_ignore2: {
    id: 'jong_ignore2',
    speaker: 'chan',
    text: '(귓속말) 저도 항상 저렇게 만나요.',
    next: 'jong_intro',
  },
  jong_intro: {
    id: 'jong_intro',
    speaker: 'chan',
    text: '종으리! 새 멤버예요. 소개 좀 해줘요.',
    next: 'jong_1',
  },
  jong_1: {
    id: 'jong_1',
    speaker: 'jonguri',
    text: '...어서 와.',
    next: 'jong_2',
  },
  jong_2: {
    id: 'jong_2',
    text: '말이 없다. 하지만 눈은 채팅창을 은근슬쩍 보고 있다.',
    next: 'jong_3',
  },
  jong_3: {
    id: 'jong_3',
    speaker: 'chan',
    text: '(귓속말) 종으리가 레기온 챗 항상 보고 있어요.\n말은 잘 안 하는데 다 읽고 있어요. 부르면 바로 대답해요.',
    next: 'jong_4',
  },
  jong_4: {
    id: 'jong_4',
    speaker: 'jonguri',
    text: '...루드라랑 1:1 했는데 이겼어.\n진짜야.',
    next: 'jong_5',
  },
  jong_5: {
    id: 'jong_5',
    text: '처음 꺼낸 말치고는 꽤 뜬금없었다.',
    next: 'jong_6',
  },
  jong_6: {
    id: 'jong_6',
    speaker: 'chan',
    text: '(귓속말) ...사실 진짜예요.\n내가 봤거든요.',
    choices: [
      { label: '😮  정말요? 대단하시네요', to: 'jong_believe', aff: { jonguri: 2 } },
      { label: '🤨  아무래도 믿기 어렵네요...', to: 'jong_doubt', aff: { jonguri: 0 } },
    ],
  },
  jong_believe: {
    id: 'jong_believe',
    speaker: 'jonguri',
    text: '...응. (짧게 고개를 끄덕인다)',
    next: 'jong_believe2',
  },
  jong_believe2: {
    id: 'jong_believe2',
    text: '표정이 아주 조금 풀렸다.',
    next: 'jong_q',
  },
  jong_doubt: {
    id: 'jong_doubt',
    speaker: 'jonguri',
    text: '(잠깐 침묵)\n\n...언젠가는 믿어줄 거야.',
    next: 'jong_doubt2',
  },
  jong_doubt2: {
    id: 'jong_doubt2',
    text: '왜인지 모르게 미안해졌다.',
    next: 'jong_q',
  },
  jong_q: {
    id: 'jong_q',
    speaker: 'jonguri',
    text: '...모르는 거 있으면 물어봐. 게임은 좀 알아.',
    choices: [
      { label: '🎮  그럼 초보한테 뭐부터 해야 해요?', to: 'jong_q_a', aff: { jonguri: 2 } },
      { label: '🙂  그냥 조용히 보고 계셨던 거예요?', to: 'jong_q_b', aff: { jonguri: 1 } },
    ],
  },
  jong_q_a: {
    id: 'jong_q_a',
    speaker: 'jonguri',
    text: '...어. (잠깐 생각하더니 조용히, 그러나 아주 상세하게 설명을 시작한다)\n주미온에서 일퀘 먼저. 어비스는 3레벨부터. 장비는...',
    next: 'jong_q_a2',
  },
  jong_q_a2: {
    id: 'jong_q_a2',
    text: '10분이 흘렀다. 말수는 적었지만 내용은 빽빽했다.',
    next: 'jong_q_a3',
  },
  jong_q_a3: {
    id: 'jong_q_a3',
    speaker: 'chan',
    text: '(귓속말) 일단 고맙다고 해요. 안 그러면 계속해요.',
    next: 'hub',
  },
  jong_q_b: {
    id: 'jong_q_b',
    speaker: 'jonguri',
    text: '...응. 항상.',
    next: 'jong_q_b2',
  },
  jong_q_b2: {
    id: 'jong_q_b2',
    speaker: 'chan',
    text: '(귓속말) 저도 나중에 알았어요. 다 보고 있다는 거.',
    next: 'hub',
  },

  // ── Chapter 4-A: 질투마스크 ──────────────────────────────────
  mask_arrive: {
    id: 'mask_arrive',
    speaker: 'chan',
    text: '다음은 질투마스크예요. 이름이 좀 특이하죠 ㅎㅎ',
    next: 'mask_1',
  },
  mask_1: {
    id: 'mask_1',
    text: '분수대 앞에 마스크를 쓴 남자가 서 있었다. 누가 봐도 의도적인 포즈.',
    next: 'mask_2',
  },
  mask_2: {
    id: 'mask_2',
    speaker: 'mask',
    expression: 'cool',
    text: '흠... 오늘 뭐 좀 재밌는 거 없나?',
    next: 'mask_3',
  },
  mask_3: {
    id: 'mask_3',
    text: '그 말과 함께 이쪽을 힐끔 쳐다봤다.',
    next: 'mask_4',
  },
  mask_4: {
    id: 'mask_4',
    speaker: 'mask',
    text: '오. 새 멤버?',
    next: 'mask_5',
  },
  mask_5: {
    id: 'mask_5',
    speaker: 'mask',
    text: '나는 질투마스크. 불신 선발대 출신이야.\n처음부터 있었다는 거지.',
    choices: [
      { label: '✨  불신 선발대요? 대단하시네요!', to: 'mask_c_a', aff: { mask: 2 } },
      { label: '🙂  왜 마스크를 쓰고 계세요?', to: 'mask_c_b', aff: { mask: 1 } },
    ],
  },
  mask_c_a: {
    id: 'mask_c_a',
    speaker: 'mask',
    expression: 'smirk',
    text: '(마스크 뒤로 흐뭇한 기색이 느껴진다)\n뭐... 아는 사람은 아는 거지.',
    next: 'mask_c_a2',
  },
  mask_c_a2: {
    id: 'mask_c_a2',
    speaker: 'chan',
    text: '(귓속말) 저 지금 진짜 좋아하는 거예요.',
    next: 'mask_enhance',
  },
  mask_c_b: {
    id: 'mask_c_b',
    speaker: 'mask',
    expression: 'smirk',
    text: '비밀이야, 비밀. 알고 싶으면 더 친해져봐.',
    next: 'mask_c_b2',
  },
  mask_c_b2: {
    id: 'mask_c_b2',
    speaker: 'chan',
    text: '(귓속말) 실은 나도 왜 마스크를 쓰는지 모르겠어.\n물어보면 항상 저렇게 대답하더라고.',
    next: 'mask_enhance',
  },
  mask_enhance: {
    id: 'mask_enhance',
    speaker: 'mask',
    text: '(신규 멤버를 보며) 강화 성공했어?',
    choices: [
      { label: '😅  아직 강화해본 적이 없어요', to: 'mask_e_a', aff: { mask: 1 } },
      { label: '😮  아, 아까 한 번 됐어요!', to: 'mask_e_b', aff: { mask: -1 } },
    ],
  },
  mask_e_a: {
    id: 'mask_e_a',
    speaker: 'mask',
    text: '...그래. 뭐. 그럼 됐어.',
    next: 'mask_e_a2',
  },
  mask_e_a2: {
    id: 'mask_e_a2',
    text: '왠지 안도하는 것 같다.',
    next: 'mask_sleep',
  },
  mask_e_b: {
    id: 'mask_e_b',
    speaker: 'mask',
    expression: 'cool',
    text: '(순식간에 마스크를 꽉 쥐며)\n...그래.',
    next: 'mask_e_b2',
  },
  mask_e_b2: {
    id: 'mask_e_b2',
    speaker: 'chan',
    text: '(귓속말) 질투 발동했어요. 다른 사람 강화 성공하면 항상 저래요.',
    next: 'mask_sleep',
  },
  mask_sleep: {
    id: 'mask_sleep',
    speaker: 'mask',
    text: '아, 나 오늘 9시에 자야 해서. 일찍 들어갈 거야.',
    next: 'mask_sleep2',
  },
  mask_sleep2: {
    id: 'mask_sleep2',
    speaker: 'chan',
    text: '(귓속말) ...새벽까지 게임해. 진짜야.',
    choices: [
      { label: '😶  (못 들은 척)', to: 'mask_s_a', aff: { mask: 1 } },
      { label: '😏  9시에요? 건강하시겠다', to: 'mask_s_b', aff: { mask: 0 } },
    ],
  },
  mask_s_a: {
    id: 'mask_s_a',
    speaker: 'mask',
    expression: 'smirk',
    text: '(흡족한 표정)',
    next: 'hub',
  },
  mask_s_b: {
    id: 'mask_s_b',
    speaker: 'mask',
    text: '...어. 뭐. 건강이 중요하지.',
    next: 'mask_s_b2',
  },
  mask_s_b2: {
    id: 'mask_s_b2',
    speaker: 'chan',
    text: '(귓속말) 지금 새벽 3시까지 할 거야.',
    next: 'hub',
  },

  // ── Chapter 4-B: 캔디 ──────────────────────────────────────────
  candy_arrive: {
    id: 'candy_arrive',
    speaker: 'chan',
    text: '다음은 캔디예요! 우리 마법소녀!',
    next: 'candy_1',
  },
  candy_1: {
    id: 'candy_1',
    text: '광장 한쪽에서 묵직한 전곤을 들고 있는 사람이 보였다.\n외모와 무기의 갭이 상당하다.',
    next: 'candy_2',
  },
  candy_2: {
    id: 'candy_2',
    speaker: 'candy',
    text: '어멋-!! 새 멤버에요??',
    next: 'candy_3',
  },
  candy_3: {
    id: 'candy_3',
    speaker: 'candy',
    text: '어멋-!! 반가워요!! 저 캔디예요! 성심당 마법소녀!!',
    choices: [
      { label: '🍬  캔디 씨가 마법소녀예요?', to: 'candy_c_b', aff: { candy: 2 } },
      { label: '🔨  그 전곤... 되게 묵직해 보이는데요?', to: 'candy_c_weapon', aff: { candy: 1 } },
    ],
  },
  candy_c_b: {
    id: 'candy_c_b',
    speaker: 'candy',
    text: '어멋-!! 알아봐 주셨어요!!! 맞아요 맞아요!!!\n겉보기에는 전곤이지만 마법의 힘이 깃들어 있다구요!',
    next: 'candy_drink',
  },
  candy_c_weapon: {
    id: 'candy_c_weapon',
    speaker: 'candy',
    text: '어멋- 이거요? 무거워 보여도 마법소녀한테는 깃털 같은 거예요!\n...사실 좀 무거워요.',
    next: 'candy_c_weapon2',
  },
  candy_c_weapon2: {
    id: 'candy_c_weapon2',
    speaker: 'chan',
    text: '(귓속말) 답답하면 지갑을 열어서 장비를 사는 타입이에요.\n그 덕에 나니아 치유가 기강이 잡히는 중이에요.',
    next: 'candy_drink',
  },
  candy_drink: {
    id: 'candy_drink',
    speaker: 'candy',
    text: '아, 나중에 술 한잔 해요..ㅎㅎ 아직은 좀 부끄러워서...',
    next: 'candy_drink2',
  },
  candy_drink2: {
    id: 'candy_drink2',
    speaker: 'chan',
    text: '(귓속말) 나중에 나중에 나중에라고 하는데... 언제인지는 나도 모르겠어요.',
    next: 'candy_manage',
  },
  candy_manage: {
    id: 'candy_manage',
    speaker: 'chan',
    text: '(귓속말) 그리고 캔디는 성심당 단도리 담당이에요.\n일터지면 정리하는 건 항상 캔디예요.',
    next: 'candy_manage2',
  },
  candy_manage2: {
    id: 'candy_manage2',
    speaker: 'candy',
    text: '...근데 사실 군단장님만 잡도리하고 있어요. 하하.',
    choices: [
      { label: '😂  군단장님을요?', to: 'candy_chan_a', aff: { candy: 1, chan: 0 } },
      { label: '😌  듬직하시네요', to: 'candy_chan_b', aff: { candy: 2 } },
    ],
  },
  candy_chan_a: {
    id: 'candy_chan_a',
    speaker: 'chan',
    text: '(귓속말) ...나 지금 억울한데.',
    next: 'candy_end',
  },
  candy_chan_b: {
    id: 'candy_chan_b',
    speaker: 'candy',
    text: '어멋-!! 고마워요! 누가 듬직하다고 해준 건 처음이에요!',
    next: 'candy_end',
  },
  candy_end: {
    id: 'candy_end',
    speaker: 'chan',
    text: '자, 다음 멤버 만나러 가볼까요?',
    next: 'hub',
  },

  // ── Chapter 5: 힐빵 ──────────────────────────────────────────
  hil_arrive: {
    id: 'hil_arrive',
    speaker: 'chan',
    text: '다음은 힐빵이에요. 우리 치유 담당!',
    next: 'hil_1',
  },
  hil_1: {
    id: 'hil_1',
    text: '창고 앞에서 채팅창을 열심히 들여다보고 있는 사람이 있었다.',
    next: 'hil_2',
  },
  hil_2: {
    id: 'hil_2',
    speaker: 'hilbbang',
    text: '오! 새로운 분이 왔군요~\n오늘도 평화로운 하루야.',
    next: 'hil_3',
  },
  hil_3: {
    id: 'hil_3',
    speaker: 'hilbbang',
    text: '혹시 다친 곳은 없나요? 제 힐링 스킬은 마을 최고라고요! ...아마도?',
    next: 'hil_4',
  },
  hil_4: {
    id: 'hil_4',
    speaker: 'chan',
    text: '(귓속말) 힐빵이 있으면 든든하지. 근데\n마지막에 "아마도" 붙이는 건 걱정되긴 해.',
    choices: [
      { label: '🙏  "아마도"가 아니라 확실히 잘 하시는 거 맞죠?', to: 'hil_c_a', aff: { hilbbang: 2 } },
      { label: '😂  아마도...라고요 ㅋㅋ', to: 'hil_c_b', aff: { hilbbang: 1 } },
    ],
  },
  hil_c_a: {
    id: 'hil_c_a',
    speaker: 'hilbbang',
    text: '아 그죠?! 저 키벨런은 진짜 잘 해요!! 그건 확실해요!!\n(살짝 자신감 차오름)',
    next: 'hil_5',
  },
  hil_c_b: {
    id: 'hil_c_b',
    speaker: 'hilbbang',
    text: '아 아니 그게... 그냥 겸손하게 말한 거예요.. 하하..',
    next: 'hil_5',
  },
  hil_5: {
    id: 'hil_5',
    text: '그때 채팅창에 뭔가 흘러갔다.',
    next: 'hil_6',
  },
  hil_6: {
    id: 'hil_6',
    speaker: 'hilbbang',
    text: '(채팅창 보며 눈을 가늘게 뜨며)\n어... 이게 마... 미르 길드인가요? 마르쿠탄에 미르가 참 많네요.',
    next: 'hil_7',
  },
  hil_7: {
    id: 'hil_7',
    speaker: 'chan',
    text: '(귓속말) 마르를 미르라고 읽는 게 특징이야. 웃기지 ㅎㅎ',
    choices: [
      { label: '😅  마르...죠? 마르 맞는 거 맞죠?', to: 'hil_c2_a', aff: { hilbbang: 1 } },
      { label: '😌  뭐 마르나 미르나 비슷비슷한 거 아닐까요', to: 'hil_c2_b', aff: { hilbbang: 2 } },
    ],
  },
  hil_c2_a: {
    id: 'hil_c2_a',
    speaker: 'hilbbang',
    text: '아 마르!! 맞다 마르!! 잠깐 글씨가 작아서...\n채팅창이 좀 눈에 안 들어와서요.. 하하',
    next: 'hil_8',
  },
  hil_c2_b: {
    id: 'hil_c2_b',
    speaker: 'hilbbang',
    text: '아 그죠?! 저만 그런 게 아닌 거죠?! (안도)',
    next: 'hil_c2_b2',
  },
  hil_c2_b2: {
    id: 'hil_c2_b2',
    speaker: 'chan',
    text: '(귓속말) ...비슷하지 않은데.',
    next: 'hil_8',
  },
  hil_8: {
    id: 'hil_8',
    speaker: 'hilbbang',
    text: '저 시즌3까지도 분크메 끼고 있을 것 같아서 무서워요..',
    choices: [
      { label: '🤗  분크메든 뭐든 잘만 고쳐주시면 되죠!', to: 'hil_c3_a', aff: { hilbbang: 2 } },
      { label: '🙂  결혼한 사람들이 부럽다고 하셨나요?', to: 'hil_c3_b', aff: { hilbbang: 1 } },
    ],
  },
  hil_c3_a: {
    id: 'hil_c3_a',
    speaker: 'hilbbang',
    text: '아... 맞는 말이긴 한데... (살짝 감동)\n(속으로) 이 분 마음에 들어.',
    next: 'hub',
  },
  hil_c3_b: {
    id: 'hil_c3_b',
    speaker: 'hilbbang',
    text: '아 아니요... 아직... 하하..\n(부드럽지만 어딘가 눈물 고인 눈) 좋겠다 결혼한 사람들...',
    next: 'hil_c3_b2',
  },
  hil_c3_b2: {
    id: 'hil_c3_b2',
    speaker: 'chan',
    text: '(귓속말) 아 그 이야기는 좀 조심해..',
    next: 'hub',
  },

  // ── Chapter 6: 노룰루 ──────────────────────────────────────────
  nolulu_arrive: {
    id: 'nolulu_arrive',
    speaker: 'chan',
    text: '다음은 노룰루예요. 명예장교인데... 에너지가 좀 넘쳐요.',
    next: 'nolulu_1',
  },
  nolulu_1: {
    id: 'nolulu_1',
    text: '광장 한복판에 마도성 복장의 사람이 서 있었다. 기세가 심상치 않다.',
    next: 'nolulu_shout',
  },
  nolulu_shout: {
    id: 'nolulu_shout',
    speaker: 'nolulu',
    shake: true,
    text: '호칸의 바람!!!',
    next: 'nolulu_2',
  },
  nolulu_2: {
    id: 'nolulu_2',
    text: '아무것도 없는 하늘을 향해 외쳤다.',
    next: 'nolulu_3',
  },
  nolulu_3: {
    id: 'nolulu_3',
    speaker: 'chan',
    text: '(조용히) 저게 노룰루예요.',
    choices: [
      { label: '😳  저...분은 뭘 하시는 건가요?', to: 'nolulu_c_a', aff: { nolulu: 1 } },
      { label: '🙋  (함께 외쳐본다) 호칸의 바람!!!', to: 'nolulu_c_b', aff: { nolulu: 2, chan: 1, jinny: 1, jonguri: 1, mask: 1, candy: 1, hilbbang: 1, irin: 1, jujang: 1, claire: 1 } },
    ],
  },
  nolulu_c_a: {
    id: 'nolulu_c_a',
    speaker: 'chan',
    text: '호칸의 바람을 외치는 거예요. 원래 저래요.',
    next: 'nolulu_4',
  },
  nolulu_c_b: {
    id: 'nolulu_c_b',
    speaker: 'nolulu',
    shake: true,
    text: '오오!! 알아?! 호칸의 바람?!',
    next: 'nolulu_c_b2',
  },
  nolulu_c_b2: {
    id: 'nolulu_c_b2',
    speaker: 'chan',
    text: '(눈물 찔끔) 첫날부터 저러면...',
    next: 'nolulu_c_b3',
  },
  nolulu_c_b3: {
    id: 'nolulu_c_b3',
    speaker: 'nolulu',
    text: '좋아!! 마음에 든다!!',
    next: 'nolulu_4',
  },
  nolulu_4: {
    id: 'nolulu_4',
    speaker: 'nolulu',
    text: '나 노룰루야. MBTI가 I야.',
    next: 'nolulu_5',
  },
  nolulu_5: {
    id: 'nolulu_5',
    speaker: 'chan',
    text: '(귓속말) E야.',
    choices: [
      { label: '😯  I세요? 진짜요?', to: 'nolulu_c2_a', aff: { nolulu: 1 } },
      { label: '😶  (고개를 끄덕인다)', to: 'nolulu_c2_b', aff: { nolulu: 2 } },
    ],
  },
  nolulu_c2_a: {
    id: 'nolulu_c2_a',
    speaker: 'nolulu',
    text: '어, 나 원래 조용한 스타일이야.',
    next: 'nolulu_c2_a2',
  },
  nolulu_c2_a2: {
    id: 'nolulu_c2_a2',
    text: '...지금 이 상황이 조용한 것인가.',
    next: 'nolulu_6',
  },
  nolulu_c2_b: {
    id: 'nolulu_c2_b',
    speaker: 'nolulu',
    text: '그렇지? 나 I 맞지? 맞지?',
    next: 'nolulu_c2_b2',
  },
  nolulu_c2_b2: {
    id: 'nolulu_c2_b2',
    speaker: 'chan',
    text: '(귓속말) 절대 믿으시면 안 돼요.',
    next: 'nolulu_6',
  },
  nolulu_6: {
    id: 'nolulu_6',
    speaker: 'nolulu',
    text: '아 근데 남궁상절 보이면 말해줘. 내가 할 말 있거든.',
    choices: [
      { label: '🤔  남궁상절이 누구예요?', to: 'nolulu_c3_a', aff: { nolulu: 1 } },
      { label: '😅  알겠어요. 보이면 알려드릴게요.', to: 'nolulu_c3_b', aff: { nolulu: 1, chan: 1 } },
    ],
  },
  nolulu_c3_a: {
    id: 'nolulu_c3_a',
    speaker: 'nolulu',
    text: '보면 알아. 아무튼 보이면 바로 말해줘.',
    next: 'nolulu_c3_a2',
  },
  nolulu_c3_a2: {
    id: 'nolulu_c3_a2',
    speaker: 'chan',
    text: '(귓속말) 남궁상절은... 대답 안 해줘요. 쭉.',
    next: 'hub',
  },
  nolulu_c3_b: {
    id: 'nolulu_c3_b',
    speaker: 'nolulu',
    shake: true,
    text: '좋아!!! 호칸의 바람!!!',
    next: 'nolulu_c3_b2',
  },
  nolulu_c3_b2: {
    id: 'nolulu_c3_b2',
    speaker: 'chan',
    text: '(한숨) ...또.',
    next: 'hub',
  },

  // ── Chapter 7: 이린 ──────────────────────────────────────────
  irin_arrive: {
    id: 'irin_arrive',
    text: '골목 쪽에서 향긋한 냄새가 풍겨왔다.\n꽃 같기도 하고, 오늘의집 인테리어 소품 같기도 한.',
    next: 'irin_1',
  },
  irin_1: {
    id: 'irin_1',
    speaker: 'chan',
    text: '아, 이린이다.',
    next: 'irin_2',
  },
  irin_2: {
    id: 'irin_2',
    speaker: 'irin',
    text: '어? 새 분이에요?',
    next: 'irin_3',
  },
  irin_3: {
    id: 'irin_3',
    speaker: 'irin',
    text: '어서 오세요~ 저 이린이에요!',
    choices: [
      { label: '🌸  분위기가 너무 좋으세요!', to: 'irin_c_a', aff: { irin: 2 } },
      { label: '😊  반갑습니다!', to: 'irin_c_b', aff: { irin: 1 } },
    ],
  },
  irin_c_a: {
    id: 'irin_c_a',
    speaker: 'irin',
    text: '어머 감사해요~ 저 인테리어 좋아해서요 ㅎㅎ',
    next: 'irin_c_a2',
  },
  irin_c_a2: {
    id: 'irin_c_a2',
    speaker: 'chan',
    text: '(귓속말) 이린 방 진짜 오늘의집 느낌나요. 진짜예요.',
    next: 'irin_4',
  },
  irin_c_b: {
    id: 'irin_c_b',
    speaker: 'irin',
    text: '저도요~ 천천히 친해져봐요!',
    next: 'irin_4',
  },
  irin_4: {
    id: 'irin_4',
    speaker: 'irin',
    text: '저 사실 처음엔 어비스 무서워서 못 들어갔거든요.\n아티쟁도 안 해봤었고...',
    next: 'irin_5',
  },
  irin_5: {
    id: 'irin_5',
    speaker: 'chan',
    text: '지금은?',
    next: 'irin_6',
  },
  irin_6: {
    id: 'irin_6',
    speaker: 'irin',
    text: '(눈빛이 갑자기 살아나며)\n썰자 갈사람!!!!',
    next: 'irin_7',
  },
  irin_7: {
    id: 'irin_7',
    text: '...분위기가 급격히 달라졌다.',
    choices: [
      { label: '😆  썰자요?! 저 이제 막 시작했는데...', to: 'irin_c2_a', aff: { irin: 1 } },
      { label: '🙋  저 갈게요!!', to: 'irin_c2_b', aff: { irin: 2, chan: 1 } },
    ],
  },
  irin_c2_a: {
    id: 'irin_c2_a',
    speaker: 'irin',
    text: '아 걱정 마요~ 처음엔 다 그랬어요, 저도요~\n(조용히) 저 강한 지인 있거든요. 버스 태워드릴게요.',
    next: 'irin_cat',
  },
  irin_c2_b: {
    id: 'irin_c2_b',
    speaker: 'irin',
    text: '오오!! 결정 빠르다!! 좋아!!',
    next: 'irin_c2_b2',
  },
  irin_c2_b2: {
    id: 'irin_c2_b2',
    speaker: 'chan',
    text: '(눈물 찔끔) 벌써 적응하고 있어...',
    next: 'irin_cat',
  },
  irin_cat: {
    id: 'irin_cat',
    text: '그때, 어딘가에서 고양이가 책상 위로 올라가는 소리가 들렸다. (아마도)',
    next: 'irin_cat2',
  },
  irin_cat2: {
    id: 'irin_cat2',
    speaker: 'irin',
    text: '(순간 표정이 굳으며) 잠깐만요.\n(저 멀리를 향해) 야 거기서 내려와!!',
    next: 'irin_cat3',
  },
  irin_cat3: {
    id: 'irin_cat3',
    text: '이린의 꽃향기가 잠깐 매서워졌다.',
    choices: [
      { label: '🐱  고양이를 키우세요?', to: 'irin_c3_a', aff: { irin: 1 } },
      { label: '😶  (아무것도 못 본 척)', to: 'irin_c3_b', aff: { irin: 2 } },
    ],
  },
  irin_c3_a: {
    id: 'irin_c3_a',
    speaker: 'irin',
    text: '네~ 귀여운데 말을 잘 안 들어요~ (다시 부드러운 표정)',
    next: 'hub',
  },
  irin_c3_b: {
    id: 'irin_c3_b',
    speaker: 'irin',
    text: '어... 못 들으셨죠? ㅎㅎ',
    next: 'hub',
  },

  // ── Chapter 8: 주장 ──────────────────────────────────────────
  jujang_arrive: {
    id: 'jujang_arrive',
    speaker: 'chan',
    text: '다음은 주장이에요. 원래 부길마였는데...',
    next: 'jujang_1',
  },
  jujang_1: {
    id: 'jujang_1',
    text: '찬이 잠깐 말을 멈췄다.',
    next: 'jujang_2',
  },
  jujang_2: {
    id: 'jujang_2',
    speaker: 'chan',
    text: '지금은 좀 조용히 지내고 있어요.',
    next: 'jujang_3',
  },
  jujang_3: {
    id: 'jujang_3',
    text: '골목 안쪽 벽에 기대어 아르카나 작업을 하고 있는 사람이 있었다.',
    next: 'jujang_4',
  },
  jujang_4: {
    id: 'jujang_4',
    speaker: 'jujang',
    text: '...오, 새 멤버야?',
    next: 'jujang_5',
  },
  jujang_5: {
    id: 'jujang_5',
    speaker: 'jujang',
    text: '(잠깐 손목을 보며) ...어서 와. 나 주장이야.',
    choices: [
      { label: '🤝  잘 부탁드립니다!', to: 'jujang_c_a', aff: { jujang: 1 } },
      { label: '😟  손목 괜찮으세요?', to: 'jujang_c_b', aff: { jujang: 2 } },
    ],
  },
  jujang_c_a: {
    id: 'jujang_c_a',
    speaker: 'jujang',
    text: '어. (다시 아르카나 연성 시작)',
    next: 'jujang_6',
  },
  jujang_c_b: {
    id: 'jujang_c_b',
    speaker: 'jujang',
    text: '(멈추며) ...알아?',
    next: 'jujang_c_b2',
  },
  jujang_c_b2: {
    id: 'jujang_c_b2',
    speaker: 'chan',
    text: '(귓속말) 손목뼈 부러졌을 때도 원정 돌았어요. 애인한테 엄청 혼났대요.',
    next: 'jujang_c_b3',
  },
  jujang_c_b3: {
    id: 'jujang_c_b3',
    speaker: 'jujang',
    text: '(들린 것 같은 표정으로) ...그땐 좀 바빴어서.',
    next: 'jujang_6',
  },
  jujang_6: {
    id: 'jujang_6',
    speaker: 'chan',
    text: '주장이 시즌1 초반에 진짜 강했어요. 나 쩔도 해줬는데.',
    next: 'jujang_7',
  },
  jujang_7: {
    id: 'jujang_7',
    speaker: 'jujang',
    text: '지금은 좀... 허겁지겁이야.',
    choices: [
      { label: '💪  곧 다시 강해지실 거예요!', to: 'jujang_c2_a', aff: { jujang: 2 } },
      { label: '🤔  부길마 하실 때는 어떠셨어요?', to: 'jujang_c2_b', aff: { jujang: 1 } },
    ],
  },
  jujang_c2_a: {
    id: 'jujang_c2_a',
    speaker: 'jujang',
    text: '(잠깐 멈추고) ...고마워.',
    next: 'jujang_8',
  },
  jujang_c2_b: {
    id: 'jujang_c2_b',
    speaker: 'jujang',
    text: '(쓴웃음) ...나중에 그 포지션은, 길드원이 하고 싶더라고.',
    next: 'jujang_c2_b2',
  },
  jujang_c2_b2: {
    id: 'jujang_c2_b2',
    speaker: 'chan',
    text: '(귓속말) 진짜로 그 말 하고 운영진 그만뒀어요.',
    next: 'jujang_8',
  },
  jujang_8: {
    id: 'jujang_8',
    speaker: 'jujang',
    text: '(아르카나 연성하며) ...뭐 모르는 거 있으면 물어봐.',
    choices: [
      { label: '🙏  잘 부탁드릴게요, 선배님', to: 'jujang_c3_a', aff: { jujang: 2 } },
      { label: '😊  감사합니다!', to: 'jujang_c3_b', aff: { jujang: 1 } },
    ],
  },
  jujang_c3_a: {
    id: 'jujang_c3_a',
    speaker: 'jujang',
    text: '...선배. (조용히 미소)',
    next: 'jujang_c3_a2',
  },
  jujang_c3_a2: {
    id: 'jujang_c3_a2',
    speaker: 'chan',
    text: '(눈물 찔끔) 주장이 저렇게 웃는 거 오랜만에 봤어요.',
    next: 'hub',
  },
  jujang_c3_b: {
    id: 'jujang_c3_b',
    speaker: 'jujang',
    text: '(고개 끄덕)',
    next: 'hub',
  },

  // ── Chapter 9: 클레어 ──────────────────────────────────────────
  claire_arrive: {
    id: 'claire_arrive',
    speaker: 'chan',
    text: '클레어예요. 지금 장기출장 중이라서 보기가 좀 힘들어요.',
    next: 'claire_1',
  },
  claire_1: {
    id: 'claire_1',
    speaker: 'chan',
    text: '가끔 신규 외형 사러 3분 딱 접속하고 바로 나가거든요.',
    choices: [
      { label: '🧐  3분이요?', to: 'claire_c_a', aff: { chan: 1 } },
      { label: '😮  그래도 만나보고 싶네요', to: 'claire_c_b', aff: { chan: 1, claire: 1 } },
    ],
  },
  claire_c_a: {
    id: 'claire_c_a',
    speaker: 'chan',
    text: '어. 접속해서 아이템 사고 로그아웃. 졸부야 진짜로 ㅎㅎ\n원래 있을 때는 키나도 막 뿌리고 치킨도 막 뿌리고...\n모니터 4대 켜고 길드원 다 챙겼는데. 빨리 돌아왔으면 좋겠어요.',
    next: 'claire_miracle',
  },
  claire_c_b: {
    id: 'claire_c_b',
    speaker: 'chan',
    text: '진짜요? 그럼...',
    next: 'claire_miracle',
  },
  claire_miracle: {
    id: 'claire_miracle',
    text: '그 순간.',
    next: 'claire_login',
  },
  claire_login: {
    id: 'claire_login',
    text: '🔔  클레어 님이 접속했습니다.',
    next: 'claire_2',
  },
  claire_2: {
    id: 'claire_2',
    speaker: 'chan',
    text: '오, 진짜로 왔다.',
    next: 'claire_3',
  },
  claire_3: {
    id: 'claire_3',
    speaker: 'claire',
    text: '어머, 새로운 분이시군요.\n이 시간대 노을이 정말 아름답지 않나요?',
    choices: [
      { label: '🌅  정말 그렇네요...', to: 'claire_c2_a', aff: { claire: 2 } },
      { label: '😊  반갑습니다! 이야기 많이 들었어요', to: 'claire_c2_b', aff: { claire: 2 } },
    ],
  },
  claire_c2_a: {
    id: 'claire_c2_a',
    speaker: 'claire',
    text: '시장에 좋은 물건이 들어오면 꼭 알려드릴게요.\n천천히 구경하세요~ 😊',
    next: 'claire_chan',
  },
  claire_c2_b: {
    id: 'claire_c2_b',
    speaker: 'claire',
    text: '어머, 좋은 이야기였으면 좋겠네요. 반가워요~\n요즘 자주 못 나와서... 잘 부탁드릴게요.',
    next: 'claire_chan',
  },
  claire_chan: {
    id: 'claire_chan',
    speaker: 'chan',
    text: '클레어는 언제나 저렇게 우아해요.\n가끔 나도 좀 배우고 싶다고 생각해요 ㅎㅎ',
    next: 'claire_logout',
  },
  claire_logout: {
    id: 'claire_logout',
    text: '🔔  클레어 님이 접속을 종료했습니다.',
    next: 'claire_4',
  },
  claire_4: {
    id: 'claire_4',
    speaker: 'chan',
    text: '...역시 3분이었네.',
    next: 'claire_5',
  },
  claire_5: {
    id: 'claire_5',
    text: '그래도 딱 맞게 본 것 같았다.',
    next: 'hub',
  },

  // ── 에필로그 진입 전 — 안 만난 캐릭터 삐짐 나레이션 ────────────
  // skipIfVisited: 해당 캐릭터를 방문했으면 자동 스킵

  ep_sulk_jinny: {
    id: 'ep_sulk_jinny',
    skipIfVisited: 'jinny',
    text: '저 멀리서 뛰어오는 발소리가 들렸다.\n그런데 방향이... 반대였다.\n\n레기온 채팅창에 조용히 한 줄이 올라왔다.\n"나는 왜 못 봤대... ㅠ"\n\n( 지니가 삐진 것 같다 . . )',
    next: 'ep_sulk_jong',
  },
  ep_sulk_jong: {
    id: 'ep_sulk_jong',
    skipIfVisited: 'jonguri',
    text: '저 멀리 주미온 나무 뒤에서 인기척이 느껴졌다.\n이쪽을 한 번 힐끔 보더니... 더 깊이 숨었다.\n\n아무 말도 없었지만, 어딘가 쓸쓸해 보였다.\n\n( 종으리가 삐진 것 같다 . . )',
    next: 'ep_sulk_mask',
  },
  ep_sulk_mask: {
    id: 'ep_sulk_mask',
    skipIfVisited: 'mask',
    text: '분수대 근처에서 마스크를 꽉 쥔 뒷모습이 보였다.\n이쪽을 힐끔 쳐다보더니 아무 말 없이 돌아섰다.\n\n( 질투마스크가 삐진 것 같다 . . )',
    next: 'ep_sulk_candy',
  },
  ep_sulk_candy: {
    id: 'ep_sulk_candy',
    skipIfVisited: 'candy',
    text: '광장 한쪽에서 전곤을 쥔 채 멍하니 서 있는 사람이 보였다.\n"어멋-..." 하고 완성되지 않은 말만 중얼거리고 있었다.\n\n( 캔디가 삐진 것 같다 . . )',
    next: 'ep_sulk_hilbbang',
  },
  ep_sulk_hilbbang: {
    id: 'ep_sulk_hilbbang',
    skipIfVisited: 'hilbbang',
    text: '힐빵은 그날 채팅창에 한 마디도 하지 않았다.\n분명히 다 보고 있었겠지만... 조용했다.\n\n(채팅창 글씨가 작아서 못 봤을 수도 있다.)\n\n( 성심당힐빵이 삐진 것 같다 . . )',
    next: 'ep_sulk_nolulu',
  },
  ep_sulk_nolulu: {
    id: 'ep_sulk_nolulu',
    skipIfVisited: 'nolulu',
    text: '이상하게 오늘은 "호칸의 바람!!!" 소리가 들리지 않았다.\n디코를 열어보니 노룰루가 접속 중이었는데...\n어쩐지 조용했다.\n\n( 노룰루가 삐진 것 같다 . . )',
    next: 'ep_sulk_irin',
  },
  ep_sulk_irin: {
    id: 'ep_sulk_irin',
    skipIfVisited: 'irin',
    text: '어디선가 꽃향기가 났다.\n따라갔더니 아무도 없었다.\n이린이 지나갔다 간 자리인 것 같았다.\n\n( 이린이 삐진 것 같다 . . )',
    next: 'ep_sulk_jujang',
  },
  ep_sulk_jujang: {
    id: 'ep_sulk_jujang',
    skipIfVisited: 'jujang',
    text: '골목 안쪽에 벽에 기대어 있던 사람이 있었다.\n가까이 가보니 이미 자리를 뜬 뒤였다.\n\n발밑에 아르카나 파편이 하나 떨어져 있었다.\n\n( 주장이 삐진 것 같다 . . )',
    next: 'ep_sulk_claire',
  },
  ep_sulk_claire: {
    id: 'ep_sulk_claire',
    skipIfVisited: 'claire',
    text: '🔔  클레어 님이 접속했습니다.\n🔔  클레어 님이 접속을 종료했습니다.\n\n...오늘도 인사는 없었다.\n\n( 클레어가 삐진 것 같다 . . )',
    next: 'epilogue_1',
  },

  // ── 에필로그 ──────────────────────────────────────────
  epilogue_1: {
    id: 'epilogue_1',
    text: '마을을 천천히 걷는다.\n\n어디선가 향긋한 냄새가 풍겨오고,\n분수대에서는 맑은 물소리가 들린다.',
    next: 'epilogue_2',
  },
  epilogue_2: {
    id: 'epilogue_2',
    text: '조용하지만 따뜻한 마을.\n서로를 아끼는 사람들이 모여 사는 곳.',
    next: 'epilogue_3',
  },
  epilogue_3: {
    id: 'epilogue_3',
    speaker: 'chan',
    text: '오늘 다들 어땠어요? 좀 당황스럽긴 했죠?',
    choices: [
      { label: '😊  재밌었어요! 다들 개성이 넘치시네요', to: 'ep_c_a', aff: { chan: 2, jinny: 1, jonguri: 1, mask: 1, candy: 1, hilbbang: 1, nolulu: 1, irin: 1, jujang: 1, claire: 1 } },
      { label: '😵  솔직히 좀 정신없긴 했어요...', to: 'ep_c_b', aff: { chan: 1 } },
      { label: '🌸  찬 님이 진짜 잘 챙겨주셨어요', to: 'ep_c_c', aff: { chan: 3 } },
    ],
  },
  ep_c_a: {
    id: 'ep_c_a',
    speaker: 'chan',
    text: '맞죠!! 맞죠!! (눈물 찔끔)\n저도 이 사람들 볼 때마다 감동받아요. 이상하게.',
    next: 'epilogue_4',
  },
  ep_c_b: {
    id: 'ep_c_b',
    speaker: 'chan',
    text: '하하... 처음엔 다 그래요. 나도 처음엔...\n(생각하다가) 나도 사실 지금도 그래요.',
    next: 'epilogue_4',
  },
  ep_c_c: {
    id: 'ep_c_c',
    speaker: 'chan',
    text: '...진짜요?',
    next: 'ep_c_c2',
  },
  ep_c_c2: {
    id: 'ep_c_c2',
    text: '찬이 잠시 말을 잇지 못했다.',
    next: 'ep_c_c3',
  },
  ep_c_c3: {
    id: 'ep_c_c3',
    speaker: 'chan',
    text: '감사해요. 진짜로. (눈물)',
    next: 'epilogue_4',
  },
  epilogue_4: {
    id: 'epilogue_4',
    speaker: 'chan',
    text: '언제든 또 찾아와줘요. 우리 마을 항상 열려 있으니까.',
    next: 'ending_final',
  },
  ending_final: {
    id: 'ending_final',
    bg: 'village_night', bgm: 'village_night',
    text: '성심당 마을의 노을이 서서히 저물어간다.\n\n오늘도 마을엔 평화로운 하루가 흘렀다.',
    next: 'ending_credit',
  },
  ending_credit: {
    id: 'ending_credit',
    text: '── 시즌 1 : 성심당에 오신 것을 환영합니다 ──\n\nThe End.',
    choices: [
      { label: '🔄  처음부터 다시 하기', to: 'prologue_1', reset: true },
    ],
  },
}

// ─────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────

const TEXT_SPEED = 28

const INIT_AFFINITY: Record<string, number> = {
  chan: 10, jinny: 5, jonguri: 5, mask: 5, candy: 5,
  hilbbang: 5, nolulu: 5, irin: 5, jujang: 5, claire: 5,
}

export default function VNPage() {
  const [sceneId, setSceneId]               = useState('prologue_1')
  const [displayedText, setDisplayedText]   = useState('')
  const [isTyping, setIsTyping]             = useState(false)
  const [textDone, setTextDone]             = useState(false)
  const [panelVisible, setPanelVisible]     = useState(true)
  const [currentBg, setCurrentBg]           = useState('village_day')
  const [bgReady, setBgReady]               = useState(false)
  const [isShaking, setIsShaking]           = useState(false)
  const [affinity, setAffinity]             = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try { const s = localStorage.getItem('rpg_affinity'); if (s) return JSON.parse(s) } catch {}
    }
    return { ...INIT_AFFINITY }
  })
  const [visited, setVisited]               = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try { const s = localStorage.getItem('rpg_visited'); if (s) return new Set(JSON.parse(s)) } catch {}
    }
    return new Set<string>()
  })
  const [volume, setVolume]                 = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try { const v = localStorage.getItem('rpg_volume'); if (v) return parseFloat(v) } catch {}
    }
    return 0.35
  })
  const [showVolume, setShowVolume]         = useState(false)
  const [isSkipping, setIsSkipping]         = useState(false)
  const [seenScenes, setSeenScenes]         = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try { const s = localStorage.getItem('rpg_seen_scenes'); if (s) return new Set(JSON.parse(s)) } catch {}
    }
    return new Set<string>()
  })

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const skipTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingScene  = useRef<string | null>(null)
  const audioRef      = useRef<HTMLAudioElement | null>(null)
  const currentBgmRef = useRef<string>('')
  const visitedRef    = useRef(visited)
  const seenRef       = useRef(seenScenes)

  // ref 동기화
  useEffect(() => { visitedRef.current = visited }, [visited])
  useEffect(() => { seenRef.current = seenScenes }, [seenScenes])

  const isHub = sceneId === 'hub'
  const scene = STORY[sceneId] ?? STORY['prologue_1']
  const char  = scene.speaker ? CHARS[scene.speaker] : null

  const charImageSrc = (() => {
    if (!scene.speaker) return null
    const imgs = CHAR_IMAGES[scene.speaker]
    if (!imgs) return null
    const key = scene.expression ?? 'normal'
    return imgs[key] ?? imgs['normal'] ?? null
  })()

  // ── BGM ─────────────────────────────────────────────────────
  const playBgm = useCallback((key: string) => {
    if (!audioRef.current || currentBgmRef.current === key) return
    const src = BGM_TRACKS[key]
    if (!src) return
    currentBgmRef.current = key
    audioRef.current.src    = src
    audioRef.current.volume = volume
    audioRef.current.loop   = true
    audioRef.current.play().catch(() => {})
  }, [volume])

  useEffect(() => {
    audioRef.current = new Audio()
    audioRef.current.volume = volume
    audioRef.current.loop   = true
    return () => { audioRef.current?.pause() }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── 볼륨 변경 ────────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
    if (typeof window !== 'undefined') localStorage.setItem('rpg_volume', volume.toString())
  }, [volume])

  // ── Affinity & visited 저장 ─────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('rpg_affinity', JSON.stringify(affinity))
  }, [affinity])

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('rpg_visited', JSON.stringify([...visited]))
  }, [visited])

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('rpg_seen_scenes', JSON.stringify([...seenScenes]))
  }, [seenScenes])

  // ── Bg / Bgm / Shake ────────────────────────────────────────
  useEffect(() => {
    if (scene.bg)  { setBgReady(false); setCurrentBg(scene.bg) }
    if (scene.bgm) playBgm(scene.bgm)
    if (scene.shake) {
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 600)
    }
  }, [sceneId])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Typewriter (skipIfVisited 포함) ──────────────────────────
  useEffect(() => {
    if (isHub) return   // 허브는 타이프라이터 불필요

    const s = STORY[sceneId]
    if (!s) return

    // skipIfVisited: 이미 방문한 캐릭터 씬은 자동 스킵
    if (s.skipIfVisited && visitedRef.current.has(s.skipIfVisited)) {
      if (s.next) setSceneId(s.next)
      return
    }

    // 이미 본 씬 기록
    setSeenScenes(prev => {
      if (prev.has(sceneId)) return prev
      const next = new Set(prev)
      next.add(sceneId)
      return next
    })

    if (timerRef.current) clearInterval(timerRef.current)
    setDisplayedText('')
    setTextDone(false)
    setIsTyping(true)
    let i = 0
    timerRef.current = setInterval(() => {
      i++
      setDisplayedText(s.text.slice(0, i))
      if (i >= s.text.length) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        setIsTyping(false)
        setTextDone(true)
      }
    }, TEXT_SPEED)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [sceneId, isHub])   // eslint-disable-line react-hooks-exhaustive-deps

  // ── Skip to next choice ─────────────────────────────────────
  useEffect(() => {
    if (!isSkipping || isHub) return

    const s = STORY[sceneId]
    if (!s) { setIsSkipping(false); return }

    // 선택지가 있으면 스킵 중단
    if (s.choices?.length) {
      setIsSkipping(false)
      // 타이핑 즉시 완료
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      setDisplayedText(s.text)
      setIsTyping(false)
      setTextDone(true)
      return
    }

    // 다음 씬이 없으면 스킵 중단
    if (!s.next) { setIsSkipping(false); return }

    // 타이핑 즉시 완료 후 다음 씬으로
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setDisplayedText(s.text)
    setIsTyping(false)
    setTextDone(true)

    skipTimerRef.current = setTimeout(() => {
      setSceneId(s.next!)
    }, 120)

    return () => { if (skipTimerRef.current) clearTimeout(skipTimerRef.current) }
  }, [isSkipping, sceneId, isHub])

  // ── Scene Transition ─────────────────────────────────────────
  const goTo = useCallback((nextId: string, aff?: Record<string, number>, resetGame?: boolean) => {
    if (resetGame) {
      setVisited(new Set())
      setAffinity({ ...INIT_AFFINITY })
      setSeenScenes(new Set())
      if (typeof window !== 'undefined') {
        localStorage.removeItem('rpg_visited')
        localStorage.removeItem('rpg_affinity')
        localStorage.removeItem('rpg_seen_scenes')
      }
    } else if (aff) {
      setAffinity(prev => {
        const next = { ...prev }
        Object.entries(aff).forEach(([key, val]) => {
          next[key] = (next[key] ?? 5) + val
        })
        return next
      })
    }
    pendingScene.current = nextId
    setPanelVisible(false)
    setTimeout(() => {
      setSceneId(pendingScene.current!)
      setPanelVisible(true)
    }, 250)
  }, [])

  // ── Hub 캐릭터 선택 ──────────────────────────────────────────
  const handleHubChoice = useCallback((char: typeof HUB_CHARS[0]) => {
    const isFirst = visitedRef.current.size === 0
    const aff: Record<string, number> = { chan: 2 }
    aff[char.key] = 1

    setVisited(prev => new Set([...prev, char.key]))
    const dest = isFirst ? char.first : char.arrive
    goTo(dest, aff)
  }, [goTo])

  // ── Tap / Click ──────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (audioRef.current?.paused && currentBgmRef.current) {
      audioRef.current.play().catch(() => {})
    }
    if (isHub) return
    if (isTyping) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      setDisplayedText(scene.text)
      setIsTyping(false)
      setTextDone(true)
      return
    }
    if (textDone && scene.next && !scene.choices?.length) {
      goTo(scene.next)
    }
  }, [isTyping, textDone, scene, goTo, isHub])

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault()
        handleTap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleTap])

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  const hasChoices = textDone && !!scene.choices?.length
  const canAdvance = textDone && !!scene.next && !scene.choices?.length

  const remaining = HUB_CHARS.filter(c => !visited.has(c.key))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
    <div
      style={{
        position: 'relative',
        height: '100dvh',
        aspectRatio: '9 / 16',
        maxWidth: '100vw',
        overflow: 'hidden',
        cursor: isHub ? 'default' : 'pointer',
        animation: isShaking ? 'shake 0.6s ease' : 'none',
      }}
      onClick={handleTap}
    >
      {/* 배경 이미지 */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <img
          key={currentBg}
          src={BG_IMAGES[currentBg] ?? '/rpg/background.png'}
          alt=""
          onLoad={() => setBgReady(true)}
          ref={(el) => { if (el?.complete && el.naturalWidth > 0) setBgReady(true) }}
          draggable={false}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            userSelect: 'none',
            opacity: bgReady ? 1 : 0,
            transition: 'opacity 0.5s ease',
          }}
        />
        {!bgReady && <div style={{ position: 'absolute', inset: 0, background: '#1a1a2e' }} />}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.72) 100%)',
        }} />
      </div>

      {/* 볼륨 컨트롤 버튼 */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 200 }}
           onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setShowVolume(v => !v)}
          style={{
            background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(200,168,78,0.35)',
            borderRadius: 8, padding: '5px 9px', color: '#fff', fontSize: 16,
            cursor: 'pointer', lineHeight: 1,
          }}
        >
          {volume === 0 ? '🔇' : volume < 0.4 ? '🔉' : '🔊'}
        </button>
        {showVolume && (
          <div style={{
            marginTop: 6, background: 'rgba(4,4,20,0.93)',
            border: '1px solid rgba(200,168,78,0.4)', borderRadius: 10,
            padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: '"Galmuri11", monospace', letterSpacing: '0.1em' }}>VOLUME</span>
            <input
              type="range" min={0} max={1} step={0.05} value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ width: 90, accentColor: '#d4a017' }}
            />
          </div>
        )}
      </div>

      {/* ── 허브 (Hub) UI ─────────────────────────────────── */}
      {isHub && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            justifyContent: 'flex-end', padding: '0 14px',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
            opacity: panelVisible ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* 허브 안내 박스 */}
          <div style={{
            borderRadius: 14, overflow: 'hidden',
            background: 'rgba(4,4,14,0.92)',
            border: '1px solid rgba(200,168,78,0.45)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 28px rgba(0,0,0,0.6)',
            marginBottom: 10, padding: '12px 16px 10px',
          }}>
            <div style={{
              padding: '0 0 8px',
              borderBottom: '1px solid rgba(200,168,78,0.2)',
              marginBottom: 8,
            }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: '"Galmuri11", monospace' }}>✦ 성심당 마을</span>
            </div>
            <p style={{
              fontFamily: '"Galmuri11", monospace', color: '#fff',
              fontSize: 14, lineHeight: 1.75, margin: 0, whiteSpace: 'pre-line',
            }}>
              {remaining.length === 0
                ? '오늘 모두 만났군요.\n하루를 마무리할까요?'
                : '다음엔 누구를 만나러 갈까요?'}
            </p>
          </div>

          {/* 캐릭터 선택 버튼들 */}
          {remaining.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 7 }}>
              {remaining.map(c => (
                <button
                  key={c.key}
                  onClick={() => handleHubChoice(c)}
                  style={{
                    padding: '10px 12px', borderRadius: 12,
                    border: '1px solid rgba(200,168,78,0.45)',
                    background: 'rgba(10,10,35,0.93)',
                    color: '#fff', fontSize: 13, fontWeight: 'bold',
                    fontFamily: '"Galmuri11", monospace',
                    textAlign: 'left', cursor: 'pointer',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
                    transition: 'transform 0.1s ease',
                  }}
                  onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          )}

          {/* 하루 마무리 버튼 */}
          <button
            onClick={() => goTo('ep_sulk_jinny', { chan: 1 })}
            style={{
              width: '100%', padding: '11px 16px', borderRadius: 12,
              border: '1px solid rgba(120,120,200,0.4)',
              background: 'rgba(10,10,40,0.93)',
              color: 'rgba(180,180,255,0.85)', fontSize: 13, fontWeight: 'bold',
              fontFamily: '"Galmuri11", monospace',
              textAlign: 'left', cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
              transition: 'transform 0.1s ease',
            }}
            onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
            onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            🌙  하루를 마무리한다
          </button>
        </div>
      )}

      {/* ── 일반 VN UI ────────────────────────────────────── */}
      {!isHub && (
        <>
          {/* 캐릭터 일러스트 */}
          {charImageSrc && (
            <div style={{
              position: 'absolute', left: 0,
              bottom: 'clamp(-60px, 2%, 20px)',
              display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end',
              pointerEvents: 'none',
              opacity: panelVisible ? 1 : 0,
              transition: 'opacity 0.25s ease',
            }}>
              <img
                key={charImageSrc}
                src={charImageSrc}
                alt={char?.name ?? ''}
                draggable={false}
                style={{
                  maxHeight: 'clamp(280px, 68vh, 640px)',
                  maxWidth: '60%',
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                  filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.85))',
                }}
              />
            </div>
          )}

          {/* 하단 대화 패널 */}
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '0 14px',
              paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
              opacity: panelVisible ? 1 : 0,
              transform: panelVisible ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 0.25s ease, transform 0.25s ease',
            }}
            onClick={e => hasChoices && e.stopPropagation()}
          >
            {/* 대화박스 */}
            <div style={{
              borderRadius: 14, overflow: 'hidden',
              background: 'rgba(4, 4, 14, 0.92)',
              border: '1px solid rgba(200, 168, 78, 0.45)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 28px rgba(0,0,0,0.6)',
            }}>
              {/* 캐릭터 이름 행 */}
              {char ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px 9px',
                  borderBottom: '1px solid rgba(200,168,78,0.25)',
                  background: 'rgba(200,168,78,0.07)',
                }}>
                  {!charImageSrc && (
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: char.avatarBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 'bold', fontSize: 13,
                      border: '1.5px solid rgba(255,255,255,0.2)',
                      flexShrink: 0,
                    }}>
                      {char.initial}
                    </div>
                  )}
                  <span style={{
                    fontFamily: '"Galmuri11", monospace',
                    fontWeight: 'bold', fontSize: 15,
                    color: char.nameColor,
                    textShadow: '0 1px 6px rgba(0,0,0,0.8)',
                    letterSpacing: '0.03em',
                  }}>
                    {char.name}
                  </span>
                  <span style={{
                    fontFamily: '"Galmuri11", monospace',
                    fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1,
                  }}>
                    {char.role}
                  </span>
                  <span style={{ flex: 1 }} />
                  {seenScenes.has(sceneId) && !scene.choices?.length && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsSkipping(true) }}
                      style={{
                        fontFamily: '"Galmuri11", monospace',
                        fontSize: 10, fontWeight: 'bold',
                        color: isSkipping ? 'rgba(120,180,255,1)' : 'rgba(120,180,255,0.7)',
                        background: isSkipping ? 'rgba(120,180,255,0.15)' : 'rgba(120,180,255,0.08)',
                        border: '1px solid rgba(120,180,255,0.3)',
                        borderRadius: 6, padding: '3px 10px',
                        cursor: 'pointer', letterSpacing: '0.05em',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isSkipping ? 'SKIP ▶▶' : 'SKIP ▶'}
                    </button>
                  )}
                </div>
              ) : (
                scene.id !== 'ending_credit' && (
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    padding: '8px 16px 7px',
                    borderBottom: '1px solid rgba(200,168,78,0.2)',
                    background: 'rgba(200,168,78,0.05)',
                  }}>
                    <span style={{
                      fontFamily: '"Galmuri11", monospace',
                      fontSize: 11, color: 'rgba(255,255,255,0.4)',
                    }}>
                      ✦ 성심당 마을
                    </span>
                    <span style={{ flex: 1 }} />
                    {seenScenes.has(sceneId) && !scene.choices?.length && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsSkipping(true) }}
                        style={{
                          fontFamily: '"Galmuri11", monospace',
                          fontSize: 10, fontWeight: 'bold',
                          color: isSkipping ? 'rgba(120,180,255,1)' : 'rgba(120,180,255,0.7)',
                          background: isSkipping ? 'rgba(120,180,255,0.15)' : 'rgba(120,180,255,0.08)',
                          border: '1px solid rgba(120,180,255,0.3)',
                          borderRadius: 6, padding: '3px 10px',
                          cursor: 'pointer', letterSpacing: '0.05em',
                          transition: 'all 0.15s',
                        }}
                      >
                        {isSkipping ? 'SKIP ▶▶' : 'SKIP ▶'}
                      </button>
                    )}
                  </div>
                )
              )}

              {/* 대사 텍스트 */}
              <div style={{ padding: '12px 16px 10px' }}>
                <p style={{
                  fontFamily: '"Galmuri11", monospace',
                  color: '#fff', fontSize: 14, lineHeight: 1.75,
                  whiteSpace: 'pre-line', minHeight: '3.8rem', margin: 0,
                }}>
                  {displayedText}
                  {isTyping && (
                    <span style={{ color: '#fbbf24', animation: 'blink 0.6s step-end infinite' }}>▋</span>
                  )}
                </p>
                {canAdvance && (
                  <div style={{
                    textAlign: 'right', marginTop: 4,
                    fontFamily: '"Galmuri11", monospace',
                    fontSize: 11, color: 'rgba(251,191,36,0.65)',
                    animation: 'blink 1.2s ease-in-out infinite',
                  }}>
                    탭하여 계속 ▶
                  </div>
                )}
              </div>
            </div>

            {/* 선택지 */}
            {hasChoices && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {scene.choices!.map(choice => (
                  <button
                    key={choice.to}
                    onClick={e => { e.stopPropagation(); goTo(choice.to, choice.aff, choice.reset) }}
                    style={{
                      width: '100%', padding: '11px 16px',
                      borderRadius: 12, border: '1px solid rgba(200,168,78,0.5)',
                      background: 'rgba(10,10,35,0.93)',
                      color: '#fff', fontSize: 13, fontWeight: 'bold',
                      fontFamily: '"Galmuri11", monospace',
                      textAlign: 'left', cursor: 'pointer',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
                      transition: 'transform 0.1s ease',
                    }}
                    onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                    onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0) translateY(0); }
          10%       { transform: translateX(-10px) translateY(-4px); }
          25%       { transform: translateX(10px) translateY(4px); }
          40%       { transform: translateX(-8px) translateY(-2px); }
          55%       { transform: translateX(8px) translateY(2px); }
          70%       { transform: translateX(-5px) translateY(-1px); }
          85%       { transform: translateX(5px) translateY(1px); }
        }
      `}</style>
    </div>
    </div>
  )
}
