
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
  writeBatch
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

const courseImportData =
  document.querySelector("#course-import-data");

const importCoursesButton =
  document.querySelector("#import-courses-button");

const fillCourseExampleButton =
  document.querySelector("#fill-course-example-button");

const courseImportMessage =
  document.querySelector("#course-import-message");

const memberManagementList =
  document.querySelector(
    "#member-management-list"
  );

const memberManagementMessage =
  document.querySelector(
    "#member-management-message"
  );
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

    // await Promise.all([
    //   loadAnnouncements(),
    //   loadAdminCourses()
    // ]);
    await Promise.all([
      loadAnnouncements(),
      loadAdminCourses(),
      loadMemberManagement()
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


/* =========================================================
   批次匯入社課
   ========================================================= */

const courseImportExample = [
  {
    order: 1,
    date: "9 月 19 日（六）",
    title: "衝浪影片檢討",
    description:
      "透過衝浪影片回顧社員的動作表現，討論划水、起乘、站姿與浪況判斷等問題。",
    tags: [
      "影片分析",
      "動作檢討",
      "室內社課"
    ],
    status: "published"
  },
  {
    order: 2,
    date: "9 月 29 日（二）",
    title: "期初社大",
    description:
      "說明本學期的社團規劃、活動安排、社員制度與重要注意事項。",
    tags: [
      "社員大會",
      "學期規劃",
      "重要活動"
    ],
    status: "published"
  },
  {
    order: 3,
    date: "10 月 7 日（三）",
    title: "秋波知識社課 🍕",
    description:
      "認識秋季浪況、潮汐、風向與海洋安全，建立下水前需要具備的基礎判斷能力。",
    tags: [
      "海洋知識",
      "浪況判讀",
      "安全觀念"
    ],
    status: "published"
  },
  {
    order: 4,
    date: "10 月 17 日（六）",
    title: "Lv.2 大團練",
    description:
      "針對 Lv.2 社員進行團體練習，加強划水、起乘、站姿與基礎控板能力。",
    tags: [
      "Lv.2",
      "團體練習",
      "實作課程"
    ],
    status: "published"
  },
  {
    order: 5,
    date: "10 月 20 日（二）",
    title: "衝浪滑板",
    description:
      "利用衝浪滑板練習轉向、重心移動與身體協調，建立接近實際衝浪的動作感受。",
    tags: [
      "衝浪滑板",
      "平衡訓練",
      "重心控制"
    ],
    status: "published"
  },
  {
    order: 6,
    date: "10 月 24 日（六）",
    title: "衝浪影片檢討",
    description:
      "分析近期衝浪練習影片，找出動作問題並討論後續改善方向。",
    tags: [
      "影片分析",
      "動作修正",
      "經驗交流"
    ],
    status: "published"
  },
  {
    order: 7,
    date: "10 月 25 日（日）",
    title: "Lv.3 學理課（可旁聽）",
    description:
      "介紹進階浪況判讀、選浪方式、衝浪規則與安全觀念，並開放社員旁聽。",
    tags: [
      "Lv.3",
      "學理課",
      "開放旁聽"
    ],
    status: "published"
  },
  {
    order: 8,
    date: "10 月 27 日（二）",
    title: "合作社課（待定）",
    description:
      "預計與其他社團或合作單位共同舉辦社課，實際內容、時間與地點將另行公告。",
    tags: [
      "合作社課",
      "內容待定",
      "另行公告"
    ],
    status: "published"
  },
  {
    order: 9,
    date: "10 月底",
    title: "第一次等級結算",
    description:
      "統整社員於 10 月底前的課程參與、練習紀錄與等級進度。",
    tags: [
      "等級制度",
      "進度結算",
      "社員紀錄"
    ],
    status: "published"
  },
  {
    order: 10,
    date: "11 月 10 日（二）",
    title: "衝浪滑板",
    description:
      "持續練習轉向、壓板、重心移動與身體協調，加強動作的連續性。",
    tags: [
      "衝浪滑板",
      "轉向練習",
      "動作銜接"
    ],
    status: "published"
  },
  {
    order: 11,
    date: "11 月 17 日（二）",
    title: "秋波知識社課 🍕",
    description:
      "延伸秋季浪況與海洋環境知識，加強社員對下水條件與安全風險的判斷。",
    tags: [
      "海洋知識",
      "浪況判讀",
      "安全觀念"
    ],
    status: "published"
  },
  {
    order: 12,
    date: "11 月 21 日（六）",
    title: "衝浪影片檢討",
    description:
      "檢視社員近期的衝浪影片，從動作、選浪與路線等面向進行討論。",
    tags: [
      "影片分析",
      "選浪討論",
      "動作改善"
    ],
    status: "published"
  },
  {
    order: 13,
    date: "11 月 28 日（六）",
    title: "Lv.4 學理課（可旁聽）",
    description:
      "介紹進階浪況分析、路線選擇、衝浪禮儀與實作策略，並開放社員旁聽。",
    tags: [
      "Lv.4",
      "進階學理",
      "開放旁聽"
    ],
    status: "published"
  },
  {
    order: 14,
    date: "11 月底",
    title: "第二次等級結算",
    description:
      "統整 11 月底前的社員參與紀錄、練習成果與等級升級進度。",
    tags: [
      "等級制度",
      "進度結算",
      "升級紀錄"
    ],
    status: "published"
  },
  {
    order: 15,
    date: "12 月 1 日（二）",
    title: "衝浪滑板",
    description:
      "持續練習重心控制、動作連接與模擬轉向技巧。",
    tags: [
      "衝浪滑板",
      "重心控制",
      "轉向技巧"
    ],
    status: "published"
  },
  {
    order: 16,
    date: "12 月 8 日（二）",
    title: "合作社課",
    description:
      "與合作單位共同進行社課交流，實際主題、時間與地點以後續公告為準。",
    tags: [
      "合作社課",
      "交流活動",
      "另行公告"
    ],
    status: "published"
  },
  {
    order: 17,
    date: "12 月 12 日（六）",
    title: "衝浪影片檢討",
    description:
      "回顧學期後段的衝浪練習影片，檢討社員進步情況並提出後續建議。",
    tags: [
      "影片分析",
      "成果檢討",
      "練習建議"
    ],
    status: "published"
  },
  {
    order: 18,
    date: "12 月 15 日（二）",
    title: "衝浪滑板",
    description:
      "本學期最後一次衝浪滑板練習，統整平衡、轉向與連續動作技巧。",
    tags: [
      "衝浪滑板",
      "綜合練習",
      "學期成果"
    ],
    status: "published"
  },
  {
    order: 19,
    date: "1 月 9 日",
    title: "期末社大",
    description:
      "回顧本學期社課與活動成果，公布重要事項並進行社員交流與學期總結。",
    tags: [
      "社員大會",
      "學期總結",
      "成果回顧"
    ],
    status: "published"
  }
];


fillCourseExampleButton?.addEventListener(
  "click",
  () => {
    courseImportData.value =
      JSON.stringify(
        courseImportExample,
        null,
        2
      );

    showStatus(
      courseImportMessage,
      `已載入 ${courseImportExample.length} 筆範例社課資料。`,
      "success"
    );
  }
);


importCoursesButton?.addEventListener(
  "click",
  async () => {
    if (!currentAdmin) {
      showStatus(
        courseImportMessage,
        "尚未完成管理員身分驗證。",
        "error"
      );

      return;
    }

    const rawData =
      courseImportData.value.trim();

    if (!rawData) {
      showStatus(
        courseImportMessage,
        "請先貼上社課 JSON 資料。",
        "error"
      );

      return;
    }

    let courses;

    try {
      courses = JSON.parse(rawData);
    } catch (error) {
      showStatus(
        courseImportMessage,
        `JSON 格式錯誤：${error.message}`,
        "error"
      );

      return;
    }

    if (!Array.isArray(courses)) {
      showStatus(
        courseImportMessage,
        "最外層資料必須是 JSON 陣列。",
        "error"
      );

      return;
    }

    if (courses.length === 0) {
      showStatus(
        courseImportMessage,
        "沒有可以匯入的社課資料。",
        "error"
      );

      return;
    }

    /*
     * 這裡先限制單次最多 400 筆，
     * 避免批次太大造成失敗。
     */
    if (courses.length > 400) {
      showStatus(
        courseImportMessage,
        "單次最多匯入 400 筆社課。",
        "error"
      );

      return;
    }

    const validatedCourses = [];

    for (
      let index = 0;
      index < courses.length;
      index += 1
    ) {
      const course = courses[index];

      const order =
        Number(course.order);

      const date =
        String(course.date ?? "").trim();

      const title =
        String(course.title ?? "").trim();

      const description =
        String(course.description ?? "").trim();

      const tags =
        Array.isArray(course.tags)
          ? course.tags
              .map((tag) =>
                String(tag).trim()
              )
              .filter(Boolean)
              .slice(0, 10)
          : [];

      const status =
        course.status === "draft"
          ? "draft"
          : "published";

      if (
        !Number.isInteger(order) ||
        order < 1
      ) {
        showStatus(
          courseImportMessage,
          `第 ${index + 1} 筆資料的 order 必須是大於 0 的整數。`,
          "error"
        );

        return;
      }

      if (!date) {
        showStatus(
          courseImportMessage,
          `第 ${index + 1} 筆資料缺少日期。`,
          "error"
        );

        return;
      }

      if (!title) {
        showStatus(
          courseImportMessage,
          `第 ${index + 1} 筆資料缺少社課名稱。`,
          "error"
        );

        return;
      }

      if (!description) {
        showStatus(
          courseImportMessage,
          `第 ${index + 1} 筆資料缺少社課說明。`,
          "error"
        );

        return;
      }

      validatedCourses.push({
        order,
        date,
        title,
        description,
        tags,
        status
      });
    }

    const confirmed =
      window.confirm(
        `確定要一次新增 ${validatedCourses.length} 筆社課嗎？`
      );

    if (!confirmed) {
      return;
    }

    importCoursesButton.disabled = true;
    fillCourseExampleButton.disabled = true;

    showStatus(
      courseImportMessage,
      `正在匯入 ${validatedCourses.length} 筆社課……`
    );

    try {
      const batch =
        writeBatch(db);

      validatedCourses.forEach(
        (course) => {
          /*
           * 使用 doc(collection(...))
           * 自動產生新的 document ID。
           */
          const courseReference =
            doc(collection(db, "courses"));

          batch.set(
            courseReference,
            {
              ...course,
              createdBy:
                currentAdmin.uid,
              createdAt:
                serverTimestamp(),
              updatedBy:
                currentAdmin.uid,
              updatedAt:
                serverTimestamp()
            }
          );
        }
      );

      await batch.commit();

      showStatus(
        courseImportMessage,
        `成功匯入 ${validatedCourses.length} 筆社課。`,
        "success"
      );

      courseImportData.value = "";

      await loadAdminCourses();
    } catch (error) {
      console.error(
        "批次匯入社課失敗：",
        error
      );

      showStatus(
        courseImportMessage,
        `匯入失敗：${error.message}`,
        "error"
      );
    } finally {
      importCoursesButton.disabled = false;
      fillCourseExampleButton.disabled = false;
    }
  }
);

/* =========================================================
   社員 Level 與家系管理
   ========================================================= */

async function loadMemberManagement() {
  if (!memberManagementList) {
    return;
  }

  memberManagementList.innerHTML = `
    <p class="empty-state">
      正在載入社員資料……
    </p>
  `;

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
          return (
            user.role === "member" ||
            user.role === "admin"
          );
        })
        .sort((memberA, memberB) => {
          return String(
            memberA.name || ""
          ).localeCompare(
            String(memberB.name || ""),
            "zh-Hant"
          );
        });

    renderMemberManagement(members);
  } catch (error) {
    console.error(
      "社員資料載入失敗：",
      error
    );

    memberManagementList.innerHTML = `
      <p class="status-message error">
        社員資料載入失敗：${error.message}
      </p>
    `;
  }
}

function renderMemberManagement(members) {
  memberManagementList.innerHTML = "";

  if (members.length === 0) {
    memberManagementList.innerHTML = `
      <p class="empty-state">
        目前沒有社員資料。
      </p>
    `;

    return;
  }

  members.forEach((member) => {
    memberManagementList.appendChild(
      createMemberManagementCard(member)
    );
  });
}

function createMemberManagementCard(member) {
  const article =
    document.createElement("article");

  article.className =
    "member-management-card";

  const information =
    document.createElement("div");

  information.className =
    "member-management-information";

  const title =
    document.createElement("h3");

  title.textContent =
    member.name || "未命名社員";

  const email =
    document.createElement("p");

  email.textContent =
    member.email || "";

  information.append(
    title,
    email
  );

  /* Level */

  const levelGroup =
    document.createElement("div");

  levelGroup.className =
    "member-management-field";

  const levelLabel =
    document.createElement("label");

  levelLabel.textContent = "Level";

  const levelSelect =
    document.createElement("select");

  const levels = [
    "",
    "Lv.1",
    "Lv.2",
    "Lv.3",
    "Lv.4",
    "Lv.5"
  ];

  levels.forEach((level) => {
    const option =
      document.createElement("option");

    option.value = level;

    option.textContent =
      level || "尚未設定";

    if (member.level === level) {
      option.selected = true;
    }

    levelSelect.appendChild(option);
  });

  levelGroup.append(
    levelLabel,
    levelSelect
  );

  /* 家系 */

  const familyGroup =
    document.createElement("div");

  familyGroup.className =
    "member-management-field";

  const familyLabel =
    document.createElement("label");

  familyLabel.textContent = "家系";

  const familyInput =
    document.createElement("input");

  familyInput.type = "text";

  familyInput.value =
    member.family || "";

  familyInput.placeholder =
    "例如：海浪家";

  familyInput.maxLength = 50;

  familyGroup.append(
    familyLabel,
    familyInput
  );

  /* 儲存按鈕 */

  const saveButton =
    document.createElement("button");

  saveButton.type = "button";

  saveButton.className =
    "button button-small";

  saveButton.textContent =
    "儲存修改";

  saveButton.addEventListener(
    "click",
    async () => {
      saveButton.disabled = true;

      showStatus(
        memberManagementMessage,
        `正在更新 ${member.name || "社員"} 的資料……`
      );

      try {
        await updateDoc(
          doc(db, "users", member.uid),
          {
            level:
              levelSelect.value,

            family:
              familyInput.value.trim(),

            updatedAt:
              serverTimestamp()
          }
        );

        showStatus(
          memberManagementMessage,
          `${member.name || "社員"} 的 Level 與家系已更新。`,
          "success"
        );
      } catch (error) {
        console.error(
          "更新社員資料失敗：",
          error
        );

        showStatus(
          memberManagementMessage,
          `更新失敗：${error.message}`,
          "error"
        );
      } finally {
        saveButton.disabled = false;
      }
    }
  );

  article.append(
    information,
    levelGroup,
    familyGroup,
    saveButton
  );

  return article;
}
