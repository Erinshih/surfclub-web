/* =========================================================
   檔案：js/board-stats.js
   本期榜單用的統計，存在 users/{uid}.boardStats

   排行榜只要讀社員名單，不必讀每個人的打卡紀錄，
   讀取次數不會隨打卡變多而增加。

   「這一期」從哪天開始，由管理員結算時決定，
   存在 settings/leaderboard；還沒結算過就用這學期的起始日。

   什麼時候更新：
   - 社員打開社員首頁、打卡、刪除打卡時，更新自己的
   - 管理員打開排行榜時，補算缺少或過期的人
   ========================================================= */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  getLevel
} from "./levels.js";

import {
  getSemesterLabel,
  getSemesterStart,
  loadLevelHistory,
  parseDateString,
  toDateString
} from "./member-card.js";

const EMPTY_STATS = {
  sessions: 0,
  dawn: 0,
  dusk: 0,
  allDay: 0,
  levelUps: 0,
  reachedLevelAt: null
};

/* =========================================================
   這一期的設定
   ========================================================= */

let periodPromise = null;
let currentPeriod = null;

function getDefaultPeriod() {
  const start =
    getSemesterStart();

  return {
    start: toDateString(start),
    label: getSemesterLabel(start)
  };
}

/*
 * 讀取 settings/leaderboard：{ periodStart: "2026-08-01", periodLabel: "115 學年度上學期" }
 * 讀不到就用這學期，排行榜照常運作。
 */
export function loadPeriod(db, { force = false } = {}) {
  if (!periodPromise || force) {
    periodPromise =
      getDoc(doc(db, "settings", "leaderboard"))
        .then((snapshot) => {
          const data =
            snapshot.exists() ? snapshot.data() : null;

          return data?.periodStart
            ? { start: data.periodStart, label: data.periodLabel || "" }
            : getDefaultPeriod();
        })
        .catch((error) => {
          console.error(
            "排行榜期別讀取失敗，改用本學期：",
            error
          );

          return getDefaultPeriod();
        })
        .then((period) => {
          currentPeriod = period;
          return period;
        });
  }

  return periodPromise;
}

/*
 * 呼叫前要先 await loadPeriod()
 */
export function getPeriod() {
  return currentPeriod || getDefaultPeriod();
}

/* =========================================================
   統計
   ========================================================= */

/*
 * 讀取社員資料上的統計；不是這一期的就當作 0
 */
export function getBoardStats(userData) {
  const stats =
    userData?.boardStats;

  if (!stats || stats.semester !== getPeriod().start) {
    return { ...EMPTY_STATS, semester: getPeriod().start };
  }

  return { ...EMPTY_STATS, ...stats };
}

export function hasCurrentBoardStats(userData) {
  return userData?.boardStats?.semester === getPeriod().start;
}

async function loadPeriodCheckins(db, uid) {
  const snapshot =
    await getDocs(
      query(
        collection(db, "users", uid, "checkins"),
        where("date", ">=", getPeriod().start)
      )
    );

  return snapshot.docs.map((checkin) => checkin.data());
}

function computeBoardStats(checkins, history, levelText) {
  const periodStart =
    parseDateString(getPeriod().start);

  /*
   * 從當天 0 點開始算
   */
  periodStart.setHours(0, 0, 0, 0);

  const level =
    getLevel(levelText);

  const reachedLevelAt =
    history
      .find((item) => Number(item.levelValue) === level?.value)
      ?.unlockedAt
      ?.toDate?.()
      ?.getTime();

  return {
    /*
     * 欄位名稱沿用 semester，內容是這一期的起始日
     */
    semester: getPeriod().start,

    sessions: checkins.length,

    dawn: checkins.filter((checkin) => checkin.dawn === true).length,

    dusk: checkins.filter((checkin) => checkin.dusk === true).length,

    /*
     * 同一天開燈又關燈
     */
    allDay: checkins.filter((checkin) =>
      checkin.dawn === true &&
      checkin.dusk === true
    ).length,

    levelUps: history.filter((item) =>
      Number(item.levelValue) > 0 &&
      item.unlockedAt?.toDate?.() >= periodStart
    ).length,

    reachedLevelAt: Number.isFinite(reachedLevelAt)
      ? reachedLevelAt
      : null
  };
}

function isSameStats(first, second) {
  return Object.keys(EMPTY_STATS)
    .concat("semester")
    .every((key) => (first?.[key] ?? null) === (second?.[key] ?? null));
}

/*
 * 重新計算並寫回；沒有變化就不寫入。
 * history 可以傳進來，省下一次讀取。
 */
export async function refreshBoardStats(db, uid, userData, history = null) {
  await loadPeriod(db);

  const [checkins, levelHistory] =
    await Promise.all([
      loadPeriodCheckins(db, uid),
      history ?? loadLevelHistory(db, uid)
    ]);

  const stats =
    computeBoardStats(checkins, levelHistory, userData?.level);

  if (!isSameStats(stats, userData?.boardStats)) {
    await updateDoc(
      doc(db, "users", uid),
      {
        boardStats: stats,
        updatedAt: serverTimestamp()
      }
    );

    if (userData) {
      userData.boardStats = stats;
    }
  }

  return stats;
}
