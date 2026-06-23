
/* =========================================================
   檔案：js/leaderboard.js
   功能：
   1. 驗證登入狀態
   2. 驗證社員或管理員權限
   3. 載入正式社員積分
   4. 顯示個人積分榜
   5. 計算並顯示家系積分榜
   6. 處理積分榜切換與登出

   Firebase 版本：12.7.0
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

console.log(
  "leaderboard.js 已成功載入"
);

/* =========================================================
   DOM
   ========================================================= */

const personalTabButton =
  document.querySelector(
    "#personalTabButton"
  );

const familyTabButton =
  document.querySelector(
    "#familyTabButton"
  );

const personalLeaderboard =
  document.querySelector(
    "#personalLeaderboard"
  );

const familyLeaderboard =
  document.querySelector(
    "#familyLeaderboard"
  );

const personalRankingList =
  document.querySelector(
    "#personalRankingList"
  );

const familyRankingList =
  document.querySelector(
    "#familyRankingList"
  );

const leaderboardLoading =
  document.querySelector(
    "#leaderboardLoading"
  );

const leaderboardError =
  document.querySelector(
    "#leaderboardError"
  );

const logoutButton =
  document.querySelector(
    "#logoutButton"
  );

/* =========================================================
   載入逾時計時器
   ========================================================= */

let loadingTimeoutId = null;

function startLoadingTimeout() {
  stopLoadingTimeout();

  loadingTimeoutId =
    window.setTimeout(
      () => {
        hideLoading();

        showError(
          "積分資料載入逾時，請檢查 Firestore Rules、登入狀態或網路連線。"
        );
      },
      10000
    );
}

function stopLoadingTimeout() {
  if (loadingTimeoutId === null) {
    return;
  }

  window.clearTimeout(
    loadingTimeoutId
  );

  loadingTimeoutId = null;
}

/* =========================================================
   畫面狀態
   ========================================================= */

function showLoading() {
  if (!leaderboardLoading) {
    return;
  }

  leaderboardLoading.hidden =
    false;
}

function hideLoading() {
  if (!leaderboardLoading) {
    return;
  }

  leaderboardLoading.hidden =
    true;
}

function clearError() {
  if (!leaderboardError) {
    return;
  }

  leaderboardError.textContent =
    "";

  leaderboardError.hidden =
    true;
}

function showError(message) {
  if (!leaderboardError) {
    return;
  }

  leaderboardError.textContent =
    message;

  leaderboardError.hidden =
    false;
}

/* =========================================================
   個人榜／家系榜切換
   ========================================================= */

function showTab(tabName) {
  const isPersonalTab =
    tabName === "personal";

  personalTabButton?.classList.toggle(
    "active",
    isPersonalTab
  );

  familyTabButton?.classList.toggle(
    "active",
    !isPersonalTab
  );

  personalTabButton?.setAttribute(
    "aria-selected",
    String(isPersonalTab)
  );

  familyTabButton?.setAttribute(
    "aria-selected",
    String(!isPersonalTab)
  );

  if (personalLeaderboard) {
    personalLeaderboard.hidden =
      !isPersonalTab;
  }

  if (familyLeaderboard) {
    familyLeaderboard.hidden =
      isPersonalTab;
  }
}

personalTabButton?.addEventListener(
  "click",
  () => {
    showTab("personal");
  }
);

familyTabButton?.addEventListener(
  "click",
  () => {
    showTab("family");
  }
);

/* =========================================================
   資料處理
   ========================================================= */

function normalizePoints(value) {
  const points =
    Number(value);

  if (
    !Number.isFinite(points) ||
    points < 0
  ) {
    return 0;
  }

  return Math.floor(points);
}

function escapeHtml(value) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function getRankLabel(index) {
  const rank =
    index + 1;

  if (rank === 1) {
    return "🥇";
  }

  if (rank === 2) {
    return "🥈";
  }

  if (rank === 3) {
    return "🥉";
  }

  return String(rank);
}

/* =========================================================
   顯示個人積分榜
   ========================================================= */

function renderPersonalRanking(
  members
) {
  if (!personalRankingList) {
    return;
  }

  if (members.length === 0) {
    personalRankingList.innerHTML = `
      <div class="empty-state">
        目前尚無社員積分資料。
      </div>
    `;

    return;
  }

  personalRankingList.innerHTML =
    members
      .map(
        (member, index) => {
          const rank =
            index + 1;

          return `
            <article
              class="ranking-item ${
                rank <= 3
                  ? "ranking-item-top"
                  : ""
              }"
            >
              <div class="ranking-position">
                ${getRankLabel(index)}
              </div>

              <div class="ranking-member-info">
                <strong>
                  ${escapeHtml(member.name)}
                </strong>

                <span>
                  ${
                    member.family
                      ? escapeHtml(member.family)
                      : "尚未設定家系"
                  }
                </span>
              </div>

              <div class="ranking-points">
                <strong>
                  ${member.points.toLocaleString("zh-TW")}
                </strong>

                <span>
                  分
                </span>
              </div>
            </article>
          `;
        }
      )
      .join("");
}

/* =========================================================
   計算家系積分
   ========================================================= */

function buildFamilyRanking(
  members
) {
  const familyMap =
    new Map();

  members.forEach(
    (member) => {
      const familyName =
        String(
          member.family || ""
        ).trim();

      /*
       * 沒有設定家系的社員，
       * 不列入家系排行榜。
       */
      if (!familyName) {
        return;
      }

      if (
        !familyMap.has(
          familyName
        )
      ) {
        familyMap.set(
          familyName,
          {
            family:
              familyName,

            points:
              0,

            memberCount:
              0
          }
        );
      }

      const familyData =
        familyMap.get(
          familyName
        );

      familyData.points +=
        normalizePoints(
          member.points
        );

      familyData.memberCount +=
        1;
    }
  );

  return Array
    .from(
      familyMap.values()
    )
    .sort(
      (first, second) => {
        if (
          second.points !==
          first.points
        ) {
          return (
            second.points -
            first.points
          );
        }

        return first.family.localeCompare(
          second.family,
          "zh-Hant"
        );
      }
    );
}

/* =========================================================
   顯示家系積分榜
   ========================================================= */

function renderFamilyRanking(
  families
) {
  if (!familyRankingList) {
    return;
  }

  if (families.length === 0) {
    familyRankingList.innerHTML = `
      <div class="empty-state">
        目前尚無家系積分資料。
      </div>
    `;

    return;
  }

  familyRankingList.innerHTML =
    families
      .map(
        (family, index) => {
          const rank =
            index + 1;

          return `
            <article
              class="ranking-item ${
                rank <= 3
                  ? "ranking-item-top"
                  : ""
              }"
            >
              <div class="ranking-position">
                ${getRankLabel(index)}
              </div>

              <div class="ranking-member-info">
                <strong>
                  ${escapeHtml(family.family)}
                </strong>

                <span>
                  ${family.memberCount} 位社員
                </span>
              </div>

              <div class="ranking-points">
                <strong>
                  ${family.points.toLocaleString("zh-TW")}
                </strong>

                <span>
                  分
                </span>
              </div>
            </article>
          `;
        }
      )
      .join("");
}

/* =========================================================
   載入積分資料
   ========================================================= */

async function loadLeaderboard() {
  console.log(
    "開始讀取積分資料"
  );

  showLoading();
  clearError();

  try {
    /*
     * 必須配合 Firestore Rules，
     * 僅查詢 status == approved。
     */
    const approvedUsersQuery =
      query(
        collection(
          db,
          "users"
        ),

        where(
          "status",
          "==",
          "approved"
        )
      );

    const snapshot =
      await getDocs(
        approvedUsersQuery
      );

    console.log(
      "符合條件的社員筆數：",
      snapshot.size
    );

    const members =
      snapshot.docs
        .map(
          (documentSnapshot) => {
            const data =
              documentSnapshot.data();

            return {
              uid:
                documentSnapshot.id,

              name:
                String(
                  data.name ||
                  "未命名社員"
                ).trim(),

              family:
                String(
                  data.family || ""
                ).trim(),

              points:
                normalizePoints(
                  data.points
                )
            };
          }
        )
        .sort(
          (first, second) => {
            if (
              second.points !==
              first.points
            ) {
              return (
                second.points -
                first.points
              );
            }

            return first.name.localeCompare(
              second.name,
              "zh-Hant"
            );
          }
        );

    renderPersonalRanking(
      members
    );

    const families =
      buildFamilyRanking(
        members
      );

    renderFamilyRanking(
      families
    );

    console.log(
      "積分榜渲染完成"
    );
  } catch (error) {
    console.error(
      "積分資料載入失敗：",
      error
    );

    showError(
      `積分資料載入失敗：${
        error?.message ||
        "未知錯誤"
      }`
    );

    if (personalRankingList) {
      personalRankingList.innerHTML = `
        <div class="empty-state">
          無法讀取個人積分資料。
        </div>
      `;
    }

    if (familyRankingList) {
      familyRankingList.innerHTML = `
        <div class="empty-state">
          無法讀取家系積分資料。
        </div>
      `;
    }
  } finally {
    hideLoading();
  }
}

/* =========================================================
   登入狀態與權限驗證
   ========================================================= */

showLoading();
clearError();
startLoadingTimeout();

onAuthStateChanged(
  auth,

  async (user) => {
    console.log(
      "登入狀態：",
      user?.uid ||
      "尚未登入"
    );

    if (!user) {
      stopLoadingTimeout();

      window.location.replace(
        "./login.html"
      );

      return;
    }

    try {
      const currentUserSnapshot =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );

      if (
        !currentUserSnapshot.exists()
      ) {
        throw new Error(
          "Firestore 中找不到目前登入者的 users 文件。"
        );
      }

      const currentUserData =
        currentUserSnapshot.data();

      const isAdmin =
        currentUserData.role ===
        "admin";

      const isApprovedMember =
        currentUserData.role ===
          "member" &&
        currentUserData.status ===
          "approved";

      console.log(
        "登入者權限：",
        {
          role:
            currentUserData.role,

          status:
            currentUserData.status,

          isAdmin,

          isApprovedMember
        }
      );

      if (
        !isAdmin &&
        !isApprovedMember
      ) {
        stopLoadingTimeout();

        window.location.replace(
          "./pending.html"
        );

        return;
      }

      await loadLeaderboard();
    } catch (error) {
      console.error(
        "積分榜初始化失敗：",
        error
      );

      showError(
        `積分榜初始化失敗：${
          error?.message ||
          "未知錯誤"
        }`
      );
    } finally {
      stopLoadingTimeout();
      hideLoading();
    }
  },

  (error) => {
    stopLoadingTimeout();
    hideLoading();

    console.error(
      "登入狀態讀取失敗：",
      error
    );

    showError(
      `登入狀態讀取失敗：${
        error?.message ||
        "未知錯誤"
      }`
    );
  }
);

/* =========================================================
   登出
   ========================================================= */

logoutButton?.addEventListener(
  "click",

  async () => {
    logoutButton.disabled =
      true;

    logoutButton.textContent =
      "登出中……";

    try {
      await signOut(
        auth
      );

      window.location.replace(
        "./login.html"
      );
    } catch (error) {
      console.error(
        "登出失敗：",
        error
      );

      logoutButton.disabled =
        false;

      logoutButton.textContent =
        "登出";

      showError(
        `登出失敗：${
          error?.message ||
          "未知錯誤"
        }`
      );
    }
  }
);
