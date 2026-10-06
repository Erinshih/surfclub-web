/* =========================================================
   檔案：js/admin-settle.js
   管理員：排行榜管理（積分規則、結算這一期、還原、選擇要歸零積分的社員）
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
  getSnapshotPoints,
  loadMembers,
  resetPoints,
  settlePeriod,
  undoSettlement
} from "./boards.js";

import {
  DEFAULT_POINT_RULES,
  POINT_RULE_FIELDS,
  addPointRecords,
  deletePointRecord,
  formatSignedPoints,
  getAdjustPoints,
  getAutoPoints,
  getBonusPoints,
  getPointRules,
  getTotalPoints,
  loadPointRecords,
  loadPointRules,
  refreshMembersPoints,
  savePointRules
} from "./points.js";

import {
  loadTrips
} from "./trips.js";

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

const rulesForm =
  document.querySelector("#rules-form");

const rulesFields =
  document.querySelector("#rules-fields");

const ruleCheckinOnTripDay =
  document.querySelector("#rule-checkin-on-trip-day");

const rulesMessage =
  document.querySelector("#rules-message");

const rulesSaveButton =
  document.querySelector("#rules-save-button");

const rulesResetButton =
  document.querySelector("#rules-reset-button");

const customRulesList =
  document.querySelector("#custom-rules");

const addCustomRuleButton =
  document.querySelector("#add-custom-rule");

const recordForm =
  document.querySelector("#record-form");

const recordRule =
  document.querySelector("#record-rule");

const recordDate =
  document.querySelector("#record-date");

const recordNote =
  document.querySelector("#record-note");

const recordSearch =
  document.querySelector("#record-search");

const recordMembers =
  document.querySelector("#record-members");

const recordCount =
  document.querySelector("#record-count");

const recordMessage =
  document.querySelector("#record-message");

const recordButton =
  document.querySelector("#record-button");

const recordList =
  document.querySelector("#record-list");

const logoutButton =
  document.querySelector("#logout-button");

let members = [];
let selected = new Set();
let latestArchive = null;
let periodStart = null;
let currentAdminUid = null;
let customRules = [];
let recordSelected = new Set();
let records = [];

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

      await Promise.all([
        renderRules(),
        renderCurrentPeriod(),
        loadResetList()
      ]);

      await renderUndo();

      renderRecordForm();
      await loadRecordList();

      if (window.location.hash === "#point-rules") {
        document.querySelector("#point-rules").scrollIntoView();
      }
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
   積分規則
   ========================================================= */

function fillRules(rules) {
  rulesFields.innerHTML =
    POINT_RULE_FIELDS.map(({ key, label, unit, min, max }) => `
      <div class="field-stack">
        <label for="rule-${key}">${escapeHtml(label)}</label>

        <div class="rules-input">
          <input
            id="rule-${key}"
            type="number"
            inputmode="numeric"
            min="${min}"
            max="${max}"
            step="1"
            value="${Number(rules[key])}"
            required
          >
          <span>${escapeHtml(unit)}</span>
        </div>
      </div>
    `).join("");

  ruleCheckinOnTripDay.checked =
    Boolean(rules.checkinOnTripDay);

  customRules =
    (rules.custom || []).map((rule) => ({ ...rule }));

  renderCustomRules();
}

/*
 * 自訂加減分項目：名稱＋分數，可以新增、刪除
 */
function renderCustomRules() {
  if (customRules.length === 0) {
    customRulesList.innerHTML = `
      <p class="empty-state">
        還沒有自訂項目。
      </p>
    `;

    return;
  }

  customRulesList.innerHTML =
    customRules.map((rule, index) => `
      <div class="custom-rule-row">
        <input
          type="text"
          maxlength="20"
          value="${escapeHtml(rule.name)}"
          placeholder="項目名稱，例如：被叫上岸"
          aria-label="項目名稱"
          data-custom-name="${index}"
          required
        >

        <input
          type="number"
          step="1"
          min="-1000"
          max="1000"
          value="${Number(rule.points) || ""}"
          placeholder="-20"
          aria-label="分數"
          data-custom-points="${index}"
          required
        >

        <span class="custom-rule-unit">分</span>

        <button
          class="icon-button"
          type="button"
          data-remove-custom="${index}"
          aria-label="刪除這個項目"
        >
          ×
        </button>
      </div>
    `).join("");
}

customRulesList?.addEventListener(
  "input",

  (event) => {
    const nameIndex =
      event.target.dataset.customName;

    const pointsIndex =
      event.target.dataset.customPoints;

    if (nameIndex !== undefined) {
      customRules[Number(nameIndex)].name = event.target.value;
    }

    if (pointsIndex !== undefined) {
      customRules[Number(pointsIndex)].points = event.target.value;
    }
  }
);

customRulesList?.addEventListener(
  "click",

  (event) => {
    const button =
      event.target.closest("[data-remove-custom]");

    if (!button) {
      return;
    }

    customRules.splice(Number(button.dataset.removeCustom), 1);
    renderCustomRules();
  }
);

addCustomRuleButton?.addEventListener(
  "click",

  () => {
    customRules.push({ id: "", name: "", points: "" });
    renderCustomRules();

    customRulesList
      .querySelector(`[data-custom-name="${customRules.length - 1}"]`)
      ?.focus();
  }
);

async function renderRules() {
  fillRules(await loadPointRules(db, { force: true }));
}

rulesResetButton?.addEventListener(
  "click",

  () => {
    fillRules(DEFAULT_POINT_RULES);

    showStatus(
      rulesMessage,
      "已填回預設值，按「儲存並重新計算」才會生效。"
    );
  }
);

rulesForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    const rules = {
      ...Object.fromEntries(
        POINT_RULE_FIELDS.map(({ key }) => [
          key,
          document.querySelector(`#rule-${key}`).value
        ])
      ),
      checkinOnTripDay: ruleCheckinOnTripDay.checked,
      custom: customRules
    };

    rulesSaveButton.disabled = true;
    rulesSaveButton.textContent = "儲存中……";

    try {
      fillRules(await savePointRules(db, rules));
      renderRecordForm();

      showStatus(rulesMessage, "規則已儲存，正在重新計算所有人的積分……");

      const [trips, period] =
        await Promise.all([
          loadTrips(db),
          loadPeriod(db)
        ]);

      await refreshMembersPoints(
        db,
        members,
        {
          trips,
          defaultSince: period.start,
          force: true,
          onProgress: (done, total) => {
            showStatus(rulesMessage, `規則已儲存，正在重新計算所有人的積分……（${done} / ${total}）`);
          }
        }
      );

      renderResetList();

      showStatus(
        rulesMessage,
        `規則已儲存，${members.length} 位社員的積分都重新計算好了。`,
        "success"
      );
    } catch (error) {
      console.error(
        "積分規則儲存失敗：",
        error
      );

      showStatus(
        rulesMessage,
        `儲存失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      rulesSaveButton.disabled = false;
      rulesSaveButton.textContent = "儲存並重新計算";
    }
  }
);

/* =========================================================
   加減分紀錄
   ========================================================= */

function renderRecordForm() {
  const custom =
    getPointRules().custom || [];

  recordRule.innerHTML =
    custom.length > 0
      ? custom.map((rule) => `
          <option value="${escapeHtml(rule.id)}">
            ${escapeHtml(rule.name)}（${formatSignedPoints(rule.points)}）
          </option>
        `).join("")
      : `<option value="">請先在上面新增自訂加減分項目</option>`;

  recordButton.disabled =
    custom.length === 0;

  if (!recordDate.value) {
    recordDate.value = todayString();
    recordDate.max = todayString();
  }

  renderRecordPicker();
}

function renderRecordPicker() {
  const keyword =
    recordSearch.value.trim().toLowerCase();

  recordMembers.innerHTML =
    [...members]
      .sort((first, second) =>
        String(first.data.name || "").localeCompare(String(second.data.name || ""), "zh-Hant")
      )
      .filter((member) =>
        !keyword ||
        [member.data.name, getProfile(member.data).nickname].some((text) =>
          String(text || "").toLowerCase().includes(keyword)
        )
      )
      .map((member) => {
        const nickname =
          getProfile(member.data).nickname;

        return `
          <label class="check-item participant-option">
            <input
              type="checkbox"
              value="${escapeHtml(member.uid)}"
              ${recordSelected.has(member.uid) ? "checked" : ""}
            >
            <span>
              ${escapeHtml(member.data.name || "未命名社員")}
              ${nickname ? `<small>（${escapeHtml(nickname)}）</small>` : ""}
            </span>
          </label>
        `;
      })
      .join("") ||
    `<p class="empty-state">找不到符合的社員。</p>`;

  recordCount.textContent =
    String(recordSelected.size);
}

recordSearch?.addEventListener("input", renderRecordPicker);

recordMembers?.addEventListener(
  "change",

  (event) => {
    if (event.target.checked) {
      recordSelected.add(event.target.value);
    } else {
      recordSelected.delete(event.target.value);
    }

    recordCount.textContent =
      String(recordSelected.size);
  }
);

async function loadRecordList() {
  try {
    records =
      await loadPointRecords(db);
  } catch (error) {
    console.error(
      "加減分紀錄讀取失敗：",
      error
    );

    recordList.innerHTML = `
      <li class="status-message error">
        加減分紀錄讀取失敗：${escapeHtml(error?.message || "未知錯誤")}
      </li>
    `;

    return;
  }

  if (records.length === 0) {
    recordList.innerHTML = `
      <li class="empty-state">
        還沒有加減分紀錄。
      </li>
    `;

    return;
  }

  const nameOf = (uid) =>
    members.find((member) => member.uid === uid)?.data.name || "（已不是正式社員）";

  recordList.innerHTML =
    records.slice(0, 50).map((record) => `
      <li class="${record.points < 0 ? "is-minus" : "is-plus"}">
        <time>${escapeHtml(record.date)}</time>
        <strong>${escapeHtml(nameOf(record.uid))}</strong>
        <span>${escapeHtml(record.name)}${record.note ? `：${escapeHtml(record.note)}` : ""}</span>
        <span class="record-points">${formatSignedPoints(Number(record.points))}</span>

        <button
          class="icon-button"
          type="button"
          data-remove-record="${escapeHtml(record.id)}"
          aria-label="刪除這筆紀錄"
        >
          ×
        </button>
      </li>
    `).join("");
}

/*
 * 加減分紀錄變動後，重算這些社員的積分
 */
async function refreshRecordMembers(uids) {
  await refreshPoints(
    members.filter((member) => uids.includes(member.uid)),
    true
  );

  renderResetList();
}

recordForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    const rule =
      (getPointRules().custom || []).find((item) => item.id === recordRule.value);

    const uids =
      [...recordSelected];

    if (!rule || uids.length === 0 || !recordDate.value) {
      showStatus(recordMessage, "請選擇項目、日期和至少一位社員。", "error");
      return;
    }

    recordButton.disabled = true;
    recordButton.textContent = "記錄中……";

    try {
      await addPointRecords(db, {
        uids,
        rule,
        date: recordDate.value,
        note: recordNote.value,
        createdBy: currentAdminUid
      });

      await refreshRecordMembers(uids);

      showStatus(
        recordMessage,
        `已幫 ${uids.length} 位社員記錄「${rule.name}」（${formatSignedPoints(rule.points)}）。`,
        "success"
      );

      recordSelected.clear();
      recordNote.value = "";
      renderRecordPicker();

      await loadRecordList();
    } catch (error) {
      console.error(
        "加減分紀錄儲存失敗：",
        error
      );

      showStatus(
        recordMessage,
        `記錄失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      recordButton.disabled = false;
      recordButton.textContent = "記錄";
    }
  }
);

recordList?.addEventListener(
  "click",

  async (event) => {
    const button =
      event.target.closest("[data-remove-record]");

    if (!button) {
      return;
    }

    const record =
      records.find((item) => item.id === button.dataset.removeRecord);

    if (
      !record ||
      !window.confirm(`確定要刪除這筆紀錄嗎？\n\n${record.date} ${record.name}（${formatSignedPoints(Number(record.points))}）`)
    ) {
      return;
    }

    button.disabled = true;

    try {
      await deletePointRecord(db, record.id);
      await refreshRecordMembers([record.uid]);
      await loadRecordList();

      showStatus(recordMessage, "已刪除這筆紀錄。");
    } catch (error) {
      console.error(
        "刪除加減分紀錄失敗：",
        error
      );

      button.disabled = false;

      showStatus(
        recordMessage,
        `刪除失敗：${error?.message || "未知錯誤"}`,
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

  periodStart =
    period.start;

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
  return getTotalPoints(member.data);
}

function describePoints(data) {
  const adjust =
    getAdjustPoints(data);

  return [
    `自動 ${getAutoPoints(data)}`,
    adjust !== 0 ? `加減分 ${formatSignedPoints(adjust)}` : "",
    `幹部加分 ${getBonusPoints(data)}`
  ].filter(Boolean).join("＋");
}

/*
 * 歸零後從哪天開始重新累積：這一期的起始日和今天，取比較晚的
 * （剛結算完就是下一期的第一天；一期中間歸零就是今天）
 */
function getResetSince() {
  return periodStart && periodStart > todayString()
    ? periodStart
    : todayString();
}

/*
 * 重算自動積分（force：全部重算，否則只算太久沒更新的人）
 */
async function refreshPoints(targets, force) {
  const [trips, period] =
    await Promise.all([
      loadTrips(db),
      loadPeriod(db)
    ]);

  await refreshMembersPoints(
    db,
    targets,
    { trips, defaultSince: period.start, force }
  );
}

async function loadResetList() {
  const loaded =
    await loadMembers(db);

  await refreshPoints(loaded, false);

  members =
    loaded
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
            <small>${escapeHtml(describePoints(member.data))}</small>
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
        `・幹部加分改成 0，自動積分從 ${getResetSince()} 開始重新累積\n` +
        "・如果是結算後才歸零，可以用「還原上一次結算」一起復原"
      );

    if (!confirmed) {
      return;
    }

    resetButton.disabled = true;
    resetButton.textContent = "歸零中……";

    try {
      const since =
        getResetSince();

      await resetPoints(db, targets.map((member) => member.uid), since);

      /*
       * 起算日改了，馬上重算這些人的自動積分
       */
      targets.forEach((member) => {
        member.data.points = 0;
        member.data.pointsSince = since;
      });

      await refreshPoints(targets, true);

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
          `${member.data.name || "未命名社員"} 幹部加分 ${getBonusPoints(member.data)} → ${getSnapshotPoints(latestArchive, member.uid)}`
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

      const { restoredCount, restoredUids } =
        await undoSettlement(db, latestArchive, { restorePoints, members });

      /*
       * 積分起算日改回去了，重算這些人的自動積分
       */
      if (restoredUids.length > 0) {
        const fresh =
          (await loadMembers(db))
            .filter((member) => restoredUids.includes(member.uid));

        await refreshPoints(fresh, true);
      }

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
