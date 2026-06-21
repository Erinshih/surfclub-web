
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  db
} from "./firebase-config.js";

const publicCourseList =
  document.querySelector("#public-course-list");

async function loadPublicCourses() {
  if (!publicCourseList) {
    console.error(
      "找不到 #public-course-list，請檢查 courses.html。"
    );

    return;
  }

  publicCourseList.innerHTML = `
    <p class="empty-state">
      正在載入社課資訊……
    </p>
  `;

  try {
    /*
     * 查詢中直接限定 published，
     * 才能符合 Firestore Security Rules。
     */
    const coursesQuery = query(
      collection(db, "courses"),
      where("status", "==", "published")
    );

    const snapshot =
      await getDocs(coursesQuery);

    const courses =
      snapshot.docs
        .map((courseDocument) => ({
          id: courseDocument.id,
          ...courseDocument.data()
        }))
        .sort((courseA, courseB) => {
          const orderA =
            Number(courseA.order) || 0;

          const orderB =
            Number(courseB.order) || 0;

          return orderA - orderB;
        });

    renderPublicCourses(courses);
  } catch (error) {
    console.error(
      "載入公開社課失敗：",
      error
    );

    publicCourseList.innerHTML = `
      <p class="status-message error">
        社課資料載入失敗。
        請開啟瀏覽器 Console 查看錯誤訊息。
      </p>
    `;
  }
}

function renderPublicCourses(courses) {
  publicCourseList.innerHTML = "";

  if (courses.length === 0) {
    publicCourseList.innerHTML = `
      <p class="empty-state">
        目前尚未公布社課資訊。
      </p>
    `;

    return;
  }

  courses.forEach((course, index) => {
    publicCourseList.appendChild(
      createPublicCourseCard(course, index)
    );
  });
}

function createPublicCourseCard(
  course,
  index
) {
  const article =
    document.createElement("article");

  article.className = "course-card";

  const number =
    document.createElement("div");

  number.className = "course-number";

  number.textContent =
    String(index + 1).padStart(2, "0");

  const content =
    document.createElement("div");

  content.className = "course-content";

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

  const tagsContainer =
    document.createElement("div");

  tagsContainer.className = "course-tags";

  const tags =
    Array.isArray(course.tags)
      ? course.tags
      : [];

  tags.forEach((tag) => {
    const tagElement =
      document.createElement("span");

    tagElement.textContent = tag;

    tagsContainer.appendChild(
      tagElement
    );
  });

  content.append(
    date,
    title,
    description,
    tagsContainer
  );

  article.append(
    number,
    content
  );

  return article;
}

loadPublicCourses();

