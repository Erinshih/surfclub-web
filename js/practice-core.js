/* =========================================================
   檔案：js/practice-core.js
   團練：設定、狀態、新增、報名

   practices/{id}：管理員新增，社員報名
   { date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", spot, note,
     minParticipants, maxParticipants, signupDeadline: Timestamp,
     participants: [uid],
     status: "open" | "confirmed" | "cancelled",
     createdBy, confirmedAt, createdAt, updatedAt }

   settings/practice：新增團練時的預設值（見 DEFAULT_PRACTICE_SETTINGS）
   ========================================================= */

import {
  Timestamp,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  parseDateString
} from "./member-card.js";

export const DEFAULT_PRACTICE_SETTINGS = {
  /* 成團人數 */
  minParticipants: 5,

  /* 每團人數上限 */
  maxParticipants: 15,

  /* 開始前幾小時截止報名 */
  closeHoursBefore: 12,

  /* 常用時段，新增團練時可以直接套用 */
  slots: [
    { id: "dawn", label: "早場", start: "06:00", end: "08:00" },
    { id: "afternoon", label: "下午場", start: "15:00", end: "17:00" }
  ],

  /* 預設浪點 */
  defaultSpot: "漁光島"
};

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const TIME_PATTERN = /^\d{2}:\d{2}$/;

/* =========================================================
   設定
   ========================================================= */

export async function loadPracticeSettings(db) {
  try {
    const snapshot =
      await getDoc(doc(db, "settings", "practice"));

    return {
      ...DEFAULT_PRACTICE_SETTINGS,
      ...(snapshot.exists() ? snapshot.data() : {})
    };
  } catch (error) {
    console.error(
      "團練設定讀取失敗，改用預設值：",
      error
    );

    return { ...DEFAULT_PRACTICE_SETTINGS };
  }
}

function checkCapacity(minValue, maxValue) {
  const minParticipants =
    Math.floor(Number(minValue));

  const maxParticipants =
    Math.floor(Number(maxValue));

  if (!(minParticipants >= 1 && minParticipants <= 100)) {
    throw new Error("成團人數要介於 1 到 100 之間。");
  }

  if (!(maxParticipants >= minParticipants && maxParticipants <= 200)) {
    throw new Error("人數上限要大於或等於成團人數，而且不超過 200。");
  }

  return { minParticipants, maxParticipants };
}

export async function savePracticeSettings(db, settings) {
  const capacity =
    checkCapacity(settings.minParticipants, settings.maxParticipants);

  const slots =
    (settings.slots || []).map((slot, index) => {
      const label =
        String(slot.label || "").trim();

      if (!label || !TIME_PATTERN.test(slot.start) || !TIME_PATTERN.test(slot.end) || slot.end <= slot.start) {
        throw new Error(`第 ${index + 1} 個時段的名稱或時間不正確（結束要晚於開始）。`);
      }

      return {
        id: slot.id || `slot-${Date.now().toString(36)}-${index}`,
        label: label.slice(0, 20),
        start: slot.start,
        end: slot.end
      };
    });

  const values = {
    ...capacity,
    closeHoursBefore: Math.min(168, Math.max(0, Math.floor(Number(settings.closeHoursBefore) || 0))),
    slots,
    defaultSpot: String(settings.defaultSpot || "").trim().slice(0, 30)
  };

  await setDoc(
    doc(db, "settings", "practice"),
    {
      ...values,
      updatedAt: serverTimestamp()
    }
  );

  return values;
}

/* =========================================================
   時間與狀態
   ========================================================= */

export function getPracticeStart(practice) {
  const date =
    parseDateString(practice.date);

  if (!date) {
    return null;
  }

  const [hours, minutes] =
    String(practice.start || "00:00").split(":").map(Number);

  date.setHours(hours, minutes, 0, 0);

  return date;
}

export function getSignupDeadline(practice) {
  return practice.signupDeadline?.toDate?.() || getPracticeStart(practice);
}

/*
 * 還能不能報名、取消報名
 */
export function isSignupOpen(practice, now = new Date()) {
  const deadline =
    getSignupDeadline(practice);

  return practice.status !== "cancelled" &&
    Boolean(deadline) &&
    now < deadline;
}

/*
 * 顯示用的狀態
 */
export function getPracticeState(practice, now = new Date()) {
  const count =
    (practice.participants || []).length;

  const min =
    Number(practice.minParticipants) || DEFAULT_PRACTICE_SETTINGS.minParticipants;

  const start =
    getPracticeStart(practice);

  if (practice.status === "cancelled") {
    return { key: "cancelled", label: "已取消", tone: "muted" };
  }

  if (start && start < now) {
    return practice.status === "confirmed"
      ? { key: "ended", label: "已結束", tone: "muted" }
      : { key: "failed", label: "未成團", tone: "muted" };
  }

  if (practice.status === "confirmed") {
    return { key: "confirmed", label: "✅ 確定成團", tone: "success" };
  }

  if (count >= min) {
    return { key: "ready", label: "🎉 人數已達標，等幹部確認", tone: "warning" };
  }

  return { key: "recruiting", label: `招募中（還差 ${min - count} 人成團）`, tone: "info" };
}

/* =========================================================
   讀取與寫入
   ========================================================= */

/*
 * fromDate 之後（含）的團練，依日期、時間排序
 */
export async function loadPractices(db, fromDate = null) {
  const snapshot =
    await getDocs(
      fromDate
        ? query(collection(db, "practices"), where("date", ">=", fromDate))
        : collection(db, "practices")
    );

  return snapshot.docs
    .map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }))
    .sort((first, second) =>
      String(first.date).localeCompare(String(second.date)) ||
      String(first.start).localeCompare(String(second.start))
    );
}

/*
 * 檢查管理員填的內容，回傳要寫進 Firestore 的欄位
 * deadline 是 Date；currentCount 是目前報名人數（編輯時用）
 */
export function buildPracticeFields({ date, start, end, spot, note, minParticipants, maxParticipants, deadline }, currentCount = 0) {
  const day =
    parseDateString(date);

  if (!day) {
    throw new Error("請選擇日期。");
  }

  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || end <= start) {
    throw new Error("請填開始和結束時間，結束要晚於開始。");
  }

  const spotText =
    String(spot || "").trim();

  if (!spotText) {
    throw new Error("請填浪點。");
  }

  const capacity =
    checkCapacity(minParticipants, maxParticipants);

  if (capacity.maxParticipants < currentCount) {
    throw new Error(`已經有 ${currentCount} 人報名，上限不能小於 ${currentCount}。`);
  }

  const practiceStart =
    getPracticeStart({ date, start });

  if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) {
    throw new Error("請填報名截止時間。");
  }

  if (deadline > practiceStart) {
    throw new Error("報名截止時間不能晚於團練開始。");
  }

  return {
    date,
    start,
    end,
    spot: spotText.slice(0, 30),
    note: String(note || "").trim().slice(0, 200),
    ...capacity,
    signupDeadline: Timestamp.fromDate(deadline)
  };
}

export async function createPractice(db, fields, uid) {
  const reference =
    await addDoc(
      collection(db, "practices"),
      {
        ...fields,
        participants: [],
        status: "open",
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

  return reference.id;
}

/*
 * previous 是修改前的團練。改了截止時間、上限、成團人數之後，
 * 已經不符合的 LINE 通知紀錄會清掉，之後條件再成立時會重新通知
 */
export async function updatePractice(db, practiceId, fields, previous = {}) {
  const count =
    (previous.participants || []).length;

  const cleared = {};

  if (previous.coachNotifiedAt && fields.minParticipants > count) {
    cleared.coachNotifiedAt = deleteField();
    cleared.coachNotifiedCount = deleteField();
  }

  if (previous.fullNotifiedAt && fields.maxParticipants > count) {
    cleared.fullNotifiedAt = deleteField();
  }

  if (previous.deadlineNotifiedAt && fields.signupDeadline.toDate() > new Date()) {
    cleared.deadlineNotifiedAt = deleteField();
    cleared.deadlineNotifiedCount = deleteField();
  }

  await updateDoc(
    doc(db, "practices", practiceId),
    {
      ...fields,
      ...cleared,
      updatedAt: serverTimestamp()
    }
  );
}

export async function deletePractice(db, practiceId) {
  await deleteDoc(doc(db, "practices", practiceId));
}

export async function joinPractice(db, practiceId, uid) {
  await updateDoc(
    doc(db, "practices", practiceId),
    {
      participants: arrayUnion(uid),
      updatedAt: serverTimestamp()
    }
  );
}

export async function leavePractice(db, practiceId, uid) {
  await updateDoc(
    doc(db, "practices", practiceId),
    {
      participants: arrayRemove(uid),
      updatedAt: serverTimestamp()
    }
  );
}

/*
 * 幹部確認成團 / 改回招募中 / 取消
 */
export async function setPracticeStatus(db, practiceId, status) {
  await updateDoc(
    doc(db, "practices", practiceId),
    {
      status,
      ...(status === "confirmed" ? { confirmedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp()
    }
  );
}

/* =========================================================
   顯示
   ========================================================= */

export function formatPracticeDate(practice) {
  const date =
    parseDateString(practice.date);

  if (!date) {
    return practice.date || "";
  }

  return `${date.getMonth() + 1}/${date.getDate()}（${WEEKDAY_LABELS[date.getDay()]}）`;
}

export function formatDeadline(practice) {
  const deadline =
    getSignupDeadline(practice);

  if (!deadline) {
    return "";
  }

  const hours =
    String(deadline.getHours()).padStart(2, "0");

  const minutes =
    String(deadline.getMinutes()).padStart(2, "0");

  return `${deadline.getMonth() + 1}/${deadline.getDate()} ${hours}:${minutes}`;
}

/*
 * 傳給教練的 LINE 訊息：人數湊齊了，有誰要參加
 * names 是報名社員的本名，照報名順序
 */
export function getLineShareText(practice, names) {
  const min =
    Number(practice.minParticipants) || DEFAULT_PRACTICE_SETTINGS.minParticipants;

  const headline =
    names.length >= min
      ? `🏄 團練人數湊齊了！目前 ${names.length} 人報名（${min} 人成團）`
      : `🏄 團練目前 ${names.length} 人報名（還差 ${min - names.length} 人成團）`;

  return [
    headline,
    "",
    `📅 ${formatPracticeDate(practice)} ${practice.start}–${practice.end}`,
    `📍 ${practice.spot || "浪點未定"}`,
    "",
    "👥 參加名單：",
    ...names.map((name, index) => `${index + 1}. ${name}`),
    ...(practice.note ? ["", `📝 ${practice.note}`] : []),
    "",
    "麻煩教練確認這團可以帶，謝謝！🙏"
  ].join("\n");
}

/*
 * 手機：打開 LINE App，選要傳給哪個好友或群組
 * 電腦：打開 LINE 的網頁分享視窗，登入後一樣可以選傳給誰
 */
export function getLineShareUrl(text, pageUrl, isMobile) {
  return isMobile
    ? `https://line.me/R/share?text=${encodeURIComponent(text)}`
    : `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`;
}
