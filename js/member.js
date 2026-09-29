/* =========================================================
   檔案：js/member.js
   社員首頁：我的角色卡
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

import {
  formatLevel,
  getLevel,
  getNextLevel
} from "./levels.js";

import {
  escapeHtml,
  getBasicInfoItems,
  getProfile,
  getSurfProfileItems,
  loadCheckinStats,
  loadLevelHistory,
  renderCardHero,
  renderInfoList,
  renderLevelPath,
  sortMemories,
  todayString
} from "./member-card.js";

/* =========================================================
   DOM
   ========================================================= */

const memberStatus =
  document.querySelector("#member-status");

const logoutButton =
  document.querySelector("#logout-button");

const characterHero =
  document.querySelector("#character-hero");

const basicInfo =
  document.querySelector("#basic-info");

const surfProfile =
  document.querySelector("#surf-profile");

const levelProgress =
  document.querySelector("#level-progress");

const goalList =
  document.querySelector("#goal-list");

const goalForm =
  document.querySelector("#goal-form");

const goalInput =
  document.querySelector("#goal-input");

const checkinForm =
  document.querySelector("#checkin-form");

const checkinDate =
  document.querySelector("#checkin-date");

const checkinSpot =
  document.querySelector("#checkin-spot");

const checkinDawn =
  document.querySelector("#checkin-dawn");

const checkinDusk =
  document.querySelector("#checkin-dusk");

const checkinStatus =
  document.querySelector("#checkin-status");

const checkinList =
  document.querySelector("#checkin-list");

const levelPath =
  document.querySelector("#level-path");

const levelChartCanvas =
  document.querySelector("#level-history-chart");

const achievementTimeline =
  document.querySelector("#achievement-timeline");

const memoryList =
  document.querySelector("#memory-list");

const memoryForm =
  document.querySelector("#memory-form");

const memoryDate =
  document.querySelector("#memory-date");

const memoryText =
  document.querySelector("#memory-text");

const announcementList =
  document.querySelector("#announcement-list");

const editProfileButton =
  document.querySelector("#edit-profile-button");

const profileDialog =
  document.querySelector("#profile-dialog");

const profileForm =
  document.querySelector("#profile-form");

const profileStatus =
  document.querySelector("#profile-status");

const profileSaveButton =
  document.querySelector("#profile-save-button");

const profileFields = {
  nickname: document.querySelector("#profile-nickname"),
  motto: document.querySelector("#profile-motto"),
  stance: document.querySelector("#profile-stance"),
  surfSince: document.querySelector("#profile-surf-since"),
  spots: document.querySelector("#profile-spots"),
  board: document.querySelector("#profile-board")
};

let currentUser = null;
let currentUserData = null;
let levelHistory = [];
let checkinStats = null;
let levelChartInstance = null;

/* =========================================================
   登入驗證
   ========================================================= */

onAuthStateChanged(
  auth,

  async (user) => {
    if (!user) {
      window.location.replace("./login.html");
      return;
    }

    currentUser = user;

    showStatus(
      memberStatus,
      "正在驗證社員資料……"
    );

    try {
      const userSnapshot =
        await getDoc(doc(db, "users", user.uid));

      if (!userSnapshot.exists()) {
        showStatus(
          memberStatus,
          "找不到社員資料，請聯絡社團管理員。",
          "error"
        );

        return;
      }

      currentUserData =
        userSnapshot.data();

      const role =
        currentUserData.role;

      const status =
        currentUserData.status;

      if (role === "admin") {
        window.location.replace("./admin.html");
        return;
      }

      if (
        role === "pending" ||
        status === "pending" ||
        status === "rejected"
      ) {
        window.location.replace("./pending.html");
        return;
      }

      if (
        role !== "member" ||
        status !== "approved"
      ) {
        showStatus(
          memberStatus,
          "目前帳號沒有社員資訊系統的存取權限。",
          "error"
        );

        return;
      }

      const profile =
        getProfile(currentUserData);

      showStatus(
        memberStatus,
        `歡迎回來，${profile.nickname || currentUserData.name || "社員"} 🤙`,
        "success"
      );

      editProfileButton.disabled = false;

      renderCharacter();

      await Promise.all([
        loadHistory(),
        loadCheckins(),
        loadAnnouncements()
      ]);
    } catch (error) {
      console.error(
        "社員資料讀取失敗：",
        error
      );

      showStatus(
        memberStatus,
        `社員資料讀取失敗：${getErrorMessage(error)}`,
        "error"
      );
    }
  },

  (error) => {
    console.error(
      "登入狀態監聽失敗：",
      error
    );

    showStatus(
      memberStatus,
      `登入狀態讀取失敗：${getErrorMessage(error)}`,
      "error"
    );
  }
);

/* =========================================================
   角色卡
   ========================================================= */

function renderCharacter() {
  if (!currentUserData) {
    return;
  }

  characterHero.innerHTML =
    renderCardHero(
      currentUserData,
      {
        total: checkinStats?.total,
        thisYear: checkinStats?.thisYear,
        levelUps: levelHistory.length
      }
    );

  basicInfo.innerHTML =
    renderInfoList(getBasicInfoItems(currentUserData));

  surfProfile.innerHTML =
    renderInfoList(getSurfProfileItems(currentUserData));

  renderLevelProgress();
  renderGoals();
  renderMemories();
}

/*
 * 社員的資料都存在 users/{uid}.profile，
 * 每次儲存都整包更新 profile。
 */
async function saveProfile(changes) {
  const nextProfile = {
    ...getProfile(currentUserData),
    ...changes
  };

  await updateDoc(
    doc(db, "users", currentUser.uid),
    {
      profile: nextProfile,
      updatedAt: serverTimestamp()
    }
  );

  currentUserData.profile =
    nextProfile;

  renderCharacter();
}

async function saveProfileWithFeedback(changes) {
  try {
    await saveProfile(changes);
    return true;
  } catch (error) {
    console.error(
      "角色卡儲存失敗：",
      error
    );

    showStatus(
      memberStatus,
      `儲存失敗：${getWriteErrorMessage(error)}`,
      "error"
    );

    renderCharacter();

    return false;
  }
}

/* =========================================================
   下一級進度
   ========================================================= */

function renderLevelProgress() {
  const level =
    getLevel(currentUserData.level);

  const nextLevel =
    getNextLevel(level);

  const skills =
    getProfile(currentUserData).skills;

  const currentHtml = level
    ? `
      <div class="level-progress-current">
        <span class="level-progress-emoji">${level.emoji}</span>

        <div>
          <p class="eyebrow">目前等級</p>
          <h2>${escapeHtml(level.name)} Lv.${level.value}</h2>
          <p class="level-tagline">「${escapeHtml(level.tagline)}」</p>
        </div>
      </div>
    `
    : `
      <div class="level-progress-current">
        <span class="level-progress-emoji">🌊</span>

        <div>
          <p class="eyebrow">目前等級</p>
          <h2>尚未分級</h2>
          <p class="level-tagline">等管理員幫你設定第一個等級。</p>
        </div>
      </div>
    `;

  if (!nextLevel) {
    levelProgress.innerHTML = `
      ${currentHtml}
      <p class="level-progress-summary">
        已經是最高等級了，換你帶新生下水 ⚡
      </p>
    `;

    return;
  }

  const remaining =
    nextLevel.requirements.filter(
      (requirement) => !skills.includes(requirement.id)
    ).length;

  levelProgress.innerHTML = `
    ${currentHtml}

    <h3 class="level-progress-next">
      下一級：<a href="./dex.html#lv${nextLevel.value}">${escapeHtml(formatLevel(nextLevel))}</a>
    </h3>

    <ul class="check-list">
      ${nextLevel.requirements.map((requirement) => `
        <li>
          <label class="check-item">
            <input
              type="checkbox"
              data-skill-id="${escapeHtml(requirement.id)}"
              ${skills.includes(requirement.id) ? "checked" : ""}
            >
            <span>${escapeHtml(requirement.text)}</span>
          </label>
        </li>
      `).join("")}
    </ul>

    <p class="level-progress-summary">
      ${remaining === 0
        ? `條件都達成了！找幹部幫你確認升上 Lv.${nextLevel.value} 🎉`
        : `距離 Lv.${nextLevel.value}：還差 <strong>${remaining}</strong> 個條件`}
    </p>

    <p class="panel-hint">
      勾選是自我評估，正式升級由幹部確認。
    </p>
  `;
}

levelProgress?.addEventListener(
  "change",

  async (event) => {
    const checkbox =
      event.target.closest("[data-skill-id]");

    if (!checkbox) {
      return;
    }

    const skillId =
      checkbox.dataset.skillId;

    const skills =
      getProfile(currentUserData).skills.filter(
        (id) => id !== skillId
      );

    if (checkbox.checked) {
      skills.push(skillId);
    }

    checkbox.disabled = true;

    await saveProfileWithFeedback({ skills });
  }
);

/* =========================================================
   今年目標
   ========================================================= */

function renderGoals() {
  const goals =
    getProfile(currentUserData).goals;

  if (goals.length === 0) {
    goalList.innerHTML = `
      <li class="empty-state">
        還沒有目標，寫一個吧，例如「升 Lv.3」。
      </li>
    `;

    return;
  }

  goalList.innerHTML =
    goals.map((goal, index) => `
      <li>
        <label class="check-item">
          <input
            type="checkbox"
            data-goal-index="${index}"
            ${goal.done ? "checked" : ""}
          >
          <span>${escapeHtml(goal.text)}</span>
        </label>

        <button
          class="icon-button"
          type="button"
          data-remove-goal="${index}"
          aria-label="刪除目標"
        >
          ×
        </button>
      </li>
    `).join("");
}

goalList?.addEventListener(
  "change",

  async (event) => {
    const checkbox =
      event.target.closest("[data-goal-index]");

    if (!checkbox) {
      return;
    }

    const goals =
      getProfile(currentUserData).goals.map(
        (goal, index) =>
          index === Number(checkbox.dataset.goalIndex)
            ? { ...goal, done: checkbox.checked }
            : goal
      );

    checkbox.disabled = true;

    await saveProfileWithFeedback({ goals });
  }
);

goalList?.addEventListener(
  "click",

  async (event) => {
    const button =
      event.target.closest("[data-remove-goal]");

    if (!button) {
      return;
    }

    const goals =
      getProfile(currentUserData).goals.filter(
        (_, index) => index !== Number(button.dataset.removeGoal)
      );

    button.disabled = true;

    await saveProfileWithFeedback({ goals });
  }
);

goalForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    const text =
      goalInput.value.trim();

    if (!text || !currentUserData) {
      return;
    }

    const goals = [
      ...getProfile(currentUserData).goals,
      { text, done: false }
    ];

    if (await saveProfileWithFeedback({ goals })) {
      goalInput.value = "";
    }
  }
);

/* =========================================================
   回憶／事件
   ========================================================= */

function renderMemories() {
  const memories =
    sortMemories(getProfile(currentUserData).memories);

  if (memories.length === 0) {
    memoryList.innerHTML = `
      <li class="empty-state">
        還沒有回憶，從第一次下水開始記吧。
      </li>
    `;

    return;
  }

  memoryList.innerHTML =
    memories.map((memory) => `
      <li>
        <time>${escapeHtml(memory.date)}</time>
        <span>${escapeHtml(memory.text)}</span>

        <button
          class="icon-button"
          type="button"
          data-remove-memory="${escapeHtml(memory.date)}|${escapeHtml(memory.text)}"
          aria-label="刪除回憶"
        >
          ×
        </button>
      </li>
    `).join("");
}

memoryList?.addEventListener(
  "click",

  async (event) => {
    const button =
      event.target.closest("[data-remove-memory]");

    if (!button) {
      return;
    }

    const key =
      button.dataset.removeMemory;

    const memories =
      getProfile(currentUserData).memories.filter(
        (memory) => `${memory.date}|${memory.text}` !== key
      );

    button.disabled = true;

    await saveProfileWithFeedback({ memories });
  }
);

memoryForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    const text =
      memoryText.value.trim();

    if (!text || !memoryDate.value || !currentUserData) {
      return;
    }

    const memories = [
      ...getProfile(currentUserData).memories,
      { date: memoryDate.value, text }
    ];

    if (await saveProfileWithFeedback({ memories })) {
      memoryText.value = "";
    }
  }
);

if (memoryDate) {
  memoryDate.value = todayString();
}

/* =========================================================
   編輯角色卡
   ========================================================= */

editProfileButton?.addEventListener(
  "click",

  () => {
    if (!currentUserData) {
      return;
    }

    const profile =
      getProfile(currentUserData);

    Object.entries(profileFields).forEach(
      ([key, input]) => {
        input.value = profile[key] || "";
      }
    );

    showStatus(profileStatus, "");

    profileDialog.showModal();
  }
);

profileForm?.addEventListener(
  "submit",

  async (event) => {
    if (event.submitter?.value !== "save") {
      return;
    }

    event.preventDefault();

    const changes =
      Object.fromEntries(
        Object.entries(profileFields).map(
          ([key, input]) => [key, input.value.trim()]
        )
      );

    profileSaveButton.disabled = true;
    profileSaveButton.textContent = "儲存中……";

    try {
      await saveProfile(changes);

      profileDialog.close();

      showStatus(
        memberStatus,
        "角色卡已更新 ✨",
        "success"
      );
    } catch (error) {
      console.error(
        "角色卡儲存失敗：",
        error
      );

      showStatus(
        profileStatus,
        `儲存失敗：${getWriteErrorMessage(error)}`,
        "error"
      );
    } finally {
      profileSaveButton.disabled = false;
      profileSaveButton.textContent = "儲存";
    }
  }
);

/* =========================================================
   下水打卡
   ========================================================= */

async function loadCheckins() {
  try {
    checkinStats =
      await loadCheckinStats(db, currentUser.uid, 5);
  } catch (error) {
    console.error(
      "下水紀錄載入失敗：",
      error
    );

    checkinStats = null;

    showStatus(
      checkinStatus,
      `下水紀錄載入失敗：${getErrorMessage(error)}`,
      "error"
    );
  }

  renderCheckins();
  renderCharacter();
}

function renderCheckins() {
  const recent =
    checkinStats?.recent || [];

  if (recent.length === 0) {
    checkinList.innerHTML = `
      <li class="empty-state">
        還沒有打卡紀錄。
      </li>
    `;

    return;
  }

  checkinList.innerHTML =
    recent.map((checkin) => `
      <li>
        <time>${escapeHtml(checkin.date)}</time>
        <span>${checkin.dawn ? "🌅 " : ""}${checkin.dusk ? "🌇 " : ""}${escapeHtml(checkin.spot || "—")}</span>

        <button
          class="icon-button"
          type="button"
          data-remove-checkin="${escapeHtml(checkin.id)}"
          aria-label="刪除這筆打卡"
        >
          ×
        </button>
      </li>
    `).join("");
}

checkinForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    const date =
      checkinDate.value;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      showStatus(checkinStatus, "請選擇日期。", "error");
      return;
    }

    if (date > todayString()) {
      showStatus(checkinStatus, "不能幫未來的自己打卡 😂", "error");
      return;
    }

    const checkinReference =
      doc(db, "users", currentUser.uid, "checkins", date);

    const submitButton =
      event.submitter;

    submitButton.disabled = true;

    try {
      const existing =
        await getDoc(checkinReference);

      if (existing.exists()) {
        showStatus(checkinStatus, `${date} 已經打過卡了。`, "error");
        return;
      }

      const checkin = {
        date,
        spot: checkinSpot.value.trim(),
        createdAt: serverTimestamp()
      };

      /*
       * 開燈存在 dawn、關燈存在 dusk，沒勾就不寫欄位
       */
      if (checkinDawn.checked) {
        checkin.dawn = true;
      }

      if (checkinDusk.checked) {
        checkin.dusk = true;
      }

      await setDoc(checkinReference, checkin);

      checkinDawn.checked = false;
      checkinDusk.checked = false;

      const badges = [
        checkin.dawn ? "🌅 開燈" : "",
        checkin.dusk ? "🌇 關燈" : ""
      ].filter(Boolean).join("、");

      showStatus(
        checkinStatus,
        `打卡成功！${date} ${badges || "🌊"}`,
        "success"
      );

      await loadCheckins();
    } catch (error) {
      console.error(
        "打卡失敗：",
        error
      );

      showStatus(
        checkinStatus,
        `打卡失敗：${getWriteErrorMessage(error)}`,
        "error"
      );
    } finally {
      submitButton.disabled = false;
    }
  }
);

checkinList?.addEventListener(
  "click",

  async (event) => {
    const button =
      event.target.closest("[data-remove-checkin]");

    if (!button) {
      return;
    }

    button.disabled = true;

    try {
      await deleteDoc(
        doc(db, "users", currentUser.uid, "checkins", button.dataset.removeCheckin)
      );

      showStatus(checkinStatus, "已刪除這筆打卡。");

      await loadCheckins();
    } catch (error) {
      console.error(
        "刪除打卡失敗：",
        error
      );

      button.disabled = false;

      showStatus(
        checkinStatus,
        `刪除失敗：${getWriteErrorMessage(error)}`,
        "error"
      );
    }
  }
);

if (checkinDate) {
  checkinDate.value = todayString();
  checkinDate.max = todayString();
}

/* =========================================================
   升級紀錄
   ========================================================= */

async function loadHistory() {
  try {
    levelHistory =
      await loadLevelHistory(db, currentUser.uid);

    levelPath.innerHTML =
      renderLevelPath(levelHistory);

    renderAchievementTimeline(levelHistory);
    renderLevelChart(levelHistory);
  } catch (error) {
    console.error(
      "Level History 載入失敗：",
      error
    );

    levelHistory = [];

    achievementTimeline.innerHTML = `
      <p class="status-message error">
        升級紀錄載入失敗。
      </p>
    `;
  }

  renderCharacter();
}

function renderAchievementTimeline(history) {
  achievementTimeline.innerHTML = "";

  history.forEach((item) => {
    const card =
      document.createElement("div");

    card.className =
      "achievement-item";

    const date =
      item.unlockedAt
        ?.toDate?.()
        ?.toLocaleDateString("zh-TW") ||
      "未知日期";

    card.innerHTML = `
      <div class="achievement-date">
        ${escapeHtml(date)}
      </div>

      <div class="achievement-level">
        ${escapeHtml(item.levelText || "未設定 Level")}
      </div>

      <div class="achievement-title">
        ${escapeHtml(item.achievement || "")}
      </div>
    `;

    achievementTimeline.appendChild(card);
  });
}

function renderLevelChart(history) {
  if (!levelChartCanvas) {
    return;
  }

  const chartBox =
    levelChartCanvas.parentElement;

  chartBox.hidden =
    history.length < 2 ||
    typeof Chart === "undefined";

  if (typeof Chart === "undefined") {
    console.error(
      "Chart.js 尚未載入，請確認 member.html 中 Chart.js 在 member.js 前面。"
    );

    return;
  }

  if (history.length < 2) {
    return;
  }

  if (levelChartInstance) {
    levelChartInstance.destroy();
  }

  levelChartInstance =
    new Chart(
      levelChartCanvas,
      {
        type: "line",

        data: {
          labels: history.map(
            (item) =>
              item.unlockedAt
                ?.toDate?.()
                ?.toLocaleDateString("zh-TW") ||
              ""
          ),

          datasets: [
            {
              label: "Level 成長",
              data: history.map(
                (item) => Number(item.levelValue) || 0
              ),
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
              display: false
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
   讀取公告
   ========================================================= */

async function loadAnnouncements() {
  if (!announcementList) {
    console.error(
      "member.html 找不到 #announcement-list。"
    );

    return;
  }

  announcementList.innerHTML = `
    <p class="empty-state">
      正在讀取公告……
    </p>
  `;

  try {
    const querySnapshot =
      await getDocs(
        query(
          collection(db, "announcements"),
          orderBy("createdAt", "desc")
        )
      );

    announcementList.innerHTML = "";

    if (querySnapshot.empty) {
      announcementList.innerHTML = `
        <p class="empty-state">
          目前沒有公告。
        </p>
      `;

      return;
    }

    querySnapshot.forEach(
      (announcementSnapshot) => {
        announcementList.appendChild(
          createAnnouncementCard({
            id: announcementSnapshot.id,
            ...announcementSnapshot.data()
          })
        );
      }
    );
  } catch (error) {
    console.error(
      "公告讀取失敗：",
      error
    );

    announcementList.innerHTML = "";

    const errorMessage =
      document.createElement("p");

    errorMessage.className =
      "status-message error";

    errorMessage.textContent =
      `公告讀取失敗：${getErrorMessage(error)}`;

    announcementList.appendChild(errorMessage);
  }
}

function createAnnouncementCard(announcement) {
  const article =
    document.createElement("article");

  const title =
    document.createElement("h3");

  const content =
    document.createElement("p");

  const metadata =
    document.createElement("small");

  article.className =
    "card announcement-card";

  title.className =
    "announcement-title";

  content.className =
    "announcement-content";

  metadata.className =
    "announcement-meta";

  title.textContent =
    announcement.title ||
    "未命名公告";

  content.textContent =
    announcement.content ||
    "";

  metadata.textContent =
    formatTimestamp(
      announcement.createdAt
    );

  article.append(
    title,
    content
  );

  if (
    announcement.linkUrl &&
    isSafeHttpUrl(announcement.linkUrl)
  ) {
    const linkWrapper =
      document.createElement("div");

    const link =
      document.createElement("a");

    linkWrapper.className =
      "announcement-link-wrapper";

    link.href =
      String(
        announcement.linkUrl
      ).trim();

    link.textContent =
      announcement.linkText ||
      "開啟連結";

    link.className =
      "button button-small announcement-link";

    link.target =
      "_blank";

    link.rel =
      "noopener noreferrer";

    linkWrapper.appendChild(link);

    article.appendChild(linkWrapper);
  }

  if (metadata.textContent) {
    article.appendChild(metadata);
  }

  return article;
}

function isSafeHttpUrl(value) {
  try {
    const parsedUrl =
      new URL(
        String(value).trim()
      );

    return (
      parsedUrl.protocol === "http:" ||
      parsedUrl.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function formatTimestamp(timestamp) {
  const date =
    typeof timestamp?.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (
    !timestamp ||
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return date.toLocaleString(
    "zh-TW",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

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
      await signOut(auth);

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

      showStatus(
        memberStatus,
        `登出失敗：${getErrorMessage(error)}`,
        "error"
      );
    }
  }
);

/* =========================================================
   共用工具
   ========================================================= */

function showStatus(
  element,
  message,
  type = ""
) {
  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.className =
    "status-message";

  if (type) {
    element.classList.add(type);
  }
}

function getErrorMessage(error) {
  const errorCode =
    error?.code ||
    "";

  if (
    errorCode === "permission-denied" ||
    errorCode === "firestore/permission-denied"
  ) {
    return "權限不足，請確認帳號已通過社員審核。";
  }

  if (
    errorCode === "unavailable" ||
    errorCode === "firestore/unavailable"
  ) {
    return "目前無法連線至資料庫，請稍後再試。";
  }

  if (
    errorCode ===
    "auth/network-request-failed"
  ) {
    return "網路連線失敗，請檢查網路狀態。";
  }

  return (
    error?.message ||
    "未知錯誤"
  );
}

function getWriteErrorMessage(error) {
  if (
    error?.code === "permission-denied" ||
    error?.code === "firestore/permission-denied"
  ) {
    return "沒有寫入權限，請管理員確認 Firestore 規則已開放社員編輯自己的角色卡。";
  }

  return getErrorMessage(error);
}
