/* =========================================================
   檔案：js/points.js
   個人積分 = 自動積分 + 幹部加分

   ✏️ 分數由管理員在「排行榜管理」頁面調整，存在 settings/pointRules；
   還沒設定過就用下面的 DEFAULT_POINT_RULES。

   自動積分存在 users/{uid}.pointStats，只有管理員端會計算和寫入：
   - 管理員打開排行榜時，幫太久沒更新的人重算
   - 管理員儲存出團紀錄、新增升級紀錄時，幫相關的人重算

   每位社員有自己的積分起算日 users/{uid}.pointsSince，
   被歸零的人會從新的起算日重新累積。
   幹部加分沿用原本的 users/{uid}.points 欄位。

   自訂加減分項目（例如「被叫上岸 −20」）存在規則的 custom，
   管理員幫社員記錄的加減分存在 pointRecords：
   { uid, ruleId, name, points, date: "YYYY-MM-DD", note }

   總積分 = 自動積分（auto）+ 加減分（adjust）+ 幹部加分（points）
   ========================================================= */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  loadLevelHistory,
  parseDateString,
  toDateString
} from "./member-card.js";

export const DEFAULT_POINT_RULES = {
  /* 參加出團（幹部在出團紀錄勾選） */
  trip: 10,

  /* 自己打卡下水：當天有下水就算一次 */
  checkin: 3,

  /* 自己打卡每週最多算幾次（週一到週日，最多 7） */
  checkinWeeklyCap: 7,

  /* 出團當天又自己打卡，要不要也算打卡分數 */
  checkinOnTripDay: false,

  /* 開燈、關燈各加幾分（0 就是不加分） */
  dawn: 0,
  dusk: 0,

  /* 升一級（Lv.1 是入社，不算） */
  levelUp: 20,

  /* 家系積分：每家只加總積分最高的幾個人 */
  familyTopCount: 5,

  /* 自訂加減分項目：管理員在「加減分紀錄」幫社員記錄 */
  custom: [
    { id: "surfer-complaint", name: "被海上浪人抱怨", points: -20 },
    { id: "sent-ashore", name: "被叫上岸", points: -20 }
  ],

  /* 規則每次修改都會換一個版本號，用來判斷積分要不要重算 */
  version: 0
};

/*
 * 管理員可以調整的欄位與範圍
 */
export const POINT_RULE_FIELDS = [
  { key: "trip", label: "參加出團", unit: "分", min: 0, max: 1000 },
  { key: "checkin", label: "自己打卡下水", unit: "分／天", min: 0, max: 1000 },
  { key: "checkinWeeklyCap", label: "打卡每週最多算", unit: "次", min: 1, max: 7 },
  { key: "dawn", label: "開燈加分", unit: "分（0 = 不加）", min: 0, max: 1000 },
  { key: "dusk", label: "關燈加分", unit: "分（0 = 不加）", min: 0, max: 1000 },
  { key: "levelUp", label: "升一級", unit: "分", min: 0, max: 1000 },
  { key: "familyTopCount", label: "家系積分加總前幾名", unit: "人", min: 1, max: 100 }
];

/*
 * 太久沒更新就重算（小時）
 */
const STALE_HOURS = 6;

/* =========================================================
   積分規則（settings/pointRules）
   ========================================================= */

let rulesPromise = null;
let currentRules = { ...DEFAULT_POINT_RULES };

export function loadPointRules(db, { force = false } = {}) {
  if (!rulesPromise || force) {
    rulesPromise =
      getDoc(doc(db, "settings", "pointRules"))
        .then((snapshot) => ({
          ...DEFAULT_POINT_RULES,
          ...(snapshot.exists() ? snapshot.data() : {})
        }))
        .catch((error) => {
          console.error(
            "積分規則讀取失敗，改用預設值：",
            error
          );

          return { ...DEFAULT_POINT_RULES };
        })
        .then((rules) => {
          currentRules = rules;
          return rules;
        });
  }

  return rulesPromise;
}

/*
 * 呼叫前要先 await loadPointRules()
 */
export function getPointRules() {
  return currentRules;
}

export async function savePointRules(db, rules) {
  const values =
    Object.fromEntries(
      POINT_RULE_FIELDS.map(({ key, min, max }) => {
        const value =
          Math.floor(Number(rules[key]));

        if (!Number.isFinite(value) || value < min || value > max) {
          throw new Error(`「${POINT_RULE_FIELDS.find((field) => field.key === key).label}」要介於 ${min} 到 ${max} 之間。`);
        }

        return [key, value];
      })
    );

  const custom =
    validateCustomRules(rules.custom || []);

  await setDoc(
    doc(db, "settings", "pointRules"),
    {
      ...values,
      checkinOnTripDay: Boolean(rules.checkinOnTripDay),
      custom,
      version: Date.now(),
      updatedAt: serverTimestamp()
    }
  );

  return loadPointRules(db, { force: true });
}

function validateCustomRules(custom) {
  if (custom.length > 30) {
    throw new Error("自訂加減分項目最多 30 個。");
  }

  return custom.map((rule, index) => {
    const name =
      String(rule.name || "").trim();

    const points =
      Math.trunc(Number(rule.points));

    if (!name || name.length > 20) {
      throw new Error(`第 ${index + 1} 個自訂項目的名稱要 1～20 個字。`);
    }

    if (!Number.isFinite(points) || points === 0 || Math.abs(points) > 1000) {
      throw new Error(`「${name}」的分數要是 -1000～1000 之間、不等於 0 的整數。`);
    }

    return {
      id: rule.id || `custom-${Date.now().toString(36)}-${index}`,
      name,
      points
    };
  });
}

export function formatSignedPoints(points) {
  return points > 0 ? `+${points}` : `−${Math.abs(points)}`;
}

/*
 * 「積分怎麼算？」說明表格的內容
 */
export function getPointRuleItems(rules = currentRules) {
  const checkinNotes = [
    "當天有下水就算一次",
    rules.checkinWeeklyCap < 7 ? `每週最多算 ${rules.checkinWeeklyCap} 次` : "",
    rules.checkinOnTripDay ? "" : "出團當天不重複計分"
  ].filter(Boolean);

  const items = [
    ["🌊", "參加出團", `+${rules.trip}`, "幹部在出團紀錄勾選"],
    ["🏄", "自己打卡下水", `+${rules.checkin}`, checkinNotes.join("；")]
  ];

  if (rules.dawn > 0 || rules.dusk > 0) {
    items.push([
      "🌅",
      "開燈／關燈",
      rules.dawn === rules.dusk ? `各 +${rules.dawn}` : `+${rules.dawn}／+${rules.dusk}`,
      "只算有計分的那幾次下水"
    ]);
  }

  items.push(
    ["📈", "升一級", `+${rules.levelUp}`, "由幹部調整等級"]
  );

  (rules.custom || []).forEach((rule) => {
    items.push([
      rule.points > 0 ? "✨" : "⚠️",
      rule.name,
      formatSignedPoints(rule.points),
      "幹部記錄"
    ]);
  });

  items.push(
    ["🙌", "幹部加分", "依情況", "教新生、搬板、開車、拍照、辦活動……"]
  );

  return items;
}

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

/*
 * 加減分紀錄的合計，可能是負的
 */
export function getAdjustPoints(userData) {
  const points =
    Math.trunc(Number(userData?.pointStats?.adjust));

  return Number.isFinite(points) ? points : 0;
}

export function getTotalPoints(userData) {
  return getAutoPoints(userData) + getAdjustPoints(userData) + getBonusPoints(userData);
}

/* =========================================================
   加減分紀錄（pointRecords）
   ========================================================= */

const RECORD_COLLECTION = "pointRecords";

/*
 * 不傳 uid 就讀全部（管理員）；社員只能讀自己的
 */
export async function loadPointRecords(db, uid = null) {
  const snapshot =
    await getDocs(
      uid
        ? query(collection(db, RECORD_COLLECTION), where("uid", "==", uid))
        : collection(db, RECORD_COLLECTION)
    );

  return snapshot.docs
    .map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }))
    .sort((first, second) => String(second.date).localeCompare(String(first.date)));
}

/*
 * 幫一位或多位社員記錄同一個加減分項目。
 * 名稱和分數另存一份，之後規則改了也不影響已經記錄的。
 */
export async function addPointRecords(db, { uids, rule, date, note, createdBy }) {
  const batch =
    writeBatch(db);

  uids.forEach((uid) => {
    batch.set(
      doc(collection(db, RECORD_COLLECTION)),
      {
        uid,
        ruleId: rule.id,
        name: rule.name,
        points: rule.points,
        date,
        note: String(note || "").trim().slice(0, 100),
        createdBy,
        createdAt: serverTimestamp()
      }
    );
  });

  await batch.commit();
}

export async function deletePointRecord(db, recordId) {
  await deleteDoc(doc(db, RECORD_COLLECTION, recordId));
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

export function computePointStats({ uid, since, checkins, history, trips, records = [], rules = currentRules }) {
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
   * 自己打卡：當天有下水算一次；
   * 出團當天要不要算、每週最多幾次，看規則設定
   */
  const weekCounts = new Map();

  let countedCheckins = 0;
  let lights = 0;

  [...checkins]
    .sort((first, second) => String(first.date).localeCompare(String(second.date)))
    .forEach((checkin) => {
      const lightPoints =
        (checkin.dawn === true ? rules.dawn : 0) +
        (checkin.dusk === true ? rules.dusk : 0);

      if (tripDates.has(checkin.date) && !rules.checkinOnTripDay) {
        lights += lightPoints;
        return;
      }

      const week =
        getWeekKey(checkin.date);

      const used =
        weekCounts.get(week) || 0;

      if (used >= rules.checkinWeeklyCap) {
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

  /*
   * 加減分紀錄：起算日之後的才算
   */
  const countedRecords =
    records.filter((record) => String(record.date || "") >= since);

  return {
    since,
    trips: tripDates.size,
    checkins: countedCheckins,
    lights,
    levelUps,
    records: countedRecords.length,
    adjust: countedRecords.reduce((sum, record) => sum + (Math.trunc(Number(record.points)) || 0), 0),
    auto:
      tripDates.size * rules.trip +
      countedCheckins * rules.checkin +
      lights +
      levelUps * rules.levelUp,
    rulesVersion: rules.version
  };
}

const STAT_KEYS =
  ["since", "trips", "checkins", "lights", "levelUps", "records", "adjust", "auto", "rulesVersion"];

function isSameStats(first, second) {
  return STAT_KEYS.every((key) => (first?.[key] ?? null) === (second?.[key] ?? null));
}

/*
 * 重新計算一位社員的自動積分並寫回。
 * defaultSince：還沒有起算日的社員，用這一天當起算日。
 */
export async function refreshPointStats(db, { uid, data }, { trips, defaultSince, records = null }) {
  await loadPointRules(db);

  const since =
    data.pointsSince || defaultSince;

  const [checkinSnapshot, history, memberRecords] =
    await Promise.all([
      getDocs(
        query(
          collection(db, "users", uid, "checkins"),
          where("date", ">=", since)
        )
      ),
      loadLevelHistory(db, uid),
      records ?? loadPointRecords(db, uid)
    ]);

  const stats =
    computePointStats({
      uid,
      since,
      checkins: checkinSnapshot.docs.map((checkin) => checkin.data()),
      history,
      trips,
      records: memberRecords
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
    (data.pointStats.rulesVersion ?? 0) !== currentRules.version ||
    isStale(data)
  );
}

/*
 * 管理員：幫需要更新的社員重算（force = true 時全部重算）
 */
export async function refreshMembersPoints(db, members, { trips, defaultSince, force = false, onProgress } = {}) {
  await loadPointRules(db);

  const targets =
    force
      ? members
      : members.filter((member) => needsPointRefresh(member.data));

  /*
   * 加減分紀錄一次讀完，再依社員分組
   */
  const recordsByUid = new Map();

  if (targets.length > 0) {
    (await loadPointRecords(db)).forEach((record) => {
      if (!recordsByUid.has(record.uid)) {
        recordsByUid.set(record.uid, []);
      }

      recordsByUid.get(record.uid).push(record);
    });
  }

  let done = 0;

  await Promise.all(
    targets.map(async (member) => {
      await refreshPointStats(db, member, {
        trips,
        defaultSince,
        records: recordsByUid.get(member.uid) || []
      });

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
        countedCount: Math.min(sorted.length, currentRules.familyTopCount),
        value: sorted
          .slice(0, currentRules.familyTopCount)
          .reduce((sum, member) => sum + getPoints(member), 0)
      };
    })
    .sort((first, second) =>
      second.value - first.value ||
      first.name.localeCompare(second.name, "zh-Hant")
    );
}
