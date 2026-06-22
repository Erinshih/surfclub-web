
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

const entryStatus =
  document.querySelector(
    "#entry-status"
  );

onAuthStateChanged(
  auth,
  async (user) => {
    /*
     * 尚未登入時留在入口頁，
     * 顯示登入與註冊按鈕。
     */
    if (!user) {
      setEntryStatus(
        "請登入社員帳號，或申請加入社團。"
      );

      return;
    }

    setEntryStatus(
      "正在讀取社員資料……"
    );

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
        setEntryStatus(
          "找不到社員資料，請聯絡管理員。",
          true
        );

        return;
      }

      const userData =
        userSnapshot.data();

      /*
       * 管理員。
       */
      if (
        userData.role === "admin"
      ) {
        window.location.replace(
          "./admin.html"
        );

        return;
      }

      /*
       * 正式社員。
       */
      if (
        userData.role === "member" &&
        userData.status === "approved"
      ) {
        window.location.replace(
          "./member.html"
        );

        return;
      }

      /*
       * 待審核或被拒絕。
       */
      if (
        userData.role === "pending" ||
        userData.status === "pending" ||
        userData.status === "rejected"
      ) {
        window.location.replace(
          "./pending.html"
        );

        return;
      }

      setEntryStatus(
        "帳號狀態異常，請聯絡管理員。",
        true
      );
    } catch (error) {
      console.error(
        "入口頁身分判斷失敗：",
        error
      );

      setEntryStatus(
        `系統資料讀取失敗：${
          error?.message ||
          "未知錯誤"
        }`,
        true
      );
    }
  }
);

function setEntryStatus(
  message,
  isError = false
) {
  if (!entryStatus) {
    return;
  }

  entryStatus.textContent =
    message;

  entryStatus.className =
    isError
      ? "status-message error"
      : "status-message";
}
