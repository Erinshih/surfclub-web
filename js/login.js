
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword
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
   DOM 元素
   ========================================================= */

const loginForm =
  document.querySelector("#login-form");

const emailInput =
  document.querySelector("#email");

const passwordInput =
  document.querySelector("#password");

const loginButton =
  document.querySelector("#login-button");

const loginMessage =
  document.querySelector("#login-message");

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

/* =========================================================
   已登入使用者自動導向
   ========================================================= */

onAuthStateChanged(
  auth,
  async (user) => {
    if (!user) {
      return;
    }

    try {
      const userSnapshot =
        await getDoc(
          doc(db, "users", user.uid)
        );

      if (!userSnapshot.exists()) {
        showStatus(
          loginMessage,
          "找不到使用者資料，請聯絡管理員。",
          "error"
        );

        return;
      }

      const userData =
        userSnapshot.data();

      redirectByRole(userData);
    } catch (error) {
      console.error(
        "讀取登入資料失敗：",
        error
      );

      showStatus(
        loginMessage,
        `讀取帳號資料失敗：${error.message}`,
        "error"
      );
    }
  }
);

/* =========================================================
   登入
   ========================================================= */

loginForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const email =
      emailInput.value.trim();

    const password =
      passwordInput.value;

    if (!email || !password) {
      showStatus(
        loginMessage,
        "請輸入 Email 與密碼。",
        "error"
      );

      return;
    }

    loginButton.disabled = true;
    loginButton.textContent =
      "登入中……";

    showStatus(
      loginMessage,
      "正在登入……"
    );

    try {
      /*
       * 將登入狀態保存在瀏覽器本機。
       * 換到其他 HTML 頁面時不需要重新登入。
       * 關閉瀏覽器後再次開啟，也會維持登入。
       */
      await setPersistence(
        auth,
        browserLocalPersistence
      );

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      const userSnapshot =
        await getDoc(
          doc(
            db,
            "users",
            credential.user.uid
          )
        );

      if (!userSnapshot.exists()) {
        throw new Error(
          "Firestore 中找不到使用者資料。"
        );
      }

      const userData =
        userSnapshot.data();

      showStatus(
        loginMessage,
        "登入成功，正在前往頁面……",
        "success"
      );

      redirectByRole(userData);
    } catch (error) {
      console.error(
        "登入失敗：",
        error
      );

      showStatus(
        loginMessage,
        getLoginErrorMessage(error),
        "error"
      );
    } finally {
      loginButton.disabled = false;
      loginButton.textContent =
        "登入";
    }
  }
);

/* =========================================================
   依照角色導向
   ========================================================= */

function redirectByRole(userData) {
  if (
    userData.role === "admin" &&
    userData.status !== "rejected"
  ) {
    window.location.replace(
      "./admin.html"
    );

    return;
  }

  if (
    userData.role === "member" &&
    userData.status === "approved"
  ) {
    window.location.replace(
      "./member.html"
    );

    return;
  }

  if (
    userData.role === "pending" ||
    userData.status === "pending"
  ) {
    window.location.replace(
      "./pending.html"
    );

    return;
  }

  if (userData.status === "rejected") {
    showStatus(
      loginMessage,
      "社員申請未通過，請聯絡管理員。",
      "error"
    );

    return;
  }

  showStatus(
    loginMessage,
    "帳號角色或審核狀態不正確，請聯絡管理員。",
    "error"
  );
}

/* =========================================================
   登入錯誤訊息
   ========================================================= */

function getLoginErrorMessage(error) {
  switch (error.code) {
    case "auth/invalid-email":
      return "Email 格式不正確。";

    case "auth/missing-password":
      return "請輸入密碼。";

    case "auth/invalid-credential":
      return "Email 或密碼不正確。";

    case "auth/user-disabled":
      return "這個帳號已被停用。";

    case "auth/too-many-requests":
      return "登入嘗試次數過多，請稍後再試。";

    case "auth/network-request-failed":
      return "網路連線失敗，請檢查網路後再試。";

    default:
      return `登入失敗：${error.message}`;
  }
}

