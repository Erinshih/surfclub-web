
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
   DOM 元素
   ========================================================= */

const memberStatus =
  document.querySelector("#member-status");

const memberName =
  document.querySelector("#member-name");

const memberEmail =
  document.querySelector("#member-email");

const memberLevel =
  document.querySelector("#member-level");

const memberFamily =
  document.querySelector("#member-family");

const memberProfileMessage =
  document.querySelector("#member-profile-message");

const announcementList =
  document.querySelector("#announcement-list");

const logoutButton =
  document.querySelector("#logout-button");

/* =========================================================
   全域狀態
   ========================================================= */

let currentMember = null;

/* =========================================================
   共用函式
   ========================================================= */

function showStatus(
  element,
  message,
  type = ""
) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = "status-message";

  if (type) {
    element.classList.add(type);
  }
}

function setText(
  element,
  value,
  fallback = "尚未設定"
) {
  if (!element) {
    return;
  }

  const text =
    String(value ?? "").trim();

  element.textContent =
    text || fallback;
}

function formatTimestamp(timestamp) {
  if (
    !timestamp ||
    typeof timestamp.toDate !== "function"
  ) {
    return "時間處理中……";
  }

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
}

/* =========================================================
   Firebase Authentication 驗證
   ========================================================= */

onAuthStateChanged(
  auth,
  async (user) => {
    if (!user) {
      window.location.replace(
        "./login.html"
      );

      return;
    }

    currentMember = user;

    showStatus(
      memberStatus,
      "正在讀取社員資料……"
    );

    try {
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

      if (!userSnapshot.exists()) {
        throw new Error(
          "Firestore 中找不到這個帳號的社員資料。"
        );
      }

      const userData =
        userSnapshot.data();

      /*
       * 未審核的使用者轉往等待頁面。
       */
      if (
        userData.role === "pending" ||
        userData.status === "pending"
      ) {
        window.location.replace(
          "./pending.html"
        );

        return;
      }

      /*
       * 被拒絕的使用者不可進入社員頁。
       */
      if (
        userData.status === "rejected"
      ) {
        showStatus(
          memberStatus,
          "社員申請未通過，請聯絡管理員。",
          "error"
        );

        showStatus(
          memberProfileMessage,
          "目前無法使用社員功能。",
          "error"
        );

        return;
      }

      /*
       * 只有 member 或 admin 可以進入社員頁。
       */
      if (
        userData.role !== "member" &&
        userData.role !== "admin"
      ) {
        throw new Error(
          "這個帳號目前沒有社員頁面的使用權限。"
        );
      }

      renderMemberProfile(
        userData,
        user
      );

      showStatus(
        memberStatus,
        `歡迎回來，${
          userData.name ||
          user.displayName ||
          user.email ||
          "社員"
        }`,
        "success"
      );

      await loadAnnouncements();
    } catch (error) {
      console.error(
        "社員驗證或資料載入失敗：",
        error
      );

      showStatus(
        memberStatus,
        `驗證失敗：${error.message}`,
        "error"
      );

      showStatus(
        memberProfileMessage,
        "社員資料載入失敗，請重新整理頁面或聯絡管理員。",
        "error"
      );

      if (announcementList) {
        announcementList.innerHTML = `
          <p class="status-message error">
            因社員身分驗證失敗，無法讀取公告。
          </p>
        `;
      }
    }
  }
);

/* =========================================================
   顯示社員個人資料
   ========================================================= */

function renderMemberProfile(
  userData,
  authUser
) {
  setText(
    memberName,
    userData.name ||
      authUser.displayName,
    "尚未填寫姓名"
  );

  setText(
    memberEmail,
    userData.email ||
      authUser.email,
    "尚未設定 Email"
  );

  setText(
    memberLevel,
    userData.level,
    "尚未設定"
  );

  setText(
    memberFamily,
    userData.family,
    "尚未分配"
  );

  if (memberLevel) {
    const level =
      String(
        userData.level ?? ""
      )
        .trim()
        .toLowerCase();

    memberLevel.dataset.level =
      level;
  }

  showStatus(
    memberProfileMessage,
    "Level 與家系資料由管理員統一設定。",
    "success"
  );
}

/* =========================================================
   讀取公告
   ========================================================= */

async function loadAnnouncements() {
  if (!announcementList) {
    return;
  }

  announcementList.innerHTML = `
    <p class="empty-state">
      正在讀取公告……
    </p>
  `;

  try {
    const announcementsQuery =
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
        announcementsQuery
      );

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
        const announcement =
          announcementSnapshot.data();

        const announcementCard =
          createAnnouncementCard(
            announcement
          );

        announcementList.appendChild(
          announcementCard
        );
      }
    );
  } catch (error) {
    console.error(
      "公告讀取失敗：",
      error
    );

    announcementList.innerHTML = `
      <p class="status-message error">
        公告讀取失敗：${escapeHtml(
          error.message
        )}
      </p>
    `;
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

  article.className =
    "announcement-card card";

  const title =
    document.createElement("h3");

  title.textContent =
    announcement.title ||
    "未命名公告";

  const content =
    document.createElement("p");

  content.className =
    "announcement-content";

  content.textContent =
    announcement.content || "";

  const metadata =
    document.createElement("small");

  metadata.className =
    "announcement-meta";

  metadata.textContent =
    formatTimestamp(
      announcement.createdAt
    );

  article.append(
    title,
    content,
    metadata
  );

  return article;
}

/* =========================================================
   登出
   ========================================================= */

logoutButton?.addEventListener(
  "click",
  async () => {
    logoutButton.disabled = true;
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

      showStatus(
        memberStatus,
        `登出失敗：${error.message}`,
        "error"
      );

      logoutButton.disabled = false;
      logoutButton.textContent =
        "登出";
    }
  }
);

/* =========================================================
   避免錯誤訊息直接插入 HTML
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
