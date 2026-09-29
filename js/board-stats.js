/* =========================================================
   檔案：js/board-stats.js
   本學期榜單用的統計，存在 users/{uid}.boardStats

   排行榜只要讀社員名單，不必讀每個人的打卡紀錄，
   讀取次數不會隨打卡變多而增加。

   什麼時候更新：
   - 社員打開社員首頁、打卡、刪除打卡時，更新自己的
   - 管理員打開排行榜時，補算缺少或過期的人
   ========================================================= */

import {
  collection,
  doc,
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
  getSemesterStart,
  loadLevelHistory,
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

/*
 * 學期的代號，例如 "2026-08-01"
 */
export function getSemesterKey() {
  return toDateString(getSemesterStart());
}

/*
 * 讀取社員資料上的統計；不是本學期的就當作 0
 */
export function getBoardStats(userData) {
  const stats =
    userData?.boardStats;

  if (!stats || stats.semester !== getSemesterKey()) {
    return { ...EMPTY_STATS, semester: getSemesterKey() };
  }

  return { ...EMPTY_STATS, ...stats };
}

export function hasCurrentBoardStats(userData) {
  return userData?.boardStats?.semester === getSemesterKey();
}

export async function loadSemesterCheckins(db, uid) {
  const snapshot =
    await getDocs(
      query(
        collection(db, "users", uid, "checkins"),
        where("date", ">=", getSemesterKey())
      )
    );

  return snapshot.docs.map((checkin) => checkin.data());
}

export function computeBoardStats(checkins, history, levelText) {
  const semesterStart =
    getSemesterStart();

  const level =
    getLevel(levelText);

  const reachedLevelAt =
    history
      .find((item) => Number(item.levelValue) === level?.value)
      ?.unlockedAt
      ?.toDate?.()
      ?.getTime();

  return {
    semester: getSemesterKey(),

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
      item.unlockedAt?.toDate?.() >= semesterStart
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
  const [checkins, levelHistory] =
    await Promise.all([
      loadSemesterCheckins(db, uid),
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
