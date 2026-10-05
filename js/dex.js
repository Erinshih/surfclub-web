/* =========================================================
   檔案：js/dex.js
   社員圖鑑：依等級瀏覽所有社員
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

import {
  applyAdminNav
} from "./admin-nav.js";

import {
  LEVELS,
  getLevel
} from "./levels.js";

import {
  escapeHtml,
  getBasicInfoItems,
  getInitial,
  getJoinDate,
  getProfile,
  getSemesterStart,
  getSurfProfileItems,
  loadCheckinStats,
  loadLevelHistory,
  renderCardHero,
  renderInfoList,
  renderLevelPath,
  sortMemories
} from "./member-card.js";

/* =========================================================
   DOM
   ========================================================= */

const dexStatus =
  document.querySelector("#dexStatus");

const dexLevels =
  document.querySelector("#dexLevels");

const dexDetail =
  document.querySelector("#dexDetail");

const memberDialog =
  document.querySelector("#memberDialog");

const memberDialogContent =
  document.querySelector("#memberDialogContent");

const closeMemberDialog =
  document.querySelector("#closeMemberDialog");

const logoutButton =
  document.querySelector("#logoutButton");

/* =========================================================
   狀態
   ========================================================= */

/*
 * value 0 代表還沒被設定 Level 的社員
 */
const UNRANKED = {
  value: 0,
  name: "尚未分級",
  emoji: "🌊",
  color: "#8a9ea1",
  tagline: "還在等幹部幫忙鑑定的神秘物種。",
  requirements: []
};

const DEX_GROUPS = [
  ...LEVELS,
  UNRANKED
];

let allMembers = [];
let selectedValue = null;
const newbornCache = new Map();

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

    try {
      const currentUserSnapshot =
        await getDoc(doc(db, "users", user.uid));

      const currentUserData =
        currentUserSnapshot.data() || {};

      const isAdmin =
        currentUserData.role === "admin";

      const isApprovedMember =
        currentUserData.role === "member" &&
        currentUserData.status === "approved";

      if (!isAdmin && !isApprovedMember) {
        window.location.replace("./pending.html");
        return;
      }

      if (isAdmin) {
        applyAdminNav();
      }

      await loadMembers();

      const initialValue =
        getValueFromHash() ??
        getLevel(currentUserData.level)?.value ??
        LEVELS[0].value;

      selectLevel(initialValue);

      dexStatus.hidden = true;
    } catch (error) {
      console.error(
        "圖鑑載入失敗：",
        error
      );

      showStatus(
        `圖鑑載入失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

async function loadMembers() {
  const snapshot =
    await getDocs(
      query(
        collection(db, "users"),
        where("status", "==", "approved")
      )
    );

  allMembers =
    snapshot.docs
      .map((documentSnapshot) => {
        const data =
          documentSnapshot.data();

        return {
          uid: documentSnapshot.id,
          data,
          levelValue: getLevel(data.level)?.value || 0,
          joinDate: getJoinDate(data)
        };
      })
      .sort((first, second) =>
        (first.joinDate?.getTime() ?? Infinity) -
        (second.joinDate?.getTime() ?? Infinity)
      );

  /*
   * 圖鑑編號：依入社順序
   */
  allMembers.forEach((member, index) => {
    member.number = index + 1;
  });

  renderLevelCards();
}

/* =========================================================
   等級總覽
   ========================================================= */

function getMembersOfLevel(value) {
  return allMembers.filter(
    (member) => member.levelValue === value
  );
}

function renderLevelCards() {
  dexLevels.innerHTML =
    DEX_GROUPS
      .filter((group) =>
        group.value !== 0 ||
        getMembersOfLevel(0).length > 0
      )
      .map((group) => `
        <button
          class="dex-level-card"
          type="button"
          data-level-value="${group.value}"
          style="--level-color: ${group.color}"
        >
          <span class="dex-level-emoji">${group.emoji}</span>
          <span class="dex-level-name">
            ${group.value ? `Lv.${group.value} ` : ""}${escapeHtml(group.name)}
          </span>
          <strong>${getMembersOfLevel(group.value).length} 人</strong>
        </button>
      `)
      .join("");
}

dexLevels?.addEventListener(
  "click",

  (event) => {
    const card =
      event.target.closest("[data-level-value]");

    if (!card) {
      return;
    }

    const value =
      Number(card.dataset.levelValue);

    history.replaceState(null, "", `#lv${value}`);

    selectLevel(value);
  }
);

window.addEventListener(
  "hashchange",

  () => {
    const value =
      getValueFromHash();

    if (value !== null) {
      selectLevel(value);
    }
  }
);

function getValueFromHash() {
  const match =
    window.location.hash.match(/^#lv(\d)$/);

  if (!match) {
    return null;
  }

  const value =
    Number(match[1]);

  return DEX_GROUPS.some((group) => group.value === value)
    ? value
    : null;
}

/* =========================================================
   等級詳細頁
   ========================================================= */

function selectLevel(value) {
  const group =
    DEX_GROUPS.find((item) => item.value === value);

  if (!group) {
    return;
  }

  selectedValue = value;

  dexLevels
    .querySelectorAll("[data-level-value]")
    .forEach((card) => {
      card.classList.toggle(
        "active",
        Number(card.dataset.levelValue) === value
      );
    });

  const members =
    getMembersOfLevel(value);

  dexDetail.hidden = false;
  dexDetail.style.setProperty("--level-color", group.color);

  dexDetail.innerHTML = `
    <header class="dex-detail-header">
      <span class="dex-detail-emoji">${group.emoji}</span>

      <div>
        <p class="leaderboard-section-eyebrow">
          ${group.value ? `LEVEL ${group.value}` : "UNRANKED"}
        </p>

        <h2>${escapeHtml(group.name)}圖鑑</h2>

        <p class="level-tagline">「${escapeHtml(group.tagline)}」</p>
      </div>
    </header>

    <dl class="dex-stats">
      <div>
        <dt>本社目前</dt>
        <dd><strong>${members.length}</strong> 隻</dd>
      </div>

      ${group.value
        ? `<div>
            <dt>本學期新誕生</dt>
            <dd id="dexNewborn"><strong>…</strong></dd>
          </div>`
        : ""}

      <div>
        <dt>平均入社</dt>
        <dd>${formatAverageMonths(members)}</dd>
      </div>
    </dl>

    ${group.requirements.length > 0
      ? `<section class="dex-requirements">
          <h3>升上${escapeHtml(group.name)}的條件</h3>
          <ul>
            ${group.requirements.map((requirement) => `
              <li>${escapeHtml(requirement.text)}</li>
            `).join("")}
          </ul>
        </section>`
      : ""}

    ${members.length > 0
      ? `<ul class="dex-grid">
          ${members.map(renderDexEntry).join("")}
        </ul>`
      : `<p class="empty-state">目前還沒有社員是${escapeHtml(group.name)}，說不定下一隻就是你。</p>`}
  `;

  if (group.value) {
    renderNewbornCount(group, members);
  }
}

function renderDexEntry(member) {
  const profile =
    getProfile(member.data);

  return `
    <li>
      <button
        class="dex-entry"
        type="button"
        data-uid="${escapeHtml(member.uid)}"
      >
        <span class="dex-entry-number">
          No.${String(member.number).padStart(3, "0")}
        </span>

        <span class="character-avatar" aria-hidden="true">
          ${escapeHtml(getInitial(member.data))}
        </span>

        <strong>${escapeHtml(member.data.name || "未命名社員")}</strong>

        <span class="dex-entry-meta">
          ${escapeHtml(profile.nickname || member.data.family || "")}
        </span>
      </button>
    </li>
  `;
}

function formatAverageMonths(members) {
  const dates =
    members
      .map((member) => member.joinDate)
      .filter(Boolean);

  if (dates.length === 0) {
    return "—";
  }

  const averageMonths =
    dates.reduce(
      (sum, date) => sum + (Date.now() - date.getTime()),
      0
    ) / dates.length / (1000 * 60 * 60 * 24 * 30.44);

  return `<strong>${averageMonths.toFixed(1)}</strong> 個月`;
}

/*
 * 本學期升上這一級的人數：讀取該等級社員的升級紀錄
 */
async function renderNewbornCount(group, members) {
  if (!newbornCache.has(group.value)) {
    const semesterStart =
      getSemesterStart();

    newbornCache.set(
      group.value,
      Promise.all(
        members.map(async (member) => {
          const history =
            await loadLevelHistory(db, member.uid);

          const reachedAt =
            history
              .find((item) => Number(item.levelValue) === group.value)
              ?.unlockedAt
              ?.toDate?.();

          return reachedAt && reachedAt >= semesterStart;
        })
      ).then((results) => results.filter(Boolean).length)
    );
  }

  let text;

  try {
    text =
      `<strong>${await newbornCache.get(group.value)}</strong> 隻`;
  } catch (error) {
    console.error(
      "升級紀錄讀取失敗：",
      error
    );

    newbornCache.delete(group.value);

    text = "—";
  }

  const target =
    document.querySelector("#dexNewborn");

  if (target && selectedValue === group.value) {
    target.innerHTML = text;
  }
}

/* =========================================================
   社員角色卡（唯讀）
   ========================================================= */

dexDetail?.addEventListener(
  "click",

  (event) => {
    const entry =
      event.target.closest("[data-uid]");

    if (!entry) {
      return;
    }

    const member =
      allMembers.find((item) => item.uid === entry.dataset.uid);

    if (member) {
      openMemberCard(member);
    }
  }
);

async function openMemberCard(member) {
  memberDialogContent.innerHTML =
    renderMemberCard(member.data, {}, null);

  memberDialog.showModal();

  try {
    const [stats, history] =
      await Promise.all([
        loadCheckinStats(db, member.uid),
        loadLevelHistory(db, member.uid)
      ]);

    if (!memberDialog.open) {
      return;
    }

    memberDialogContent.innerHTML =
      renderMemberCard(
        member.data,
        { ...stats, levelUps: history.length },
        history
      );
  } catch (error) {
    console.error(
      "角色卡資料載入失敗：",
      error
    );
  }
}

function renderMemberCard(data, stats, history) {
  const profile =
    getProfile(data);

  const memories =
    sortMemories(profile.memories);

  const goals =
    profile.goals;

  return `
    <section class="character-card">
      ${renderCardHero(data, stats)}
    </section>

    <div class="character-panel-grid">
      <section class="character-panel">
        <h3>基本資料</h3>
        ${renderInfoList(getBasicInfoItems(data))}
      </section>

      <section class="character-panel">
        <h3>衝浪檔案</h3>
        ${renderInfoList(getSurfProfileItems(data))}
      </section>
    </div>

    ${goals.length > 0
      ? `<section class="character-panel">
          <h3>今年目標</h3>
          <ul class="check-list">
            ${goals.map((goal) => `
              <li>${goal.done ? "✅" : "⬜"} ${escapeHtml(goal.text)}</li>
            `).join("")}
          </ul>
        </section>`
      : ""}

    <section class="character-panel">
      <h3>升級紀錄</h3>
      ${history ? renderLevelPath(history) : `<p class="empty-state">載入中……</p>`}
    </section>

    ${memories.length > 0
      ? `<section class="character-panel">
          <h3>回憶／事件</h3>
          <ol class="memory-list">
            ${memories.map((memory) => `
              <li>
                <time>${escapeHtml(memory.date)}</time>
                <span>${escapeHtml(memory.text)}</span>
              </li>
            `).join("")}
          </ol>
        </section>`
      : ""}
  `;
}

closeMemberDialog?.addEventListener(
  "click",
  () => memberDialog.close()
);

memberDialog?.addEventListener(
  "click",

  (event) => {
    /*
     * 點對話框外面的背景也可以關閉
     */
    if (event.target === memberDialog) {
      memberDialog.close();
    }
  }
);

/* =========================================================
   共用
   ========================================================= */

function showStatus(message, type = "") {
  dexStatus.hidden = false;
  dexStatus.textContent = message;
  dexStatus.className = "status-message";

  if (type) {
    dexStatus.classList.add(type);
  }
}

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
    }
  }
);
