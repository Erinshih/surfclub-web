
/* =========================================================
   檔案：js/admin-courses.js
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
  serverTimestamp,
  updateDoc,
  writeBatch
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

const courseForm =
  document.querySelector("#course-form");

const courseId =
  document.querySelector("#course-id");

const courseOrder =
  document.querySelector("#course-order");

const courseDate =
  document.querySelector("#course-date");

const courseTitle =
  document.querySelector("#course-title");

const courseDescription =
  document.querySelector("#course-description");

const courseTags =
  document.querySelector("#course-tags");

const courseStatus =
  document.querySelector("#course-status");

const courseSubmit =
  document.querySelector("#course-submit");

const courseCancel =
  document.querySelector("#course-cancel");

const courseMessage =
  document.querySelector("#course-message");

const courseList =
  document.querySelector("#course-list");

const importData =
  document.querySelector("#course-import-data");

const fillExample =
  document.querySelector("#fill-course-example");

const importCourses =
  document.querySelector("#import-courses");

const importMessage =
  document.querySelector("#course-import-message");

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
      const snapshot =
        await getDoc(
          doc(db, "users", user.uid)
        );

      if (!snapshot.exists()) {
        throw new Error(
          "Firestore 中找不到使用者資料。"
        );
      }

      const userData =
        snapshot.data();

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

      await loadCourses();
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
   新增或修改社課
   ========================================================= */

courseForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!currentAdmin) {
      showStatus(
        courseMessage,
        "尚未完成管理員驗證。",
        "error"
      );

      return;
    }

    const order =
      Number(courseOrder.value);

    const date =
      courseDate.value.trim();

    const title =
      courseTitle.value.trim();

    const description =
      courseDescription.value.trim();

    const tags =
      parseTags(courseTags.value);

    const status =
      courseStatus.value;

    if (
      !Number.isInteger(order) ||
      order < 1
    ) {
      showStatus(
        courseMessage,
        "顯示順序必須是大於 0 的整數。",
        "error"
      );

      return;
    }

    if (!date || !title || !description) {
      showStatus(
        courseMessage,
        "日期、名稱與說明不可空白。",
        "error"
      );

      return;
    }

    courseSubmit.disabled = true;

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
      if (courseId.value) {
        await updateDoc(
          doc(
            db,
            "courses",
            courseId.value
          ),
          courseData
        );

        showStatus(
          courseMessage,
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
          courseMessage,
          "社課新增成功。",
          "success"
        );
      }

      resetForm();
      await loadCourses();
    } catch (error) {
      console.error(
        "社課儲存失敗：",
        error
      );

      showStatus(
        courseMessage,
        `社課儲存失敗：${error.message}`,
        "error"
      );
    } finally {
      courseSubmit.disabled = false;
    }
  }
);

courseCancel?.addEventListener(
  "click",
  resetForm
);

/* =========================================================
   批次匯入
   ========================================================= */

fillExample?.addEventListener(
  "click",
  () => {
    importData.value =
      JSON.stringify(
        COURSE_EXAMPLE,
        null,
        2
      );

    showStatus(
      importMessage,
      "已載入範例資料。",
      "success"
    );
  }
);

importCourses?.addEventListener(
  "click",
  async () => {
    if (!currentAdmin) {
      return;
    }

    let parsed;

    try {
      parsed =
        JSON.parse(
          importData.value.trim()
        );
    } catch (error) {
      showStatus(
        importMessage,
        `JSON 格式錯誤：${error.message}`,
        "error"
      );

      return;
    }

    if (
      !Array.isArray(parsed) ||
      parsed.length === 0
    ) {
      showStatus(
        importMessage,
        "資料必須是非空白的 JSON 陣列。",
        "error"
      );

      return;
    }

    if (parsed.length > 400) {
      showStatus(
        importMessage,
        "單次最多匯入 400 筆。",
        "error"
      );

      return;
    }

    const validated = [];

    for (
      let index = 0;
      index < parsed.length;
      index += 1
    ) {
      const item =
        validateImportedCourse(
          parsed[index],
          index
        );

      if (!item) {
        return;
      }

      validated.push(item);
    }

    const confirmed =
      window.confirm(
        `確定要匯入 ${validated.length} 筆社課嗎？`
      );

    if (!confirmed) {
      return;
    }

    importCourses.disabled = true;

    try {
      const batch =
        writeBatch(db);

      validated.forEach(
        (course) => {
          const reference =
            doc(
              collection(db, "courses")
            );

          batch.set(
            reference,
            {
              ...course,
              createdBy: currentAdmin.uid,
              createdAt: serverTimestamp(),
              updatedBy: currentAdmin.uid,
              updatedAt: serverTimestamp()
            }
          );
        }
      );

      await batch.commit();

      importData.value = "";

      showStatus(
        importMessage,
        `成功匯入 ${validated.length} 筆社課。`,
        "success"
      );

      await loadCourses();
    } catch (error) {
      console.error(
        "批次匯入失敗：",
        error
      );

      showStatus(
        importMessage,
        `批次匯入失敗：${error.message}`,
        "error"
      );
    } finally {
      importCourses.disabled = false;
    }
  }
);

/* =========================================================
   讀取社課
   ========================================================= */

async function loadCourses() {
  courseList.innerHTML = `
    <p class="empty-state">
      正在載入社課……
    </p>
  `;

  try {
    const snapshot =
      await getDocs(
        query(
          collection(db, "courses"),
          orderBy("order", "asc")
        )
      );

    courseList.innerHTML = "";

    if (snapshot.empty) {
      courseList.innerHTML = `
        <p class="empty-state">
          目前沒有社課資料。
        </p>
      `;

      return;
    }

    snapshot.forEach(
      (documentSnapshot) => {
        courseList.appendChild(
          createCourseCard(
            documentSnapshot.id,
            documentSnapshot.data()
          )
        );
      }
    );
  } catch (error) {
    console.error(
      "社課載入失敗：",
      error
    );

    courseList.innerHTML = `
      <p class="status-message error">
        社課載入失敗。
      </p>
    `;
  }
}

/* =========================================================
   社課卡片
   ========================================================= */

function createCourseCard(
  id,
  course
) {
  const article =
    document.createElement("article");

  const information =
    document.createElement("div");

  const date =
    document.createElement("p");

  const title =
    document.createElement("h3");

  const description =
    document.createElement("p");

  const metadata =
    document.createElement("small");

  const tags =
    document.createElement("div");

  const actions =
    document.createElement("div");

  const editButton =
    document.createElement("button");

  const deleteButton =
    document.createElement("button");

  article.className =
    "management-card";

  date.className =
    "course-date";

  tags.className =
    "course-tags";

  actions.className =
    "management-actions";

  date.textContent =
    course.date || "";

  title.textContent =
    course.title ||
    "未命名社課";

  description.textContent =
    course.description || "";

  metadata.textContent =
    `順序：${course.order ?? "-"}｜狀態：${
      course.status === "published"
        ? "公開"
        : "草稿"
    }`;

  (
    Array.isArray(course.tags)
      ? course.tags
      : []
  ).forEach(
    (tag) => {
      const tagElement =
        document.createElement("span");

      tagElement.textContent =
        tag;

      tags.appendChild(
        tagElement
      );
    }
  );

  editButton.type =
    "button";

  editButton.className =
    "button button-small";

  editButton.textContent =
    "編輯";

  editButton.addEventListener(
    "click",
    () => {
      courseId.value = id;
      courseOrder.value =
        course.order ?? "";
      courseDate.value =
        course.date ?? "";
      courseTitle.value =
        course.title ?? "";
      courseDescription.value =
        course.description ?? "";
      courseTags.value =
        Array.isArray(course.tags)
          ? course.tags.join(", ")
          : "";
      courseStatus.value =
        course.status || "published";

      courseSubmit.textContent =
        "儲存修改";

      courseCancel.classList.remove(
        "hidden"
      );

      courseForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  );

  deleteButton.type =
    "button";

  deleteButton.className =
    "button button-small delete-button";

  deleteButton.textContent =
    "刪除";

  deleteButton.addEventListener(
    "click",
    async () => {
      if (
        !window.confirm(
          `確定要刪除「${
            course.title ||
            "未命名社課"
          }」嗎？`
        )
      ) {
        return;
      }

      try {
        await deleteDoc(
          doc(db, "courses", id)
        );

        await loadCourses();
      } catch (error) {
        window.alert(
          `刪除失敗：${error.message}`
        );
      }
    }
  );

  information.append(
    date,
    title,
    description,
    tags,
    metadata
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

/* =========================================================
   登出與工具
   ========================================================= */

logoutButton?.addEventListener(
  "click",
  async () => {
    try {
      await signOut(auth);
    } finally {
      window.location.replace(
        "./login.html"
      );
    }
  }
);

function resetForm() {
  courseForm.reset();
  courseId.value = "";
  courseStatus.value =
    "published";
  courseSubmit.textContent =
    "新增社課";
  courseCancel.classList.add(
    "hidden"
  );
}

function parseTags(value) {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function validateImportedCourse(
  course,
  index
) {
  const order =
    Number(course.order);

  const date =
    String(
      course.date ?? ""
    ).trim();

  const title =
    String(
      course.title ?? ""
    ).trim();

  const description =
    String(
      course.description ?? ""
    ).trim();

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
      importMessage,
      `第 ${index + 1} 筆 order 不正確。`,
      "error"
    );

    return null;
  }

  if (
    !date ||
    !title ||
    !description
  ) {
    showStatus(
      importMessage,
      `第 ${index + 1} 筆缺少必要資料。`,
      "error"
    );

    return null;
  }

  return {
    order,
    date,
    title,
    description,
    tags,
    status
  };
}

function showStatus(
  element,
  message,
  type = ""
) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className =
    "status-message";

  if (type) {
    element.classList.add(type);
  }
}

const COURSE_EXAMPLE = [
  {
    order: 1,
    date: "9 月 19 日（六）",
    title: "衝浪影片檢討",
    description:
      "透過衝浪影片回顧社員的動作表現。",
    tags: [
      "影片分析",
      "動作檢討"
    ],
    status: "published"
  }
];

