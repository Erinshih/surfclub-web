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
  updateDoc
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

/* 公告元素 */

const announcementForm =
  document.querySelector("#announcement-form");

const announcementTitleInput =
  document.querySelector("#announcement-title");

const announcementContentInput =
  document.querySelector("#announcement-content");

const publishButton =
  document.querySelector("#publish-button");

const announcementFormMessage =
  document.querySelector("#announcement-form-message");

const announcementList =
  document.querySelector("#announcement-list");

const exportMembersButton =
  document.querySelector("#export-members-button");

const exportMembersMessage =
  document.querySelector("#export-members-message");

/* 社課元素 */

const courseForm =
  document.querySelector("#course-form");

const courseIdInput =
  document.querySelector("#course-id");

const courseOrderInput =
  document.querySelector("#course-order");

const courseDateInput =
  document.querySelector("#course-date");

const courseTitleInput =
  document.querySelector("#course-title");

const courseDescriptionInput =
  document.querySelector("#course-description");

const courseTagsInput =
  document.querySelector("#course-tags");

const courseStatusInput =
  document.querySelector("#course-status");

const courseSubmitButton =
  document.querySelector("#course-submit-button");

const courseCancelButton =
  document.querySelector("#course-cancel-button");

const courseFormMessage =
  document.querySelector("#course-form-message");

const adminCourseList =
  document.querySelector("#admin-course-list");

let currentAdmin = null;

/* =========================================================
   共用函式
   ========================================================= */

function showStatus(element, text, type = "") {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.className = "status-message";

  if (type) {
    element.classList.add(type);
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") {
    return "時間處理中……";
  }

  return timestamp.toDate().toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseCourseTags(tagText) {
  return tagText
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 10);
}

/* =========================================================
   管理員驗證
   ========================================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("./login.html");
    return;
  }

  try {
    const userSnapshot =
      await getDoc(doc(db, "users", user.uid));

    if (!userSnapshot.exists()) {
      throw new Error("Firestore 中找不到使用者資料。");
    }

    const userData = userSnapshot.data();

    if (userData.role !== "admin") {
      window.location.replace("./member.html");
      return;
    }

    currentAdmin = user;

    showStatus(
      adminStatus,
      `管理員：${userData.name ?? user.email}`,
      "success"
    );

    adminContent.classList.remove("hidden");

    await Promise.all([
      loadAnnouncements(),
      loadAdminCourses()
    ]);
  } catch (error) {
    console.error("管理員驗證失敗：", error);

    showStatus(
      adminStatus,
      `驗證失敗：${error.message}`,
      "error"
    );
  }
});

/* =========================================================
   公告管理
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
      announcementTitleInput.value.trim();

    const content =
      announcementContentInput.value.trim();

    if (!title || !content) {
      showStatus(
        announcementFormMessage,
        "標題與公告內容不可空白。",
        "error"
      );

      return;
    }

    publishButton.disabled = true;

    showStatus(
      announcementFormMessage,
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
        announcementFormMessage,
        "公告發布成功。",
        "success"
      );

      await loadAnnouncements();
    } catch (error) {
      console.error("公告發布失敗：", error);

      showStatus(
        announcementFormMessage,
        `公告發布失敗：${error.message}`,
        "error"
      );
    } finally {
      publishButton.disabled = false;
    }
  }
);

async function loadAnnouncements() {
  announcementList.innerHTML = `
    <p class="empty-state">
      正在讀取公告……
    </p>
  `;

  try {
    const announcementQuery = query(
      collection(db, "announcements"),
      orderBy("createdAt", "desc")
    );

    const querySnapshot =
      await getDocs(announcementQuery);

    announcementList.innerHTML = "";

    if (querySnapshot.empty) {
      announcementList.innerHTML = `
        <div class="empty-state">
          目前沒有公告。
        </div>
      `;

      return;
    }

    querySnapshot.forEach((snapshot) => {
      announcementList.appendChild(
        createAnnouncementCard(
          snapshot.id,
          snapshot.data()
        )
      );
    });
  } catch (error) {
    console.error("公告讀取失敗：", error);

    announcementList.innerHTML = `
      <p class="status-message error">
        公告讀取失敗：${error.message}
      </p>
    `;
  }
}

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
    announcement.title ?? "未命名公告";

  const content =
    document.createElement("p");

  content.textContent =
    announcement.content ?? "";

  const time =
    document.createElement("small");

  time.className =
    "announcement-meta";

  time.textContent =
    formatTimestamp(announcement.createdAt);

  const actions =
    document.createElement("div");

  actions.className =
    "announcement-actions";

  const deleteButton =
    document.createElement("button");

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
          `確定要刪除「${announcement.title ?? "未命名公告"}」嗎？`
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

  actions.appendChild(deleteButton);

  article.append(
    title,
    content,
    time,
    actions
  );

  return article;
}

/* =========================================================
   社課管理
   ========================================================= */

courseForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!currentAdmin) {
      showStatus(
        courseFormMessage,
        "尚未完成管理員身分驗證。",
        "error"
      );

      return;
    }

    const courseId =
      courseIdInput.value.trim();

    const order =
      Number(courseOrderInput.value);

    const date =
      courseDateInput.value.trim();

    const title =
      courseTitleInput.value.trim();

    const description =
      courseDescriptionInput.value.trim();

    const tags =
      parseCourseTags(courseTagsInput.value);

    const status =
      courseStatusInput.value;

    if (!Number.isInteger(order) || order < 1) {
      showStatus(
        courseFormMessage,
        "顯示順序必須是大於 0 的整數。",
        "error"
      );

      return;
    }

    if (!date || !title || !description) {
      showStatus(
        courseFormMessage,
        "日期、社課名稱與社課說明不可空白。",
        "error"
      );

      return;
    }

    if (
      status !== "published" &&
      status !== "draft"
    ) {
      showStatus(
        courseFormMessage,
        "社課狀態不正確。",
        "error"
      );

      return;
    }

    courseSubmitButton.disabled = true;

    showStatus(
      courseFormMessage,
      courseId
        ? "正在儲存修改……"
        : "正在新增社課……"
    );

    const courseData = {
      order,
      date,
      title,
      description,
      tags,
      status,
      updatedBy: currentAdmin.uid,
      updatedAt: serverTimestamp()
    };

    try {
      if (courseId) {
        await updateDoc(
          doc(db, "courses", courseId),
          courseData
        );

        showStatus(
          courseFormMessage,
          "社課修改成功。",
          "success"
        );
      } else {
        await addDoc(
          collection(db, "courses"),
          {
            ...courseData,
            createdBy: currentAdmin.uid,
            createdAt: serverTimestamp()
          }
        );

        showStatus(
          courseFormMessage,
          "社課新增成功。",
          "success"
        );
      }

      resetCourseForm();

      await loadAdminCourses();
    } catch (error) {
      console.error("社課儲存失敗：", error);

      showStatus(
        courseFormMessage,
        `社課儲存失敗：${error.message}`,
        "error"
      );
    } finally {
      courseSubmitButton.disabled = false;
    }
  }
);

courseCancelButton?.addEventListener(
  "click",
  () => {
    resetCourseForm();
  }
);

function resetCourseForm() {
  courseForm.reset();

  courseIdInput.value = "";

  courseStatusInput.value =
    "published";

  courseSubmitButton.textContent =
    "新增社課";

  courseCancelButton.classList.add(
    "hidden"
  );
}

async function loadAdminCourses() {
  adminCourseList.innerHTML = `
    <p class="empty-state">
      正在載入社課……
    </p>
  `;

  try {
    const coursesQuery = query(
      collection(db, "courses"),
      orderBy("order", "asc")
    );

    const snapshot =
      await getDocs(coursesQuery);

    adminCourseList.innerHTML = "";

    if (snapshot.empty) {
      adminCourseList.innerHTML = `
        <p class="empty-state">
          目前還沒有社課資料。
        </p>
      `;

      return;
    }

    snapshot.forEach((courseSnapshot) => {
      adminCourseList.appendChild(
        createAdminCourseCard(
          courseSnapshot.id,
          courseSnapshot.data()
        )
      );
    });
  } catch (error) {
    console.error("載入社課失敗：", error);

    adminCourseList.innerHTML = `
      <p class="status-message error">
        社課載入失敗：${error.message}
      </p>
    `;
  }
}

function createAdminCourseCard(
  courseId,
  course
) {
  const article =
    document.createElement("article");

  article.className =
    "member-application";

  const information =
    document.createElement("div");

  const date =
    document.createElement("p");

  date.className = "course-date";
  date.textContent = course.date ?? "";

  const title =
    document.createElement("h3");

  title.textContent =
    course.title ?? "未命名社課";

  const description =
    document.createElement("p");

  description.textContent =
    course.description ?? "";

  const metadata =
    document.createElement("p");

  metadata.textContent =
    `顯示順序：${course.order ?? "-"}｜狀態：${
      course.status === "published"
        ? "公開"
        : "草稿"
    }`;

  const tagContainer =
    document.createElement("div");

  tagContainer.className =
    "course-tags";

  const tags =
    Array.isArray(course.tags)
      ? course.tags
      : [];

  tags.forEach((tag) => {
    const tagElement =
      document.createElement("span");

    tagElement.textContent = tag;

    tagContainer.appendChild(
      tagElement
    );
  });

  information.append(
    date,
    title,
    description,
    tagContainer,
    metadata
  );

  const actions =
    document.createElement("div");

  actions.className =
    "member-application-actions";

  const editButton =
    document.createElement("button");

  editButton.type = "button";

  editButton.className =
    "button button-small";

  editButton.textContent =
    "編輯";

  editButton.addEventListener(
    "click",
    () => {
      startEditingCourse(
        courseId,
        course
      );
    }
  );

  const deleteButton =
    document.createElement("button");

  deleteButton.type = "button";

  deleteButton.className =
    "button button-small delete-button";

  deleteButton.textContent =
    "刪除";

  deleteButton.addEventListener(
    "click",
    async () => {
      await removeCourse(
        courseId,
        course.title
      );
    }
  );

  actions.append(
    editButton,
    deleteButton
  );

  article.append(
    information,
    actions
  );

  return article;
}

function startEditingCourse(
  courseId,
  course
) {
  courseIdInput.value =
    courseId;

  courseOrderInput.value =
    course.order ?? "";

  courseDateInput.value =
    course.date ?? "";

  courseTitleInput.value =
    course.title ?? "";

  courseDescriptionInput.value =
    course.description ?? "";

  courseTagsInput.value =
    Array.isArray(course.tags)
      ? course.tags.join(", ")
      : "";

  courseStatusInput.value =
    course.status ?? "published";

  courseSubmitButton.textContent =
    "儲存修改";

  courseCancelButton.classList.remove(
    "hidden"
  );

  showStatus(
    courseFormMessage,
    `正在編輯：${course.title ?? "未命名社課"}`,
    "success"
  );

  courseForm.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function removeCourse(
  courseId,
  courseTitle
) {
  const confirmed =
    window.confirm(
      `確定要刪除「${courseTitle ?? "未命名社課"}」嗎？`
    );

  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(
      doc(db, "courses", courseId)
    );

    if (
      courseIdInput.value === courseId
    ) {
      resetCourseForm();
    }

    await loadAdminCourses();
  } catch (error) {
    console.error("刪除社課失敗：", error);

    window.alert(
      `刪除社課失敗：${error.message}`
    );
  }
}

/* =========================================================
   登出
   ========================================================= */

logoutButton?.addEventListener(
  "click",
  async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("登出失敗：", error);
    } finally {
      window.location.replace(
        "./login.html"
      );
    }
  }
);


/* =========================================================
   匯出社員 CSV
   ========================================================= */

exportMembersButton?.addEventListener(
  "click",
  async () => {
    if (!currentAdmin) {
      showStatus(
        exportMembersMessage,
        "尚未完成管理員身分驗證。",
        "error"
      );

      return;
    }

    exportMembersButton.disabled = true;

    showStatus(
      exportMembersMessage,
      "正在讀取並整理社員資料……"
    );

    try {
      const usersSnapshot =
        await getDocs(
          collection(db, "users")
        );

      const members =
        usersSnapshot.docs
          .map((userDocument) => ({
            uid: userDocument.id,
            ...userDocument.data()
          }))
          .filter((user) => {
            /*
             * 只匯出社員與管理員。
             * 若你的 role 使用其他名稱，
             * 請修改這裡。
             */
            return (
              user.role === "member" ||
              user.role === "admin"
            );
          })
          .sort((memberA, memberB) => {
            const nameA =
              String(memberA.name ?? "");

            const nameB =
              String(memberB.name ?? "");

            return nameA.localeCompare(
              nameB,
              "zh-Hant"
            );
          });

      if (members.length === 0) {
        showStatus(
          exportMembersMessage,
          "目前沒有可以匯出的社員資料。",
          "error"
        );

        return;
      }

      /*
       * CSV 第一列標題。
       * 可以依照你的 Firestore 欄位增減。
       */
      const csvRows = [
        [
          "姓名",
          "Email",
          "學號",
          "角色",
          "家系",
          "等級",
          "積分",
          "審核狀態",
          "UID"
        ]
      ];

      members.forEach((member) => {
        csvRows.push([
          member.name ?? "",
          member.email ?? "",
          member.studentId ?? "",
          member.role ?? "",
          member.family ?? "",
          member.level ?? "",
          member.points ?? 0,
          member.status ?? "",
          member.uid
        ]);
      });

      /*
       * 加入 UTF-8 BOM，
       * 避免 Excel 開啟中文時出現亂碼。
       */
      const csvContent =
        "\uFEFF" +
        csvRows
          .map((row) => {
            return row
              .map((value) =>
                escapeCsvValue(value)
              )
              .join(",");
          })
          .join("\r\n");

      const csvBlob =
        new Blob(
          [csvContent],
          {
            type:
              "text/csv;charset=utf-8;"
          }
        );

      const downloadUrl =
        URL.createObjectURL(csvBlob);

      const downloadLink =
        document.createElement("a");

      const today =
        new Date()
          .toISOString()
          .slice(0, 10);

      downloadLink.href =
        downloadUrl;

      downloadLink.download =
        `surf-club-members-${today}.csv`;

      document.body.appendChild(
        downloadLink
      );

      downloadLink.click();

      downloadLink.remove();

      URL.revokeObjectURL(
        downloadUrl
      );

      showStatus(
        exportMembersMessage,
        `成功匯出 ${members.length} 筆社員資料。`,
        "success"
      );
    } catch (error) {
      console.error(
        "社員資料匯出失敗：",
        error
      );

      showStatus(
        exportMembersMessage,
        `匯出失敗：${error.message}`,
        "error"
      );
    } finally {
      exportMembersButton.disabled = false;
    }
  }
);


/**
 * 將資料轉換為安全的 CSV 欄位。
 *
 * 1. 將雙引號轉成兩個雙引號。
 * 2. 防止 Excel 將社員資料誤判成公式。
 * 3. 每個欄位都使用雙引號包住。
 */
function escapeCsvValue(value) {
  let text =
    String(value ?? "");

  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  const escapedText =
    text.replaceAll('"', '""');

  return `"${escapedText}"`;
}

