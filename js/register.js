import {
  createUserWithEmailAndPassword
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

const registerForm =
  document.querySelector("#register-form");

const registerButton =
  document.querySelector("#register-button");

const message =
  document.querySelector("#message");

function showMessage(text, type = "") {
  message.textContent = text;
  message.className =
    `status-message ${type}`.trim();
}

registerForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const name =
      document.querySelector("#name").value.trim();

    const studentId =
      document.querySelector("#student-id").value.trim();

    const email =
      document.querySelector("#email").value.trim();

    const password =
      document.querySelector("#password").value;

    const confirmPassword =
      document.querySelector("#confirm-password").value;

    if (
      !name ||
      !studentId ||
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

    if (password !== confirmPassword) {
      showMessage(
        "兩次輸入的密碼不一致。",
        "error"
      );

      return;
    }

    registerButton.disabled = true;

    showMessage("正在建立帳號……");

    try {
      /*
       * 1. 建立 Firebase Authentication 帳號
       */
      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      const user = credential.user;

      /*
       * 2. 建立 Firestore 使用者資料
       *
       * role 與 status 固定由程式指定，
       * 不接受使用者自行輸入。
       */
      await setDoc(
        doc(db, "users", user.uid),
        {
          name: name,
          studentId: studentId,
          email: email,
          role: "member",
          status: "pending",
          createdAt: serverTimestamp()
        }
      );

      showMessage(
        "註冊成功，正在前往審核等待頁面。",
        "success"
      );

      window.location.replace(
        "./pending.html"
      );

    } catch (error) {
      console.error(
        "註冊失敗：",
        error
      );

      switch (error.code) {
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
            "密碼強度不足。",
            "error"
          );
          break;

        case "permission-denied":
        case "firestore/permission-denied":
          showMessage(
            "帳號已建立，但無法建立社員申請資料，請聯絡管理員。",
            "error"
          );
          break;

        default:
          showMessage(
            `註冊失敗：${error.message}`,
            "error"
          );
      }

    } finally {
      registerButton.disabled = false;
    }
  }
);