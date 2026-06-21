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

const memberStatus = document.querySelector("#member-status");
const announcementList = document.querySelector("#announcement-list");
const logoutButton = document.querySelector("#logout-button");

function showStatus(text, type = "") {
  memberStatus.textContent = text;
  memberStatus.className = `status-message ${type}`.trim();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("./login.html");
    return;
  }

  try {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));

    if (!userSnapshot.exists()) {
      throw new Error("Firestore 中找不到使用者資料。");
    }

    const userData = userSnapshot.data();

    // if (userData.role !== "member" && userData.role !== "admin") {
    //   throw new Error("你沒有社員頁面的存取權限。");
    // }
    
    if (userData.role === "admin") {
  showStatus(
    `歡迎，${userData.name ?? user.email}`,
    "success"
  );

  await loadAnnouncements();
  return;
}

if (
  userData.role !== "member" ||
  userData.status !== "approved"
) {
  window.location.replace(
    "./pending.html"
  );

  return;
}

showStatus(
  `歡迎，${userData.name ?? user.email}`,
  "success"
);

await loadAnnouncements();

    showStatus(
      `歡迎，${userData.name ?? user.email}`,
      "success"
    );

    await loadAnnouncements();
  } catch (error) {
    console.error("社員驗證失敗：", error);
    showStatus(`驗證失敗：${error.message}`, "error");
  }
});

async function loadAnnouncements() {
  announcementList.innerHTML = "<p>正在讀取公告……</p>";

  try {
    const announcementQuery = query(
      collection(db, "announcements"),
      orderBy("createdAt", "desc")
    );

    const querySnapshot = await getDocs(announcementQuery);
    announcementList.innerHTML = "";

    if (querySnapshot.empty) {
      announcementList.innerHTML =
        '<div class="empty-state">目前沒有公告。</div>';
      return;
    }

    querySnapshot.forEach((snapshot) => {
      const announcement = snapshot.data();

      const article = document.createElement("article");
      article.className = "card announcement-card";

      const title = document.createElement("h3");
      title.textContent = announcement.title ?? "未命名公告";

      const content = document.createElement("p");
      content.textContent = announcement.content ?? "";

      const time = document.createElement("small");
      time.className = "announcement-meta";
      time.textContent = formatTimestamp(announcement.createdAt);

      article.append(title, content, time);
      announcementList.appendChild(article);
    });
  } catch (error) {
    console.error("公告讀取失敗：", error);

    const errorMessage = document.createElement("p");
    errorMessage.className = "status-message error";
    errorMessage.textContent = `公告讀取失敗：${error.message}`;

    announcementList.innerHTML = "";
    announcementList.appendChild(errorMessage);
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

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } finally {
    window.location.replace("./login.html");
  }
});
