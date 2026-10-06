/* =========================================================
   檔案：js/admin-data.js
   管理員：個資搬移、下載完整備份
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

import {
  todayString
} from "./member-card.js";

/* =========================================================
   DOM
   ========================================================= */

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const privacySummary =
  document.querySelector("#privacy-summary");

const privacyMessage =
  document.querySelector("#privacy-message");

const migrateButton =
  document.querySelector("#migrate-button");

const backupSummary =
  document.querySelector("#backup-summary");

const backupMessage =
  document.querySelector("#backup-message");

const backupButton =
  document.querySelector("#backup-button");

const logoutButton =
  document.querySelector("#logout-button");

/*
 * 要從 users 搬到 privateProfiles 的欄位
 */
const PRIVATE_FIELDS = ["email", "phone", "studentId"];

/*
 * 備份的集合；users 底下的子集合另外處理
 */
const TOP_COLLECTIONS = [
  "users",
  "privateProfiles",
  "announcements",
  "courses",
  "trips",
  "boardArchives",
  "settings",
  "pointRecords",
  "charges",
  "payments"
];

const USER_SUBCOLLECTIONS = ["levelHistory", "checkins", "progress"];

let currentAdminUid = null;
let legacyUsers = [];

/* =========================================================
   管理員驗證
   ========================================================= */

onAuthStateChanged(
  auth,

  async (user) => {
    if (!user) {
      window.location.replace("./login.html");
      return;
    }

    try {
      const userSnapshot =
        await getDoc(doc(db, "users", user.uid));

      const userData =
        userSnapshot.data() || {};

      if (userData.role !== "admin") {
        window.location.replace(
          userData.status === "pending" || userData.status === "rejected"
            ? "./pending.html"
            : "./member.html"
        );

        return;
      }

      currentAdminUid =
        user.uid;

      showStatus(
        adminStatus,
        `管理員：${userData.name || user.email || "未命名"}`,
        "success"
      );

      adminContent.classList.remove("hidden");

      await Promise.all([
        checkPrivacy(),
        renderBackupSummary()
      ]);
    } catch (error) {
      console.error(
        "資料管理載入失敗：",
        error
      );

      showStatus(
        adminStatus,
        `載入失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

/* =========================================================
   個資搬移
   ========================================================= */

async function checkPrivacy() {
  const snapshot =
    await getDocs(collection(db, "users"));

  legacyUsers =
    snapshot.docs
      .map((documentSnapshot) => ({
        uid: documentSnapshot.id,
        data: documentSnapshot.data()
      }))
      .filter(({ data }) =>
        PRIVATE_FIELDS.some((field) => field in data)
      );

  if (legacyUsers.length === 0) {
    privacySummary.textContent =
      `✅ ${snapshot.docs.length} 位使用者的個資都已經只放在 privateProfiles，其他社員讀不到。`;

    migrateButton.hidden = true;

    return;
  }

  privacySummary.textContent =
    `⚠️ 還有 ${legacyUsers.length} 位使用者的電話、學號或 Email 放在公開資料裡，其他社員可以讀到。`;

  migrateButton.hidden = false;
  migrateButton.textContent =
    `搬移 ${legacyUsers.length} 位使用者的個資`;
}

/*
 * 每位使用者：
 * 1. 把電話、學號、Email 合併到 privateProfiles（那邊已經有的值不覆蓋）
 * 2. 從 users 刪掉這三個欄位
 * 同一個人的兩筆寫入放在同一個 batch，一起成功或一起失敗。
 */
migrateButton?.addEventListener(
  "click",

  async () => {
    if (
      !window.confirm(
        `確定要搬移 ${legacyUsers.length} 位使用者的個資嗎？\n\n` +
        "搬移後，電話、學號、Email 只有本人和幹部看得到。\n" +
        "建議先在下方「下載完整備份」一次再搬移。"
      )
    ) {
      return;
    }

    migrateButton.disabled = true;

    try {
      const privateSnapshot =
        await getDocs(collection(db, "privateProfiles"));

      const existing =
        new Map(
          privateSnapshot.docs.map((documentSnapshot) => [
            documentSnapshot.id,
            documentSnapshot.data()
          ])
        );

      /*
       * 一個 batch 最多 500 筆寫入，每人 2 筆，所以 200 人一批
       */
      for (let index = 0; index < legacyUsers.length; index += 200) {
        const batch =
          writeBatch(db);

        legacyUsers.slice(index, index + 200).forEach(({ uid, data }) => {
          const current =
            existing.get(uid) || {};

          const privateData = {
            updatedAt: serverTimestamp()
          };

          const removeFields = {
            updatedAt: serverTimestamp()
          };

          PRIVATE_FIELDS.forEach((field) => {
            if (!(field in data)) {
              return;
            }

            if (current[field] === undefined || current[field] === "") {
              privateData[field] = String(data[field] ?? "");
            }

            removeFields[field] = deleteField();
          });

          batch.set(
            doc(db, "privateProfiles", uid),
            privateData,
            { merge: true }
          );

          batch.update(
            doc(db, "users", uid),
            removeFields
          );
        });

        showStatus(
          privacyMessage,
          `正在搬移……（${Math.min(index + 200, legacyUsers.length)} / ${legacyUsers.length}）`
        );

        await batch.commit();
      }

      showStatus(
        privacyMessage,
        `已搬移 ${legacyUsers.length} 位使用者的個資。`,
        "success"
      );

      await checkPrivacy();
    } catch (error) {
      console.error(
        "個資搬移失敗：",
        error
      );

      showStatus(
        privacyMessage,
        `搬移失敗：${error?.message || "未知錯誤"}（已經搬好的不受影響，可以再按一次繼續）`,
        "error"
      );
    } finally {
      migrateButton.disabled = false;
    }
  }
);

/* =========================================================
   資料備份
   ========================================================= */

async function renderBackupSummary() {
  try {
    const snapshot =
      await getDoc(doc(db, "settings", "backup"));

    const data =
      snapshot.exists() ? snapshot.data() : null;

    const lastBackupAt =
      data?.lastBackupAt?.toDate?.();

    if (!lastBackupAt) {
      backupSummary.textContent =
        "⚠️ 還沒有備份過。";

      return;
    }

    const days =
      Math.floor((Date.now() - lastBackupAt.getTime()) / 86400000);

    backupSummary.textContent =
      `上次備份：${lastBackupAt.toLocaleString("zh-TW")}（${days === 0 ? "今天" : `${days} 天前`}）` +
      (data.totalDocuments ? `，共 ${data.totalDocuments} 筆資料` : "");
  } catch (error) {
    console.error(
      "備份紀錄讀取失敗：",
      error
    );

    backupSummary.textContent =
      "讀不到上次備份的時間。";
  }
}

/*
 * Firestore 的 Timestamp 轉成 { __timestamp: ISO 字串 }，其他照原樣
 */
function toPlain(value) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value.toDate === "function") {
    return { __timestamp: value.toDate().toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map(toPlain);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toPlain(item)])
    );
  }

  return value;
}

async function readCollection(path) {
  const snapshot =
    await getDocs(collection(db, ...path));

  return Object.fromEntries(
    snapshot.docs.map((documentSnapshot) => [
      documentSnapshot.id,
      toPlain(documentSnapshot.data())
    ])
  );
}

backupButton?.addEventListener(
  "click",

  async () => {
    backupButton.disabled = true;
    backupButton.textContent = "備份中……";

    try {
      const backup = {
        app: "surfclub-web",
        exportedAt: new Date().toISOString(),
        collections: {}
      };

      for (const name of TOP_COLLECTIONS) {
        showStatus(backupMessage, `正在讀取 ${name}……`);

        backup.collections[name] =
          await readCollection([name]);
      }

      /*
       * 每位社員底下的打卡、升級紀錄、進步紀錄
       */
      const uids =
        Object.keys(backup.collections.users);

      backup.subcollections = {};

      let done = 0;

      await Promise.all(
        uids.map(async (uid) => {
          const entries =
            await Promise.all(
              USER_SUBCOLLECTIONS.map(async (name) => [
                name,
                await readCollection(["users", uid, name])
              ])
            );

          backup.subcollections[uid] =
            Object.fromEntries(entries);

          done += 1;

          showStatus(
            backupMessage,
            `正在讀取每位社員的打卡和紀錄……（${done} / ${uids.length}）`
          );
        })
      );

      const totalDocuments =
        Object.values(backup.collections)
          .reduce((sum, items) => sum + Object.keys(items).length, 0) +
        Object.values(backup.subcollections)
          .reduce(
            (sum, groups) =>
              sum + Object.values(groups).reduce((count, items) => count + Object.keys(items).length, 0),
            0
          );

      backup.totalDocuments =
        totalDocuments;

      downloadJson(
        backup,
        `surfclub-backup-${todayString()}.json`
      );

      await setDoc(
        doc(db, "settings", "backup"),
        {
          lastBackupAt: serverTimestamp(),
          lastBackupBy: currentAdminUid,
          totalDocuments
        }
      );

      showStatus(
        backupMessage,
        `已下載備份（共 ${totalDocuments} 筆資料）。請把檔案存到安全的地方。`,
        "success"
      );

      await renderBackupSummary();
    } catch (error) {
      console.error(
        "備份失敗：",
        error
      );

      showStatus(
        backupMessage,
        `備份失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      backupButton.disabled = false;
      backupButton.textContent = "下載完整備份";
    }
  }
);

function downloadJson(data, filename) {
  const blob =
    new Blob(
      [JSON.stringify(data, null, 2)],
      { type: "application/json" }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =========================================================
   共用
   ========================================================= */

function showStatus(element, message, type = "") {
  element.textContent = message;
  element.className = "status-message";

  if (type) {
    element.classList.add(type);
  }
}

logoutButton?.addEventListener(
  "click",

  async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "登出中……";

    try {
      await signOut(auth);
      window.location.replace("./login.html");
    } catch (error) {
      console.error(
        "登出失敗：",
        error
      );

      logoutButton.disabled = false;
      logoutButton.textContent = "登出";
    }
  }
);
