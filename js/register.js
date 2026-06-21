
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  setPersistence
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  doc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

/* =========================================================
   DOM
   ========================================================= */

const registerForm =
  document.querySelector("#register-form");

const registerButton =
  document.querySelector("#register-button");

const message =
  document.querySelector("#message");

/* =========================================================
   顯示訊息
   ========================================================= */

function showMessage(text, type = "") {
  if (!message) {
    console.error(
      'register.html 中找不到 id="message"。'
    );

    return;
  }

  message.textContent = text;
  message.className = "status-message";

  if (type) {
    message.classList.add(type);
  }
}

/* =========================================================
   社員註冊
   ========================================================= */

registerForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const nameInput =
      document.querySelector("#name");

    const studentIdInput =
      document.querySelector("#student-id");

    const departmentInput =
      document.querySelector("#department");

    const phoneInput =
      document.querySelector("#phone");

    const emailInput =
      document.querySelector("#email");

    const passwordInput =
      document.querySelector("#password");

    const confirmPasswordInput =
      document.querySelector(
        "#confirm-password"
      );

    if (
      !nameInput ||
      !studentIdInput ||
      !departmentInput ||
      !phoneInput ||
      !emailInput ||
      !passwordInput ||
      !confirmPasswordInput
    ) {
      showMessage(
        "註冊頁面缺少必要欄位，請檢查 HTML 元素 ID。",
        "error"
      );

      return;
    }

    const name =
      nameInput.value.trim();

    const studentId =
      studentIdInput.value.trim();

    const department =
      departmentInput.value.trim();

    const phone =
      phoneInput.value.trim();

    const email =
      emailInput.value.trim();

    const password =
      passwordInput.value;

    const confirmPassword =
      confirmPasswordInput.value;

    /* =====================================================
       表單驗證
       ===================================================== */

    if (
      !name ||
      !studentId ||
      !department ||
      !phone ||
      !email ||
      !password ||
      !confirmPassword
    ) {
      showMessage(
        "請完整填寫所有欄位。",
        "error"
      );

      return;
    }

    if (password.length < 6) {
      showMessage(
        "密碼至少需要 6 個字元。",
        "error"
      );

      return;
    }

    if (
      password !== confirmPassword
    ) {
      showMessage(
        "兩次輸入的密碼不一致。",
        "error"
      );

      return;
    }

    registerButton.disabled = true;
    registerButton.textContent =
      "送出申請中……";

    let createdUser = null;
    let firestoreDocumentCreated = false;

    try {
      /*
       * 1. 設定登入狀態保存方式
       */
      await setPersistence(
        auth,
        browserLocalPersistence
      );

      /*
       * 2. 建立 Firebase Authentication 帳號
       */
      showMessage(
        "正在建立登入帳號……"
      );

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      createdUser =
        credential.user;

      /*
       * 3. 建立 Firestore 社員申請資料
       */
      showMessage(
        "正在建立社員申請資料……"
      );

      await setDoc(
        doc(
          db,
          "users",
          createdUser.uid
        ),
        {
          name,
          studentId,
          department,
          phone,
          email,

          role: "pending",
          status: "pending",

          level: "",
          family: "",

          /*
           * 社費狀態仍保留，
           * 由管理員在後台人工確認。
           */
          paymentStatus: "pending",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()
        }
      );

      firestoreDocumentCreated =
        true;

      showMessage(
        "社員申請已送出，正在前往審核等待頁面……",
        "success"
      );

      window.setTimeout(
        () => {
          window.location.replace(
            "./pending.html"
          );
        },
        600
      );
    } catch (error) {
      console.error(
        "社員申請失敗：",
        error
      );

      /*
       * Firestore 文件建立失敗時，
       * 清除剛建立的 Authentication 帳號。
       */
      if (
        createdUser &&
        !firestoreDocumentCreated
      ) {
        try {
          await deleteUser(
            createdUser
          );
        } catch (cleanupError) {
          console.warn(
            "無法清除未完成的登入帳號：",
            cleanupError
          );
        }
      }

      switch (error?.code) {
        case "auth/email-already-in-use":
          showMessage(
            "這個 Email 已經註冊。",
            "error"
          );
          break;

        case "auth/invalid-email":
          showMessage(
            "Email 格式不正確。",
            "error"
          );
          break;

        case "auth/weak-password":
          showMessage(
            "密碼強度不足，至少需要 6 個字元。",
            "error"
          );
          break;

        case "auth/network-request-failed":
          showMessage(
            "網路連線失敗，請稍後重新嘗試。",
            "error"
          );
          break;

        case "permission-denied":
        case "firestore/permission-denied":
          showMessage(
            "社員申請資料被 Firestore Rules 拒絕。",
            "error"
          );
          break;

        default:
          showMessage(
            `申請失敗：${
              error?.code ||
              "unknown"
            }｜${
              error?.message ||
              "未知錯誤"
            }`,
            "error"
          );
      }
    } finally {
      registerButton.disabled = false;
      registerButton.textContent =
        "送出社員申請";
    }
  }
);

