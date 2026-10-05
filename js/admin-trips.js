/* =========================================================
   檔案：js/admin-trips.js
   管理員：新增、編輯、刪除出團紀錄
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
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

import {
  formatLevel,
  getLevel
} from "./levels.js";

import {
  escapeHtml,
  getProfile,
  todayString
} from "./member-card.js";

import {
  getHighlights,
  getLinks,
  getParticipants,
  loadApprovedMembers,
  loadTrips
} from "./trips.js";

import {
  loadPeriod
} from "./board-stats.js";

import {
  refreshMembersPoints
} from "./points.js";

/* =========================================================
   DOM
   ========================================================= */

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const logoutButton =
  document.querySelector("#logout-button");

const tripForm =
  document.querySelector("#trip-form");

const tripFormTitle =
  document.querySelector("#trip-form-title");

const tripDate =
  document.querySelector("#trip-date");

const tripTitle =
  document.querySelector("#trip-title");

const tripSpot =
  document.querySelector("#trip-spot");

const tripHighlights =
  document.querySelector("#trip-highlights");

const tripLinks =
  document.querySelector("#trip-links");

const tripQuote =
  document.querySelector("#trip-quote");

const tripQuoteBy =
  document.querySelector("#trip-quote-by");

const tripMessage =
  document.querySelector("#trip-message");

const tripSaveButton =
  document.querySelector("#trip-save-button");

const cancelEditButton =
  document.querySelector("#cancel-edit-button");

const participantPicker =
  document.querySelector("#participant-picker");

const participantSearch =
  document.querySelector("#participant-search");

const participantCount =
  document.querySelector("#participant-count");

const selectCheckinsButton =
  document.querySelector("#select-checkins-button");

const clearParticipantsButton =
  document.querySelector("#clear-participants-button");

const tripList =
  document.querySelector("#trip-list");

let currentAdmin = null;
let members = [];
let trips = [];
let editingTripId = null;
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

      currentAdmin = user;

      showStatus(
        adminStatus,
        `管理員：${userData.name || user.email || "未命名"}`,
        "success"
      );

      adminContent?.classList.remove("hidden");

      const membersMap =
        await loadApprovedMembers(db);

      members =
        [...membersMap.entries()]
          .map(([uid, data]) => ({ uid, data }))
          .sort((first, second) =>
            String(first.data.name || "").localeCompare(
              String(second.data.name || ""),
              "zh-Hant"
            )
          );

      resetForm();

      await refreshTrips();
    } catch (error) {
      console.error(
        "管理員驗證失敗：",
        error
      );

      showStatus(
        adminStatus,
        `驗證失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

/* =========================================================
   選擇參加社員
   ========================================================= */

function renderPicker() {
  const keyword =
    participantSearch.value.trim().toLowerCase();

  participantPicker.innerHTML =
    members
      .filter((member) => {
        if (!keyword) {
          return true;
        }

        return [
          member.data.name,
          getProfile(member.data).nickname
        ].some((text) =>
          String(text || "").toLowerCase().includes(keyword)
        );
      })
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
              <small>${escapeHtml(formatLevel(getLevel(member.data.level)))}</small>
            </span>
          </label>
        `;
      })
      .join("") ||
    `<p class="empty-state">找不到符合的社員。</p>`;

  participantCount.textContent =
    String(selected.size);
}

participantPicker?.addEventListener(
  "change",

  (event) => {
    const checkbox =
      event.target;

    if (checkbox.checked) {
      selected.add(checkbox.value);
    } else {
      selected.delete(checkbox.value);
    }

    participantCount.textContent =
      String(selected.size);
  }
);

participantSearch?.addEventListener("input", renderPicker);

clearParticipantsButton?.addEventListener(
  "click",

  () => {
    selected.clear();
    renderPicker();
  }
);

/*
 * 讀取每位社員當天的打卡紀錄，把有打卡的人勾起來
 */
selectCheckinsButton?.addEventListener(
  "click",

  async () => {
    const date =
      tripDate.value;

    if (!date) {
      showStatus(tripMessage, "請先選擇日期。", "error");
      return;
    }

    selectCheckinsButton.disabled = true;
    selectCheckinsButton.textContent = "讀取中……";

    try {
      const results =
        await Promise.all(
          members.map(async (member) => {
            const checkin =
              await getDoc(doc(db, "users", member.uid, "checkins", date));

            return checkin.exists()
              ? member.uid
              : null;
          })
        );

      const found =
        results.filter(Boolean);

      found.forEach((uid) => selected.add(uid));

      renderPicker();

      showStatus(
        tripMessage,
        found.length > 0
          ? `已選取 ${found.length} 位 ${date} 有打卡的社員。`
          : `${date} 沒有社員打卡。`,
        found.length > 0 ? "success" : ""
      );
    } catch (error) {
      console.error(
        "讀取打卡紀錄失敗：",
        error
      );

      showStatus(
        tripMessage,
        `讀取打卡紀錄失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      selectCheckinsButton.disabled = false;
      selectCheckinsButton.textContent = "選取當天有打卡的社員";
    }
  }
);

/* =========================================================
   表單
   ========================================================= */

function resetForm() {
  editingTripId = null;
  selected = new Set();

  tripForm.reset();
  tripDate.value = todayString();

  tripFormTitle.textContent = "新增出團紀錄";
  cancelEditButton.hidden = true;

  showStatus(tripMessage, "");

  renderPicker();
}

function fillForm(trip) {
  editingTripId = trip.id;
  selected = new Set(getParticipants(trip));

  tripDate.value = trip.date || "";
  tripTitle.value = trip.title || "";
  tripSpot.value = trip.spot || "";
  tripHighlights.value = getHighlights(trip).join("\n");
  tripLinks.value =
    getLinks(trip)
      .map((link) => (link.label ? `${link.label} ${link.url}` : link.url))
      .join("\n");
  tripQuote.value = trip.quote || "";
  tripQuoteBy.value = trip.quoteBy || "";

  tripFormTitle.textContent = `編輯：${trip.date} ${trip.title || ""}`;
  cancelEditButton.hidden = false;

  showStatus(tripMessage, "");

  participantSearch.value = "";
  renderPicker();

  tripForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

cancelEditButton?.addEventListener("click", resetForm);

tripForm?.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    const { links, invalidLines } =
      parseLinks(tripLinks.value);

    if (invalidLines.length > 0) {
      showStatus(
        tripMessage,
        `這幾行找不到 http:// 或 https:// 開頭的網址：${invalidLines.join("、")}`,
        "error"
      );

      tripLinks.focus();

      return;
    }

    const trip = {
      date: tripDate.value,
      title: tripTitle.value.trim(),
      spot: tripSpot.value.trim(),
      participants: [...selected],
      highlights:
        tripHighlights.value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      links,
      quote: tripQuote.value.trim(),
      quoteBy: tripQuoteBy.value.trim(),
      updatedAt: serverTimestamp()
    };

    if (!trip.date || !trip.title) {
      showStatus(tripMessage, "請填寫日期與標題。", "error");
      return;
    }

    tripSaveButton.disabled = true;
    tripSaveButton.textContent = "儲存中……";

    /*
     * 原本有參加、現在有參加的人，積分都可能變動
     */
    const affected =
      new Set([
        ...trip.participants,
        ...(editingTripId
          ? getParticipants(trips.find((item) => item.id === editingTripId) || {})
          : [])
      ]);

    try {
      if (editingTripId) {
        await updateDoc(doc(db, "trips", editingTripId), trip);
      } else {
        await addDoc(
          collection(db, "trips"),
          {
            ...trip,
            createdAt: serverTimestamp(),
            createdBy: currentAdmin.uid
          }
        );
      }

      const message =
        `${trip.date} ${trip.title} 已儲存（${trip.participants.length} 人）。`;

      resetForm();

      showStatus(tripMessage, `${message}正在更新參加社員的積分……`, "success");

      await refreshTrips();
      await updateParticipantsPoints(affected);

      showStatus(tripMessage, message, "success");
    } catch (error) {
      console.error(
        "出團紀錄儲存失敗：",
        error
      );

      showStatus(
        tripMessage,
        `儲存失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    } finally {
      tripSaveButton.disabled = false;
      tripSaveButton.textContent = "儲存";
    }
  }
);

/*
 * 「照片 https://...」→ { label: "照片", url: "https://..." }
 */
function parseLinks(text) {
  const links = [];
  const invalidLines = [];

  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match =
        line.match(/https?:\/\/\S+/);

      if (!match) {
        invalidLines.push(line.length > 20 ? `${line.slice(0, 20)}…` : line);
        return;
      }

      links.push({
        label: line.replace(match[0], "").trim().slice(0, 30),
        url: match[0]
      });
    });

  return { links, invalidLines };
}

/* =========================================================
   出團紀錄列表
   ========================================================= */

async function refreshTrips() {
  try {
    trips =
      await loadTrips(db);

    renderTripList();
  } catch (error) {
    console.error(
      "出團紀錄載入失敗：",
      error
    );

    tripList.innerHTML = `
      <p class="status-message error">
        出團紀錄載入失敗：${escapeHtml(error?.message || "未知錯誤")}
      </p>
    `;
  }
}

function renderTripList() {
  if (trips.length === 0) {
    tripList.innerHTML = `
      <p class="empty-state">
        還沒有出團紀錄。
      </p>
    `;

    return;
  }

  tripList.innerHTML =
    trips.map((trip) => `
      <article class="member-application">
        <div>
          <h3>${escapeHtml(trip.date || "")} ${escapeHtml(trip.title || "")}</h3>
          <p>
            ${trip.spot ? `📍 ${escapeHtml(trip.spot)}｜` : ""}${getParticipants(trip).length} 人下水｜${getHighlights(trip).length} 件事｜${getLinks(trip).length} 個連結
          </p>
        </div>

        <div class="member-application-actions">
          <button
            class="button button-small button-secondary"
            type="button"
            data-edit-trip="${escapeHtml(trip.id)}"
          >
            編輯
          </button>

          <button
            class="button button-small delete-button"
            type="button"
            data-delete-trip="${escapeHtml(trip.id)}"
          >
            刪除
          </button>
        </div>
      </article>
    `).join("");
}

tripList?.addEventListener(
  "click",

  async (event) => {
    const editButton =
      event.target.closest("[data-edit-trip]");

    const deleteButton =
      event.target.closest("[data-delete-trip]");

    if (editButton) {
      const trip =
        trips.find((item) => item.id === editButton.dataset.editTrip);

      if (trip) {
        fillForm(trip);
      }

      return;
    }

    if (!deleteButton) {
      return;
    }

    const trip =
      trips.find((item) => item.id === deleteButton.dataset.deleteTrip);

    if (
      !trip ||
      !window.confirm(`確定要刪除「${trip.date} ${trip.title || ""}」的出團紀錄嗎？`)
    ) {
      return;
    }

    deleteButton.disabled = true;

    try {
      await deleteDoc(doc(db, "trips", trip.id));

      if (editingTripId === trip.id) {
        resetForm();
      }

      await refreshTrips();
      await updateParticipantsPoints(new Set(getParticipants(trip)));
    } catch (error) {
      console.error(
        "刪除出團紀錄失敗：",
        error
      );

      deleteButton.disabled = false;

      showStatus(
        tripMessage,
        `刪除失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

/*
 * 出團紀錄改了之後，重算相關社員的自動積分
 */
async function updateParticipantsPoints(uids) {
  try {
    const period =
      await loadPeriod(db);

    await refreshMembersPoints(
      db,
      members.filter((member) => uids.has(member.uid)),
      { trips, defaultSince: period.start, force: true }
    );
  } catch (error) {
    console.error(
      "積分更新失敗：",
      error
    );
  }
}

/* =========================================================
   共用
   ========================================================= */

function showStatus(element, message, type = "") {
  if (!element) {
    return;
  }

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
