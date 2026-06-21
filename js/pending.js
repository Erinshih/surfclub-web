import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

const statusElement =
  document.querySelector("#pending-status");

const memberLink =
  document.querySelector("#member-link");

const logoutButton =
  document.querySelector("#logout-button");

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
          doc(db, "users", user.uid)
        );

      if (!userSnapshot.exists()) {
        throw new Error(
          "找不到社員申請資料。"
        );
      }

      const userData =
        userSnapshot.data();

      if (userData.role === "admin") {
        window.location.replace(
          "./admin.html"
        );

        return;
      }

      switch (userData.status) {
        case "approved":
          statusElement.textContent =
            "你的社員申請已通過，可以進入社員中心。";

          memberLink.classList.remove(
            "hidden"
          );
          break;

        case "rejected":
          statusElement.textContent =
            "你的社員申請目前未通過，請聯絡社團管理員。";
          break;

        case "pending":
        default:
          statusElement.textContent =
            "你的社員申請正在等待管理員審核，通過後即可查看公告。";
      }

    } catch (error) {
      console.error(error);

      statusElement.textContent =
        `無法讀取申請狀態：${error.message}`;
    }
  }
);

logoutButton.addEventListener(
  "click",
  async () => {
    await signOut(auth);

    window.location.replace(
      "./login.html"
    );
  }
);