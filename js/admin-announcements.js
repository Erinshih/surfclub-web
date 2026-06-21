
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

/* =========================================================
   DOM 元素
   ========================================================= */

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const logoutButton =
  document.querySelector("#logout-button");

const announcementForm =
  document.querySelector("#announcement-form");

const announcementTitleInput =
  document.querySelector("#announcement-title");

const announcementContentInput =
  document.querySelector("#announcement-content");

const announcementSubmitButton =
  document.querySelector("#announcement-submit");

const announcementMessage =
  document.querySelector("#announcement-message");

const announcementList =
  document.querySelector("#announcement-list");

/* =========================================================
   全域狀態
   ========================================================= */

let currentAdmin = null;
let authFinished = false;

/* =========================================================
   頁面基本檢查
   ========================================================= */

if (!adminStatus || !adminContent) {
  console.error(
    "admin-announcements.html 缺少必要元素：",
    {
      adminStatus,
      adminContent
    }
  );
}

/*
 * 如果 Firebase 驗證長時間完全沒有回應，
 * 顯示提示，避免永遠停在「驗證中」。
 */
const authTimeout = window.setTimeout(() => {
  if (authFinished) {
    return;
  }

  showStatus(
    adminStatus,
    "管理員驗證逾時。請檢查 firebase-config.js、網路連線與瀏覽器 Console。",
    "error"
  );
}, 10000);

/* =========================================================
   管理員身分驗證
   ========================================================= */

onAuthStateChanged(
  auth,

  async (user) => {
    authFinished = true;
    window.clearTimeout(authTimeout);

    /*
     * 沒有 Firebase 登入狀態時，
     * 導回登入頁面。
     */
    if (!user) {
      showStatus(
        adminStatus,
        "尚未登入，正在前往登入頁面……",
        "error"
      );

      window.setTimeout(() => {
        window.location.replace(
          "./login.html"
        );
      }, 600);

      return;
    }

    showStatus(
      adminStatus,
      "登入狀態已確認，正在讀取管理員資料……"
    );

    try {
      /*
       * Firestore 文件路徑必須是：
       * users/{Firebase Authentication UID}
       */
      const userReference =
        doc(
          db,
          "users",
          user.uid
        );

      const userSnapshot =
        await getDoc(userReference);

      if (!userSnapshot.exists()) {
        throw new Error(
          `Firestore 中找不到 users/${user.uid} 文件。`
        );
      }

      const userData =
        userSnapshot.data();

      /*
       * 管理員 role 必須精確等於字串 "admin"。
       */
      if (userData.role !== "admin") {
        showStatus(
          adminStatus,
          `此帳號不是管理員，目前角色為：${
            userData.role || "未設定"
          }`,
          "error"
        );

        window.setTimeout(() => {
          if (
            userData.role === "pending" ||
            userData.status === "pending"
          ) {
            window.location.replace(
              "./pending.html"
            );
          } else {
            window.location.replace(
              "./member.html"
            );
          }
        }, 1000);

        return;
      }

      currentAdmin = user;

      showStatus(
        adminStatus,
        `管理員：${
          userData.name ||
          user.email ||
          user.uid
        }`,
        "success"
      );

      adminContent.classList.remove(
        "hidden"
      );

      await loadAnnouncements();
    } catch (error) {
      console.error(
        "管理員驗證失敗：",
        error
      );

      showStatus(
        adminStatus,
        getReadableErrorMessage(
          "管理員驗證失敗",
          error
        ),
        "error"
      );
    }
  },

  (error) => {
    authFinished = true;
    window.clearTimeout(authTimeout);

    console.error(
      "Firebase Authentication 監聽失敗：",
      error
    );

    showStatus(
      adminStatus,
      getReadableErrorMessage(
        "登入狀態讀取失敗",
        error
      ),
      "error"
    );
  }
);

/* =========================================================
   發布公告
   ========================================================= */

announcementForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    if (!currentAdmin) {
      showStatus(
        announcementMessage,
        "尚未完成管理員身分驗證。",
        "error"
      );

      return;
    }

    const title =
      announcementTitleInput
        .value
        .trim();

    const content =
      announcementContentInput
        .value
        .trim();

    if (!title) {
      showStatus(
        announcementMessage,
        "請輸入公告標題。",
        "error"
      );

      announcementTitleInput.focus();
      return;
    }

    if (!content) {
      showStatus(
        announcementMessage,
        "請輸入公告內容。",
        "error"
      );

      announcementContentInput.focus();
      return;
    }

    announcementSubmitButton.disabled =
      true;

    announcementSubmitButton.textContent =
      "發布中……";

    showStatus(
      announcementMessage,
      "正在發布公告……"
    );

    try {
      await addDoc(
        collection(
          db,
          "announcements"
        ),
        {
          title,
          content,
          createdBy:
            currentAdmin.uid,
          createdAt:
            serverTimestamp()
        }
      );

      announcementForm.reset();

      showStatus(
        announcementMessage,
        "公告發布成功。",
        "success"
      );

      await loadAnnouncements();
    } catch (error) {
      console.error(
        "公告發布失敗：",
        error
      );

      showStatus(
        announcementMessage,
        getReadableErrorMessage(
          "公告發布失敗",
          error
        ),
        "error"
      );
    } finally {
      announcementSubmitButton.disabled =
        false;

      announcementSubmitButton.textContent =
        "發布公告";
    }
  }
);

/* =========================================================
   載入公告
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
      (documentSnapshot) => {
        const announcementCard =
          createAnnouncementCard(
            documentSnapshot.id,
            documentSnapshot.data()
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

    announcementList.innerHTML = "";

    const errorMessage =
      document.createElement("p");

    errorMessage.className =
      "status-message error";

    errorMessage.textContent =
      getReadableErrorMessage(
        "公告讀取失敗",
        error
      );

    announcementList.appendChild(
      errorMessage
    );
  }
}

/* =========================================================
   建立公告卡片
   ========================================================= */

function createAnnouncementCard(
  announcementId,
  announcement
) {
  const article =
    document.createElement("article");

  article.className =
    "management-card announcement-card";

  const information =
    document.createElement("div");

  const title =
    document.createElement("h3");

  const content =
    document.createElement("p");

  const metadata =
    document.createElement("small");

  const actions =
    document.createElement("div");

  const deleteButton =
    document.createElement("button");

  title.textContent =
    announcement.title ||
    "未命名公告";

  content.textContent =
    announcement.content || "";

  metadata.className =
    "announcement-meta";

  metadata.textContent =
    formatTimestamp(
      announcement.createdAt
    );

  actions.className =
    "management-actions";

  deleteButton.type =
    "button";

  deleteButton.className =
    "button button-small delete-button";

  deleteButton.textContent =
    "刪除公告";

  deleteButton.addEventListener(
    "click",

    async () => {
      const confirmed =
        window.confirm(
          `確定要刪除「${
            announcement.title ||
            "未命名公告"
          }」嗎？`
        );

      if (!confirmed) {
        return;
      }

      deleteButton.disabled =
        true;

      deleteButton.textContent =
        "刪除中……";

      try {
        await deleteDoc(
          doc(
            db,
            "announcements",
            announcementId
          )
        );

        showStatus(
          announcementMessage,
          "公告已刪除。",
          "success"
        );

        await loadAnnouncements();
      } catch (error) {
        console.error(
          "公告刪除失敗：",
          error
        );

        window.alert(
          getReadableErrorMessage(
            "公告刪除失敗",
            error
          )
        );

        deleteButton.disabled =
          false;

        deleteButton.textContent =
          "刪除公告";
      }
    }
  );

  information.append(
    title,
    content,
    metadata
  );

  actions.appendChild(
    deleteButton
  );

  article.append(
    information,
    actions
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
        adminStatus,
        getReadableErrorMessage(
          "登出失敗",
          error
        ),
        "error"
      );

      logoutButton.disabled = false;
      logoutButton.textContent =
        "登出";
    }
  }
);

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

  element.textContent =
    message;

  element.className =
    "status-message";

  if (type) {
    element.classList.add(type);
  }
}

function formatTimestamp(
  timestamp
) {
  if (
    !timestamp ||
    typeof timestamp.toDate !==
      "function"
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

function getReadableErrorMessage(
  prefix,
  error
) {
  if (
    error?.code ===
    "permission-denied"
  ) {
    return `${prefix}：Firestore 權限不足，請檢查 Rules 與管理員 role。`;
  }

  if (
    error?.code ===
    "unavailable"
  ) {
    return `${prefix}：目前無法連線到 Firebase，請檢查網路。`;
  }

  if (
    error?.code ===
    "failed-precondition"
  ) {
    return `${prefix}：Firebase 查詢條件尚未完成設定。`;
  }

  return `${prefix}：${
    error?.message ||
    "未知錯誤"
  }`;
}

