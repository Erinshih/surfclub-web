/* =========================================================
   檔案：js/review.js
   年度回顧：自動統計一整年的社團紀錄
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
  LEVELS
} from "./levels.js";

import {
  escapeHtml,
  getJoinDate,
  getProfile,
  loadLevelHistory
} from "./member-card.js";

import {
  formatTripDate,
  getParticipants,
  loadApprovedMembers,
  loadTrips
} from "./trips.js";

/* =========================================================
   DOM
   ========================================================= */

const reviewTitle =
  document.querySelector("#reviewTitle");

const reviewYearNav =
  document.querySelector("#reviewYearNav");

const reviewStatus =
  document.querySelector("#reviewStatus");

const reviewContent =
  document.querySelector("#reviewContent");

const logoutButton =
  document.querySelector("#logoutButton");

const currentYear =
  new Date().getFullYear();

const year = (() => {
  const value =
    Number(new URLSearchParams(window.location.search).get("year"));

  return Number.isInteger(value) && value >= 2000 && value <= currentYear
    ? value
    : currentYear;
})();

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

      renderHeader();

      const stats =
        await loadYearStats();

      reviewContent.innerHTML =
        renderReview(stats);

      reviewStatus.hidden = true;
    } catch (error) {
      console.error(
        "年度回顧載入失敗：",
        error
      );

      reviewStatus.textContent =
        `年度回顧載入失敗：${error?.message || "未知錯誤"}`;

      reviewStatus.className =
        "status-message error";
    }
  }
);

function renderHeader() {
  document.title =
    `${year} 年度回顧｜Surf Club`;

  reviewTitle.textContent =
    `${year} Surf Club 年度回顧`;

  reviewYearNav.innerHTML = `
    <a
      class="button button-small button-secondary"
      href="./review.html?year=${year - 1}"
    >
      ← ${year - 1}
    </a>

    ${year < currentYear
      ? `<a
          class="button button-small button-secondary"
          href="./review.html?year=${year + 1}"
        >
          ${year + 1} →
        </a>`
      : ""}

    <a
      class="button button-small"
      href="./memories.html"
    >
      回憶牆
    </a>
  `;
}

/* =========================================================
   統計
   ========================================================= */

async function loadYearStats() {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [membersMap, allTrips] =
    await Promise.all([
      loadApprovedMembers(db),
      loadTrips(db)
    ]);

  const trips =
    allTrips.filter((trip) =>
      String(trip.date || "").startsWith(`${year}-`)
    );

  const members =
    await Promise.all(
      [...membersMap.entries()].map(async ([uid, data]) => {
        const [checkinSnapshot, history] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "users", uid, "checkins"),
                where("date", ">=", yearStart),
                where("date", "<=", yearEnd)
              )
            ),
            loadLevelHistory(db, uid)
          ]);

        return {
          uid,
          data,
          checkins: checkinSnapshot.docs.map((checkin) => checkin.data()),
          levelUps: history.filter((item) =>
            item.unlockedAt?.toDate?.()?.getFullYear() === year &&
            Number(item.levelValue) > 0
          )
        };
      })
    );

  const allCheckins =
    members.flatMap((member) => member.checkins);

  /*
   * 浪點：優先用打卡紀錄，沒有的話用出團紀錄
   */
  const spotCounts =
    countBy(
      allCheckins.length > 0
        ? allCheckins.map((checkin) => checkin.spot)
        : trips.map((trip) => trip.spot)
    );

  const biggestTrip =
    [...trips].sort((first, second) =>
      getParticipants(second).length - getParticipants(first).length
    )[0];

  const newPerLevel =
    LEVELS
      .map((level) => ({
        level,
        count: members.filter((member) =>
          member.levelUps.some((item) => Number(item.levelValue) === level.value)
        ).length
      }))
      .filter((item) => item.count > 0);

  return {
    memberCount: membersMap.size,

    newMembers: members.filter((member) =>
      getJoinDate(member.data)?.getFullYear() === year
    ).length,

    totalSessions: allCheckins.length,

    dawnSessions: allCheckins.filter((checkin) => checkin.dawn === true).length,

    duskSessions: allCheckins.filter((checkin) => checkin.dusk === true).length,

    /*
     * Lv.1 是入社，不算升級
     */
    levelUpMembers: members.filter((member) =>
      member.levelUps.some((item) => Number(item.levelValue) >= 2)
    ).length,

    topSpot: spotCounts[0],

    trips,

    biggestTrip,

    newPerLevel,

    topSurfers:
      members
        .filter((member) => member.checkins.length > 0)
        .sort((first, second) => second.checkins.length - first.checkins.length)
        .slice(0, 3),

    quotes: trips.filter((trip) => trip.quote)
  };
}

function countBy(values) {
  const counts = new Map();

  values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((first, second) => second.count - first.count);
}

/* =========================================================
   畫面
   ========================================================= */

function renderReview(stats) {
  const numbers = [
    ["目前社員", stats.memberCount, "人"],
    ["今年新加入", stats.newMembers, "人"],
    ["總下水紀錄", stats.totalSessions, "次"],
    ["出團", stats.trips.length, "次"],
    ["今年升級", stats.levelUpMembers, "人"],
    ["開燈／關燈", `${stats.dawnSessions}／${stats.duskSessions}`, "次"]
  ];

  return `
    <dl class="review-numbers">
      ${numbers.map(([label, value, unit]) => `
        <div>
          <dt>${label}</dt>
          <dd><strong>${escapeHtml(String(value))}</strong> ${unit}</dd>
        </div>
      `).join("")}
    </dl>

    <div class="review-grid">
      <section class="character-panel">
        <h2>🏝️ 最多人去的浪點</h2>
        ${stats.topSpot
          ? `<p class="review-big">${escapeHtml(stats.topSpot.name)}</p>
             <p class="panel-hint">${stats.topSpot.count} 次</p>`
          : `<p class="empty-state">今年還沒有浪點紀錄。</p>`}
      </section>

      <section class="character-panel">
        <h2>👥 年度最大團</h2>
        ${stats.biggestTrip
          ? `<p class="review-big">${getParticipants(stats.biggestTrip).length} 人</p>
             <p class="panel-hint">
               <a href="./memories.html#trip-${encodeURIComponent(stats.biggestTrip.id)}">
                 ${escapeHtml(formatTripDate(stats.biggestTrip.date))}
                 ${escapeHtml(stats.biggestTrip.title || stats.biggestTrip.spot || "出團")}
               </a>
             </p>`
          : `<p class="empty-state">今年還沒有出團紀錄。</p>`}
      </section>

      <section class="character-panel">
        <h2>🌱 今年的新物種</h2>
        ${stats.newPerLevel.length > 0
          ? `<ul class="review-list">
              ${stats.newPerLevel.map(({ level, count }) => `
                <li>今年新增 <strong>${count}</strong> 位 ${level.emoji} ${escapeHtml(level.name)}</li>
              `).join("")}
            </ul>`
          : `<p class="empty-state">今年還沒有升級紀錄。</p>`}
      </section>

      <section class="character-panel">
        <h2>🌊 年度下水王</h2>
        ${stats.topSurfers.length > 0
          ? `<ol class="review-list">
              ${stats.topSurfers.map((member, index) => `
                <li>
                  ${["🥇", "🥈", "🥉"][index]}
                  ${escapeHtml(getProfile(member.data).nickname || member.data.name || "社員")}
                  <strong>${member.checkins.length}</strong> 次
                </li>
              `).join("")}
            </ol>`
          : `<p class="empty-state">今年還沒有打卡紀錄。</p>`}
      </section>
    </div>

    <section class="character-panel">
      <h2>💬 年度名言</h2>
      ${stats.quotes.length > 0
        ? `<ul class="review-quotes">
            ${stats.quotes.map((trip) => `
              <li>
                <blockquote class="trip-quote">
                  <p>${escapeHtml(trip.quote)}</p>
                  <cite>
                    ${trip.quoteBy ? `— ${escapeHtml(trip.quoteBy)}，` : ""}
                    ${escapeHtml(formatTripDate(trip.date))} ${escapeHtml(trip.title || "")}
                  </cite>
                </blockquote>
              </li>
            `).join("")}
          </ul>`
        : `<p class="empty-state">今年還沒有名言，下一句就等你說了。</p>`}
    </section>

    <section class="character-panel">
      <h2>📅 今年的每一團</h2>
      ${stats.trips.length > 0
        ? `<ul class="review-list">
            ${stats.trips.map((trip) => `
              <li>
                <a href="./memories.html#trip-${encodeURIComponent(trip.id)}">
                  ${escapeHtml(formatTripDate(trip.date))}
                  ${escapeHtml(trip.title || trip.spot || "出團")}
                </a>
                ｜${getParticipants(trip).length} 人
              </li>
            `).join("")}
          </ul>`
        : `<p class="empty-state">今年還沒有出團紀錄。</p>`}
    </section>
  `;
}

/* =========================================================
   登出
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
    }
  }
);
