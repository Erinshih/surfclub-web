
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

/* =========================================================
   公開頁面登入導覽
   ========================================================= */

const authNavigation =
  document.querySelector(
    "#auth-navigation"
  );

/*
 * 若目前頁面沒有 #auth-navigation，
 * 這支程式就不做任何處理。
 */
if (authNavigation) {
  onAuthStateChanged(
    auth,
    async (user) => {
      if (!user) {
        showLoginLink();
        return;
      }

      authNavigation.textContent =
        "正在讀取……";

      authNavigation.href =
        "#";

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
          showLoginLink();
          return;
        }

        const userData =
          userSnapshot.data();

        updateNavigationByRole(
          userData
        );
      } catch (error) {
        console.error(
          "導覽列登入狀態讀取失敗：",
          error
        );

        /*
         * 發生錯誤時不要清除 Firebase 登入狀態，
         * 只顯示一般登入連結。
         */
        showLoginLink();
      }
    }
  );
}

/* =========================================================
   未登入狀態
   ========================================================= */

function showLoginLink() {
  authNavigation.textContent =
    "社員登入";

  authNavigation.href =
    "./login.html";
}

/* =========================================================
   根據角色更新導覽列
   ========================================================= */

function updateNavigationByRole(
  userData
) {
  if (
    userData.role === "admin" &&
    userData.status !== "rejected"
  ) {
    authNavigation.textContent =
      "管理員後台";

    authNavigation.href =
      "./admin.html";

    return;
  }

  if (
    userData.role === "member" &&
    userData.status === "approved"
  ) {
    authNavigation.textContent =
      "社員首頁";

    authNavigation.href =
      "./member.html";

    return;
  }

  if (
    userData.role === "pending" ||
    userData.status === "pending"
  ) {
    authNavigation.textContent =
      "審核狀態";

    authNavigation.href =
      "./pending.html";

    return;
  }

  if (
    userData.status === "rejected"
  ) {
    authNavigation.textContent =
      "申請狀態";

    authNavigation.href =
      "./pending.html";

    return;
  }

  showLoginLink();
}

