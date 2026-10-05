/* =========================================================
   檔案：js/admin-settle.js
   管理員：結算這一期的排行榜，並選擇要歸零積分的社員
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
  loadPeriod
} from "./board-stats.js";

import {
  findLatestSettlement,
  getChangedPoints,
  loadMembers,
  resetPoints,
  settlePeriod,
  undoSettlement
} from "./boards.js";

import {
  escapeHtml,
  getProfile,
  getSemesterLabel,
  getSemesterStart,
  parseDateString,
  toDateString,
  todayString
} from "./member-card.js";

/* =========================================================
   DOM
   ========================================================= */

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const currentPeriodText =
  document.querySelector("#current-period");

const settleForm =
  document.querySelector("#settle-form");

const settleLabel =
  document.querySelector("#settle-label");

const settleEnd =
  document.querySelector("#settle-end");

const settleNextLabel =
  document.querySelector("#settle-next-label");

const settleMessage =
  document.querySelector("#settle-message");

const settleButton =
  document.querySelector("#settle-button");

const resetSection =
  document.querySelector("#reset-section");

const resetList =
  document.querySelector("#reset-list");

const resetMessage =
  document.querySelector("#reset-message");

const resetButton =
  document.querySelector("#reset-button");

const selectScoredButton =
  document.querySelector("#select-scored-button");

const clearSelectionButton =
  document.querySelector("#clear-selection-button");

const undoSection =
  document.querySelector("#undo-section");

const undoSummary =
  document.querySelector("#undo-summary");

const undoRestorePoints =
  document.querySelector("#undo-restore-points");

const undoPointsText =
  document.querySelector("#undo-points-text");

const undoMessage =
  document.querySelector("#undo-message");

const undoButton =
  document.querySelector("#undo-button");

const logoutButton =
  document.querySelector("#logout-button");

let members = [];
let selected = new Set();
let latestArchive = null;

/* =========================================================
   管理員驗證
   ========================================================= */

onAuthStateChanged(
  auth,

  async (user) => {
    if (!user) {
      window.location.replace("./login.html");
      return;
    }

    try {
      const userSnapshot =
        await getDoc(doc(db, "users", user.uid));

      const userData =
        userSnapshot.data() || {};

      if (userData.role !== "admin") {
        window.location.replace(
          userData.status === "pending" || userData.status === "rejected"
            ? "./pending.html"
            : "./member.html"
        );

        return;
      }

      showStatus(
        adminStatus,
        `管理員：${userData.name || user.email || "未命名"}`,
        "success"
      );

      adminContent.classList.remove("hidden");

      await Promise.all([
        renderCurrentPeriod(),
        loadResetList()
      ]);

      await renderUndo();
    } catch (error) {
      console.error(
        "結算頁載入失敗：",
        error
      );

      showStatus(
        adminStatus,
        `載入失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

/* =========================================================
   步驟 1：結算
   ========================================================= */

async function renderCurrentPeriod() {
  const period =
    await loadPeriod(db, { force: true });

  const days =
    Math.max(
      0,
      Math.round((parseDateString(todayString()) - parseDateString(period.start)) / 86400000) + 1
    );

  currentPeriodText.innerHTML = `
    目前這一期：<strong>${escapeHtml(period.label || "未命名")}</strong>，
    從 <strong>${escapeHtml(period.start.replaceAll("-", "/"))}</strong> 開始，到今天共 ${days} 天。
  `;

  settleLabel.value =
    period.label;

  settleEnd.value =
    todayString();

  settleEnd.min =
    period.start;

  settleEnd.max =
    todayString();

  updateNextLabel();
}

/*
 * 預設的下一期名稱：結算日隔天所在的學期
 */
function updateNextLabel() {
  const end =
    parseDateString(settleEnd.value);

  if (!end) {
    return;
  }

  end.setDate(end.getDate() + 1);

  settleNextLabel.value =
    getSemesterLabel(getSemesterStart(end));
}

settleEnd?.addEventListener("change", updateNextLabel);

settleForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    const label =
      settleLabel.value.trim();

    const endDate =
      settleEnd.value;

    const nextLabel =
      settleNextLabel.value.trim();

    if (!label || !endDate || !nextLabel) {
      showStatus(settleMessage, "請填寫這一期名稱、結算日和下一期名稱。", "error");
      return;
    }

    const nextStart =
      parseDateString(endDate);

    nextStart.setDate(nextStart.getDate() + 1);

    const confirmed =
      window.confirm(
        `確定要結算「${label}」嗎？\n\n` +
        `・封存到 ${endDate}（含）為止的榜單和積分排名\n` +
        `・下一期「${nextLabel}」從 ${toDateString(nextStart)} 開始\n` +
        "・不會改動任何人的積分"
      );

    if (!confirmed) {
      return;
    }

    settleButton.disabled = true;
    settleButton.textContent = "結算中……";

    showStatus(settleMessage, "正在統計每位社員這一期的紀錄……");

    try {
      await settlePeriod(db, { label, endDate, nextLabel });

      showStatus(
        settleMessage,
        `「${label}」已封存，可以在排行榜的歷屆榜單查看。下一期從 ${toDateString(nextStart)} 開始。接著在下方選擇要歸零積分的社員。`,
        "success"
      );

      await renderCurrentPeriod();
      await renderUndo();

      resetSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(
        "結算失敗：",
        error
      );

      showStatus(
        settleMessage,
        `結算失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      settleButton.disabled = false;
      settleButton.textContent = "結算並封存";
    }
  }
);

/* =========================================================
   步驟 2：選擇要歸零積分的社員
   ========================================================= */

function getPoints(member) {
  const points =
    Number(member.data.points);

  return Number.isFinite(points) && points > 0
    ? Math.floor(points)
    : 0;
}

async function loadResetList() {
  members =
    (await loadMembers(db))
      .sort((first, second) =>
        getPoints(second) - getPoints(first) ||
        String(first.data.name || "").localeCompare(String(second.data.name || ""), "zh-Hant")
      );

  renderResetList();
}

function renderResetList() {
  if (members.length === 0) {
    resetList.innerHTML = `
      <p class="empty-state">
        目前沒有正式社員。
      </p>
    `;

    return;
  }

  resetList.innerHTML =
    members.map((member) => {
      const nickname =
        getProfile(member.data).nickname;

      return `
        <label class="check-item reset-option">
          <input
            type="checkbox"
            value="${escapeHtml(member.uid)}"
            ${selected.has(member.uid) ? "checked" : ""}
          >

          <span class="reset-name">
            ${escapeHtml(member.data.name || "未命名社員")}
            ${nickname ? `<small>（${escapeHtml(nickname)}）</small>` : ""}
            <small>${escapeHtml(member.data.family || "尚未分配")}</small>
          </span>

          <span class="reset-points">
            <strong>${getPoints(member)}</strong> 分
          </span>
        </label>
      `;
    }).join("");

  updateResetButton();
}

function updateResetButton() {
  resetButton.disabled =
    selected.size === 0;

  resetButton.textContent =
    selected.size > 0
      ? `將勾選的 ${selected.size} 位社員積分歸零`
      : "將勾選的社員積分歸零";
}

resetList?.addEventListener(
  "change",

  (event) => {
    const checkbox =
      event.target;

    if (checkbox.checked) {
      selected.add(checkbox.value);
    } else {
      selected.delete(checkbox.value);
    }

    updateResetButton();
  }
);

selectScoredButton?.addEventListener(
  "click",

  () => {
    members
      .filter((member) => getPoints(member) > 0)
      .forEach((member) => selected.add(member.uid));

    renderResetList();
  }
);

clearSelectionButton?.addEventListener(
  "click",

  () => {
    selected.clear();
    renderResetList();
  }
);

resetButton?.addEventListener(
  "click",

  async () => {
    const targets =
      members.filter((member) => selected.has(member.uid));

    if (targets.length === 0) {
      return;
    }

    const names =
      targets
        .slice(0, 10)
        .map((member) => member.data.name || "未命名社員")
        .join("、");

    const confirmed =
      window.confirm(
        `確定要把這 ${targets.length} 位社員的積分歸零嗎？\n\n` +
        `${names}${targets.length > 10 ? " 等" : ""}\n\n` +
        "歸零後無法復原（結算時已封存的歷屆榜單不受影響）。"
      );

    if (!confirmed) {
      return;
    }

    resetButton.disabled = true;
    resetButton.textContent = "歸零中……";

    try {
      await resetPoints(db, targets.map((member) => member.uid));

      showStatus(
        resetMessage,
        `已將 ${targets.length} 位社員的積分歸零。`,
        "success"
      );

      selected.clear();

      await loadResetList();
      await renderUndo();
    } catch (error) {
      console.error(
        "積分歸零失敗：",
        error
      );

      showStatus(
        resetMessage,
        `歸零失敗：${error?.message || "未知錯誤"}`,
        "error"
      );

      updateResetButton();
    }
  }
);

/* =========================================================
   還原上一次結算
   ========================================================= */

async function renderUndo() {
  try {
    latestArchive =
      await findLatestSettlement(db);
  } catch (error) {
    console.error(
      "讀取上一次結算失敗：",
      error
    );

    latestArchive = null;
  }

  undoSection.hidden =
    !latestArchive;

  if (!latestArchive) {
    return;
  }

  undoSummary.innerHTML = `
    上一次結算：<strong>${escapeHtml(latestArchive.label || "未命名")}</strong>
    （${escapeHtml(String(latestArchive.semester).replaceAll("-", "/"))} ～ ${escapeHtml(String(latestArchive.end).replaceAll("-", "/"))}）
  `;

  const changed =
    getChangedPoints(latestArchive, members);

  if (!latestArchive.pointsSnapshot) {
    undoRestorePoints.checked = false;
    undoRestorePoints.disabled = true;
    undoPointsText.textContent =
      "這次結算是改版前做的，沒有存當時的積分，只能還原期別。";
  } else if (changed.length === 0) {
    undoRestorePoints.checked = false;
    undoRestorePoints.disabled = true;
    undoPointsText.textContent =
      "大家的積分都跟結算當時一樣，不需要還原積分。";
  } else {
    const preview =
      changed
        .slice(0, 5)
        .map((member) =>
          `${member.data.name || "未命名社員"} ${Number(member.data.points) || 0} → ${latestArchive.pointsSnapshot[member.uid]}`
        )
        .join("、");

    undoRestorePoints.disabled = false;
    undoRestorePoints.checked = true;
    undoPointsText.textContent =
      `同時把 ${changed.length} 位社員的積分改回結算當時的分數（${preview}${changed.length > 5 ? "…" : ""}）`;
  }
}

undoButton?.addEventListener(
  "click",

  async () => {
    if (!latestArchive) {
      return;
    }

    const restorePoints =
      undoRestorePoints.checked &&
      !undoRestorePoints.disabled;

    const confirmed =
      window.confirm(
        `確定要還原「${latestArchive.label || "上一次結算"}」嗎？\n\n` +
        `・這一期會改回「${latestArchive.label || ""}」，從 ${latestArchive.semester} 開始\n` +
        "・那一次的歷屆榜單會被刪除\n" +
        (restorePoints ? "・積分會改回結算當時的分數" : "・積分維持現在的分數")
      );

    if (!confirmed) {
      return;
    }

    undoButton.disabled = true;
    undoButton.textContent = "還原中……";

    try {
      const label =
        latestArchive.label;

      const { restoredCount } =
        await undoSettlement(db, latestArchive, { restorePoints, members });

      showStatus(
        undoMessage,
        `已還原「${label || "上一次結算"}」${restoredCount > 0 ? `，並把 ${restoredCount} 位社員的積分改回結算當時` : ""}。打開排行榜時會自動重新計算。`,
        "success"
      );

      await renderCurrentPeriod();
      await loadResetList();
      await renderUndo();

      /*
       * 還原後如果還有更早的結算，區塊會繼續顯示；沒有就把成功訊息留在上面
       */
      if (undoSection.hidden) {
        showStatus(
          settleMessage,
          `已還原「${label || "上一次結算"}」。`,
          "success"
        );
      }
    } catch (error) {
      console.error(
        "還原結算失敗：",
        error
      );

      showStatus(
        undoMessage,
        `還原失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      undoButton.disabled = false;
      undoButton.textContent = "還原上一次結算";
    }
  }
);

/* =========================================================
   共用
   ========================================================= */

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
