/* =========================================================
   檔案：js/admin-dashboard.js
   管理首頁：目前狀況總覽與快捷入口
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

import {
  escapeHtml,
  getSemesterStart,
  toDateString,
  todayString
} from "./member-card.js";

import {
  getParticipants,
  loadTrips,
  renderTripTitle
} from "./trips.js";

import {
  formatMoney,
  loadOutstandingPayments
} from "./fees.js";

import {
  getPracticeState,
  loadPractices
} from "./practice-core.js";

/* =========================================================
   DOM
   ========================================================= */

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const dashboardStats =
  document.querySelector("#dashboard-stats");

const dashboardTrip =
  document.querySelector("#dashboard-trip");

const logoutButton =
  document.querySelector("#logout-button");

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

      showStatus(
        `管理員：${userData.name || user.email || "未命名"}`,
        "success"
      );

      adminContent.classList.remove("hidden");

      await loadDashboard();
    } catch (error) {
      console.error(
        "管理首頁載入失敗：",
        error
      );

      showStatus(
        `載入失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

/* =========================================================
   總覽
   ========================================================= */

async function loadDashboard() {
  const [usersSnapshot, trips, outstanding, backupSnapshot, practices] =
    await Promise.all([
      getDocs(collection(db, "users")),
      loadTrips(db),
      loadOutstandingPayments(db).catch((error) => {
        console.error("待繳費用讀取失敗：", error);
        return [];
      }),
      getDoc(doc(db, "settings", "backup")).catch(() => null),
      loadPractices(db, todayString()).catch((error) => {
        console.error("團練讀取失敗：", error);
        return [];
      })
    ]);

  /*
   * 接下來的團練；人數到了但還沒確認成團的要提醒
   */
  const practiceStates =
    practices.map((practice) => getPracticeState(practice).key);

  const upcomingPractices =
    practiceStates.filter((key) => ["recruiting", "ready", "confirmed"].includes(key)).length;

  const readyPractices =
    practiceStates.filter((key) => key === "ready").length;

  /*
   * 上次備份距今幾天；個資是不是還留在公開資料裡
   */
  const lastBackupAt =
    backupSnapshot?.exists?.()
      ? backupSnapshot.data().lastBackupAt?.toDate?.()
      : null;

  const backupDays =
    lastBackupAt
      ? Math.floor((Date.now() - lastBackupAt.getTime()) / 86400000)
      : null;

  const legacyPrivateCount =
    usersSnapshot.docs.filter((documentSnapshot) => {
      const data = documentSnapshot.data();
      return "phone" in data || "studentId" in data || "email" in data;
    }).length;

  const users =
    usersSnapshot.docs.map((documentSnapshot) => documentSnapshot.data());

  /*
   * 跟社員管理頁的「待審核社員」用同樣的條件
   */
  const pending =
    users.filter((user) => user.status === "pending").length;

  const members =
    users.filter((user) =>
      user.role === "member" &&
      user.status === "approved"
    );

  const unassigned =
    members.filter((user) => !String(user.family || "").trim()).length;

  const semesterStart =
    toDateString(getSemesterStart());

  const semesterTrips =
    trips.filter((trip) => String(trip.date || "") >= semesterStart).length;

  const stats = [
    {
      label: "待審核申請",
      value: pending,
      unit: "人",
      href: "./admin-members.html",
      alert: pending > 0,
      note: pending > 0 ? "點這裡去審核" : "目前沒有新申請"
    },
    {
      label: "正式社員",
      value: members.length,
      unit: "人",
      href: "./admin-members.html"
    },
    {
      label: "尚未分配家系",
      value: unassigned,
      unit: "人",
      href: "./admin-members.html",
      alert: unassigned > 0,
      note: unassigned > 0 ? "記得幫他們分家" : "大家都有家了"
    },
    {
      label: "本學期出團",
      value: semesterTrips,
      unit: "次",
      href: "./admin-trips.html"
    },
    {
      label: "接下來的團練",
      value: upcomingPractices,
      unit: "團",
      href: "./admin-practice.html",
      alert: readyPractices > 0,
      note: readyPractices > 0
        ? `${readyPractices} 團人數到了，等你確認成團`
        : upcomingPractices > 0 ? "還在招募中" : "可以開新的團練"
    },
    {
      label: "未繳費用",
      value: outstanding.length,
      unit: "筆",
      href: "./admin-fees.html",
      alert: outstanding.length > 0,
      note: outstanding.length > 0
        ? `共 ${formatMoney(outstanding.reduce((total, payment) => total + Number(payment.amount || 0), 0))}${
          outstanding.some((payment) => payment.status === "reported")
            ? `，${outstanding.filter((payment) => payment.status === "reported").length} 筆待確認`
            : ""
        }`
        : "大家都繳清了"
    },
    {
      label: "上次備份",
      value: backupDays === null ? "—" : backupDays,
      unit: backupDays === null ? "" : "天前",
      href: "./admin-data.html",
      alert: backupDays === null || backupDays > 120 || legacyPrivateCount > 0,
      note: legacyPrivateCount > 0
        ? `${legacyPrivateCount} 位的個資還沒搬移`
        : backupDays === null
          ? "還沒備份過"
          : backupDays > 120
            ? "超過 4 個月沒備份了"
            : "資料都有備份"
    }
  ];

  dashboardStats.innerHTML =
    stats.map((stat) => `
      <a
        class="dashboard-stat ${stat.alert ? "is-alert" : ""}"
        href="${stat.href}"
      >
        <span>${escapeHtml(stat.label)}</span>
        <strong>${stat.value}<small> ${stat.unit}</small></strong>
        ${stat.note ? `<small>${escapeHtml(stat.note)}</small>` : ""}
      </a>
    `).join("");

  renderLatestTrip(trips[0]);
}

function renderLatestTrip(trip) {
  if (!trip) {
    dashboardTrip.innerHTML = `
      <h2>最近一次出團</h2>

      <p class="empty-state">
        還沒有出團紀錄。
      </p>

      <a
        class="button button-small"
        href="./admin-trips.html"
      >
        新增出團紀錄
      </a>
    `;

    return;
  }

  dashboardTrip.innerHTML = `
    <p class="eyebrow">最近一次出團</p>

    <h2>${renderTripTitle(trip)}</h2>

    <p class="panel-hint">
      ${trip.spot ? `📍 ${escapeHtml(trip.spot)}｜` : ""}${getParticipants(trip).length} 人下水
    </p>

    <div class="dashboard-trip-actions">
      <a
        class="button button-small"
        href="./admin-trips.html"
      >
        新增或編輯出團紀錄
      </a>

      <a
        class="button button-small button-secondary"
        href="./memories.html#trip-${encodeURIComponent(trip.id)}"
      >
        在回憶牆查看
      </a>
    </div>
  `;
}

/* =========================================================
   共用
   ========================================================= */

function showStatus(message, type = "") {
  adminStatus.textContent = message;
  adminStatus.className = "status-message";

  if (type) {
    adminStatus.classList.add(type);
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
