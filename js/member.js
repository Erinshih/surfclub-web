/* =========================================================
   檔案：js/member.js
   社員首頁：我的角色卡
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  addDoc,
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
  getGoalsToNextLevel,
  getLevel,
  getLevelByValue,
  getNextLevel
} from "./levels.js";

import {
  getParticipants,
  loadTripLevelUps,
  loadTrips,
  renderQuote,
  renderTripFacts,
  renderTripLinks,
  renderTripTitle
} from "./trips.js";

import {
  escapeHtml,
  getBasicInfoItems,
  getProfile,
  getSurfProfileItems,
  loadCheckinStats,
  loadLevelHistory,
  loadProgress,
  parseDateString,
  renderCardHero,
  renderInfoList,
  renderLevelPath,
  sortMemories,
  todayString
} from "./member-card.js";

import {
  refreshBoardStats
} from "./board-stats.js";

import {
  PAYMENT_STATUS,
  formatMoney,
  isOutstanding,
  loadMyPayments,
  reportPayment
} from "./fees.js";

import {
  formatSignedPoints,
  getAdjustPoints,
  getBonusPoints,
  getPointRules,
  getTotalPoints,
  loadPointRecords,
  loadPointRules
} from "./points.js";

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

const progressForm =
  document.querySelector("#progress-form");

const progressDate =
  document.querySelector("#progress-date");

const progressText =
  document.querySelector("#progress-text");

const progressSubmit =
  document.querySelector("#progress-submit");

const progressCancel =
  document.querySelector("#progress-cancel");

const progressStatus =
  document.querySelector("#progress-status");

const growthSummary =
  document.querySelector("#growth-summary");

const growthTimeline =
  document.querySelector("#growth-timeline");

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

const latestTrip =
  document.querySelector("#latest-trip");

const myPoints =
  document.querySelector("#my-points");

const myFees =
  document.querySelector("#my-fees");

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
let levelHistoryLoaded = false;
let progressEntries = [];
let editingProgressId = null;
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
        loadLatestTrip(),
        loadMyPoints(),
        loadMyFees(),
        loadAnnouncements()
      ]);

      await syncBoardStats();
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

  const goals =
    getGoalsToNextLevel(level);

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

      <div class="level-stage">
        <h3>這個階段</h3>
        <ul>
          ${level.stage.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}
        </ul>
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
    goals.filter(
      (goal) => !skills.includes(goal.id)
    ).length;

  levelProgress.innerHTML = `
    ${currentHtml}

    <h3 class="level-progress-next">
      升上 <a href="./dex.html#lv${nextLevel.value}">${escapeHtml(formatLevel(nextLevel))}</a> 的目標
    </h3>

    <ul class="check-list">
      ${goals.map((goal) => `
        <li>
          <label class="check-item">
            <input
              type="checkbox"
              data-skill-id="${escapeHtml(goal.id)}"
              ${skills.includes(goal.id) ? "checked" : ""}
            >
            <span>${escapeHtml(goal.text)}</span>
          </label>
        </li>
      `).join("")}
    </ul>

    <p class="level-progress-summary">
      ${remaining === 0
        ? `目標都達成了！找幹部幫你確認升上 Lv.${nextLevel.value} 🎉`
        : `距離 Lv.${nextLevel.value}：還差 <strong>${remaining}</strong> 個目標`}
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
      await syncBoardStats();
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
      await syncBoardStats();
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

/*
 * 更新排行榜用的統計（沒變化就不寫入）。
 * 失敗不影響頁面，只是排行榜晚一點更新。
 */
async function syncBoardStats() {
  try {
    await refreshBoardStats(
      db,
      currentUser.uid,
      currentUserData,
      levelHistoryLoaded ? levelHistory : null
    );
  } catch (error) {
    console.error(
      "排行榜統計更新失敗：",
      error
    );
  }
}

/* =========================================================
   升級紀錄
   ========================================================= */

async function loadHistory() {
  try {
    levelHistory =
      await loadLevelHistory(db, currentUser.uid);

    levelHistoryLoaded = true;
  } catch (error) {
    console.error(
      "Level History 載入失敗：",
      error
    );

    levelHistory = [];

    showStatus(
      progressStatus,
      "升級紀錄載入失敗。",
      "error"
    );
  }

  await loadProgressEntries();

  renderCharacter();
}

async function loadProgressEntries() {
  try {
    progressEntries =
      await loadProgress(db, currentUser.uid);
  } catch (error) {
    console.error(
      "進步紀錄載入失敗：",
      error
    );

    showStatus(
      progressStatus,
      `進步紀錄載入失敗：${getErrorMessage(error)}`,
      "error"
    );
  }

  renderGrowth();
}

/* =========================================================
   升級與進步紀錄
   ========================================================= */

/*
 * 把管理員的升級紀錄和社員自己的進步紀錄合併，依時間排序
 */
function buildGrowthEvents() {
  const levelEvents =
    levelHistory
      .map((item) => ({
        type: "level",
        id: item.id,
        date: item.unlockedAt?.toDate?.() || null,
        levelValue: Number(item.levelValue) || 0,
        levelText: item.levelText || "",
        text: item.achievement || ""
      }))
      .filter((event) => event.date);

  const progressEvents =
    progressEntries
      .map((item) => ({
        type: "progress",
        id: item.id,
        date: parseDateString(item.date),
        dateText: item.date,
        text: item.text || ""
      }))
      .filter((event) => event.date);

  return [...levelEvents, ...progressEvents]
    .sort((first, second) =>
      first.date - second.date ||
      (first.type === "level" ? -1 : 1)
    );
}

function renderGrowth() {
  levelPath.innerHTML =
    renderLevelPath(levelHistory);

  const events =
    buildGrowthEvents();

  growthSummary.textContent =
    `全部紀錄（${events.length} 筆）`;

  renderGrowthTimeline(events);
  renderGrowthChart(events);
}

function renderGrowthTimeline(events) {
  if (events.length === 0) {
    growthTimeline.innerHTML = `
      <li class="empty-state">
        還沒有紀錄，記下你的第一個進步吧 ✨
      </li>
    `;

    return;
  }

  /*
   * 新的在上面
   */
  growthTimeline.innerHTML =
    [...events]
      .reverse()
      .map((event) => {
        const date =
          event.date.toLocaleDateString("zh-TW");

        if (event.type === "level") {
          return `
            <li class="growth-item is-level">
              <time>${escapeHtml(date)}</time>
              <span class="growth-badge">⬆️ 升級</span>
              <span class="growth-text">
                <strong>${escapeHtml(event.levelText || `Lv.${event.levelValue}`)}</strong>
                ${event.text ? `<small>${escapeHtml(event.text)}</small>` : ""}
              </span>
            </li>
          `;
        }

        return `
          <li class="growth-item is-progress">
            <time>${escapeHtml(date)}</time>
            <span class="growth-badge">✨ 進步</span>
            <span class="growth-text">${escapeHtml(event.text)}</span>

            <span class="growth-actions">
              <button
                class="link-button"
                type="button"
                data-edit-progress="${escapeHtml(event.id)}"
              >
                編輯
              </button>

              <button
                class="icon-button"
                type="button"
                data-remove-progress="${escapeHtml(event.id)}"
                aria-label="刪除這筆進步"
              >
                ×
              </button>
            </span>
          </li>
        `;
      })
      .join("");
}

/*
 * Level 用階梯線，進步用 ✨ 標在當時的 Level 上
 */
function renderGrowthChart(events) {
  if (!levelChartCanvas) {
    return;
  }

  const chartBox =
    levelChartCanvas.parentElement;

  chartBox.hidden =
    events.length === 0 ||
    typeof Chart === "undefined";

  if (chartBox.hidden) {
    return;
  }

  let currentLevel = 0;

  const points =
    events.map((event) => {
      if (event.type === "level") {
        currentLevel = event.levelValue;
      }

      return { ...event, level: currentLevel };
    });

  if (levelChartInstance) {
    levelChartInstance.destroy();
  }

  levelChartInstance =
    new Chart(
      levelChartCanvas,
      {
        type: "line",

        data: {
          labels: points.map(
            (point) => point.date.toLocaleDateString("zh-TW")
          ),

          datasets: [
            {
              label: "Level",
              data: points.map((point) => point.level),
              stepped: true,
              fill: false,
              borderColor: "#315f65",
              backgroundColor: "#315f65",
              pointRadius: points.map((point) => (point.type === "level" ? 5 : 0)),
              pointHoverRadius: points.map((point) => (point.type === "level" ? 7 : 0))
            },
            {
              label: "✨ 進步",
              data: points.map((point) => (point.type === "progress" ? point.level : null)),
              showLine: false,
              pointStyle: "star",
              pointRadius: 9,
              pointHoverRadius: 12,
              borderWidth: 2,
              borderColor: "#c99a1c",
              backgroundColor: "#f4d35e"
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: true
            },

            tooltip: {
              callbacks: {
                label: (context) => {
                  const point =
                    points[context.dataIndex];

                  if (context.datasetIndex === 1) {
                    return `✨ ${point.text}`;
                  }

                  if (point.type === "level") {
                    const level =
                      getLevelByValue(point.level);

                    return `⬆️ ${level ? `Lv.${level.value} ${level.name}` : `Lv.${point.level}`}${point.text ? `：${point.text}` : ""}`;
                  }

                  return `Lv.${point.level}`;
                }
              }
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
   社員自己記錄進步
   ========================================================= */

function resetProgressForm() {
  editingProgressId = null;

  progressText.value = "";
  progressDate.value = todayString();

  progressSubmit.textContent = "記錄進步";
  progressCancel.hidden = true;
}

progressCancel?.addEventListener("click", resetProgressForm);

progressForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    const date =
      progressDate.value;

    const text =
      progressText.value.trim();

    if (!parseDateString(date) || !text) {
      showStatus(progressStatus, "請填寫日期和進步內容。", "error");
      return;
    }

    if (date > todayString()) {
      showStatus(progressStatus, "還沒發生的進步先別記 😂", "error");
      return;
    }

    progressSubmit.disabled = true;

    try {
      if (editingProgressId) {
        await updateDoc(
          doc(db, "users", currentUser.uid, "progress", editingProgressId),
          {
            date,
            text,
            updatedAt: serverTimestamp()
          }
        );
      } else {
        await addDoc(
          collection(db, "users", currentUser.uid, "progress"),
          {
            date,
            text,
            createdAt: serverTimestamp()
          }
        );
      }

      showStatus(
        progressStatus,
        editingProgressId ? "進步紀錄已更新。" : "記下來了 ✨",
        "success"
      );

      resetProgressForm();

      await loadProgressEntries();
    } catch (error) {
      console.error(
        "進步紀錄儲存失敗：",
        error
      );

      showStatus(
        progressStatus,
        `儲存失敗：${getWriteErrorMessage(error)}`,
        "error"
      );
    } finally {
      progressSubmit.disabled = false;
    }
  }
);

growthTimeline?.addEventListener(
  "click",

  async (event) => {
    const editButton =
      event.target.closest("[data-edit-progress]");

    const removeButton =
      event.target.closest("[data-remove-progress]");

    if (editButton) {
      const entry =
        progressEntries.find((item) => item.id === editButton.dataset.editProgress);

      if (!entry) {
        return;
      }

      editingProgressId = entry.id;

      progressDate.value = entry.date;
      progressText.value = entry.text;

      progressSubmit.textContent = "更新";
      progressCancel.hidden = false;

      progressText.focus();

      return;
    }

    if (!removeButton) {
      return;
    }

    const entry =
      progressEntries.find((item) => item.id === removeButton.dataset.removeProgress);

    if (
      !entry ||
      !window.confirm(`要刪除「${entry.text}」這筆進步紀錄嗎？`)
    ) {
      return;
    }

    removeButton.disabled = true;

    try {
      await deleteDoc(
        doc(db, "users", currentUser.uid, "progress", entry.id)
      );

      if (editingProgressId === entry.id) {
        resetProgressForm();
      }

      showStatus(progressStatus, "已刪除這筆進步紀錄。");

      await loadProgressEntries();
    } catch (error) {
      console.error(
        "刪除進步紀錄失敗：",
        error
      );

      removeButton.disabled = false;

      showStatus(
        progressStatus,
        `刪除失敗：${getWriteErrorMessage(error)}`,
        "error"
      );
    }
  }
);

if (progressDate) {
  progressDate.value = todayString();
  progressDate.max = todayString();
}

/* =========================================================
   我的待繳
   ========================================================= */

let myPayments = [];

async function loadMyFees() {
  try {
    myPayments =
      await loadMyPayments(db, currentUser.uid);
  } catch (error) {
    /*
     * 費用只是補充資訊，讀不到就不顯示
     */
    console.error(
      "待繳費用讀取失敗：",
      error
    );

    myPayments = [];
  }

  renderMyFees();
}

function renderMyFees() {
  const outstanding =
    myPayments.filter(isOutstanding);

  myFees.hidden =
    outstanding.length === 0;

  if (outstanding.length === 0) {
    return;
  }

  const unpaidTotal =
    outstanding
      .filter((payment) => payment.status === "unpaid")
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);

  myFees.innerHTML = `
    <p class="eyebrow">FEES</p>

    <div class="my-points-header">
      <h2>我的待繳</h2>
      <strong class="my-fees-total">${formatMoney(unpaidTotal)}</strong>
    </div>

    <ul class="my-fees-list">
      ${outstanding.map((payment) => {
        const isOverdue =
          payment.dueDate &&
          payment.dueDate < todayString() &&
          payment.status === "unpaid";

        return `
          <li class="${isOverdue ? "is-overdue" : ""}">
            <div class="my-fee-main">
              <strong>${escapeHtml(payment.title)}</strong>
              <span class="my-fee-amount">${formatMoney(payment.amount)}</span>
            </div>

            <p class="my-fee-meta">
              <span class="fee-chip is-${PAYMENT_STATUS[payment.status].tone}">
                ${escapeHtml(PAYMENT_STATUS[payment.status].label)}
              </span>
              ${payment.dueDate
                ? `<span>${isOverdue ? "⚠️ 已過期限" : "期限"} ${escapeHtml(payment.dueDate.replaceAll("-", "/"))}</span>`
                : ""}
              ${payment.status === "reported" && payment.reportNote
                ? `<span>你回報的：${escapeHtml(payment.reportNote)}</span>`
                : ""}
            </p>

            ${payment.note ? `<p class="my-fee-note">${escapeHtml(payment.note)}</p>` : ""}

            <form
              class="inline-form my-fee-report"
              data-report-payment="${escapeHtml(payment.id)}"
            >
              <input
                type="text"
                maxlength="30"
                placeholder="轉帳帳號末五碼或備註"
                aria-label="轉帳帳號末五碼或備註"
                value="${escapeHtml(payment.status === "reported" ? payment.reportNote || "" : "")}"
                required
              >

              <button
                class="button button-small"
                type="submit"
              >
                ${payment.status === "reported" ? "更新回報" : "回報已轉帳"}
              </button>
            </form>
          </li>
        `;
      }).join("")}
    </ul>

    <p class="panel-hint">
      轉帳後按「回報已轉帳」，幹部確認後就會從這裡消失。
    </p>
  `;
}

myFees?.addEventListener(
  "submit",

  async (event) => {
    const form =
      event.target.closest("[data-report-payment]");

    if (!form) {
      return;
    }

    event.preventDefault();

    const button =
      form.querySelector("button");

    const note =
      form.querySelector("input").value.trim();

    if (!note) {
      return;
    }

    button.disabled = true;
    button.textContent = "回報中……";

    try {
      await reportPayment(db, form.dataset.reportPayment, note);

      const payment =
        myPayments.find((item) => item.id === form.dataset.reportPayment);

      payment.status = "reported";
      payment.reportNote = note;

      renderMyFees();

      showStatus(
        memberStatus,
        `已回報「${payment.title}」，等幹部確認 🙏`,
        "success"
      );
    } catch (error) {
      console.error(
        "回報轉帳失敗：",
        error
      );

      button.disabled = false;
      button.textContent = "回報已轉帳";

      showStatus(
        memberStatus,
        `回報失敗：${getWriteErrorMessage(error)}`,
        "error"
      );
    }
  }
);

/* =========================================================
   我的積分
   ========================================================= */

async function loadMyPoints() {
  let records = [];

  try {
    [records] =
      await Promise.all([
        loadPointRecords(db, currentUser.uid),
        loadPointRules(db)
      ]);
  } catch (error) {
    console.error(
      "加減分紀錄讀取失敗：",
      error
    );
  }

  renderMyPoints(records);
}

function renderMyPoints(records) {
  const stats =
    currentUserData.pointStats;

  if (!stats) {
    myPoints.innerHTML = `
      <p class="eyebrow">POINTS</p>
      <h2>我的積分</h2>
      <p class="empty-state">
        積分還沒計算，幹部更新排行榜後就會出現。
      </p>
    `;

    return;
  }

  const rules =
    getPointRules();

  const adjust =
    getAdjustPoints(currentUserData);

  const bonus =
    getBonusPoints(currentUserData);

  const lines = [
    ["🌊 參加出團", `${stats.trips || 0} 次`, (stats.trips || 0) * rules.trip],
    ["🏄 自己打卡下水", `${stats.checkins || 0} 次`, (stats.checkins || 0) * rules.checkin],
    stats.lights ? ["🌅 開燈／關燈", "", stats.lights] : null,
    ["📈 升級", `${stats.levelUps || 0} 級`, (stats.levelUps || 0) * rules.levelUp],
    adjust !== 0 || records.length > 0 ? ["⚖️ 加減分", `${stats.records || 0} 筆`, adjust] : null,
    bonus > 0 ? ["🙌 幹部加分", "", bonus] : null
  ].filter(Boolean);

  const since =
    stats.since || currentUserData.pointsSince || "";

  const updatedAt =
    stats.computedAt
      ? new Date(stats.computedAt).toLocaleString("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
      : "";

  myPoints.innerHTML = `
    <p class="eyebrow">POINTS</p>

    <div class="my-points-header">
      <h2>我的積分</h2>
      <strong class="my-points-total">${getTotalPoints(currentUserData)}<small> 分</small></strong>
    </div>

    <ul class="my-points-lines">
      ${lines.map(([label, count, points]) => `
        <li>
          <span>${escapeHtml(label)}</span>
          <span class="my-points-count">${escapeHtml(count)}</span>
          <strong class="${points < 0 ? "is-minus" : ""}">${points === 0 ? "0" : formatSignedPoints(points)}</strong>
        </li>
      `).join("")}
    </ul>

    <p class="panel-hint">
      ${since ? `從 ${escapeHtml(since.replaceAll("-", "/"))} 開始累積。` : ""}
      ${updatedAt ? `上次更新：${escapeHtml(updatedAt)}。` : ""}
      打卡的分數會在幹部更新排行榜時算進來。
      <a href="./leaderboard.html">積分怎麼算？</a>
    </p>

    ${records.length > 0
      ? `<details class="growth-details">
          <summary>我的加減分紀錄（${records.length} 筆）</summary>
          <ol class="growth-timeline">
            ${records.map((record) => {
              const isOld =
                String(record.date) < since;

              return `
                <li class="growth-item ${isOld ? "is-old" : ""}">
                  <time>${escapeHtml(String(record.date).replaceAll("-", "/"))}</time>
                  <span class="growth-badge ${Number(record.points) < 0 ? "is-minus" : "is-plus"}">
                    ${formatSignedPoints(Number(record.points))}
                  </span>
                  <span class="growth-text">
                    <strong>${escapeHtml(record.name)}</strong>
                    ${record.note ? `<small>${escapeHtml(record.note)}</small>` : ""}
                    ${isOld ? "<small>（在積分起算日之前，不計分）</small>" : ""}
                  </span>
                </li>
              `;
            }).join("")}
          </ol>
        </details>`
      : ""}
  `;
}

/* =========================================================
   最近一次出團
   ========================================================= */

async function loadLatestTrip() {
  try {
    const [trip] =
      await loadTrips(db, 1);

    if (!trip) {
      return;
    }

    const isToday =
      trip.date === todayString();

    const joined =
      getParticipants(trip).includes(currentUser.uid);

    const renderTrip = (levelUps) => {
      latestTrip.innerHTML = `
        <p class="eyebrow">
          ${isToday ? "今天的衝浪社" : "最近一次出團"}
        </p>

        <h2>
          ${renderTripTitle(trip)}
          ${joined ? `<span class="trip-joined">你有參加</span>` : ""}
        </h2>

        ${trip.spot ? `<p class="panel-hint">📍 ${escapeHtml(trip.spot)}</p>` : ""}

        ${renderTripFacts(trip, levelUps)}

        ${renderQuote(trip)}

        ${renderTripLinks(trip)}

        <a
          class="button button-small button-secondary"
          href="./memories.html#trip-${encodeURIComponent(trip.id)}"
        >
          看完整紀錄
        </a>
      `;
    };

    renderTrip(null);
    latestTrip.hidden = false;

    renderTrip(await loadTripLevelUps(db, trip));
  } catch (error) {
    /*
     * 出團紀錄只是補充資訊，讀不到就不顯示
     */
    console.error(
      "出團紀錄載入失敗：",
      error
    );
  }
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
