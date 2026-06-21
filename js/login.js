import {
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

const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const message = document.querySelector("#message");

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = `status-message ${type}`.trim();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  if (!email || !password) {
    showMessage("請輸入 Email 與密碼。", "error");
    return;
  }

  loginButton.disabled = true;
  showMessage("登入中……");

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const uid = credential.user.uid;
    const userSnapshot = await getDoc(doc(db, "users", uid));

    if (!userSnapshot.exists()) {
      throw new Error("Firestore 中找不到此使用者的角色資料。");
    }

    const userData = userSnapshot.data();

    if (userData.role === "admin") {
      window.location.replace("./admin.html");
      return;
    }

    if (userData.role === "member") {
  if (userData.status === "approved") {
    window.location.replace(
      "./member.html"
    );
  } else {
    window.location.replace(
      "./pending.html"
    );
  }

  return;
}

    throw new Error(`未知的使用者角色：${String(userData.role)}`);
  } catch (error) {
    console.error("登入失敗：", error);

    switch (error.code) {
      case "auth/invalid-credential":
        showMessage("Email 或密碼不正確。", "error");
        break;

      case "auth/invalid-email":
        showMessage("Email 格式不正確。", "error");
        break;

      case "auth/too-many-requests":
        showMessage("登入嘗試次數過多，請稍後再試。", "error");
        break;

      case "auth/operation-not-allowed":
        showMessage("Firebase 尚未啟用 Email／Password 登入。", "error");
        break;

      case "permission-denied":
      case "firestore/permission-denied":
        showMessage("登入成功，但 Firestore 拒絕讀取角色資料。", "error");
        break;

      default:
        showMessage(`登入失敗：${error.message}`, "error");
    }
  } finally {
    loginButton.disabled = false;
  }
});
