
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

const announcementTitleInput =
  document.querySelector("#announcement-title");

const announcementContentInput =
  document.querySelector("#announcement-content");

const announcementLinkTextInput =
  document.querySelector("#announcement-link-text");

const announcementLinkUrlInput =
  document.querySelector("#announcement-link-url");

const publishButton =
  document.querySelector("#publish-button");

const announcementFormMessage =
  document.querySelector("#announcement-form-message");

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
      window.location.replace(
        "./login.html"
      );

      return;
    }

    try {
      const userSnapshot =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );

      if (!userSnapshot.exists()) {
        throw new Error(
          "Firestore 中找不到管理員資料。"
        );
      }

      const userData =
        userSnapshot.data();

      if (userData.role !== "admin") {
        if (
          userData.status === "pending" ||
          userData.status === "rejected"
        ) {
          window.location.replace(
            "./pending.html"
          );
        } else {
          window.location.replace(
            "./member.html"
          );
        }

        return;
      }

      currentAdmin = user;

      showStatus(
        adminStatus,
        `管理員：${
          userData.name ||
          user.email ||
          "未命名"
        }`,
        "success"
      );

      adminContent?.classList.remove(
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
        `驗證失敗：${
          error?.message ||
          "未知錯誤"
        }`,
        "error"
      );
    }
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
        announcementFormMessage,
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

    const originalLinkText =
      announcementLinkTextInput
        .value
        .trim();

    const linkUrl =
      normalizeUrl(
        announcementLinkUrlInput
          .value
      );

    const linkText =
      linkUrl
        ? (
            originalLinkText ||
            "開啟連結"
          )
        : "";

    if (
      !title ||
      !content
    ) {
      showStatus(
        announcementFormMessage,
        "公告標題與內容不可空白。",
        "error"
      );

      return;
    }

    if (
      linkUrl &&
      !isSafeHttpUrl(linkUrl)
    ) {
      showStatus(
        announcementFormMessage,
        "網址格式不正確，只允許 http:// 或 https:// 網址。",
        "error"
      );

      return;
    }

    /*
     * 有填連結文字但沒有網址時，
     * 提醒管理員補上網址。
     */
    if (
      originalLinkText &&
      !linkUrl
    ) {
      showStatus(
        announcementFormMessage,
        "已填寫連結文字，但尚未輸入網址。",
        "error"
      );

      return;
    }

    publishButton.disabled =
      true;

    publishButton.textContent =
      "發布中……";

    showStatus(
      announcementFormMessage,
      "公告發布中……"
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

          linkText,
          linkUrl,

          createdBy:
            currentAdmin.uid,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()
        }
      );

      announcementForm.reset();

      showStatus(
        announcementFormMessage,
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
        announcementFormMessage,
        `公告發布失敗：${
          error?.message ||
          "未知錯誤"
        }`,
        "error"
      );
    } finally {
      publishButton.disabled =
        false;

      publishButton.textContent =
        "發布公告";
    }
  }
);

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
        announcementList.appendChild(
          createAnnouncementCard(
            announcementSnapshot.id,
            announcementSnapshot.data()
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
        公告讀取失敗：${escapeHtml(
          error?.message ||
          "未知錯誤"
        )}
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

  const time =
    document.createElement(
      "small"
    );

  const actions =
    document.createElement(
      "div"
    );

  const deleteButton =
    document.createElement(
      "button"
    );

  article.className =
    "card announcement-card";

  title.textContent =
    announcement.title ||
    "未命名公告";

  content.textContent =
    announcement.content ||
    "";

  time.className =
    "announcement-meta";

  time.textContent =
    formatTimestamp(
      announcement.createdAt
    );

  actions.className =
    "announcement-actions";

  article.append(
    title,
    content
  );

  /*
   * 公告有安全網址時，
   * 建立真正可以點擊的連結按鈕。
   */
  if (
    announcement.linkUrl &&
    isSafeHttpUrl(
      announcement.linkUrl
    )
  ) {
    const link =
      document.createElement(
        "a"
      );

    link.href =
      announcement.linkUrl;

    link.textContent =
      announcement.linkText ||
      "開啟連結";

    link.className =
      "button button-small announcement-link";

    link.target =
      "_blank";

    link.rel =
      "noopener noreferrer";

    article.appendChild(
      link
    );
  }

  article.appendChild(
    time
  );

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
          announcementFormMessage,
          "公告已刪除。",
          "success"
        );

        await loadAnnouncements();
      } catch (error) {
        console.error(
          "公告刪除失敗：",
          error
        );

        showStatus(
          announcementFormMessage,
          `公告刪除失敗：${
            error?.message ||
            "未知錯誤"
          }`,
          "error"
        );

        deleteButton.disabled =
          false;

        deleteButton.textContent =
          "刪除公告";
      }
    }
  );

  actions.appendChild(
    deleteButton
  );

  article.appendChild(
    actions
  );

  return article;
}

/* =========================================================
   網址處理
   ========================================================= */

function normalizeUrl(value) {
  const text =
    String(
      value || ""
    ).trim();

  if (!text) {
    return "";
  }

  if (
    /^https?:\/\//i.test(text)
  ) {
    return text;
  }

  return `https://${text}`;
}

function isSafeHttpUrl(value) {
  try {
    const parsedUrl =
      new URL(value);

    return (
      parsedUrl.protocol ===
        "http:" ||
      parsedUrl.protocol ===
        "https:"
    );
  } catch {
    return false;
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

      showStatus(
        adminStatus,
        `登出失敗：${
          error?.message ||
          "未知錯誤"
        }`,
        "error"
      );
    }
  }
);

/* =========================================================
   共用函式
   ========================================================= */

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

function escapeHtml(value) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function showStatus(
  element,
  text,
  type = ""
) {
  if (!element) {
    return;
  }

  element.textContent =
    text;

  element.className =
    "status-message";

  if (type) {
    element.classList.add(
      type
    );
  }
}

