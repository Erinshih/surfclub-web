/* =========================================================
   檔案：js/levels.js
   Surf Level 設定：名稱、圖示、階段說明與升級目標

   ✏️ 社團要修改等級內容，只需要改這個檔案。

   - tagline：一句話介紹（角色卡上的標語）
   - stage：這個階段的說明
   - goals：要升上「下一級」需要做到的目標
     （社員可以在社員首頁自己勾選，正式升級由幹部確認）
   - 目標的 id 一旦有社員勾選過就不要再改，
     否則已勾選的紀錄會對不上（文字可以隨意修改）
   ========================================================= */

export const LEVELS = [
  {
    value: 1,
    name: "漂流木",
    emoji: "🪵",
    color: "#a0774f",
    tagline: "剛下水的新鮮人，在海上漂來漂去，偶爾被浪帶著走。",
    stage: [
      "主要在白花區練習",
      "重點在於起乘技巧的穩定性",
      "學會如何自己滑水追到浪"
    ],
    goals: [
      { id: "lv1-straight-5s", text: "直跑 5 秒以上" }
    ]
  },
  {
    value: 2,
    name: "水筆仔",
    emoji: "🌱",
    color: "#4f9d69",
    tagline: "開始自己追浪，但還是一不小心就被沖回岸上。",
    stage: [
      "已具備自行下浪及嘗試斜跑的能力"
    ],
    goals: [
      { id: "lv2-fitness", text: "強化體能與滑水基本功" },
      { id: "lv2-turtle-roll", text: "熟練烏龜翻與撐板越浪技巧" },
      { id: "lv2-etiquette", text: "理解海上規矩，保護自己也能保護他人" },
      { id: "lv2-responsible", text: "在海上能夠為自己的行為負責" }
    ]
  },
  {
    value: 3,
    name: "漁光三寶",
    emoji: "🐚",
    color: "#d9825b",
    tagline: "漁光島的常客，開始懂得挑浪，也開始有自己的招牌摔法。",
    stage: [
      "能穩定下浪",
      "需提升判斷浪頭與等浪位置的能力",
      "評估後可換硬板"
    ],
    goals: [
      { id: "lv3-full-ride", text: "衝完一道完整的浪後收板" },
      { id: "lv3-kick-out", text: "熟練收板技巧" },
      { id: "lv3-read-peak", text: "可判斷浪頭" },
      { id: "lv3-no-drop-in", text: "絕不搶浪" }
    ]
  },
  {
    value: 4,
    name: "奧賽四超人",
    emoji: "🦸",
    color: "#3f7cc4",
    tagline: "綠浪上的超人，新生眼中的學長姐，摔倒也摔得很帥。",
    stage: [
      "開始練習第一個 TURN、1&2 步、CUTBACK、LIP"
    ],
    goals: [
      { id: "lv4-wave-sense", text: "深化對浪的理解" },
      { id: "lv4-angle-high", text: "學會斜追並維持在浪的中高段" },
      { id: "lv4-president", text: "社長認證：有料" }
    ]
  },
  {
    value: 5,
    name: "漁光電線桿",
    emoji: "⚡",
    color: "#c99a1c",
    tagline: "像電線桿一樣屹立在浪上，是漁光島的地標。",
    stage: [
      "已達進階浪人的最低標準",
      "可持續鑽研長板技巧，或開始嘗試短板挑戰"
    ],
    goals: []
  }
];

/*
 * 還沒分級的社員，要成為 Lv.1 的目標
 */
export const ENTRY_GOALS = [
  { id: "lv0-first-session", text: "完成第一次下水" }
];

/*
 * 後台存的 level 是像「Lv.2：水筆仔」這樣的文字，
 * 這裡把它轉回等級設定。
 */
export function getLevel(levelText) {
  const match =
    String(levelText || "").match(/Lv\.?\s*(\d+)/i);

  if (!match) {
    return null;
  }

  return getLevelByValue(Number(match[1]));
}

export function getLevelByValue(value) {
  return (
    LEVELS.find((level) => level.value === value) ||
    null
  );
}

export function getNextLevel(level) {
  if (!level) {
    return LEVELS[0];
  }

  return getLevelByValue(level.value + 1);
}

/*
 * 從這個等級升上下一級的目標
 */
export function getGoalsToNextLevel(level) {
  return level
    ? level.goals
    : ENTRY_GOALS;
}

export function formatLevel(level) {
  if (!level) {
    return "尚未分級";
  }

  return `${level.emoji} Lv.${level.value} ${level.name}`;
}
