/* =========================================================
   檔案：js/levels.js
   Surf Level 設定：名稱、圖示、介紹與升級條件

   ✏️ 社團要修改等級內容，只需要改這個檔案。

   - requirements：升到「這個等級」需要達成的條件
   - 條件的 id 一旦有社員勾選過就不要再改，
     否則已勾選的紀錄會對不上（文字可以隨意修改）
   ========================================================= */

export const LEVELS = [
  {
    value: 1,
    name: "漂流木",
    emoji: "🪵",
    color: "#a0774f",
    tagline: "剛下水的新鮮人，在海上漂來漂去，偶爾被浪帶著走。",
    requirements: [
      { id: "lv1-first-session", text: "完成第一次下水" },
      { id: "lv1-paddle", text: "學會趴板划水" },
      { id: "lv1-safety", text: "知道基本的海上安全規則" }
    ]
  },
  {
    value: 2,
    name: "水筆仔",
    emoji: "🌱",
    color: "#4f9d69",
    tagline: "開始自己追浪，但還是一不小心就被沖回岸上。",
    requirements: [
      { id: "lv2-stand-up", text: "可以在白浪上站起來" },
      { id: "lv2-paddle-out", text: "可以自己划出去" },
      { id: "lv2-catch-wave", text: "可以自己追到浪" }
    ]
  },
  {
    value: 3,
    name: "漁光三寶",
    emoji: "🐚",
    color: "#d9825b",
    tagline: "漁光島的常客，開始懂得挑浪，也開始有自己的招牌摔法。",
    requirements: [
      { id: "lv3-angle", text: "開始嘗試斜跑" },
      { id: "lv3-trim", text: "穩定橫跑" },
      { id: "lv3-outside", text: "可以自己划到外海 lineup" }
    ]
  },
  {
    value: 4,
    name: "奧賽四超人",
    emoji: "🦸",
    color: "#3f7cc4",
    tagline: "綠浪上的超人，新生眼中的學長姐，摔倒也摔得很帥。",
    requirements: [
      { id: "lv4-green-wave", text: "穩定追到綠浪" },
      { id: "lv4-bottom-turn", text: "做出 bottom turn" },
      { id: "lv4-read-waves", text: "會看浪、選位置" }
    ]
  },
  {
    value: 5,
    name: "漁光電線桿",
    emoji: "⚡",
    color: "#c99a1c",
    tagline: "像電線桿一樣屹立在浪上，是漁光島的地標。",
    requirements: [
      { id: "lv5-turns", text: "能做出流暢的轉向動作" },
      { id: "lv5-big-waves", text: "在大浪中也能穩定起乘" },
      { id: "lv5-mentor", text: "能帶新生下水" }
    ]
  }
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

export function formatLevel(level) {
  if (!level) {
    return "尚未分級";
  }

  return `${level.emoji} Lv.${level.value} ${level.name}`;
}
