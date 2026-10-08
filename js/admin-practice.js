/* =========================================================
   檔案：js/admin-practice.js
   管理員：新增、編輯團練，確認成團，預設值
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
  buildPracticeFields,
  createPractice,
  deletePractice,
  formatDeadline,
  formatPracticeDate,
  getLineShareText,
  getLineShareUrl,
  getPracticeStart,
  getPracticeState,
  getSignupDeadline,
  loadPracticeSettings,
  loadPractices,
  savePracticeSettings,
  setPracticeStatus,
  updatePractice
} from "./practice-core.js";

/* =========================================================
   DOM
   ========================================================= */

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const practiceFormCard =
  document.querySelector("#practice-form-card");

const practiceFormTitle =
  document.querySelector("#practice-form-title");

const practiceForm =
  document.querySelector("#practice-form");

const practiceDate =
  document.querySelector("#practice-date");

const practiceSlot =
  document.querySelector("#practice-slot");

const practiceStart =
  document.querySelector("#practice-start");

const practiceEnd =
  document.querySelector("#practice-end");

const practiceSpot =
  document.querySelector("#practice-spot");

const spotOptions =
  document.querySelector("#spot-options");

const practiceMin =
  document.querySelector("#practice-min");

const practiceMax =
  document.querySelector("#practice-max");

const practiceDeadline =
  document.querySelector("#practice-deadline");

const practiceNote =
  document.querySelector("#practice-note");

const practiceFormMessage =
  document.querySelector("#practice-form-message");

const practiceFormCancel =
  document.querySelector("#practice-form-cancel");

const practiceSubmit =
  document.querySelector("#practice-submit");

const practiceList =
  document.querySelector("#admin-practice-list");

const practiceListMessage =
  document.querySelector("#practice-list-message");

const pastPractices =
  document.querySelector("#admin-past-practices");

const pastPracticeList =
  document.querySelector("#admin-past-practice-list");

const settingsForm =
  document.querySelector("#practice-settings-form");

const settingMin =
  document.querySelector("#setting-min");

const settingMax =
  document.querySelector("#setting-max");

const settingHours =
  document.querySelector("#setting-hours");

const settingSpot =
  document.querySelector("#setting-spot");

const settingSlots =
  document.querySelector("#setting-slots");

const addSlotButton =
  document.querySelector("#add-slot-button");

const settingsMessage =
  document.querySelector("#settings-message");

const saveSettingsButton =
  document.querySelector("#save-settings-button");

const logoutButton =
  document.querySelector("#logout-button");

let currentAdminUid = null;
let settings = null;
let slots = [];
let practices = [];
let membersMap = new Map();

/* 正在編輯的團練 ID；新增時是 null */
let editingId = null;

/* 管理員有沒有自己改過截止時間；沒改過就跟著日期、時間自動算 */
let deadlineTouched = false;

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

      currentAdminUid =
        user.uid;

      showStatus(
        adminStatus,
        `管理員：${userData.name || user.email || "未命名"}`,
        "success"
      );

      adminContent.classList.remove("hidden");

      [settings] =
        await Promise.all([
          loadPracticeSettings(db),
          refreshPractices()
        ]);

      fillSettings();
      resetPracticeForm();
    } catch (error) {
      console.error(
        "團練管理載入失敗：",
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
   新增、編輯團練
   ========================================================= */

/*
 * Date 轉成 datetime-local 用的 "YYYY-MM-DDTHH:MM"
 */
function toLocalInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return `${toDateString(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultDeadline() {
  const start =
    getPracticeStart({ date: practiceDate.value, start: practiceStart.value });

  if (!start) {
    return "";
  }

  start.setHours(start.getHours() - (Number(settings.closeHoursBefore) || 0));

  return toLocalInputValue(start);
}

function renderSlotOptions() {
  practiceSlot.innerHTML = `
    <option value="">自訂時間</option>
    ${settings.slots.map((slot) => `
      <option value="${escapeHtml(slot.id)}">
        ${escapeHtml(slot.label)} ${escapeHtml(slot.start)}–${escapeHtml(slot.end)}
      </option>
    `).join("")}
  `;

  /*
   * 開始、結束剛好是某個常用時段，就選那個
   */
  const match =
    settings.slots.find((slot) => slot.start === practiceStart.value && slot.end === practiceEnd.value);

  practiceSlot.value =
    match ? match.id : "";
}

function renderSpotOptions() {
  const spots =
    [...new Set([settings.defaultSpot, ...practices.map((practice) => practice.spot)].filter(Boolean))];

  spotOptions.innerHTML =
    spots.map((spot) => `<option value="${escapeHtml(spot)}"></option>`).join("");
}

function resetPracticeForm() {
  editingId = null;
  deadlineTouched = false;

  const tomorrow =
    parseDateString(todayString());

  tomorrow.setDate(tomorrow.getDate() + 1);

  const firstSlot =
    settings.slots[0];

  practiceDate.value = toDateString(tomorrow);
  practiceStart.value = firstSlot?.start || "06:00";
  practiceEnd.value = firstSlot?.end || "08:00";
  practiceSpot.value = settings.defaultSpot;
  practiceMin.value = settings.minParticipants;
  practiceMax.value = settings.maxParticipants;
  practiceNote.value = "";
  practiceDeadline.value = getDefaultDeadline();

  practiceFormTitle.textContent = "新增團練";
  practiceSubmit.textContent = "新增團練";
  practiceFormCancel.hidden = true;

  renderSlotOptions();
  renderSpotOptions();
}

function startEditing(practice) {
  editingId = practice.id;
  deadlineTouched = true;

  practiceDate.value = practice.date;
  practiceStart.value = practice.start;
  practiceEnd.value = practice.end;
  practiceSpot.value = practice.spot || "";
  practiceMin.value = practice.minParticipants;
  practiceMax.value = practice.maxParticipants;
  practiceNote.value = practice.note || "";
  practiceDeadline.value = toLocalInputValue(getSignupDeadline(practice));

  practiceFormTitle.textContent = `編輯 ${formatPracticeDate(practice)} ${practice.start} 的團練`;
  practiceSubmit.textContent = "儲存修改";
  practiceFormCancel.hidden = false;

  showStatus(practiceFormMessage, "");
  renderSlotOptions();

  practiceFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

practiceSlot?.addEventListener(
  "change",

  () => {
    const slot =
      settings.slots.find((item) => item.id === practiceSlot.value);

    if (slot) {
      practiceStart.value = slot.start;
      practiceEnd.value = slot.end;
    }

    if (!deadlineTouched) {
      practiceDeadline.value = getDefaultDeadline();
    }
  }
);

[practiceDate, practiceStart].forEach((input) => {
  input?.addEventListener(
    "change",

    () => {
      if (!deadlineTouched) {
        practiceDeadline.value = getDefaultDeadline();
      }

      renderSlotOptions();
    }
  );
});

practiceEnd?.addEventListener("change", renderSlotOptions);

practiceDeadline?.addEventListener(
  "change",

  () => {
    deadlineTouched = true;
  }
);

practiceFormCancel?.addEventListener(
  "click",

  () => {
    resetPracticeForm();
    showStatus(practiceFormMessage, "");
  }
);

practiceForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    const editing =
      practices.find((practice) => practice.id === editingId);

    const deadline =
      practiceDeadline.value ? new Date(practiceDeadline.value) : null;

    /*
     * 新增的團，截止時間一定要在現在之後，不然社員沒辦法報名
     */
    if (!editing && deadline && deadline <= new Date()) {
      showStatus(practiceFormMessage, "報名截止時間已經過了，請改晚一點，社員才能報名。", "error");
      return;
    }

    let fields;

    try {
      fields =
        buildPracticeFields(
          {
            date: practiceDate.value,
            start: practiceStart.value,
            end: practiceEnd.value,
            spot: practiceSpot.value,
            note: practiceNote.value,
            minParticipants: practiceMin.value,
            maxParticipants: practiceMax.value,
            deadline
          },
          (editing?.participants || []).length
        );
    } catch (error) {
      showStatus(practiceFormMessage, error.message, "error");
      return;
    }

    practiceSubmit.disabled = true;

    try {
      let id = editingId;

      if (editing) {
        await updatePractice(db, editing.id, fields, editing);
      } else {
        id = await createPractice(db, fields, currentAdminUid);
      }

      const message =
        editing
          ? "已儲存修改。"
          : `已新增 ${formatPracticeDate(fields)} ${fields.start} 的團練，社員現在可以報名了。`;

      resetPracticeForm();
      await refreshPractices();

      showStatus(practiceFormMessage, message, "success");
      highlightPractice(id);
    } catch (error) {
      console.error(
        "團練儲存失敗：",
        error
      );

      showStatus(
        practiceFormMessage,
        `儲存失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      practiceSubmit.disabled = false;
    }
  }
);

/* =========================================================
   團練列表
   ========================================================= */

async function refreshPractices() {
  const since =
    parseDateString(todayString());

  since.setDate(since.getDate() - 30);

  [practices, membersMap] =
    await Promise.all([
      loadPractices(db, toDateString(since)),
      loadApprovedMembers(db)
    ]);

  renderPractices();
}

function getMemberName(uid) {
  const data =
    membersMap.get(uid);

  return data ? data.name || getProfile(data).nickname || "社員" : "（已不是社員）";
}

function renderPractices() {
  const now =
    new Date();

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
      : `<p class="empty-state">接下來沒有團練，用上面的表單新增一團。</p>`;

  pastPractices.hidden =
    past.length === 0;

  pastPracticeList.innerHTML =
    past.map((practice) => renderPracticeCard(practice, now)).join("");

  if (settings) {
    renderSpotOptions();
  }
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

  const id =
    escapeHtml(practice.id);

  const actions = [];

  if (state.key === "recruiting" || state.key === "ready") {
    actions.push(`<button class="button button-small" type="button" data-practice-action="confirm" data-id="${id}">確認成團</button>`);
  }

  if (state.key === "confirmed") {
    actions.push(`<button class="link-button" type="button" data-practice-action="reopen" data-id="${id}">改回招募中</button>`);
  }

  /*
   * 人數湊齊了才需要通知教練
   */
  if (state.key === "ready" || state.key === "confirmed") {
    actions.push(`<button class="button button-small practice-line-button" type="button" data-line-share="${id}">${practice.coachNotifiedAt || practice.fullNotifiedAt || practice.deadlineNotifiedAt ? "再用 LINE 通知一次" : "用 LINE 通知教練"}</button>`);
  }

  if (state.key === "recruiting" || state.key === "ready" || state.key === "confirmed") {
    actions.push(`<button class="button button-small button-secondary" type="button" data-practice-action="edit" data-id="${id}">編輯</button>`);
    actions.push(`<button class="link-button practice-cancel" type="button" data-practice-action="cancel" data-id="${id}">取消這團</button>`);
  } else {
    actions.push(`<button class="link-button practice-cancel" type="button" data-practice-action="delete" data-id="${id}">刪除</button>`);
  }

  const percent =
    Math.min(100, Math.round((count / max) * 100));

  const minPercent =
    Math.min(100, Math.round((min / max) * 100));

  return `
    <article
      class="practice-card is-${state.key}"
      id="practice-${id}"
    >
      <header class="practice-card-header">
        <div>
          <strong class="practice-card-date">
            ${escapeHtml(formatPracticeDate(practice))}
            ${escapeHtml(practice.start)}–${escapeHtml(practice.end)}
          </strong>
          <span class="practice-card-time">
            📍 ${escapeHtml(practice.spot || "")}｜報名截止 ${escapeHtml(formatDeadline(practice))}
          </span>
        </div>

        <span class="fee-chip is-${state.tone}">${escapeHtml(state.label)}</span>
      </header>

      <div class="practice-progress">
        <span class="practice-progress-bar" style="width: ${percent}%"></span>
        <span class="practice-progress-min" style="left: ${minPercent}%" title="成團人數"></span>
      </div>

      <p class="practice-count">
        <strong>${count}</strong> / ${max} 人｜${min} 人成團
      </p>

      ${renderNotifiedNote(practice)}

      ${count > 0
        ? `<p class="practice-people">
            ${participants.map((uid) => `<span class="practice-person">${escapeHtml(getMemberName(uid))}</span>`).join("")}
          </p>`
        : `<p class="panel-hint">還沒有人報名。</p>`}

      ${practice.note ? `<p class="my-fee-note">${escapeHtml(practice.note)}</p>` : ""}

      <div class="practice-actions">${actions.join("")}</div>
    </article>
  `;
}

/*
 * LINE 小幫手（line-bot/Code.gs）自動通知後會寫上
 * coachNotifiedAt（人數湊齊）、fullNotifiedAt（額滿）、deadlineNotifiedAt（報名截止）
 */
function formatNotifiedTime(value) {
  const date =
    value?.toDate?.();

  if (!date) {
    return "";
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderNotifiedNote(practice) {
  const items = [
    practice.coachNotifiedAt &&
      `人數湊齊 ${formatNotifiedTime(practice.coachNotifiedAt)}（${Number(practice.coachNotifiedCount) || 0} 人）`,
    practice.fullNotifiedAt &&
      `額滿 ${formatNotifiedTime(practice.fullNotifiedAt)}`,
    practice.deadlineNotifiedAt &&
      `報名截止 ${formatNotifiedTime(practice.deadlineNotifiedAt)}（${Number(practice.deadlineNotifiedCount) || 0} 人）`
  ].filter(Boolean);

  if (items.length === 0) {
    return "";
  }

  /*
   * 最後一次通知之後名單還有變動，提醒可以手動再傳
   */
  const lastCount =
    practice.deadlineNotifiedAt
      ? Number(practice.deadlineNotifiedCount)
      : practice.fullNotifiedAt
        ? Number(practice.maxParticipants)
        : Number(practice.coachNotifiedCount);

  const changed =
    lastCount > 0 && lastCount !== (practice.participants || []).length;

  return `
    <p class="practice-notified">
      📨 已自動通知教練：${escapeHtml(items.join("、"))}
      ${changed ? "<br>名單之後有變動，需要的話可以再通知一次。" : ""}
    </p>
  `;
}

const CONFIRM_MESSAGES = {
  confirm: (practice, count) =>
    count < practice.minParticipants
      ? `目前只有 ${count} 人，還沒到成團人數 ${practice.minParticipants} 人，確定要成團嗎？`
      : "",
  reopen: () => "確定要改回招募中嗎？",
  cancel: () => "確定要取消這團嗎？報名的社員會看到「已取消」。",
  delete: () => "確定要刪除這團的紀錄嗎？刪除後無法復原。"
};

const DONE_MESSAGES = {
  confirm: "✅ 已確認成團，記得通知報名的社員。",
  reopen: "已改回招募中。",
  cancel: "已取消這團。",
  delete: "已刪除。"
};

/*
 * 用 LINE 通知教練：先問要不要開 LINE，再到 LINE 裡選要傳給誰
 */
adminContent?.addEventListener(
  "click",

  (event) => {
    const button =
      event.target.closest("[data-line-share]");

    if (!button) {
      return;
    }

    const practice =
      practices.find((item) => item.id === button.dataset.lineShare);

    if (!practice) {
      return;
    }

    const isMobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (
      !window.confirm(
        `要開啟 LINE 通知教練嗎？\n\n` +
        `${formatPracticeDate(practice)} ${practice.start}｜${practice.spot}\n\n` +
        (isMobile
          ? "接下來會打開 LINE App，選擇要傳給哪個好友或群組。"
          : "接下來會開啟 LINE 分享視窗，登入後選擇要傳給哪個好友或群組。")
      )
    ) {
      return;
    }

    const text =
      getLineShareText(
        practice,
        (practice.participants || []).map(getMemberName)
      );

    const url =
      getLineShareUrl(text, getPracticePageUrl(practice.id), isMobile);

    if (isMobile) {
      window.location.href = url;
      return;
    }

    /*
     * 電腦版也先複製一份，LINE 網頁沒帶到訊息時可以直接貼上
     */
    navigator.clipboard?.writeText(text).catch(() => {});

    window.open(url, "line-share", "width=600,height=720,noopener");

    showStatus(
      practiceListMessage,
      "已開啟 LINE 分享視窗，訊息也複製好了，沒帶到的話直接貼上就可以。",
      "success"
    );
  }
);

adminContent?.addEventListener(
  "click",

  async (event) => {
    const button =
      event.target.closest("[data-practice-action]");

    if (!button) {
      return;
    }

    const action =
      button.dataset.practiceAction;

    const practice =
      practices.find((item) => item.id === button.dataset.id);

    if (!practice) {
      return;
    }

    if (action === "edit") {
      startEditing(practice);
      return;
    }

    const question =
      CONFIRM_MESSAGES[action](practice, (practice.participants || []).length);

    if (question && !window.confirm(`${formatPracticeDate(practice)} ${practice.start} ${practice.spot}\n\n${question}`)) {
      return;
    }

    button.disabled = true;

    try {
      if (action === "delete") {
        await deletePractice(db, practice.id);
      } else {
        await setPracticeStatus(
          db,
          practice.id,
          { confirm: "confirmed", reopen: "open", cancel: "cancelled" }[action]
        );
      }

      if (editingId === practice.id) {
        resetPracticeForm();
      }

      await refreshPractices();

      showStatus(practiceListMessage, DONE_MESSAGES[action], "success");
      highlightPractice(practice.id);
    } catch (error) {
      console.error(
        "團練更新失敗：",
        error
      );

      button.disabled = false;

      showStatus(
        practiceListMessage,
        `更新失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

/*
 * 社員報名用的團練頁網址
 */
function getPracticePageUrl(id) {
  return new URL(`./practice.html#practice-${id}`, window.location.href).href;
}

function highlightPractice(id) {
  const card =
    id && document.querySelector(`#practice-${CSS.escape(id)}`);

  if (!card) {
    return;
  }

  card.classList.add("is-highlighted");
  window.setTimeout(() => card.classList.remove("is-highlighted"), 2500);
}

/* =========================================================
   預設值
   ========================================================= */

function fillSettings() {
  settingMin.value = settings.minParticipants;
  settingMax.value = settings.maxParticipants;
  settingHours.value = settings.closeHoursBefore;
  settingSpot.value = settings.defaultSpot;

  slots =
    settings.slots.map((slot) => ({ ...slot }));

  renderSlots();
}

function renderSlots() {
  settingSlots.innerHTML =
    slots.map((slot, index) => `
      <div class="custom-rule-row slot-row">
        <input
          type="text"
          maxlength="20"
          value="${escapeHtml(slot.label)}"
          placeholder="名稱，例如：早場"
          aria-label="時段名稱"
          data-slot-field="label"
          data-slot-index="${index}"
          required
        >

        <input
          type="time"
          value="${escapeHtml(slot.start)}"
          aria-label="開始時間"
          data-slot-field="start"
          data-slot-index="${index}"
          required
        >

        <span class="custom-rule-unit">到</span>

        <input
          type="time"
          value="${escapeHtml(slot.end)}"
          aria-label="結束時間"
          data-slot-field="end"
          data-slot-index="${index}"
          required
        >

        <button
          class="icon-button"
          type="button"
          data-remove-slot="${index}"
          aria-label="刪除這個時段"
        >
          ×
        </button>
      </div>
    `).join("") ||
    `<p class="empty-state">還沒有常用時段，新增團練時就自己填時間。</p>`;
}

settingSlots?.addEventListener(
  "input",

  (event) => {
    const { slotField, slotIndex } =
      event.target.dataset;

    if (slotField !== undefined) {
      slots[Number(slotIndex)][slotField] = event.target.value;
    }
  }
);

settingSlots?.addEventListener(
  "click",

  (event) => {
    const button =
      event.target.closest("[data-remove-slot]");

    if (!button) {
      return;
    }

    slots.splice(Number(button.dataset.removeSlot), 1);
    renderSlots();
  }
);

addSlotButton?.addEventListener(
  "click",

  () => {
    slots.push({ id: "", label: "", start: "07:00", end: "09:00" });
    renderSlots();

    settingSlots
      .querySelector(`[data-slot-index="${slots.length - 1}"][data-slot-field="label"]`)
      ?.focus();
  }
);

settingsForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    saveSettingsButton.disabled = true;
    saveSettingsButton.textContent = "儲存中……";

    try {
      settings =
        await savePracticeSettings(db, {
          minParticipants: settingMin.value,
          maxParticipants: settingMax.value,
          closeHoursBefore: settingHours.value,
          defaultSpot: settingSpot.value,
          slots
        });

      fillSettings();

      if (!editingId) {
        resetPracticeForm();
      } else {
        renderSlotOptions();
      }

      showStatus(settingsMessage, "預設值已儲存。", "success");
    } catch (error) {
      console.error(
        "團練預設值儲存失敗：",
        error
      );

      showStatus(
        settingsMessage,
        `儲存失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      saveSettingsButton.disabled = false;
      saveSettingsButton.textContent = "儲存預設值";
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
