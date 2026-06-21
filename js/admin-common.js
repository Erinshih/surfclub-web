


/* =========================================================
   檔案：js/admin-announcements.js
   ========================================================= */

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
   DOM
   ========================================================= */

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const logoutButton =
  document.querySelector("#logout-button");

const announcementForm =
  document.querySelector("#announcement-form");

const announcementTitle =
  document.querySelector("#announcement-title");

const announcementContent =
  document.querySelector("#announcement-content");

const announcementSubmit =
  document.querySelector("#announcement-submit");

const announcementMessage =
  document.querySelector("#announcement-message");

const announcementList =
  document.querySelector("#announcement-list");

let currentAdmin = null;

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
        await getDoc(
          doc(db, "users", user.uid)
        );

      if (!userSnapshot.exists()) {
        throw new Error(
          "Firestore 中找不到使用者資料。"
        );
      }

      const userData =
        userSnapshot.data();

      if (userData.role !== "admin") {
        window.location.replace(
          userData.status === "pending"
            ? "./pending.html"
            : "./member.html"
        );

        return;
      }

      currentAdmin = user;

      showStatus(
        adminStatus,
        `管理員：${userData.name || user.email}`,
        "success"
      );

      adminContent.classList.remove("hidden");

      await loadAnnouncements();
    } catch (error) {
      console.error(
        "管理員驗證失敗：",
        error
      );

      showStatus(
        adminStatus,
        `驗證失敗：${error.message}`,
        "error"
      );
    }
  }
);

/* =========================================================
   新增公告
   ========================================================= */

announcementForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!currentAdmin) {
      showStatus(
        announcementMessage,
        "尚未完成管理員驗證。",
        "error"
      );

      return;
    }

    const title =
      announcementTitle.value.trim();

    const content =
      announcementContent.value.trim();

    if (!title || !content) {
      showStatus(
        announcementMessage,
        "公告標題與內容不可空白。",
        "error"
      );

      return;
    }

    announcementSubmit.disabled = true;

    showStatus(
      announcementMessage,
      "公告發布中……"
    );

    try {
      await addDoc(
        collection(db, "announcements"),
        {
          title,
          content,
          createdBy: currentAdmin.uid,
          createdAt: serverTimestamp()
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
        `公告發布失敗：${error.message}`,
        "error"
      );
    } finally {
      announcementSubmit.disabled = false;
    }
  }
);

/* =========================================================
   讀取公告
   ========================================================= */

async function loadAnnouncements() {
  announcementList.innerHTML = `
    <p class="empty-state">
      正在讀取公告……
    </p>
  `;

  try {
    const announcementsQuery =
      query(
        collection(db, "announcements"),
        orderBy("createdAt", "desc")
      );

    const snapshot =
      await getDocs(announcementsQuery);

    announcementList.innerHTML = "";

    if (snapshot.empty) {
      announcementList.innerHTML = `
        <p class="empty-state">
          目前沒有公告。
        </p>
      `;

      return;
    }

    snapshot.forEach(
      (documentSnapshot) => {
        announcementList.appendChild(
          createAnnouncementCard(
            documentSnapshot.id,
            documentSnapshot.data()
          )
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
        公告讀取失敗。
      </p>
    `;
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
    "management-card";

  const information =
    document.createElement("div");

  const title =
    document.createElement("h3");

  const content =
    document.createElement("p");

  const time =
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

  time.className =
    "announcement-meta";

  time.textContent =
    formatTimestamp(
      announcement.createdAt
    );

  actions.className =
    "management-actions";

  deleteButton.type = "button";

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

      deleteButton.disabled = true;

      try {
        await deleteDoc(
          doc(
            db,
            "announcements",
            announcementId
          )
        );

        await loadAnnouncements();
      } catch (error) {
        console.error(
          "公告刪除失敗：",
          error
        );

        window.alert(
          `公告刪除失敗：${error.message}`
        );

        deleteButton.disabled = false;
      }
    }
  );

  information.append(
    title,
    content,
    time
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

    try {
      await signOut(auth);
    } finally {
      window.location.replace(
        "./login.html"
      );
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

  element.textContent = message;
  element.className = "status-message";

  if (type) {
    element.classList.add(type);
  }
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
