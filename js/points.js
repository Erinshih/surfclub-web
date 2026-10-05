/* =========================================================
   檔案：js/points.js
   個人積分 = 自動積分 + 幹部加分

   ✏️ 要調整分數，只要改下面的 POINT_RULES。
   改完之後到排行榜按「重新計算所有人的積分」就會套用。

   自動積分存在 users/{uid}.pointStats，只有管理員端會計算和寫入：
   - 管理員打開排行榜時，幫太久沒更新的人重算
   - 管理員儲存出團紀錄、新增升級紀錄時，幫相關的人重算

   每位社員有自己的積分起算日 users/{uid}.pointsSince，
   被歸零的人會從新的起算日重新累積。
   幹部加分沿用原本的 users/{uid}.points 欄位。
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
  loadLevelHistory,
  parseDateString,
  toDateString
} from "./member-card.js";

export const POINT_RULES = {
  /* 參加出團（幹部在出團紀錄勾選） */
  trip: 10,

  /* 自己打卡下水；出團當天不重複計分 */
  checkin: 3,

  /* 自己打卡每週最多算幾次（週一到週日） */
  checkinWeeklyCap: 3,

  /* 開燈、關燈各加幾分（只算有計分的那幾次下水） */
  dawn: 2,
  dusk: 2,

  /* 升一級（Lv.1 是入社，不算） */
  levelUp: 20,

  /* 家系積分：每家只加總積分最高的幾個人 */
  familyTopCount: 5
};

/*
 * 太久沒更新就重算（小時）
 */
const STALE_HOURS = 6;

export const POINT_RULE_ITEMS = [
  ["🌊", "參加出團", `+${POINT_RULES.trip}`, "幹部在出團紀錄勾選"],
  ["🏄", "自己打卡下水", `+${POINT_RULES.checkin}`, `每週最多算 ${POINT_RULES.checkinWeeklyCap} 次；出團當天不重複計分`],
  ["🌅", "開燈／關燈", `各 +${POINT_RULES.dawn}`, "只算有計分的那幾次下水"],
  ["📈", "升一級", `+${POINT_RULES.levelUp}`, "由幹部調整等級"],
  ["🙌", "幹部加分", "依情況", "教新生、搬板、開車、拍照、辦活動……"]
];

/* =========================================================
   讀取
   ========================================================= */

function normalizePoints(value) {
  const points =
    Number(value);

  return Number.isFinite(points) && points > 0
    ? Math.floor(points)
    : 0;
}

export function getBonusPoints(userData) {
  return normalizePoints(userData?.points);
}

export function getAutoPoints(userData) {
  return normalizePoints(userData?.pointStats?.auto);
}

export function getTotalPoints(userData) {
  return getAutoPoints(userData) + getBonusPoints(userData);
}

/* =========================================================
   計算
   ========================================================= */

/*
 * 週一的日期，用來把打卡分週
 */
function getWeekKey(dateText) {
  const date =
    parseDateString(dateText);

  const day =
    (date.getDay() + 6) % 7;

  date.setDate(date.getDate() - day);

  return toDateString(date);
}

export function computePointStats({ uid, since, checkins, history, trips }) {
  const tripDates =
    new Set(
      trips
        .filter((trip) =>
          String(trip.date || "") >= since &&
          Array.isArray(trip.participants) &&
          trip.participants.includes(uid)
        )
        .map((trip) => trip.date)
    );

  /*
   * 自己打卡：出團當天不算，每週最多 N 次
   */
  const weekCounts = new Map();

  let countedCheckins = 0;
  let lights = 0;

  [...checkins]
    .sort((first, second) => String(first.date).localeCompare(String(second.date)))
    .forEach((checkin) => {
      const lightPoints =
        (checkin.dawn === true ? POINT_RULES.dawn : 0) +
        (checkin.dusk === true ? POINT_RULES.dusk : 0);

      if (tripDates.has(checkin.date)) {
        lights += lightPoints;
        return;
      }

      const week =
        getWeekKey(checkin.date);

      const used =
        weekCounts.get(week) || 0;

      if (used >= POINT_RULES.checkinWeeklyCap) {
        return;
      }

      weekCounts.set(week, used + 1);
      countedCheckins += 1;
      lights += lightPoints;
    });

  const sinceDate =
    parseDateString(since);

  sinceDate.setHours(0, 0, 0, 0);

  const levelUps =
    history.filter((item) =>
      Number(item.levelValue) >= 2 &&
      item.unlockedAt?.toDate?.() >= sinceDate
    ).length;

  return {
    since,
    trips: tripDates.size,
    checkins: countedCheckins,
    lights,
    levelUps,
    auto:
      tripDates.size * POINT_RULES.trip +
      countedCheckins * POINT_RULES.checkin +
      lights +
      levelUps * POINT_RULES.levelUp
  };
}

const STAT_KEYS =
  ["since", "trips", "checkins", "lights", "levelUps", "auto"];

function isSameStats(first, second) {
  return STAT_KEYS.every((key) => (first?.[key] ?? null) === (second?.[key] ?? null));
}

/*
 * 重新計算一位社員的自動積分並寫回。
 * defaultSince：還沒有起算日的社員，用這一天當起算日。
 */
export async function refreshPointStats(db, { uid, data }, { trips, defaultSince }) {
  const since =
    data.pointsSince || defaultSince;

  const [checkinSnapshot, history] =
    await Promise.all([
      getDocs(
        query(
          collection(db, "users", uid, "checkins"),
          where("date", ">=", since)
        )
      ),
      loadLevelHistory(db, uid)
    ]);

  const stats =
    computePointStats({
      uid,
      since,
      checkins: checkinSnapshot.docs.map((checkin) => checkin.data()),
      history,
      trips
    });

  const changes = {};

  if (!isSameStats(stats, data.pointStats)) {
    changes.pointStats = {
      ...stats,
      computedAt: Date.now()
    };
  } else if (isStale(data)) {
    /*
     * 數字沒變，只更新計算時間，免得一直重算
     */
    changes.pointStats = {
      ...data.pointStats,
      computedAt: Date.now()
    };
  }

  if (!data.pointsSince) {
    changes.pointsSince = since;
  }

  if (Object.keys(changes).length > 0) {
    await updateDoc(
      doc(db, "users", uid),
      {
        ...changes,
        updatedAt: serverTimestamp()
      }
    );

    Object.assign(data, changes);
  }

  return data.pointStats;
}

function isStale(data) {
  const computedAt =
    Number(data.pointStats?.computedAt) || 0;

  return Date.now() - computedAt > STALE_HOURS * 3600000;
}

export function needsPointRefresh(data) {
  return (
    !data.pointStats ||
    !data.pointsSince ||
    data.pointStats.since !== data.pointsSince ||
    isStale(data)
  );
}

/*
 * 管理員：幫需要更新的社員重算（force = true 時全部重算）
 */
export async function refreshMembersPoints(db, members, { trips, defaultSince, force = false, onProgress } = {}) {
  const targets =
    force
      ? members
      : members.filter((member) => needsPointRefresh(member.data));

  let done = 0;

  await Promise.all(
    targets.map(async (member) => {
      await refreshPointStats(db, member, { trips, defaultSince });

      done += 1;
      onProgress?.(done, targets.length);
    })
  );

  return targets.length;
}

/* =========================================================
   家系積分：每家積分最高的 N 人加總
   ========================================================= */

export function buildFamilyTotals(members, getPoints = (member) => getTotalPoints(member.data)) {
  const families = new Map();

  members.forEach((member) => {
    const family =
      String(member.data.family || "").trim();

    if (!family) {
      return;
    }

    if (!families.has(family)) {
      families.set(family, []);
    }

    families.get(family).push(member);
  });

  return [...families.entries()]
    .map(([name, familyMembers]) => {
      const sorted =
        [...familyMembers].sort((first, second) => getPoints(second) - getPoints(first));

      return {
        name,
        members: sorted,
        memberCount: sorted.length,
        countedCount: Math.min(sorted.length, POINT_RULES.familyTopCount),
        value: sorted
          .slice(0, POINT_RULES.familyTopCount)
          .reduce((sum, member) => sum + getPoints(member), 0)
      };
    })
    .sort((first, second) =>
      second.value - first.value ||
      first.name.localeCompare(second.name, "zh-Hant")
    );
}
