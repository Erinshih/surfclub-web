/* =========================================================
   檔案：js/memories.js
   回憶牆：所有出團紀錄
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

import {
  escapeHtml
} from "./member-card.js";

import {
  formatTripDate,
  getHighlights,
  getLinks,
  getParticipants,
  loadApprovedMembers,
  loadTripLevelUps,
  loadTrips,
  renderParticipants,
  renderQuote,
  renderTripFacts,
  renderTripLinks,
  renderTripTitle
} from "./trips.js";

/* =========================================================
   DOM
   ========================================================= */

const memoriesStatus =
  document.querySelector("#memoriesStatus");

const reviewLinks =
  document.querySelector("#reviewLinks");

const tripTimeline =
  document.querySelector("#tripTimeline");

const tripDialog =
  document.querySelector("#tripDialog");

const tripDialogContent =
  document.querySelector("#tripDialogContent");

const closeTripDialog =
  document.querySelector("#closeTripDialog");

const logoutButton =
  document.querySelector("#logoutButton");

let currentUid = null;
let trips = [];
let membersMap = new Map();

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

      currentUid = user.uid;

      [trips, membersMap] =
        await Promise.all([
          loadTrips(db),
          loadApprovedMembers(db)
        ]);

      renderReviewLinks();
      renderTimeline();

      memoriesStatus.hidden = true;

      openTripFromHash();
    } catch (error) {
      console.error(
        "回憶牆載入失敗：",
        error
      );

      memoriesStatus.textContent =
        `回憶牆載入失敗：${error?.message || "未知錯誤"}`;

      memoriesStatus.className =
        "status-message error";
    }
  }
);

/* =========================================================
   年度回顧連結
   ========================================================= */

function renderReviewLinks() {
  const years =
    new Set([new Date().getFullYear()]);

  trips.forEach((trip) => {
    const year =
      Number(String(trip.date || "").slice(0, 4));

    if (year) {
      years.add(year);
    }
  });

  reviewLinks.innerHTML =
    [...years]
      .sort((first, second) => second - first)
      .map((year) => `
        <a
          class="button button-small button-secondary"
          href="./review.html?year=${year}"
        >
          📖 ${year} 年度回顧
        </a>
      `)
      .join("");
}

/* =========================================================
   時間軸
   ========================================================= */

function renderTimeline() {
  if (trips.length === 0) {
    tripTimeline.innerHTML = `
      <p class="empty-state">
        還沒有出團紀錄，等幹部記下第一團吧 🌊
      </p>
    `;

    return;
  }

  /*
   * 依月份分組，trips 已經是新到舊
   */
  const groups = new Map();

  trips.forEach((trip) => {
    const month =
      String(trip.date || "").slice(0, 7);

    if (!groups.has(month)) {
      groups.set(month, []);
    }

    groups.get(month).push(trip);
  });

  tripTimeline.innerHTML =
    [...groups.entries()]
      .map(([month, monthTrips]) => {
        const [year, monthNumber] =
          month.split("-");

        return `
          <section class="trip-month">
            <h2>${escapeHtml(year)} 年 ${Number(monthNumber)} 月</h2>

            <div class="trip-grid">
              ${monthTrips.map(renderTripCard).join("")}
            </div>
          </section>
        `;
      })
      .join("");
}

function renderTripCard(trip) {
  const joined =
    getParticipants(trip).includes(currentUid);

  const highlights =
    getHighlights(trip);

  return `
    <button
      class="trip-card"
      type="button"
      data-trip-id="${escapeHtml(trip.id)}"
    >
      <span class="trip-card-date">
        ${escapeHtml(formatTripDate(trip.date))}
      </span>

      <strong>${escapeHtml(trip.title || trip.spot || "出團")}</strong>

      <span class="trip-card-meta">
        ${trip.spot ? `📍 ${escapeHtml(trip.spot)}｜` : ""}${getParticipants(trip).length} 人下水${getLinks(trip).length > 0 ? `｜📷 ${getLinks(trip).length} 個相簿／影片` : ""}
      </span>

      ${highlights[0]
        ? `<span class="trip-card-highlight">${escapeHtml(highlights[0])}</span>`
        : ""}

      ${trip.quote
        ? `<span class="trip-card-quote">「${escapeHtml(trip.quote)}」</span>`
        : ""}

      ${joined ? `<span class="trip-joined">你有參加</span>` : ""}
    </button>
  `;
}

tripTimeline?.addEventListener(
  "click",

  (event) => {
    const card =
      event.target.closest("[data-trip-id]");

    if (card) {
      history.replaceState(null, "", `#trip-${card.dataset.tripId}`);
      openTrip(card.dataset.tripId);
    }
  }
);

/* =========================================================
   單次出團詳細紀錄
   ========================================================= */

function openTripFromHash() {
  const match =
    window.location.hash.match(/^#trip-(.+)$/);

  if (match) {
    openTrip(decodeURIComponent(match[1]));
  }
}

window.addEventListener("hashchange", openTripFromHash);

async function openTrip(tripId) {
  const trip =
    trips.find((item) => item.id === tripId);

  if (!trip) {
    return;
  }

  const render = (levelUps) => `
    <article class="trip-detail">
      <p class="eyebrow">${escapeHtml(trip.date || "")}</p>

      <h2>${renderTripTitle(trip)}</h2>

      ${trip.spot ? `<p class="panel-hint">📍 ${escapeHtml(trip.spot)}</p>` : ""}

      ${renderTripFacts(trip, levelUps)}

      ${renderQuote(trip)}

      ${renderTripLinks(trip)}

      <h3>這天下水的社員</h3>

      ${renderParticipants(trip, membersMap)}
    </article>
  `;

  tripDialogContent.innerHTML =
    render(null);

  if (!tripDialog.open) {
    tripDialog.showModal();
  }

  try {
    const levelUps =
      await loadTripLevelUps(db, trip);

    if (tripDialog.open) {
      tripDialogContent.innerHTML =
        render(levelUps);
    }
  } catch (error) {
    console.error(
      "當天升級紀錄載入失敗：",
      error
    );
  }
}

function closeTrip() {
  tripDialog.close();
}

tripDialog?.addEventListener(
  "close",

  () => {
    if (window.location.hash.startsWith("#trip-")) {
      history.replaceState(null, "", window.location.pathname);
    }
  }
);

closeTripDialog?.addEventListener("click", closeTrip);

tripDialog?.addEventListener(
  "click",

  (event) => {
    if (event.target === tripDialog) {
      closeTrip();
    }
  }
);

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
