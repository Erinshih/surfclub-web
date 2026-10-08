/* =========================================================
   檔案：js/practice.js
   團練：社員報名、取消報名
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
  applyAdminNav
} from "./admin-nav.js";

import {
  escapeHtml,
  getProfile,
  parseDateString,
  toDateString,
  todayString
} from "./member-card.js";

import {
  loadApprovedMembers
} from "./trips.js";

import {
  formatDeadline,
  formatPracticeDate,
  getPracticeState,
  isSignupOpen,
  joinPractice,
  leavePractice,
  loadPractices
} from "./practice-core.js";

/* =========================================================
   DOM
   ========================================================= */

const practiceStatus =
  document.querySelector("#practiceStatus");

const practiceList =
  document.querySelector("#practiceList");

const pastPractices =
  document.querySelector("#pastPractices");

const pastPracticeList =
  document.querySelector("#pastPracticeList");

const logoutButton =
  document.querySelector("#logoutButton");

let currentUid = null;
let practices = [];
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
      const snapshot =
        await getDoc(doc(db, "users", user.uid));

      const data =
        snapshot.data() || {};

      const isAdmin =
        data.role === "admin";

      const isApprovedMember =
        data.role === "member" &&
        data.status === "approved";

      if (!isAdmin && !isApprovedMember) {
        window.location.replace("./pending.html");
        return;
      }

      if (isAdmin) {
        applyAdminNav();
      }

      currentUid =
        user.uid;

      await refresh();

      highlightFromHash();
    } catch (error) {
      console.error(
        "團練載入失敗：",
        error
      );

      showStatus(
        practiceStatus,
        `團練載入失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

async function refresh() {
  /*
   * 顯示今天以後的團，加上最近兩週結束的
   */
  const since =
    parseDateString(todayString());

  since.setDate(since.getDate() - 14);

  [practices, membersMap] =
    await Promise.all([
      loadPractices(db, toDateString(since)),
      loadApprovedMembers(db)
    ]);

  practiceStatus.hidden = true;

  renderLists();
}

/* =========================================================
   列表
   ========================================================= */

function getMemberName(uid) {
  const data =
    membersMap.get(uid);

  return data ? getProfile(data).nickname || data.name || "社員" : "社員";
}

function renderLists() {
  const now =
    new Date();

  /*
   * 接下來的團：還沒開始、沒有取消
   */
  const upcoming =
    practices.filter((practice) => {
      const state = getPracticeState(practice, now).key;
      return state !== "ended" && state !== "failed" && state !== "cancelled";
    });

  const past =
    practices
      .filter((practice) => !upcoming.includes(practice))
      .reverse();

  practiceList.innerHTML =
    upcoming.length > 0
      ? upcoming.map((practice) => renderPracticeCard(practice, now)).join("")
      : `<p class="empty-state">目前沒有開放報名的團練，等幹部開團 🏄</p>`;

  pastPractices.hidden =
    past.length === 0;

  pastPracticeList.innerHTML =
    past.map((practice) => renderPracticeCard(practice, now)).join("");
}

function renderPracticeCard(practice, now) {
  const state =
    getPracticeState(practice, now);

  const participants =
    practice.participants || [];

  const count =
    participants.length;

  const min =
    Number(practice.minParticipants) || 1;

  const max =
    Number(practice.maxParticipants) || count || 1;

  const joined =
    participants.includes(currentUid);

  const isUpcoming =
    state.key === "recruiting" || state.key === "ready" || state.key === "confirmed";

  const signupOpen =
    isSignupOpen(practice, now);

  const actions = [];

  if (isUpcoming && signupOpen) {
    if (joined) {
      actions.push(`<button class="button button-small button-secondary" type="button" data-action="leave" data-id="${escapeHtml(practice.id)}">取消報名</button>`);
    } else if (count < max) {
      actions.push(`<button class="button button-small" type="button" data-action="join" data-id="${escapeHtml(practice.id)}">我要參加</button>`);
    } else {
      actions.push(`<span class="fee-chip is-muted">已額滿</span>`);
    }
  } else if (isUpcoming) {
    actions.push(`<span class="fee-chip is-muted">報名已截止</span>`);
  }

  const percent =
    Math.min(100, Math.round((count / max) * 100));

  const minPercent =
    Math.min(100, Math.round((min / max) * 100));

  return `
    <article
      class="practice-card is-${state.key} ${joined ? "is-joined" : ""}"
      id="practice-${escapeHtml(practice.id)}"
    >
      <header class="practice-card-header">
        <div>
          <strong class="practice-card-date">
            ${escapeHtml(formatPracticeDate(practice))}
            ${escapeHtml(practice.start)}–${escapeHtml(practice.end)}
          </strong>
          <span class="practice-card-time">
            📍 ${escapeHtml(practice.spot || "浪點未定")}
            ${isUpcoming ? `｜報名截止 ${escapeHtml(formatDeadline(practice))}` : ""}
          </span>
        </div>

        <span class="fee-chip is-${state.tone}">${escapeHtml(state.label)}</span>
      </header>

      <div
        class="practice-progress"
        aria-label="${count} / ${max} 人"
      >
        <span class="practice-progress-bar" style="width: ${percent}%"></span>
        <span class="practice-progress-min" style="left: ${minPercent}%" title="成團人數"></span>
      </div>

      <p class="practice-count">
        <strong>${count}</strong> / ${max} 人｜${min} 人成團
        ${joined ? "｜✋ 你已報名" : ""}
      </p>

      ${count > 0
        ? `<p class="practice-people">
            ${participants.map((uid) => `
              <span class="practice-person ${uid === currentUid ? "is-me" : ""}">${escapeHtml(getMemberName(uid))}</span>
            `).join("")}
          </p>`
        : ""}

      ${practice.note ? `<p class="my-fee-note">${escapeHtml(practice.note)}</p>` : ""}

      ${actions.length > 0 ? `<div class="practice-actions">${actions.join("")}</div>` : ""}
    </article>
  `;
}

/* =========================================================
   報名
   ========================================================= */

async function handleAction(action, id) {
  const practice =
    practices.find((item) => item.id === id);

  if (!practice) {
    return;
  }

  if (action === "join") {
    await joinPractice(db, id, currentUid);
    await refresh();

    const updated =
      practices.find((item) => item.id === id);

    const reachedMin =
      updated &&
      (practice.participants || []).length < updated.minParticipants &&
      updated.participants.length >= updated.minParticipants;

    showStatus(
      practiceStatus,
      reachedMin
        ? `🎉 報名成功！已經 ${updated.participants.length} 人，達到成團人數了，等幹部確認。`
        : "報名成功！",
      "success"
    );
  }

  if (action === "leave") {
    if (!window.confirm(`確定要取消報名 ${formatPracticeDate(practice)} ${practice.start} 的團練嗎？`)) {
      return;
    }

    await leavePractice(db, id, currentUid);
    await refresh();

    showStatus(practiceStatus, "已取消報名。");
  }

  practiceStatus.hidden = false;

  highlightPractice(id);
}

document.addEventListener(
  "click",

  async (event) => {
    const button =
      event.target.closest("[data-action][data-id]");

    if (!button) {
      return;
    }

    button.disabled = true;

    try {
      await handleAction(button.dataset.action, button.dataset.id);
    } catch (error) {
      console.error(
        "團練報名失敗：",
        error
      );

      button.disabled = false;

      showStatus(
        practiceStatus,
        error?.code === "permission-denied"
          ? "沒有辦法報名，可能已經額滿、截止或取消了，重新整理看看。"
          : `操作失敗：${error?.message || "未知錯誤"}`,
        "error"
      );

      practiceStatus.hidden = false;
    }
  }
);

/* =========================================================
   連結與共用
   ========================================================= */

function highlightPractice(id) {
  const card =
    document.querySelector(`#practice-${CSS.escape(id)}`);

  if (!card) {
    return;
  }

  card.classList.add("is-highlighted");
  card.scrollIntoView({ behavior: "smooth", block: "center" });

  window.setTimeout(() => card.classList.remove("is-highlighted"), 2500);
}

function highlightFromHash() {
  const match =
    window.location.hash.match(/^#practice-(.+)$/);

  if (match) {
    highlightPractice(decodeURIComponent(match[1]));
  }
}

function showStatus(element, message, type = "") {
  element.textContent = message;
  element.className = "status-message";

  if (type) {
    element.classList.add(type);
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
