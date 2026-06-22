
/* =========================================================
   檔案：js/member.js

   功能：
   1. 驗證 Firebase Authentication 登入狀態
   2. 讀取 Firestore users/{uid}
   3. 驗證正式社員身分
   4. 顯示姓名、Email、Level、家系
   5. 讀取最新公告
   6. 顯示公告網址按鈕
   7. 登出

   已移除：
   - 近期社課載入
   - member-course-list
   - 快速入口相關邏輯
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

/* =========================================================
   DOM：狀態與登出
   ========================================================= */

const memberStatus =
  document.querySelector(
    "#member-status"
  );

const logoutButton =
  document.querySelector(
    "#logout-button"
  );

/* =========================================================
   DOM：社員資料
   ========================================================= */

const memberName =
  document.querySelector(
    "#member-name"
  );

const memberEmail =
  document.querySelector(
    "#member-email"
  );

const memberLevel =
  document.querySelector(
    "#member-level"
  );

const memberFamily =
  document.querySelector(
    "#member-family"
  );

/* =========================================================
   DOM：公告
   ========================================================= */

const announcementList =
  document.querySelector(
    "#announcement-list"
  );

/* =========================================================
   狀態
   ========================================================= */

let currentUser = null;
let currentUserData = null;

/* =========================================================
   驗證登入狀態與社員身分
   ========================================================= */

onAuthStateChanged(
  auth,

  async (user) => {
    /*
     * 沒有登入時，導向登入頁面。
     */
    if (!user) {
      window.location.replace(
        "./login.html"
      );

      return;
    }

    currentUser = user;

    showStatus(
      memberStatus,
      "正在驗證社員資料……"
    );

    try {
      /*
       * 讀取目前登入者的 Firestore 文件。
       */
      const userReference =
        doc(
          db,
          "users",
          user.uid
        );

      const userSnapshot =
        await getDoc(
          userReference
        );

      /*
       * Firebase Authentication 有帳號，
       * 但 Firestore 找不到 users/{uid}。
       */
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

      /*
       * 管理員登入時，導向管理後台。
       */
      if (role === "admin") {
        window.location.replace(
          "./admin.html"
        );

        return;
      }

      /*
       * 待審核或被拒絕者，
       * 導向 pending.html。
       */
      if (
        role === "pending" ||
        status === "pending" ||
        status === "rejected"
      ) {
        window.location.replace(
          "./pending.html"
        );

        return;
      }

      /*
       * 只有正式社員可以留在社員首頁。
       */
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

      /*
       * 顯示社員個人資料。
       */
      renderMemberProfile(
        user,
        currentUserData
      );

      /*
       * 顯示歡迎訊息。
       */
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

      /*
       * 身分驗證完成後讀取公告。
       */
      await loadAnnouncements();
    } catch (error) {
      console.error(
        "社員資料讀取失敗：",
        error
      );

      clearMemberProfile();

      showStatus(
        memberStatus,
        `社員資料讀取失敗：${
          getErrorMessage(error)
        }`,
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
      `登入狀態讀取失敗：${
        getErrorMessage(error)
      }`,
      "error"
    );
  }
);

/* =========================================================
   顯示社員個人資料
   ========================================================= */

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

/* =========================================================
   清除社員資料顯示
   ========================================================= */

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
      await getDocs(
        announcementQuery
      );

    announcementList.innerHTML =
      "";

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
          id:
            announcementSnapshot.id,

          ...announcementSnapshot.data()
        };

        announcementList.appendChild(
          createAnnouncementCard(
            announcement
          )
        );
      }
    );
  } catch (error) {
    console.error(
      "公告讀取失敗：",
      error
    );

    announcementList.innerHTML =
      "";

    const errorMessage =
      document.createElement(
        "p"
      );

    errorMessage.className =
      "status-message error";

    errorMessage.textContent =
      `公告讀取失敗：${
        getErrorMessage(error)
      }`;

    announcementList.appendChild(
      errorMessage
    );
  }
}

/* =========================================================
   建立公告卡片
   ========================================================= */

function createAnnouncementCard(
  announcement
) {
  const article =
    document.createElement(
      "article"
    );

  const title =
    document.createElement(
      "h3"
    );

  const content =
    document.createElement(
      "p"
    );

  const metadata =
    document.createElement(
      "small"
    );

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

  /*
   * 公告有合法的 HTTP／HTTPS 網址時，
   * 顯示可點擊的連結按鈕。
   */
  if (
    announcement.linkUrl &&
    isSafeHttpUrl(
      announcement.linkUrl
    )
  ) {
    const linkWrapper =
      document.createElement(
        "div"
      );

    const link =
      document.createElement(
        "a"
      );

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

    linkWrapper.appendChild(
      link
    );

    article.appendChild(
      linkWrapper
    );
  }

  /*
   * 有時間資料才顯示時間。
   */
  if (metadata.textContent) {
    article.appendChild(
      metadata
    );
  }

  return article;
}

/* =========================================================
   網址安全檢查
   ========================================================= */

function isSafeHttpUrl(
  value
) {
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

/* =========================================================
   公告時間格式
   ========================================================= */

function formatTimestamp(
  timestamp
) {
  if (!timestamp) {
    return "";
  }

  /*
   * Firestore Timestamp。
   */
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

  /*
   * 相容一般日期字串或毫秒數。
   */
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
      await signOut(
        auth
      );

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
        `登出失敗：${
          getErrorMessage(error)
        }`,
        "error"
      );
    }
  }
);

/* =========================================================
   顯示狀態訊息
   ========================================================= */

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
    element.classList.add(
      type
    );
  }
}

/* =========================================================
   錯誤訊息處理
   ========================================================= */

function getErrorMessage(
  error
) {
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

