/* =========================================================
   檔案：js/member-card.js
   角色卡共用元件：社員首頁與社員圖鑑都會使用
   ========================================================= */

import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  formatLevel,
  getLevel
} from "./levels.js";

export const STANCE_LABELS = {
  regular: "Regular（左腳在前）",
  goofy: "Goofy（右腳在前）"
};

/* =========================================================
   資料整理
   ========================================================= */

export function getProfile(userData) {
  const profile =
    userData?.profile || {};

  return {
    nickname: String(profile.nickname || "").trim(),
    stance: profile.stance || "",
    surfSince: profile.surfSince || "",
    spots: String(profile.spots || "").trim(),
    board: String(profile.board || "").trim(),
    motto: String(profile.motto || "").trim(),
    goals: Array.isArray(profile.goals) ? profile.goals : [],
    memories: Array.isArray(profile.memories) ? profile.memories : [],
    skills: Array.isArray(profile.skills) ? profile.skills : []
  };
}

export function getTitles(userData) {
  return Array.isArray(userData?.titles)
    ? userData.titles.filter(Boolean)
    : [];
}

export function getJoinDate(userData) {
  const timestamp =
    userData?.approvedAt ||
    userData?.createdAt;

  return timestamp?.toDate?.() || null;
}

export function getInitial(userData) {
  const text =
    getProfile(userData).nickname ||
    userData?.name ||
    "?";

  return Array.from(text.trim())[0] || "?";
}

export function formatYearMonth(date) {
  if (!date) {
    return "";
  }

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/*
 * surfSince 是 <input type="month"> 的值，例如 "2025-09"
 */
export function describeSurfDuration(surfSince) {
  const match =
    String(surfSince || "").match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return "";
  }

  const now = new Date();

  const months =
    (now.getFullYear() - Number(match[1])) * 12 +
    (now.getMonth() + 1 - Number(match[2]));

  if (months < 1) {
    return "剛開始衝浪";
  }

  const years = Math.floor(months / 12);
  const rest = months % 12;

  if (years === 0) {
    return `衝浪 ${rest} 個月`;
  }

  return rest === 0
    ? `衝浪 ${years} 年`
    : `衝浪 ${years} 年 ${rest} 個月`;
}

export function daysSince(date) {
  if (!date) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 86400000)
  );
}

export function todayString() {
  return toDateString(new Date());
}

export function toDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

/*
 * 學期起點：2 月 1 日、8 月 1 日
 */
export function getSemesterStart() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 8) {
    return new Date(year, 7, 1);
  }

  if (month >= 2) {
    return new Date(year, 1, 1);
  }

  return new Date(year - 1, 7, 1);
}

/*
 * 學年起點：8 月 1 日，這天之後入社的算新生
 */
export function getAcademicYearStart() {
  const now = new Date();

  return new Date(
    now.getMonth() + 1 >= 8
      ? now.getFullYear()
      : now.getFullYear() - 1,
    7,
    1
  );
}

/* =========================================================
   Firestore 讀取
   ========================================================= */

export async function loadLevelHistory(db, uid) {
  const snapshot =
    await getDocs(
      query(
        collection(db, "users", uid, "levelHistory"),
        orderBy("unlockedAt", "asc")
      )
    );

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data()
  }));
}

/*
 * 下水打卡存在 users/{uid}/checkins/{YYYY-MM-DD}，
 * 一天最多一筆。
 */
export async function loadCheckinStats(db, uid, recentCount = 0) {
  const checkinCollection =
    collection(db, "users", uid, "checkins");

  const yearStart =
    `${new Date().getFullYear()}-01-01`;

  const requests = [
    getCountFromServer(checkinCollection),
    getCountFromServer(
      query(checkinCollection, where("date", ">=", yearStart))
    )
  ];

  if (recentCount > 0) {
    requests.push(
      getDocs(
        query(
          checkinCollection,
          orderBy("date", "desc"),
          limit(recentCount)
        )
      )
    );
  }

  const [totalSnapshot, yearSnapshot, recentSnapshot] =
    await Promise.all(requests);

  return {
    total: totalSnapshot.data().count,
    thisYear: yearSnapshot.data().count,
    recent: recentSnapshot
      ? recentSnapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }))
      : []
  };
}

/* =========================================================
   HTML
   ========================================================= */

export function renderCardHero(userData, stats = {}) {
  const profile = getProfile(userData);
  const level = getLevel(userData.level);
  const titles = getTitles(userData);
  const joinDays = daysSince(getJoinDate(userData));

  const statItems = [
    ["累積下水", stats.total, "次"],
    ["今年下水", stats.thisYear, "次"],
    ["入社", joinDays, "天"],
    ["升級紀錄", stats.levelUps, "筆"]
  ];

  return `
    <div class="character-hero" style="--level-color: ${level?.color || "#8a9ea1"}">
      <div class="character-avatar" aria-hidden="true">
        ${escapeHtml(getInitial(userData))}
      </div>

      <div class="character-identity">
        <p class="character-level">
          ${escapeHtml(formatLevel(level))}
        </p>

        <h2 class="character-name">
          ${escapeHtml(userData.name || "未命名社員")}
          ${profile.nickname
            ? `<span class="character-nickname">「${escapeHtml(profile.nickname)}」</span>`
            : ""}
        </h2>

        <p class="character-meta">
          ${escapeHtml(userData.family || "尚未分配家系")}
          ${userData.department ? `｜${escapeHtml(userData.department)}` : ""}
        </p>
      </div>
    </div>

    ${profile.motto
      ? `<blockquote class="character-motto">${escapeHtml(profile.motto)}</blockquote>`
      : ""}

    ${titles.length > 0
      ? `<ul class="character-titles">
          ${titles.map((title) => `<li>🏆 ${escapeHtml(title)}</li>`).join("")}
        </ul>`
      : ""}

    <dl class="character-stats">
      ${statItems.map(([label, value, unit]) => `
        <div>
          <dt>${label}</dt>
          <dd>
            <strong>${value ?? "—"}</strong>
            ${value === null || value === undefined ? "" : unit}
          </dd>
        </div>
      `).join("")}
    </dl>
  `;
}

export function renderInfoList(items) {
  return `
    <dl class="character-info-list">
      ${items.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${value ? escapeHtml(value) : `<span class="character-empty">還沒填</span>`}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

export function getBasicInfoItems(userData) {
  const profile = getProfile(userData);
  const joinDate = getJoinDate(userData);

  return [
    ["名字", userData.name || ""],
    ["綽號", profile.nickname],
    ["系級", userData.department || ""],
    ["入社年份", joinDate ? `${joinDate.getFullYear()} 年` : ""],
    ["所屬家", userData.family || ""]
  ];
}

export function getSurfProfileItems(userData) {
  const profile = getProfile(userData);

  return [
    ["站姿", STANCE_LABELS[profile.stance] || ""],
    ["目前等級", userData.level ? formatLevel(getLevel(userData.level)) : ""],
    ["衝浪資歷", describeSurfDuration(profile.surfSince)],
    ["常去浪點", profile.spots],
    ["我的板子", profile.board]
  ];
}

/*
 * 例如：2026/10 Lv.1 → 2027/03 Lv.2
 */
export function renderLevelPath(history) {
  const steps =
    history.filter((item) => Number(item.levelValue) > 0);

  if (steps.length === 0) {
    return `<p class="empty-state">還沒有升級紀錄，第一個紀錄就在不遠的前方 🌊</p>`;
  }

  return `
    <ol class="level-path">
      ${steps.map((item) => `
        <li>
          <span>${escapeHtml(formatYearMonth(item.unlockedAt?.toDate?.()))}</span>
          <strong>Lv.${Number(item.levelValue)}</strong>
        </li>
      `).join("")}
    </ol>
  `;
}

export function sortMemories(memories) {
  return [...memories].sort((first, second) =>
    String(first.date || "").localeCompare(String(second.date || ""))
  );
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
