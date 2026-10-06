/* =========================================================
   檔案：js/admin-members.js
   功能：
   1. 管理員權限驗證
   2. 待審核社員管理
   3. 正式社員資料管理
   4. 家系與幹部加分管理（自動積分見 js/points.js）
   5. Level / 成就紀錄新增與刪除
   6. 社員刪除
   7. CSV 匯出
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
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

import {
  loadPeriod,
  refreshBoardStats
} from "./board-stats.js";

import {
  getAutoPoints,
  getBonusPoints,
  getTotalPoints,
  refreshPointStats
} from "./points.js";

import {
  loadTrips
} from "./trips.js";

const adminStatus =
  document.querySelector("#admin-status");

const adminContent =
  document.querySelector("#admin-content");

const logoutButton =
  document.querySelector("#logout-button");

const pendingMemberList =
  document.querySelector("#pending-member-list");

const memberList =
  document.querySelector("#member-list");

const memberMessage =
  document.querySelector("#member-message");

const exportMembersButton =
  document.querySelector("#export-members");

const exportMessage =
  document.querySelector("#export-message");

let currentAdmin = null;
let allUsers = [];

onAuthStateChanged(
  auth,

  async (user) => {
    if (!user) {
      window.location.replace("./login.html");
      return;
    }

    try {
      const userSnapshot =
        await getDoc(
          doc(db, "users", user.uid)
        );

      if (!userSnapshot.exists()) {
        throw new Error("Firestore 中找不到管理員資料。");
      }

      const userData =
        userSnapshot.data();

      if (userData.role !== "admin") {
        if (
          userData.status === "pending" ||
          userData.status === "rejected"
        ) {
          window.location.replace("./pending.html");
        } else {
          window.location.replace("./member.html");
        }

        return;
      }

      currentAdmin = user;

      showStatus(
        adminStatus,
        `管理員：${userData.name || user.email || "未命名"}`,
        "success"
      );

      adminContent?.classList.remove("hidden");

      await loadUsers();
    } catch (error) {
      console.error("管理員驗證失敗：", error);

      showStatus(
        adminStatus,
        `驗證失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

async function loadUsers() {
  if (
    !pendingMemberList ||
    !memberList
  ) {
    console.error("admin-members.html 缺少必要元素。");
    return;
  }

  pendingMemberList.innerHTML = `
    <p class="empty-state">
      正在載入社員申請……
    </p>
  `;

  memberList.innerHTML = `
    <p class="empty-state">
      正在載入正式社員……
    </p>
  `;

  try {
    /*
     * 電話、學號、Email 存在 privateProfiles，
     * 還沒搬移的舊資料則還在 users 裡，兩邊合併起來顯示
     */
    const [snapshot, privateSnapshot] =
      await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "privateProfiles")).catch((error) => {
          console.error("個資讀取失敗：", error);
          return { docs: [] };
        })
      ]);

    const privateByUid =
      new Map(
        privateSnapshot.docs.map((documentSnapshot) => [
          documentSnapshot.id,
          documentSnapshot.data()
        ])
      );

    allUsers =
      snapshot.docs.map((documentSnapshot) => {
        const data =
          documentSnapshot.data();

        const privateData =
          privateByUid.get(documentSnapshot.id) || {};

        return {
          uid: documentSnapshot.id,
          ...data,
          email: privateData.email ?? data.email,
          phone: privateData.phone ?? data.phone,
          studentId: privateData.studentId ?? data.studentId,
          points: normalizePoints(data.points)
        };
      });

    renderPendingMembers();
    renderApprovedMembers();
  } catch (error) {
    console.error("社員資料載入失敗：", error);

    const errorText =
      error?.message || "未知錯誤";

    pendingMemberList.innerHTML = `
      <p class="status-message error">
        社員申請載入失敗：${escapeHtml(errorText)}
      </p>
    `;

    memberList.innerHTML = `
      <p class="status-message error">
        社員資料載入失敗：${escapeHtml(errorText)}
      </p>
    `;
  }
}

function renderPendingMembers() {
  pendingMemberList.innerHTML = "";

  const pendingMembers =
    allUsers
      .filter((user) => user.status === "pending")
      .sort((a, b) =>
        String(a.name || "").localeCompare(
          String(b.name || ""),
          "zh-Hant"
        )
      );

  if (pendingMembers.length === 0) {
    pendingMemberList.innerHTML = `
      <p class="empty-state">
        目前沒有待審核社員。
      </p>
    `;

    return;
  }

  pendingMembers.forEach((member) => {
    pendingMemberList.appendChild(
      createPendingMemberCard(member)
    );
  });
}

function createPendingMemberCard(member) {
  const article =
    document.createElement("article");

  const information =
    document.createElement("div");

  const title =
    document.createElement("h3");

  const details =
    document.createElement("div");

  const controls =
    document.createElement("div");

  const paymentSelect =
    createPaymentSelect(member.paymentStatus || "pending");

  const approveButton =
    document.createElement("button");

  const rejectButton =
    document.createElement("button");

  article.className = "member-review-card";
  information.className = "member-review-information";
  details.className = "member-detail-grid";
  controls.className = "member-review-controls";

  title.textContent =
    member.name || "未命名申請者";

  details.append(
    createDetail("Email", member.email),
    createDetail("學號", member.studentId),
    createDetail("系級", member.department),
    createDetail("電話", member.phone),
    createDetail("審核狀態", getApplicationStatusText(member.status))
  );

  approveButton.type = "button";
  approveButton.className = "button button-small";
  approveButton.textContent = "通過申請";

  approveButton.addEventListener(
    "click",

    async () => {
      if (paymentSelect.value !== "paid") {
        showStatus(
          memberMessage,
          `請先將 ${member.name || "該申請者"} 的社費狀態設定為「已繳費」。`,
          "error"
        );

        return;
      }

      const confirmed =
        window.confirm(
          `確定要通過 ${member.name || "這位申請者"} 的社員申請嗎？`
        );

      if (!confirmed) {
        return;
      }

      approveButton.disabled = true;
      rejectButton.disabled = true;
      approveButton.textContent = "處理中……";

      try {
        await updateDoc(
          doc(db, "users", member.uid),
          {
            role: "member",
            status: "approved",
            paymentStatus: "paid",
            points: normalizePoints(member.points),
            family: String(member.family || "").trim(),
            approvedBy: currentAdmin.uid,
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }
        );

        showStatus(
          memberMessage,
          `${member.name || "社員"} 已通過認證。`,
          "success"
        );

        await loadUsers();
      } catch (error) {
        console.error("通過社員申請失敗：", error);

        showStatus(
          memberMessage,
          `通過申請失敗：${error?.message || "未知錯誤"}`,
          "error"
        );

        approveButton.disabled = false;
        rejectButton.disabled = false;
        approveButton.textContent = "通過申請";
      }
    }
  );

  rejectButton.type = "button";
  rejectButton.className = "button button-small delete-button";
  rejectButton.textContent = "拒絕申請";

  rejectButton.addEventListener(
    "click",

    async () => {
      const confirmed =
        window.confirm(
          `確定要拒絕 ${member.name || "這位申請者"} 的社員申請嗎？`
        );

      if (!confirmed) {
        return;
      }

      approveButton.disabled = true;
      rejectButton.disabled = true;
      rejectButton.textContent = "處理中……";

      try {
        await updateDoc(
          doc(db, "users", member.uid),
          {
            role: "pending",
            status: "rejected",
            paymentStatus: "rejected",
            reviewedBy: currentAdmin.uid,
            reviewedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }
        );

        showStatus(
          memberMessage,
          `${member.name || "申請者"} 的申請已拒絕。`,
          "success"
        );

        await loadUsers();
      } catch (error) {
        console.error("拒絕社員申請失敗：", error);

        showStatus(
          memberMessage,
          `拒絕申請失敗：${error?.message || "未知錯誤"}`,
          "error"
        );

        approveButton.disabled = false;
        rejectButton.disabled = false;
        rejectButton.textContent = "拒絕申請";
      }
    }
  );

  information.append(
    title,
    details
  );

  controls.append(
    createLabeledControl("社費狀態", paymentSelect),
    approveButton,
    rejectButton
  );

  article.append(
    information,
    controls
  );

  return article;
}

function renderApprovedMembers() {
  memberList.innerHTML = "";

  const approvedMembers =
    allUsers
      .filter(
        (user) =>
          user.role === "admin" ||
          (
            user.role === "member" &&
            user.status === "approved"
          )
      )
      .sort((a, b) =>
        String(a.name || "").localeCompare(
          String(b.name || ""),
          "zh-Hant"
        )
      );

  if (approvedMembers.length === 0) {
    memberList.innerHTML = `
      <p class="empty-state">
        目前沒有正式社員。
      </p>
    `;

    return;
  }

  approvedMembers.forEach((member) => {
    placeMemberRow(
      createMemberEditor(member),
      member
    );
  });
}

/* =========================================================
   依家系分組
   ========================================================= */

const UNASSIGNED_FAMILY = "尚未分配";

function getFamilyName(member) {
  return (
    String(member.family || "").trim() ||
    UNASSIGNED_FAMILY
  );
}

/*
 * 找到（或建立）家系分組；家系依名稱排序，「尚未分配」放最後
 */
function getFamilyGroup(familyName) {
  const groups =
    [...memberList.querySelectorAll(".family-group")];

  const existing =
    groups.find((group) => group.dataset.family === familyName);

  if (existing) {
    return existing;
  }

  const group =
    document.createElement("details");

  /*
   * 預設收起來，點家系名稱才展開
   */
  group.className = "family-group";
  group.dataset.family = familyName;
  group.open = false;

  group.innerHTML = `
    <summary>
      <span class="family-group-name"></span>
      <span class="family-group-count"></span>
    </summary>

    <div class="family-group-list"></div>
  `;

  group.querySelector(".family-group-name").textContent =
    familyName;

  const next =
    groups.find((other) =>
      familyName !== UNASSIGNED_FAMILY &&
      (
        other.dataset.family === UNASSIGNED_FAMILY ||
        other.dataset.family.localeCompare(familyName, "zh-Hant") > 0
      )
    );

  memberList.insertBefore(group, next || null);

  return group;
}

/*
 * 放進對應的家系分組，組內依姓名排序。
 * 儲存後家系有變，也用這個把那一列移過去。
 */
function placeMemberRow(row, member) {
  row.dataset.name =
    member.name || "";

  const list =
    getFamilyGroup(getFamilyName(member))
      .querySelector(".family-group-list");

  const next =
    [...list.children].find((other) =>
      other !== row &&
      other.dataset.name.localeCompare(row.dataset.name, "zh-Hant") > 0
    );

  list.insertBefore(row, next || null);

  updateFamilyGroups();
}

function updateFamilyGroups() {
  memberList
    .querySelectorAll(".family-group")
    .forEach((group) => {
      const count =
        group.querySelector(".family-group-list").children.length;

      if (count === 0) {
        group.remove();
        return;
      }

      group.querySelector(".family-group-count").textContent =
        `${count} 人`;
    });
}

function createMemberEditor(member) {
  const row =
    document.createElement("article");

  const identity =
    document.createElement("div");

  const name =
    document.createElement("strong");

  const detail =
    document.createElement("span");

  const levelWrapper =
    document.createElement("label");

  const levelLabel =
    document.createElement("span");

  const levelSelect =
    document.createElement("select");

  const familyWrapper =
    document.createElement("label");

  const familyLabel =
    document.createElement("span");

  const familyInput =
    document.createElement("input");

  const pointsWrapper =
    document.createElement("label");

  const pointsLabel =
    document.createElement("span");

  const pointsInput =
    document.createElement("input");

  const paymentWrapper =
    document.createElement("label");

  const paymentLabel =
    document.createElement("span");

  const paymentSelect =
    createPaymentSelect(member.paymentStatus || "unpaid");

  const titlesWrapper =
    document.createElement("label");

  const titlesLabel =
    document.createElement("span");

  const titlesInput =
    document.createElement("input");

  const achievementWrapper =
    document.createElement("label");

  const achievementLabel =
    document.createElement("span");

  const achievementInput =
    document.createElement("input");

  const achievementButton =
    document.createElement("button");

  const viewAchievementButton =
    document.createElement("button");

  const actions =
    document.createElement("div");

  const saveButton =
    document.createElement("button");

  const deleteButton =
    document.createElement("button");

  row.className = "member-row";
  row.dataset.userId = member.uid;

  identity.className = "member-row-identity";
  name.className = "member-row-name";
  detail.className = "member-row-detail";

  levelWrapper.className = "member-row-field";
  familyWrapper.className = "member-row-field member-row-family";
  pointsWrapper.className = "member-row-field member-row-points";
  paymentWrapper.className = "member-row-field";
  titlesWrapper.className = "member-row-field member-row-titles";
  achievementWrapper.className = "member-row-field member-row-achievement";
  actions.className = "member-row-actions";

  name.textContent =
    `${member.name || "未命名社員"}${
      member.role === "admin"
        ? "（管理員）"
        : ""
    }`;

  const detailParts = [];

  if (member.email) {
    detailParts.push(member.email);
  }

  if (member.studentId) {
    detailParts.push(member.studentId);
  }

  detail.textContent =
    detailParts.join("｜") || "無其他資料";

  const pointsInfo =
    document.createElement("span");

  pointsInfo.className =
    "member-row-detail member-row-points-info";

  const renderPointsInfo = () => {
    pointsInfo.textContent =
      `總積分 ${getTotalPoints(member)}（自動 ${getAutoPoints(member)}＋幹部加分 ${getBonusPoints(member)}）`;
  };

  renderPointsInfo();

  identity.append(
    name,
    detail,
    pointsInfo
  );

  levelLabel.textContent = "Level";

  [
    "",
    "Lv.1：漂流木",
    "Lv.2：水筆仔",
    "Lv.3：漁光三寶",
    "Lv.4：奧賽四超人",
    "Lv.5：漁光電線桿"
  ].forEach((level) => {
    const option =
      document.createElement("option");

    option.value = level;
    option.textContent = level || "尚未設定";
    option.selected = member.level === level;

    levelSelect.appendChild(option);
  });

  levelWrapper.append(
    levelLabel,
    levelSelect
  );

  familyLabel.textContent = "家系";

  familyInput.type = "text";
  familyInput.maxLength = 50;
  familyInput.placeholder = "尚未分配";
  familyInput.value = member.family || "";

  familyWrapper.append(
    familyLabel,
    familyInput
  );

  pointsLabel.textContent = "幹部加分";

  pointsInput.type = "number";
  pointsInput.min = "0";
  pointsInput.step = "1";
  pointsInput.inputMode = "numeric";
  pointsInput.placeholder = "0";
  pointsInput.value =
    String(normalizePoints(member.points));
  pointsInput.className = "member-points-input";

  pointsInput.addEventListener(
    "input",

    () => {
      const value =
        Number(pointsInput.value);

      if (
        Number.isFinite(value) &&
        value < 0
      ) {
        pointsInput.value = "0";
      }
    }
  );

  pointsWrapper.append(
    pointsLabel,
    pointsInput
  );

  paymentLabel.textContent = "社費";

  paymentWrapper.append(
    paymentLabel,
    paymentSelect
  );

  titlesLabel.textContent = "年度稱號（用、分隔）";

  titlesInput.type = "text";
  titlesInput.maxLength = 120;
  titlesInput.placeholder = "例如：開燈王、最會撿板的人";
  titlesInput.value =
    Array.isArray(member.titles)
      ? member.titles.join("、")
      : "";

  titlesWrapper.append(
    titlesLabel,
    titlesInput
  );

  achievementLabel.textContent = "解鎖成就";

  achievementInput.type = "text";
  achievementInput.placeholder = "例如：完成第一次下水";
  achievementInput.maxLength = 100;

  achievementButton.type = "button";
  achievementButton.className = "button button-small";
  achievementButton.textContent = "新增紀錄";

  achievementButton.addEventListener(
    "click",

    async () => {
      const levelText =
        levelSelect.value.trim();

      const achievement =
        achievementInput.value.trim();

      const levelValue =
        getLevelValue(levelText);

      if (!levelText) {
        showStatus(
          memberMessage,
          "請先選擇 Level。",
          "error"
        );

        return;
      }

      if (!achievement) {
        showStatus(
          memberMessage,
          "請輸入解鎖成就內容。",
          "error"
        );

        achievementInput.focus();

        return;
      }

      if (!currentAdmin) {
        showStatus(
          memberMessage,
          "尚未完成管理員驗證。",
          "error"
        );

        return;
      }

      achievementButton.disabled = true;
      achievementButton.textContent = "新增中……";

      try {
        const historyReference =
          await addDoc(
            collection(
              db,
              "users",
              member.uid,
              "levelHistory"
            ),
            {
              levelText,
              levelValue,
              achievement,
              unlockedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              createdBy: currentAdmin.uid
            }
          );

        console.log(
          "levelHistory 寫入成功",
          {
            memberUid: member.uid,
            historyId: historyReference.id
          }
        );

        showStatus(
          memberMessage,
          `${member.name || "社員"} 的 Level / 成就紀錄已新增。`,
          "success"
        );

        achievementInput.value = "";

        await updateMemberBoardStats(member);
        await updateMemberPoints(member);
        renderPointsInfo();
      } catch (error) {
        console.error(
          "新增 Level / 成就紀錄失敗：",
          error
        );

        showStatus(
          memberMessage,
          `新增紀錄失敗：${error?.message || "未知錯誤"}`,
          "error"
        );
      } finally {
        achievementButton.disabled = false;
        achievementButton.textContent = "新增紀錄";
      }
    }
  );

  viewAchievementButton.type = "button";
  viewAchievementButton.className = "button button-small button-secondary";
  viewAchievementButton.textContent = "查看/刪除紀錄";

  viewAchievementButton.addEventListener(
    "click",

    async () => {
      await showMemberLevelHistory(member);
    }
  );

  achievementWrapper.append(
    achievementLabel,
    achievementInput,
    achievementButton,
    viewAchievementButton
  );

  saveButton.type = "button";
  saveButton.className = "button button-small member-row-save";
  saveButton.textContent = "儲存";

  saveButton.addEventListener(
    "click",

    async () => {
      const points =
        validatePointsInput(pointsInput.value);

      if (points === null) {
        showStatus(
          memberMessage,
          `${member.name || "社員"} 的幹部加分必須是大於或等於 0 的整數。`,
          "error"
        );

        pointsInput.focus();

        return;
      }

      saveButton.disabled = true;
      deleteButton.disabled = true;
      saveButton.textContent = "儲存中……";

      try {
        const family =
          familyInput.value.trim();

        const titles =
          parseTitles(titlesInput.value);

        await updateDoc(
          doc(db, "users", member.uid),
          {
            level: levelSelect.value,
            family,
            points,
            paymentStatus: paymentSelect.value,
            titles,
            updatedAt: serverTimestamp()
          }
        );

        const familyChanged =
          getFamilyName(member) !== getFamilyName({ family });

        member.level = levelSelect.value;
        member.family = family;
        member.points = points;
        member.paymentStatus = paymentSelect.value;
        member.titles = titles;

        await updateMemberBoardStats(member);
        await updateMemberPoints(member);
        renderPointsInfo();
        titlesInput.value = titles.join("、");

        /*
         * 移到新的家系後展開那一組，免得看起來像消失了
         */
        if (familyChanged) {
          placeMemberRow(row, member);

          row.closest(".family-group").open = true;
        }

        showStatus(
          memberMessage,
          `${member.name || "社員"} 的資料與積分已更新。`,
          "success"
        );

        saveButton.textContent = "已儲存";

        window.setTimeout(
          () => {
            saveButton.textContent = "儲存";
          },
          1200
        );
      } catch (error) {
        console.error(
          "社員資料更新失敗：",
          error
        );

        showStatus(
          memberMessage,
          `更新失敗：${error?.message || "未知錯誤"}`,
          "error"
        );

        saveButton.textContent = "儲存";
      } finally {
        saveButton.disabled = false;

        if (
          currentAdmin &&
          member.uid === currentAdmin.uid
        ) {
          deleteButton.disabled = true;
        } else {
          deleteButton.disabled = false;
        }
      }
    }
  );

  deleteButton.type = "button";
  deleteButton.className = "button button-small delete-button member-row-delete";
  deleteButton.textContent = "刪除";

  if (
    currentAdmin &&
    member.uid === currentAdmin.uid
  ) {
    deleteButton.disabled = true;
    deleteButton.textContent = "目前管理員";
    deleteButton.title = "不能刪除目前登入中的管理員帳號";
  }

  deleteButton.addEventListener(
    "click",

    async () => {
      if (
        currentAdmin &&
        member.uid === currentAdmin.uid
      ) {
        showStatus(
          memberMessage,
          "不能刪除目前登入中的管理員。",
          "error"
        );

        return;
      }

      const memberName =
        member.name ||
        member.email ||
        "這位社員";

      const firstConfirm =
        window.confirm(
          `確定要刪除「${memberName}」的社員資料嗎？`
        );

      if (!firstConfirm) {
        return;
      }

      const secondConfirm =
        window.confirm(
          "此操作會刪除 Firestore 中的社員資料，而且無法復原。確定繼續嗎？"
        );

      if (!secondConfirm) {
        return;
      }

      saveButton.disabled = true;
      deleteButton.disabled = true;
      deleteButton.textContent = "刪除中……";

      try {
        await deleteDoc(
          doc(db, "users", member.uid)
        );

        /*
         * 個資也一起刪掉
         */
        await deleteDoc(
          doc(db, "privateProfiles", member.uid)
        ).catch((error) => {
          console.error("個資刪除失敗：", error);
        });

        showStatus(
          memberMessage,
          `${memberName} 的社員資料已刪除。`,
          "success"
        );

        await loadUsers();
      } catch (error) {
        console.error(
          "社員資料刪除失敗：",
          error
        );

        showStatus(
          memberMessage,
          `刪除失敗：${error?.message || "未知錯誤"}`,
          "error"
        );

        saveButton.disabled = false;
        deleteButton.disabled = false;
        deleteButton.textContent = "刪除";
      }
    }
  );

  actions.append(
    saveButton,
    deleteButton
  );

  row.append(
    identity,
    levelWrapper,
    familyWrapper,
    pointsWrapper,
    paymentWrapper,
    titlesWrapper,
    achievementWrapper,
    actions
  );

  return row;
}

/*
 * 升級紀錄或等級變動後，更新排行榜用的統計。
 * 失敗不影響儲存結果，排行榜頁也可以重新計算。
 */
async function updateMemberBoardStats(member) {
  try {
    await refreshBoardStats(db, member.uid, member);
  } catch (error) {
    console.error(
      "排行榜統計更新失敗：",
      error
    );
  }
}

/*
 * 重算一位社員的自動積分（出團紀錄只讀一次）
 */
let tripsPromise = null;

async function updateMemberPoints(member) {
  try {
    tripsPromise ??= loadTrips(db);

    const [trips, period] =
      await Promise.all([
        tripsPromise,
        loadPeriod(db)
      ]);

    await refreshPointStats(
      db,
      { uid: member.uid, data: member },
      { trips, defaultSince: period.start }
    );
  } catch (error) {
    console.error(
      "積分更新失敗：",
      error
    );
  }
}

/*
 * 「開燈王、最會撿板的人」→ ["開燈王", "最會撿板的人"]
 */
function parseTitles(value) {
  return [
    ...new Set(
      String(value || "")
        .split(/[、,，\n]/)
        .map((title) => title.trim())
        .filter(Boolean)
    )
  ];
}

async function showMemberLevelHistory(member) {
  try {
    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "users",
            member.uid,
            "levelHistory"
          ),
          orderBy(
            "unlockedAt",
            "asc"
          )
        )
      );

    if (snapshot.empty) {
      window.alert("這位社員目前沒有成就紀錄。");
      return;
    }

    const records =
      snapshot.docs.map(
        (docSnapshot, index) => {
          const data =
            docSnapshot.data();

          const date =
            data.unlockedAt
              ?.toDate?.()
              ?.toLocaleDateString("zh-TW") ||
            "未知日期";

          return {
            id: docSnapshot.id,
            text:
              `${index + 1}. ${date}｜${data.levelText || ""}｜${data.achievement || ""}`
          };
        }
      );

    const message =
      records
        .map((record) => record.text)
        .join("\n") +
      "\n\n請輸入要刪除的編號：";

    const input =
      window.prompt(message);

    if (!input) {
      return;
    }

    const index =
      Number(input) - 1;

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= records.length
    ) {
      window.alert("編號不正確。");
      return;
    }

    const confirmed =
      window.confirm(
        `確定要刪除這筆紀錄嗎？\n\n${records[index].text}`
      );

    if (!confirmed) {
      return;
    }

    await deleteDoc(
      doc(
        db,
        "users",
        member.uid,
        "levelHistory",
        records[index].id
      )
    );

    window.alert("成就紀錄已刪除。");
  } catch (error) {
    console.error(
      "刪除成就紀錄失敗：",
      error
    );

    window.alert(
      `刪除成就紀錄失敗：${error?.message || "未知錯誤"}`
    );
  }
}

exportMembersButton?.addEventListener(
  "click",

  () => {
    const members =
      allUsers.filter(
        (user) =>
          user.role === "admin" ||
          (
            user.role === "member" &&
            user.status === "approved"
          )
      );

    if (members.length === 0) {
      showStatus(
        exportMessage,
        "目前沒有可以匯出的正式社員。",
        "error"
      );

      return;
    }

    const rows = [
      [
        "姓名",
        "Email",
        "學號",
        "系級",
        "電話",
        "角色",
        "Level",
        "家系",
        "總積分",
        "自動積分",
        "幹部加分",
        "積分起算日",
        "社費狀態",
        "審核狀態",
        "UID"
      ]
    ];

    members.forEach((member) => {
      rows.push([
        member.name ?? "",
        member.email ?? "",
        member.studentId ?? "",
        member.department ?? "",
        member.phone ?? "",
        member.role ?? "",
        member.level ?? "",
        member.family ?? "",
        getTotalPoints(member),
        getAutoPoints(member),
        getBonusPoints(member),
        member.pointsSince ?? "",
        member.paymentStatus ?? "",
        member.status ?? "",
        member.uid
      ]);
    });

    const csvContent =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map(escapeCsvValue)
            .join(",")
        )
        .join("\r\n");

    const blob =
      new Blob(
        [csvContent],
        {
          type: "text/csv;charset=utf-8;"
        }
      );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `surf-club-members-${
        new Date().toISOString().slice(0, 10)
      }.csv`;

    document.body.appendChild(link);

    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showStatus(
      exportMessage,
      `已匯出 ${members.length} 筆正式社員資料。`,
      "success"
    );
  }
);

logoutButton?.addEventListener(
  "click",

  async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "登出中……";

    try {
      await signOut(auth);

      window.location.replace("./login.html");
    } catch (error) {
      console.error("登出失敗：", error);

      logoutButton.disabled = false;
      logoutButton.textContent = "登出";

      showStatus(
        adminStatus,
        `登出失敗：${error?.message || "未知錯誤"}`,
        "error"
      );
    }
  }
);

function createPaymentSelect(currentValue) {
  const select =
    document.createElement("select");

  [
    ["pending", "尚未確認"],
    ["paid", "已繳費"],
    ["unpaid", "尚未繳費"],
    ["rejected", "資料有誤"]
  ].forEach(([value, label]) => {
    const option =
      document.createElement("option");

    option.value = value;
    option.textContent = label;
    option.selected = currentValue === value;

    select.appendChild(option);
  });

  return select;
}

function createLabeledControl(
  labelText,
  control
) {
  const wrapper =
    document.createElement("label");

  const label =
    document.createElement("span");

  wrapper.className = "field-stack";
  label.textContent = labelText;

  wrapper.append(
    label,
    control
  );

  return wrapper;
}

function createDetail(
  labelText,
  value
) {
  const wrapper =
    document.createElement("div");

  const label =
    document.createElement("span");

  const data =
    document.createElement("strong");

  wrapper.className = "member-detail-item";
  label.textContent = labelText;

  data.textContent =
    String(value ?? "").trim() ||
    "未填寫";

  wrapper.append(
    label,
    data
  );

  return wrapper;
}

function getApplicationStatusText(status) {
  const statusMap = {
    pending: "待審核",
    approved: "已通過",
    rejected: "已拒絕"
  };

  return (
    statusMap[status] ||
    "未知狀態"
  );
}

function normalizePoints(value) {
  const points =
    Number(value);

  if (
    !Number.isFinite(points) ||
    points < 0
  ) {
    return 0;
  }

  return Math.floor(points);
}

function getLevelValue(levelText) {
  if (!levelText) {
    return 0;
  }

  const match =
    levelText.match(/Lv\.(\d+)/);

  if (!match) {
    return 0;
  }

  return Number(match[1]);
}

function validatePointsInput(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return 0;
  }

  const points =
    Number(value);

  if (
    !Number.isFinite(points) ||
    !Number.isInteger(points) ||
    points < 0
  ) {
    return null;
  }

  return points;
}

function escapeCsvValue(value) {
  let text =
    String(value ?? "");

  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showStatus(
  element,
  text,
  type = ""
) {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.className = "status-message";

  if (type) {
    element.classList.add(type);
  }
}