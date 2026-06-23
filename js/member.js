/* =========================================================
   檔案：js/member.js
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

const memberStatus =
  document.querySelector("#member-status");

const logoutButton =
  document.querySelector("#logout-button");

const memberName =
  document.querySelector("#member-name");

const memberEmail =
  document.querySelector("#member-email");

const memberLevel =
  document.querySelector("#member-level");

const memberFamily =
  document.querySelector("#member-family");

const announcementList =
  document.querySelector("#announcement-list");

const levelChartCanvas =
  document.querySelector("#level-history-chart");

const achievementTimeline =
  document.querySelector("#achievement-timeline");

let currentUser = null;
let currentUserData = null;
let levelChartInstance = null;

onAuthStateChanged(
  auth,

  async (user) => {
    if (!user) {
      window.location.replace("./login.html");
      return;
    }

    currentUser = user;

    showStatus(
      memberStatus,
      "正在驗證社員資料……"
    );

    try {
      const userReference =
        doc(db, "users", user.uid);

      const userSnapshot =
        await getDoc(userReference);

      if (!userSnapshot.exists()) {
        clearMemberProfile();

        showStatus(
          memberStatus,
          "找不到社員資料，請聯絡社團管理員。",
          "error"
        );

        return;
      }

      currentUserData =
        userSnapshot.data();

      const role =
        currentUserData.role;

      const status =
        currentUserData.status;

      if (role === "admin") {
        window.location.replace("./admin.html");
        return;
      }

      if (
        role === "pending" ||
        status === "pending" ||
        status === "rejected"
      ) {
        window.location.replace("./pending.html");
        return;
      }

      if (
        role !== "member" ||
        status !== "approved"
      ) {
        clearMemberProfile();

        showStatus(
          memberStatus,
          "目前帳號沒有社員資訊系統的存取權限。",
          "error"
        );

        return;
      }

      renderMemberProfile(
        user,
        currentUserData
      );

      const displayName =
        currentUserData.name ||
        user.displayName ||
        user.email ||
        "社員";

      const summaryParts = [];

      if (currentUserData.level) {
        summaryParts.push(
          currentUserData.level
        );
      }

      if (currentUserData.family) {
        summaryParts.push(
          currentUserData.family
        );
      }

      const summaryText =
        summaryParts.length > 0
          ? `｜${summaryParts.join("｜")}`
          : "";

      showStatus(
        memberStatus,
        `歡迎回來，${displayName}${summaryText}`,
        "success"
      );

      await loadAnnouncements();

      await loadLevelHistory(user.uid);
    } catch (error) {
      console.error(
        "社員資料讀取失敗：",
        error
      );

      clearMemberProfile();

      showStatus(
        memberStatus,
        `社員資料讀取失敗：${getErrorMessage(error)}`,
        "error"
      );
    }
  },

  (error) => {
    console.error(
      "登入狀態監聽失敗：",
      error
    );

    clearMemberProfile();

    showStatus(
      memberStatus,
      `登入狀態讀取失敗：${getErrorMessage(error)}`,
      "error"
    );
  }
);

function renderMemberProfile(
  user,
  userData
) {
  if (memberName) {
    memberName.textContent =
      userData.name ||
      user.displayName ||
      "未提供姓名";
  }

  if (memberEmail) {
    memberEmail.textContent =
      userData.email ||
      user.email ||
      "未提供 Email";
  }

  if (memberLevel) {
    memberLevel.textContent =
      userData.level ||
      "尚未設定";
  }

  if (memberFamily) {
    memberFamily.textContent =
      userData.family ||
      "尚未分配";
  }
}

function clearMemberProfile() {
  if (memberName) {
    memberName.textContent =
      "無法載入";
  }

  if (memberEmail) {
    memberEmail.textContent =
      "無法載入";
  }

  if (memberLevel) {
    memberLevel.textContent =
      "尚未設定";
  }

  if (memberFamily) {
    memberFamily.textContent =
      "尚未分配";
  }
}

async function loadLevelHistory(uid) {
  console.log(
    "準備讀取 levelHistory",
    uid
  );

  if (
    !levelChartCanvas ||
    !achievementTimeline
  ) {
    console.warn(
      "找不到 level chart 或 achievement timeline DOM。"
    );

    return;
  }

  try {
    const historySnapshot =
      await getDocs(
        query(
          collection(
            db,
            "users",
            uid,
            "levelHistory"
          ),
          orderBy(
            "unlockedAt",
            "asc"
          )
        )
      );

    const history =
      historySnapshot.docs.map(
        (docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data()
        })
      );

    console.log(
      "levelHistory 筆數",
      history.length,
      history
    );

    renderAchievementTimeline(history);
    renderLevelChart(history);
  } catch (error) {
    console.error(
      "Level History 載入失敗：",
      error
    );

    achievementTimeline.innerHTML = `
      <p class="status-message error">
        Level / 成就紀錄載入失敗。
      </p>
    `;
  }
}

function renderAchievementTimeline(history) {
  if (!achievementTimeline) {
    return;
  }

  achievementTimeline.innerHTML = "";

  if (history.length === 0) {
    achievementTimeline.innerHTML = `
      <p class="empty-state">
        尚無成就紀錄
      </p>
    `;

    return;
  }

  history.forEach((item) => {
    const card =
      document.createElement("div");

    card.className =
      "achievement-item";

    const date =
      item.unlockedAt
        ?.toDate?.()
        ?.toLocaleDateString("zh-TW") ||
      "未知日期";

    const level =
      item.levelText ||
      "未設定 Level";

    const achievement =
      item.achievement ||
      "";

    card.innerHTML = `
      <div class="achievement-date">
        ${escapeHtml(date)}
      </div>

      <div class="achievement-level">
        ${escapeHtml(level)}
      </div>

      <div class="achievement-title">
        ${escapeHtml(achievement)}
      </div>
    `;

    achievementTimeline.appendChild(card);
  });
}

function renderLevelChart(history) {
  if (!levelChartCanvas) {
    return;
  }

  if (typeof Chart === "undefined") {
    console.error(
      "Chart.js 尚未載入，請確認 member.html 中 Chart.js 在 member.js 前面。"
    );

    return;
  }

  if (history.length === 0) {
    return;
  }

  const labels =
    history.map(
      (item) =>
        item.unlockedAt
          ?.toDate?.()
          ?.toLocaleDateString("zh-TW") ||
        ""
    );

  const values =
    history.map(
      (item) =>
        Number(item.levelValue) || 0
    );

  if (levelChartInstance) {
    levelChartInstance.destroy();
  }

  levelChartInstance =
    new Chart(
      levelChartCanvas,
      {
        type: "line",

        data: {
          labels,

          datasets: [
            {
              label: "Level 成長",
              data: values,
              tension: 0.3,
              fill: false
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: true
            }
          },

          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: 5,

              ticks: {
                stepSize: 1
              }
            }
          }
        }
      }
    );
}

/* =========================================================
   讀取公告
   ========================================================= */

async function loadAnnouncements() {
  if (!announcementList) {
    console.error(
      "member.html 找不到 #announcement-list。"
    );

    return;
  }

  announcementList.innerHTML = `
    <p class="empty-state">
      正在讀取公告……
    </p>
  `;

  try {
    const announcementQuery =
      query(
        collection(
          db,
          "announcements"
        ),
        orderBy(
          "createdAt",
          "desc"
        )
      );

    const querySnapshot =
      await getDocs(announcementQuery);

    announcementList.innerHTML = "";

    if (querySnapshot.empty) {
      announcementList.innerHTML = `
        <p class="empty-state">
          目前沒有公告。
        </p>
      `;

      return;
    }

    querySnapshot.forEach(
      (announcementSnapshot) => {
        const announcement = {
          id: announcementSnapshot.id,
          ...announcementSnapshot.data()
        };

        announcementList.appendChild(
          createAnnouncementCard(announcement)
        );
      }
    );
  } catch (error) {
    console.error(
      "公告讀取失敗：",
      error
    );

    announcementList.innerHTML = "";

    const errorMessage =
      document.createElement("p");

    errorMessage.className =
      "status-message error";

    errorMessage.textContent =
      `公告讀取失敗：${getErrorMessage(error)}`;

    announcementList.appendChild(errorMessage);
  }
}

function createAnnouncementCard(announcement) {
  const article =
    document.createElement("article");

  const title =
    document.createElement("h3");

  const content =
    document.createElement("p");

  const metadata =
    document.createElement("small");

  article.className =
    "card announcement-card";

  title.className =
    "announcement-title";

  content.className =
    "announcement-content";

  metadata.className =
    "announcement-meta";

  title.textContent =
    announcement.title ||
    "未命名公告";

  content.textContent =
    announcement.content ||
    "";

  metadata.textContent =
    formatTimestamp(
      announcement.createdAt
    );

  article.append(
    title,
    content
  );

  if (
    announcement.linkUrl &&
    isSafeHttpUrl(announcement.linkUrl)
  ) {
    const linkWrapper =
      document.createElement("div");

    const link =
      document.createElement("a");

    linkWrapper.className =
      "announcement-link-wrapper";

    link.href =
      String(
        announcement.linkUrl
      ).trim();

    link.textContent =
      announcement.linkText ||
      "開啟連結";

    link.className =
      "button button-small announcement-link";

    link.target =
      "_blank";

    link.rel =
      "noopener noreferrer";

    linkWrapper.appendChild(link);

    article.appendChild(linkWrapper);
  }

  if (metadata.textContent) {
    article.appendChild(metadata);
  }

  return article;
}

function isSafeHttpUrl(value) {
  try {
    const parsedUrl =
      new URL(
        String(value).trim()
      );

    return (
      parsedUrl.protocol === "http:" ||
      parsedUrl.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }

  if (
    typeof timestamp.toDate ===
    "function"
  ) {
    try {
      return timestamp
        .toDate()
        .toLocaleString(
          "zh-TW",
          {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          }
        );
    } catch (error) {
      console.warn(
        "公告時間格式化失敗：",
        error
      );

      return "";
    }
  }

  try {
    const date =
      new Date(timestamp);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    return date.toLocaleString(
      "zh-TW",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  } catch {
    return "";
  }
}

/* =========================================================
   登出
   ========================================================= */

logoutButton?.addEventListener(
  "click",

  async () => {
    logoutButton.disabled =
      true;

    logoutButton.textContent =
      "登出中……";

    try {
      await signOut(auth);

      window.location.replace(
        "./login.html"
      );
    } catch (error) {
      console.error(
        "登出失敗：",
        error
      );

      logoutButton.disabled =
        false;

      logoutButton.textContent =
        "登出";

      showStatus(
        memberStatus,
        `登出失敗：${getErrorMessage(error)}`,
        "error"
      );
    }
  }
);

function showStatus(
  element,
  message,
  type = ""
) {
  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.className =
    "status-message";

  if (type) {
    element.classList.add(type);
  }
}

function getErrorMessage(error) {
  const errorCode =
    error?.code ||
    "";

  if (
    errorCode === "permission-denied" ||
    errorCode === "firestore/permission-denied"
  ) {
    return "權限不足，請確認帳號已通過社員審核。";
  }

  if (
    errorCode === "unavailable" ||
    errorCode === "firestore/unavailable"
  ) {
    return "目前無法連線至資料庫，請稍後再試。";
  }

  if (
    errorCode ===
    "auth/network-request-failed"
  ) {
    return "網路連線失敗，請檢查網路狀態。";
  }

  return (
    error?.message ||
    "未知錯誤"
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}