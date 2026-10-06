/* =========================================================
   檔案：js/admin-fees.js
   管理員：建立費用、確認繳費、複製催繳名單
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
  getProfile
} from "./member-card.js";

import {
  formatTripDate,
  getParticipants,
  loadApprovedMembers,
  loadTrips
} from "./trips.js";

import {
  PAYMENT_STATUS,
  createCharge,
  deleteCharge,
  formatMoney,
  isOutstanding,
  loadCharges,
  setPaymentStatus
} from "./fees.js";

/* =========================================================
   DOM
   ========================================================= */

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const feeSummary =
  document.querySelector("#fee-summary");

const chargeForm =
  document.querySelector("#charge-form");

const chargeTitle =
  document.querySelector("#charge-title");

const chargeAmount =
  document.querySelector("#charge-amount");

const chargeDue =
  document.querySelector("#charge-due");

const chargeTrip =
  document.querySelector("#charge-trip");

const chargeNote =
  document.querySelector("#charge-note");

const chargeSearch =
  document.querySelector("#charge-search");

const chargeMembers =
  document.querySelector("#charge-members");

const chargeCount =
  document.querySelector("#charge-count");

const chargeSelectAll =
  document.querySelector("#charge-select-all");

const chargeClear =
  document.querySelector("#charge-clear");

const chargeMessage =
  document.querySelector("#charge-message");

const chargeButton =
  document.querySelector("#charge-button");

const feeList =
  document.querySelector("#fee-list");

const feeListMessage =
  document.querySelector("#fee-list-message");

const feeFilterOpen =
  document.querySelector("#fee-filter-open");

const logoutButton =
  document.querySelector("#logout-button");

let currentAdminUid = null;
let members = [];
let membersMap = new Map();
let trips = [];
let charges = [];
let selected = new Set();

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

      [membersMap, trips] =
        await Promise.all([
          loadApprovedMembers(db),
          loadTrips(db)
        ]);

      members =
        [...membersMap.entries()]
          .map(([uid, data]) => ({ uid, data }))
          .sort((first, second) =>
            String(first.data.name || "").localeCompare(String(second.data.name || ""), "zh-Hant")
          );

      renderTripOptions();
      renderPicker();

      await refreshCharges();
    } catch (error) {
      console.error(
        "費用管理載入失敗：",
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
   新增費用
   ========================================================= */

function renderTripOptions() {
  chargeTrip.innerHTML = `
    <option value="">不套用</option>
    ${trips.slice(0, 30).map((trip) => `
      <option value="${escapeHtml(trip.id)}">
        ${escapeHtml(formatTripDate(trip.date))} ${escapeHtml(trip.title || "")}（${getParticipants(trip).length} 人）
      </option>
    `).join("")}
  `;
}

function renderPicker() {
  const keyword =
    chargeSearch.value.trim().toLowerCase();

  chargeMembers.innerHTML =
    members
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
              ${selected.has(member.uid) ? "checked" : ""}
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

  chargeCount.textContent =
    String(selected.size);
}

chargeSearch?.addEventListener("input", renderPicker);

chargeMembers?.addEventListener(
  "change",

  (event) => {
    if (event.target.checked) {
      selected.add(event.target.value);
    } else {
      selected.delete(event.target.value);
    }

    chargeCount.textContent =
      String(selected.size);
  }
);

chargeSelectAll?.addEventListener(
  "click",

  () => {
    members.forEach((member) => selected.add(member.uid));
    renderPicker();
  }
);

chargeClear?.addEventListener(
  "click",

  () => {
    selected.clear();
    renderPicker();
  }
);

/*
 * 選了出團紀錄：勾選那一團的參加社員，名稱沒填的話幫忙帶入
 */
chargeTrip?.addEventListener(
  "change",

  () => {
    const trip =
      trips.find((item) => item.id === chargeTrip.value);

    if (!trip) {
      return;
    }

    selected =
      new Set(getParticipants(trip).filter((uid) => membersMap.has(uid)));

    if (!chargeTitle.value.trim()) {
      chargeTitle.value =
        `${formatTripDate(trip.date)} ${trip.title || ""} 費用`.trim();
    }

    renderPicker();

    showStatus(
      chargeMessage,
      `已勾選「${trip.title || "這一團"}」的 ${selected.size} 位參加社員。`
    );
  }
);

chargeForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    const title =
      chargeTitle.value.trim();

    const amount =
      Number(chargeAmount.value);

    const uids =
      [...selected];

    if (!title || !Number.isInteger(amount) || amount <= 0) {
      showStatus(chargeMessage, "請填寫名稱和每人金額（正整數）。", "error");
      return;
    }

    if (uids.length === 0) {
      showStatus(chargeMessage, "請至少選一位要繳費的社員。", "error");
      return;
    }

    chargeButton.disabled = true;
    chargeButton.textContent = "建立中……";

    try {
      await createCharge(db, {
        title,
        amount,
        dueDate: chargeDue.value,
        note: chargeNote.value,
        tripId: chargeTrip.value,
        uids,
        createdBy: currentAdminUid
      });

      showStatus(
        chargeMessage,
        `已建立「${title}」，${uids.length} 位社員各 ${formatMoney(amount)}。`,
        "success"
      );

      chargeForm.reset();
      selected.clear();
      renderPicker();

      await refreshCharges();
    } catch (error) {
      console.error(
        "建立費用失敗：",
        error
      );

      showStatus(
        chargeMessage,
        `建立失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      chargeButton.disabled = false;
      chargeButton.textContent = "建立費用";
    }
  }
);

/* =========================================================
   費用列表
   ========================================================= */

async function refreshCharges() {
  try {
    charges =
      await loadCharges(db);
  } catch (error) {
    console.error(
      "費用讀取失敗：",
      error
    );

    feeList.innerHTML = `
      <p class="status-message error">
        費用讀取失敗：${escapeHtml(error?.message || "未知錯誤")}
      </p>
    `;

    return;
  }

  renderSummary();
  renderCharges();
}

function renderSummary() {
  const payments =
    charges.flatMap((charge) => charge.payments);

  const unpaid =
    payments.filter((payment) => payment.status === "unpaid");

  const reported =
    payments.filter((payment) => payment.status === "reported");

  const paid =
    payments.filter((payment) => payment.status === "paid");

  const sum = (items) =>
    items.reduce((total, payment) => total + Number(payment.amount || 0), 0);

  const stats = [
    ["未繳", `${unpaid.length} 筆`, formatMoney(sum(unpaid)), unpaid.length > 0],
    ["已回報，待確認", `${reported.length} 筆`, formatMoney(sum(reported)), reported.length > 0],
    ["已收", `${paid.length} 筆`, formatMoney(sum(paid)), false]
  ];

  feeSummary.innerHTML =
    stats.map(([label, count, money, alert]) => `
      <div class="dashboard-stat ${alert ? "is-alert" : ""}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(money)}</strong>
        <small>${escapeHtml(count)}</small>
      </div>
    `).join("");
}

function getMemberName(uid) {
  return membersMap.get(uid)?.name || "（已不是正式社員）";
}

function renderCharges() {
  const visible =
    feeFilterOpen.checked
      ? charges.filter((charge) => charge.payments.some(isOutstanding))
      : charges;

  if (visible.length === 0) {
    feeList.innerHTML = `
      <p class="empty-state">
        ${feeFilterOpen.checked ? "大家都繳清了 🎉" : "還沒有建立任何費用。"}
      </p>
    `;

    return;
  }

  feeList.innerHTML =
    visible.map((charge) => {
      const count = (status) =>
        charge.payments.filter((payment) => payment.status === status).length;

      const collected =
        charge.payments
          .filter((payment) => payment.status === "paid")
          .reduce((total, payment) => total + Number(payment.amount || 0), 0);

      const payments =
        [...charge.payments].sort((first, second) => {
          const order = ["reported", "unpaid", "paid", "waived"];

          return (
            order.indexOf(first.status) - order.indexOf(second.status) ||
            getMemberName(first.uid).localeCompare(getMemberName(second.uid), "zh-Hant")
          );
        });

      return `
        <details
          class="fee-card"
          data-charge-id="${escapeHtml(charge.id)}"
          ${charge.payments.some((payment) => payment.status === "reported") ? "open" : ""}
        >
          <summary>
            <span class="fee-card-title">
              <strong>${escapeHtml(charge.title)}</strong>
              <small>
                每人 ${formatMoney(charge.amount)}
                ${charge.dueDate ? `｜期限 ${escapeHtml(charge.dueDate.replaceAll("-", "/"))}` : ""}
              </small>
            </span>

            <span class="fee-card-counts">
              <span class="fee-chip is-success">已繳 ${count("paid")}</span>
              ${count("reported") ? `<span class="fee-chip is-warning">待確認 ${count("reported")}</span>` : ""}
              ${count("unpaid") ? `<span class="fee-chip is-danger">未繳 ${count("unpaid")}</span>` : ""}
              ${count("waived") ? `<span class="fee-chip is-muted">免繳 ${count("waived")}</span>` : ""}
              <small>已收 ${formatMoney(collected)}</small>
            </span>
          </summary>

          ${charge.note ? `<p class="fee-card-note">${escapeHtml(charge.note)}</p>` : ""}

          <ul class="fee-payments">
            ${payments.map((payment) => `
              <li>
                <strong>${escapeHtml(getMemberName(payment.uid))}</strong>

                <span class="fee-chip is-${PAYMENT_STATUS[payment.status]?.tone || "muted"}">
                  ${escapeHtml(PAYMENT_STATUS[payment.status]?.label || payment.status)}
                </span>

                ${payment.reportNote ? `<small>回報：${escapeHtml(payment.reportNote)}</small>` : ""}

                <span class="fee-payment-actions">
                  ${payment.status !== "paid"
                    ? `<button class="button button-small" type="button" data-payment-id="${escapeHtml(payment.id)}" data-status="paid">確認已繳</button>`
                    : ""}
                  ${payment.status !== "unpaid"
                    ? `<button class="button button-small button-secondary" type="button" data-payment-id="${escapeHtml(payment.id)}" data-status="unpaid">改回未繳</button>`
                    : ""}
                  ${payment.status !== "waived"
                    ? `<button class="link-button" type="button" data-payment-id="${escapeHtml(payment.id)}" data-status="waived">免繳</button>`
                    : ""}
                </span>
              </li>
            `).join("")}
          </ul>

          <div class="fee-card-actions">
            <button
              class="button button-small button-secondary"
              type="button"
              data-copy-unpaid="${escapeHtml(charge.id)}"
            >
              複製催繳名單
            </button>

            <button
              class="button button-small delete-button"
              type="button"
              data-delete-charge="${escapeHtml(charge.id)}"
            >
              刪除這筆費用
            </button>
          </div>
        </details>
      `;
    }).join("");
}

feeFilterOpen?.addEventListener("change", renderCharges);

feeList?.addEventListener(
  "click",

  async (event) => {
    const statusButton =
      event.target.closest("[data-payment-id]");

    const copyButton =
      event.target.closest("[data-copy-unpaid]");

    const deleteButton =
      event.target.closest("[data-delete-charge]");

    if (statusButton) {
      statusButton.disabled = true;

      try {
        await setPaymentStatus(
          db,
          statusButton.dataset.paymentId,
          statusButton.dataset.status,
          currentAdminUid
        );

        /*
         * 只更新畫面上的那一筆，展開的卡片維持展開
         */
        const payment =
          charges
            .flatMap((charge) => charge.payments)
            .find((item) => item.id === statusButton.dataset.paymentId);

        payment.status =
          statusButton.dataset.status;

        const openIds =
          [...feeList.querySelectorAll(".fee-card[open]")].map((card) => card.dataset.chargeId);

        renderSummary();
        renderCharges();

        openIds.forEach((id) => {
          const card =
            feeList.querySelector(`.fee-card[data-charge-id="${CSS.escape(id)}"]`);

          if (card) {
            card.open = true;
          }
        });
      } catch (error) {
        console.error(
          "更新繳費狀態失敗：",
          error
        );

        statusButton.disabled = false;

        showStatus(
          feeListMessage,
          `更新失敗：${error?.message || "未知錯誤"}`,
          "error"
        );
      }

      return;
    }

    if (copyButton) {
      const charge =
        charges.find((item) => item.id === copyButton.dataset.copyUnpaid);

      const names =
        charge.payments
          .filter(isOutstanding)
          .map((payment) => getMemberName(payment.uid));

      const text =
        names.length > 0
          ? `【${charge.title}】每人 ${formatMoney(charge.amount)}${charge.dueDate ? `，${charge.dueDate.replaceAll("-", "/")} 前` : ""}\n還沒繳費的：${names.join("、")}\n繳完記得到社員首頁按「回報已轉帳」🙏`
          : `【${charge.title}】大家都繳清了 🎉`;

      try {
        await navigator.clipboard.writeText(text);
        showStatus(feeListMessage, `已複製催繳名單（${names.length} 人），可以直接貼到群組。`, "success");
      } catch {
        /*
         * 瀏覽器不讓複製的話，直接顯示出來讓管理員自己選取
         */
        showStatus(feeListMessage, text);
      }

      return;
    }

    if (deleteButton) {
      const charge =
        charges.find((item) => item.id === deleteButton.dataset.deleteCharge);

      if (
        !charge ||
        !window.confirm(`確定要刪除「${charge.title}」嗎？\n\n所有人的繳費紀錄都會一起刪除，無法復原。`)
      ) {
        return;
      }

      deleteButton.disabled = true;

      try {
        await deleteCharge(db, charge);

        showStatus(feeListMessage, `已刪除「${charge.title}」。`);

        await refreshCharges();
      } catch (error) {
        console.error(
          "刪除費用失敗：",
          error
        );

        deleteButton.disabled = false;

        showStatus(
          feeListMessage,
          `刪除失敗：${error?.message || "未知錯誤"}`,
          "error"
        );
      }
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
