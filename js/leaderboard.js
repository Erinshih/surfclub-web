/* =========================================================
   檔案：js/leaderboard.js
   功能：
   1. 驗證登入狀態與權限
   2. 顯示個人積分榜
   3. 顯示家系積分榜與家系成員
   4. 點選個人姓名後顯示 Level 曲線圖與成就紀錄
   5. 登出
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
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

/* =========================================================
   DOM
   ========================================================= */

const personalTabButton =
  document.querySelector("#personalTabButton");

const familyTabButton =
  document.querySelector("#familyTabButton");

const personalLeaderboard =
  document.querySelector("#personalLeaderboard");

const familyLeaderboard =
  document.querySelector("#familyLeaderboard");

const personalRankingList =
  document.querySelector("#personalRankingList");

const familyRankingList =
  document.querySelector("#familyRankingList");

const leaderboardLoading =
  document.querySelector("#leaderboardLoading");

const leaderboardError =
  document.querySelector("#leaderboardError");

const logoutButton =
  document.querySelector("#logoutButton");

const memberDetailPanel =
  document.querySelector("#memberDetailPanel");

const selectedMemberName =
  document.querySelector("#selectedMemberName");

const selectedMemberMeta =
  document.querySelector("#selectedMemberMeta");

const selectedMemberAchievementList =
  document.querySelector("#selectedMemberAchievementList");

const selectedMemberLevelChart =
  document.querySelector("#selectedMemberLevelChart");

const closeMemberDetail =
  document.querySelector("#closeMemberDetail");

/* =========================================================
   狀態
   ========================================================= */

let allMembers = [];
let levelChartInstance = null;
let loadingTimeoutId = null;

/* =========================================================
   Loading / Error
   ========================================================= */

function showLoading() {
  if (leaderboardLoading) {
    leaderboardLoading.hidden = false;
  }
}

function hideLoading() {
  if (leaderboardLoading) {
    leaderboardLoading.hidden = true;
  }
}

function clearError() {
  if (!leaderboardError) {
    return;
  }

  leaderboardError.textContent = "";
  leaderboardError.hidden = true;
}

function showError(message) {
  if (!leaderboardError) {
    return;
  }

  leaderboardError.textContent = message;
  leaderboardError.hidden = false;
}

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

  window.clearTimeout(loadingTimeoutId);
  loadingTimeoutId = null;
}

/* =========================================================
   Tabs
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
  () => showTab("personal")
);

familyTabButton?.addEventListener(
  "click",
  () => showTab("family")
);

closeMemberDetail?.addEventListener(
  "click",
  () => {
    if (memberDetailPanel) {
      memberDetailPanel.hidden = true;
    }
  }
);

/* =========================================================
   Utils
   ========================================================= */

function normalizePoints(value) {
  const points = Number(value);

  if (
    !Number.isFinite(points) ||
    points < 0
  ) {
    return 0;
  }

  return Math.floor(points);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRankLabel(index) {
  const rank = index + 1;

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

function formatDate(timestamp) {
  return (
    timestamp
      ?.toDate?.()
      ?.toLocaleDateString("zh-TW") ||
    "未知日期"
  );
}

/* =========================================================
   個人積分榜
   ========================================================= */

function renderPersonalRanking(members) {
  if (!personalRankingList) {
    return;
  }

  personalRankingList.innerHTML = "";

  if (members.length === 0) {
    personalRankingList.innerHTML = `
      <div class="empty-state">
        目前尚無社員積分資料。
      </div>
    `;

    return;
  }

  members.forEach((member, index) => {
    const rank = index + 1;

    const article =
      document.createElement("article");

    article.className =
      `ranking-item ${
        rank <= 3
          ? "ranking-item-top"
          : ""
      }`;

    article.dataset.uid = member.uid;

    article.innerHTML = `
      <div class="ranking-position">
        ${getRankLabel(index)}
      </div>

      <div class="ranking-member-info">
        <button
          class="ranking-member-button"
          type="button"
        >
          ${escapeHtml(member.name)}
        </button>

        <span>
          ${
            member.family
              ? escapeHtml(member.family)
              : "尚未設定家系"
          }
          ${
            member.level
              ? `｜${escapeHtml(member.level)}`
              : ""
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
    `;

    const nameButton =
      article.querySelector(".ranking-member-button");

    nameButton?.addEventListener(
      "click",
      async () => {
        await showMemberDetail(member);
      }
    );

    // personalRankingList.appendChild(article);
    personalRankingList.appendChild(article);

if (
  memberDetailPanel &&
  memberDetailPanel.parentElement !== personalRankingList
) {
  personalRankingList.appendChild(memberDetailPanel);
}
  });
}

/* =========================================================
   家系積分榜
   ========================================================= */

function buildFamilyRanking(members) {
  const familyMap =
    new Map();

  members.forEach((member) => {
    const familyName =
      String(member.family || "").trim();

    if (!familyName) {
      return;
    }

    if (!familyMap.has(familyName)) {
      familyMap.set(
        familyName,
        {
          family: familyName,
          points: 0,
          memberCount: 0,
          members: []
        }
      );
    }

    const familyData =
      familyMap.get(familyName);

    familyData.points +=
      normalizePoints(member.points);

    familyData.memberCount += 1;

    familyData.members.push(member);
  });

  return Array
    .from(familyMap.values())
    .sort((first, second) => {
      if (second.points !== first.points) {
        return second.points - first.points;
      }

      return first.family.localeCompare(
        second.family,
        "zh-Hant"
      );
    });
}

function renderFamilyRanking(families) {
  if (!familyRankingList) {
    return;
  }

  familyRankingList.innerHTML = "";

  if (families.length === 0) {
    familyRankingList.innerHTML = `
      <div class="empty-state">
        目前尚無家系積分資料。
      </div>
    `;

    return;
  }

  families.forEach((family, index) => {
    const rank = index + 1;

    const article =
      document.createElement("article");

    article.className =
      `ranking-item family-ranking-item ${
        rank <= 3
          ? "ranking-item-top"
          : ""
      }`;

    const sortedMembers =
      [...family.members].sort(
        (first, second) => {
          if (second.points !== first.points) {
            return second.points - first.points;
          }

          return first.name.localeCompare(
            second.name,
            "zh-Hant"
          );
        }
      );

    const memberListHtml =
      sortedMembers
        .map(
          (member) => `
            <li>
              <button
                class="family-member-button"
                type="button"
                data-uid="${escapeHtml(member.uid)}"
              >
                ${escapeHtml(member.name)}
              </button>

              <span>
                ${member.points.toLocaleString("zh-TW")} 分
              </span>
            </li>
          `
        )
        .join("");

    article.innerHTML = `
      <div class="ranking-position">
        ${getRankLabel(index)}
      </div>

      <div class="ranking-member-info family-ranking-info">
        <strong>
          ${escapeHtml(family.family)}
        </strong>

        <span>
          ${family.memberCount} 位社員
        </span>

        <ul class="family-member-list">
          ${memberListHtml}
        </ul>
      </div>

      <div class="ranking-points">
        <strong>
          ${family.points.toLocaleString("zh-TW")}
        </strong>

        <span>
          分
        </span>
      </div>
    `;

    article
      .querySelectorAll(".family-member-button")
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const uid =
              button.getAttribute("data-uid");

            const member =
              allMembers.find(
                (item) => item.uid === uid
              );

            if (member) {
              showTab("personal");
              await showMemberDetail(member);
            }
          }
        );
      });

    familyRankingList.appendChild(article);
  });
}

/* =========================================================
   社員 Level / 成就詳情
   ========================================================= */

async function loadMemberLevelHistory(uid) {
  const snapshot =
    await getDocs(
      query(
        collection(
          db,
          "users",
          uid,
          "levelHistory"
        ),
        orderBy(
          "unlockedAt",
          "asc"
        )
      )
    );

  return snapshot.docs.map(
    (documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    })
  );
}

async function showMemberDetail(member) {
  const selectedRow =
  document.querySelector(
    `.ranking-item[data-uid="${member.uid}"]`
  );

if (selectedRow && memberDetailPanel) {
  selectedRow.insertAdjacentElement(
    "afterend",
    memberDetailPanel
  );
}

  if (!memberDetailPanel) {
    return;
  }

  memberDetailPanel.hidden = false;

  if (selectedMemberName) {
    selectedMemberName.textContent =
      member.name;
  }

  if (selectedMemberMeta) {
    selectedMemberMeta.textContent =
      [
        member.family || "尚未設定家系",
        member.level || "尚未設定 Level",
        `${member.points.toLocaleString("zh-TW")} 分`
      ].join("｜");
  }

  if (selectedMemberAchievementList) {
    selectedMemberAchievementList.innerHTML = `
      <p class="empty-state">
        正在載入成就紀錄……
      </p>
    `;
  }

  try {
    const history =
      await loadMemberLevelHistory(
        member.uid
      );

    renderSelectedMemberAchievements(
      history
    );

    renderSelectedMemberChart(
      history
    );

    memberDetailPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    console.error(
      "讀取社員成就紀錄失敗：",
      error
    );

    if (selectedMemberAchievementList) {
      selectedMemberAchievementList.innerHTML = `
        <p class="status-message error">
          成就紀錄載入失敗：${escapeHtml(error?.message || "未知錯誤")}
        </p>
      `;
    }
  }
}

function renderSelectedMemberAchievements(history) {
  if (!selectedMemberAchievementList) {
    return;
  }

  selectedMemberAchievementList.innerHTML = "";

  if (history.length === 0) {
    selectedMemberAchievementList.innerHTML = `
      <p class="empty-state">
        尚無成就紀錄
      </p>
    `;

    return;
  }

  history.forEach((item) => {
    const card =
      document.createElement("div");

    card.className =
      "achievement-item";

    card.innerHTML = `
      <div class="achievement-date">
        ${escapeHtml(formatDate(item.unlockedAt))}
      </div>

      <div class="achievement-level">
        ${escapeHtml(item.levelText || "未設定 Level")}
      </div>

      <div class="achievement-title">
        ${escapeHtml(item.achievement || "")}
      </div>
    `;

    selectedMemberAchievementList.appendChild(card);
  });
}

function renderSelectedMemberChart(history) {
  if (!selectedMemberLevelChart) {
    return;
  }

  if (typeof Chart === "undefined") {
    console.error(
      "Chart.js 尚未載入，請確認 leaderboard.html 中 Chart.js 在 leaderboard.js 前面。"
    );

    return;
  }

  if (levelChartInstance) {
    levelChartInstance.destroy();
    levelChartInstance = null;
  }

  if (history.length === 0) {
    return;
  }

  const labels =
    history.map(
      (item) =>
        formatDate(item.unlockedAt)
    );

  const values =
    history.map(
      (item) =>
        Number(item.levelValue) || 0
    );

  levelChartInstance =
    new Chart(
      selectedMemberLevelChart,
      {
        type: "line",

        data: {
          labels,

          datasets: [
            {
              label: "Level 成長",
              data: values,
              tension: 0.3,
              fill: false
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: true
            }
          },

          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: 5,

              ticks: {
                stepSize: 1
              }
            }
          }
        }
      }
    );
}

/* =========================================================
   載入積分資料
   ========================================================= */

async function loadLeaderboard() {
  showLoading();
  clearError();

  try {
    const approvedUsersQuery =
      query(
        collection(db, "users"),
        where("status", "==", "approved")
      );

    const snapshot =
      await getDocs(approvedUsersQuery);

    allMembers =
      snapshot.docs
        .map((documentSnapshot) => {
          const data =
            documentSnapshot.data();

          return {
            uid: documentSnapshot.id,

            name:
              String(
                data.name ||
                "未命名社員"
              ).trim(),

            family:
              String(
                data.family ||
                ""
              ).trim(),

            level:
              String(
                data.level ||
                ""
              ).trim(),

            points:
              normalizePoints(
                data.points
              )
          };
        })
        .sort((first, second) => {
          if (second.points !== first.points) {
            return second.points - first.points;
          }

          return first.name.localeCompare(
            second.name,
            "zh-Hant"
          );
        });

    renderPersonalRanking(allMembers);

    const families =
      buildFamilyRanking(allMembers);

    renderFamilyRanking(families);
  } catch (error) {
    console.error(
      "積分資料載入失敗：",
      error
    );

    showError(
      `積分資料載入失敗：${error?.message || "未知錯誤"}`
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
   Auth
   ========================================================= */

showLoading();
clearError();
startLoadingTimeout();

onAuthStateChanged(
  auth,

  async (user) => {
    if (!user) {
      stopLoadingTimeout();

      window.location.replace("./login.html");

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

      if (!currentUserSnapshot.exists()) {
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
        `積分榜初始化失敗：${error?.message || "未知錯誤"}`
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
      `登入狀態讀取失敗：${error?.message || "未知錯誤"}`
    );
  }
);

/* =========================================================
   Logout
   ========================================================= */

logoutButton?.addEventListener(
  "click",

  async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "登出中……";

    try {
      await signOut(auth);

      window.location.replace("./login.html");
    } catch (error) {
      console.error(
        "登出失敗：",
        error
      );

      logoutButton.disabled = false;
      logoutButton.textContent = "登出";

      showError(
        `登出失敗：${error?.message || "未知錯誤"}`
      );
    }
  }
);