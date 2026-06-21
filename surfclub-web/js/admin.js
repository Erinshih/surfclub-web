// javascript
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
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

/* =========================================================
   取得 HTML 元素
   ========================================================= */

// 管理員狀態
const adminStatus =
  document.querySelector("#admin-status");

// 公告表單區塊
const announcementFormSection =
  document.querySelector(
    "#announcement-form-section"
  );

// 公告表單
const announcementForm =
  document.querySelector("#announcement-form");

const titleInput =
  document.querySelector("#title");

const contentInput =
  document.querySelector("#content");

const publishButton =
  document.querySelector("#publish-button");

const formMessage =
  document.querySelector("#form-message");

// 公告列表
const announcementList =
  document.querySelector("#announcement-list");

// 待審核社員列表
const pendingMemberList =
  document.querySelector("#pending-member-list");

// 登出按鈕
const logoutButton =
  document.querySelector("#logout-button");

// 目前登入的管理員
let currentAdmin = null;


/* =========================================================
   顯示狀態訊息
   ========================================================= */

function showStatus(
  element,
  text,
  type = ""
) {
  if (!element) {
    return;
  }

  element.textContent = text;

  element.className =
    `status-message ${type}`.trim();
}


/* =========================================================
   驗證管理員身分
   ========================================================= */

onAuthStateChanged(
  auth,
  async (user) => {
    /*
     * 沒有登入就回登入頁。
     */
    if (!user) {
      window.location.replace(
        "./login.html"
      );

      return;
    }

    try {
      /*
       * 根據 Authentication UID
       * 讀取 Firestore 使用者資料。
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
          "Firestore 中找不到使用者資料。"
        );
      }

      const userData =
        userSnapshot.data();

      /*
       * 非管理員不可進入管理後台。
       */
      if (userData.role !== "admin") {
        if (
          userData.role === "member" &&
          userData.status !== "approved"
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

      /*
       * 驗證成功，保存目前管理員。
       */
      currentAdmin = user;

      showStatus(
        adminStatus,
        `管理員：${
          userData.name ??
          user.email ??
          "未命名管理員"
        }`,
        "success"
      );

      /*
       * 顯示公告表單。
       */
      if (announcementFormSection) {
        announcementFormSection
          .classList
          .remove("hidden");
      }

      /*
       * 載入公告與待審核社員。
       */
      await Promise.all([
        loadAnnouncements(),
        loadPendingMembers()
      ]);

    } catch (error) {
      console.error(
        "管理員驗證失敗：",
        error
      );

      showStatus(
        adminStatus,
        `管理員驗證失敗：${error.message}`,
        "error"
      );
    }
  }
);


/* =========================================================
   發布公告
   ========================================================= */

if (announcementForm) {
  announcementForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      if (!currentAdmin) {
        showStatus(
          formMessage,
          "尚未完成管理員身分驗證。",
          "error"
        );

        return;
      }

      const title =
        titleInput.value.trim();

      const content =
        contentInput.value.trim();

      if (!title || !content) {
        showStatus(
          formMessage,
          "標題與公告內容不可空白。",
          "error"
        );

        return;
      }

      if (title.length > 100) {
        showStatus(
          formMessage,
          "公告標題不可超過 100 個字元。",
          "error"
        );

        return;
      }

      if (content.length > 2000) {
        showStatus(
          formMessage,
          "公告內容不可超過 2000 個字元。",
          "error"
        );

        return;
      }

      publishButton.disabled = true;

      showStatus(
        formMessage,
        "公告發布中……"
      );

      try {
        /*
         * Firestore 若尚未有 announcements，
         * addDoc 成功後會自動建立集合。
         */
        await addDoc(
          collection(
            db,
            "announcements"
          ),
          {
            title: title,
            content: content,
            createdBy:
              currentAdmin.uid,
            createdAt:
              serverTimestamp()
          }
        );

        announcementForm.reset();

        showStatus(
          formMessage,
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
          formMessage,
          `公告發布失敗：${error.message}`,
          "error"
        );

      } finally {
        publishButton.disabled = false;
      }
    }
  );
}


/* =========================================================
   讀取公告
   ========================================================= */

async function loadAnnouncements() {
  if (!announcementList) {
    return;
  }

  announcementList.innerHTML =
    "<p>正在讀取公告……</p>";

  try {
    /*
     * 依建立時間由新到舊排序。
     */
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

    announcementList.innerHTML = "";

    if (querySnapshot.empty) {
      announcementList.innerHTML =
        '<div class="empty-state">目前沒有公告。</div>';

      return;
    }

    querySnapshot.forEach(
      (documentSnapshot) => {
        const announcement =
          documentSnapshot.data();

        const card =
          createAnnouncementCard(
            documentSnapshot.id,
            announcement
          );

        announcementList.appendChild(card);
      }
    );

  } catch (error) {
    console.error(
      "公告讀取失敗：",
      error
    );

    const message =
      document.createElement("p");

    message.className =
      "status-message error";

    message.textContent =
      `公告讀取失敗：${error.message}`;

    announcementList.innerHTML = "";

    announcementList.appendChild(
      message
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
    "card announcement-card";

  const title =
    document.createElement("h3");

  title.textContent =
    announcement.title ??
    "未命名公告";

  const content =
    document.createElement("p");

  content.textContent =
    announcement.content ?? "";

  const time =
    document.createElement("small");

  time.className =
    "announcement-meta";

  time.textContent =
    formatTimestamp(
      announcement.createdAt
    );

  const actions =
    document.createElement("div");

  actions.className =
    "announcement-actions";

  const deleteButton =
    document.createElement("button");

  deleteButton.type = "button";

  deleteButton.className =
    "button delete-button";

  deleteButton.textContent =
    "刪除公告";

  deleteButton.addEventListener(
    "click",
    async () => {
      const confirmed =
        window.confirm(
          `確定要刪除「${
            announcement.title ??
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

  actions.appendChild(
    deleteButton
  );

  article.append(
    title,
    content,
    time,
    actions
  );

  return article;
}


/* =========================================================
   讀取待審核社員
   ========================================================= */

async function loadPendingMembers() {
  if (!pendingMemberList) {
    return;
  }

  pendingMemberList.innerHTML =
    "<p>正在讀取待審核社員……</p>";

  try {
    /*
     * 只查詢：
     * role = member
     * status = pending
     */
    const pendingQuery =
      query(
        collection(
          db,
          "users"
        ),
        where(
          "role",
          "==",
          "member"
        ),
        where(
          "status",
          "==",
          "pending"
        )
      );

    const querySnapshot =
      await getDocs(
        pendingQuery
      );

    pendingMemberList.innerHTML = "";

    if (querySnapshot.empty) {
      pendingMemberList.innerHTML =
        '<div class="empty-state">目前沒有待審核社員。</div>';

      return;
    }

    querySnapshot.forEach(
      (documentSnapshot) => {
        const member =
          documentSnapshot.data();

        const card =
          createMemberApplicationCard(
            documentSnapshot.id,
            member
          );

        pendingMemberList.appendChild(
          card
        );
      }
    );

  } catch (error) {
    console.error(
      "讀取社員申請失敗：",
      error
    );

    const message =
      document.createElement("p");

    message.className =
      "status-message error";

    message.textContent =
      `讀取社員申請失敗：${error.message}`;

    pendingMemberList.innerHTML = "";

    pendingMemberList.appendChild(
      message
    );
  }
}


/* =========================================================
   建立社員申請卡片
   ========================================================= */

function createMemberApplicationCard(
  userId,
  member
) {
  const article =
    document.createElement("article");

  article.className =
    "member-application";

  const information =
    document.createElement("div");

  const name =
    document.createElement("h3");

  name.textContent =
    member.name ??
    "未填寫姓名";

  const studentId =
    document.createElement("p");

  studentId.textContent =
    `學號：${
      member.studentId ??
      "未填寫"
    }`;

  const email =
    document.createElement("p");

  email.textContent =
    `Email：${
      member.email ??
      "未填寫"
    }`;

  const applicationTime =
    document.createElement("small");

  applicationTime.className =
    "announcement-meta";

  applicationTime.textContent =
    `申請時間：${
      formatTimestamp(
        member.createdAt
      )
    }`;

  information.append(
    name,
    studentId,
    email,
    applicationTime
  );

  const actions =
    document.createElement("div");

  actions.className =
    "member-application-actions";

  const approveButton =
    document.createElement("button");

  approveButton.type = "button";

  approveButton.className =
    "button";

  approveButton.textContent =
    "批准";

  approveButton.addEventListener(
    "click",
    async () => {
      await reviewMember(
        userId,
        member,
        "approved",
        approveButton,
        rejectButton
      );
    }
  );

  const rejectButton =
    document.createElement("button");

  rejectButton.type = "button";

  rejectButton.className =
    "button delete-button";

  rejectButton.textContent =
    "拒絕";

  rejectButton.addEventListener(
    "click",
    async () => {
      await reviewMember(
        userId,
        member,
        "rejected",
        approveButton,
        rejectButton
      );
    }
  );

  actions.append(
    approveButton,
    rejectButton
  );

  article.append(
    information,
    actions
  );

  return article;
}


/* =========================================================
   批准或拒絕社員
   ========================================================= */

async function reviewMember(
  userId,
  member,
  newStatus,
  approveButton,
  rejectButton
) {
  if (!currentAdmin) {
    window.alert(
      "尚未完成管理員身分驗證。"
    );

    return;
  }

  const isApproved =
    newStatus === "approved";

  const actionName =
    isApproved
      ? "批准"
      : "拒絕";

  const memberName =
    member.name ??
    member.email ??
    "此社員";

  const confirmed =
    window.confirm(
      `確定要${actionName}「${memberName}」的社員申請嗎？`
    );

  if (!confirmed) {
    return;
  }

  approveButton.disabled = true;
  rejectButton.disabled = true;

  try {
    /*
     * 更新使用者申請狀態。
     */
    await updateDoc(
      doc(
        db,
        "users",
        userId
      ),
      {
        status: newStatus,
        reviewedBy:
          currentAdmin.uid,
        reviewedAt:
          serverTimestamp()
      }
    );

    window.alert(
      `${actionName}成功。`
    );

    await loadPendingMembers();

  } catch (error) {
    console.error(
      "更新社員狀態失敗：",
      error
    );

    window.alert(
      `更新社員狀態失敗：${error.message}`
    );

    approveButton.disabled = false;
    rejectButton.disabled = false;
  }
}


/* =========================================================
   Firestore Timestamp 格式化
   ========================================================= */

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
   登出
   ========================================================= */

if (logoutButton) {
  logoutButton.addEventListener(
    "click",
    async () => {
      try {
        await signOut(auth);
      } catch (error) {
        console.error(
          "登出失敗：",
          error
        );
      } finally {
        window.location.replace(
          "./login.html"
        );
      }
    }
  );
}

