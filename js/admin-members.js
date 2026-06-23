
/* =========================================================
   檔案：js/admin-members.js
   功能：
   1. 管理員權限驗證
   2. 待審核社員管理
   3. 正式社員資料管理
   4. 家系與個人積分管理
   5. 社員刪除
   6. CSV 匯出
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  auth,
  db
} from "./firebase-config.js";

/* =========================================================
   DOM
   ========================================================= */

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

/* =========================================================
   狀態
   ========================================================= */

let currentAdmin = null;
let allUsers = [];

/* =========================================================
   管理員驗證
   ========================================================= */

onAuthStateChanged(
  auth,

  async (user) => {
    if (!user) {
      window.location.replace(
        "./login.html"
      );

      return;
    }

    try {
      const userSnapshot =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );

      if (!userSnapshot.exists()) {
        throw new Error(
          "Firestore 中找不到管理員資料。"
        );
      }

      const userData =
        userSnapshot.data();

      if (userData.role !== "admin") {
        if (
          userData.status === "pending" ||
          userData.status === "rejected"
        ) {
          window.location.replace(
            "./pending.html"
          );
        } else {
          window.location.replace(
            "./member.html"
          );
        }

        return;
      }

      currentAdmin = user;

      showStatus(
        adminStatus,
        `管理員：${
          userData.name ||
          user.email ||
          "未命名"
        }`,
        "success"
      );

      adminContent?.classList.remove(
        "hidden"
      );

      await loadUsers();
    } catch (error) {
      console.error(
        "管理員驗證失敗：",
        error
      );

      showStatus(
        adminStatus,
        `驗證失敗：${
          error?.message ||
          "未知錯誤"
        }`,
        "error"
      );
    }
  },

  (error) => {
    console.error(
      "登入狀態監聽失敗：",
      error
    );

    showStatus(
      adminStatus,
      `登入狀態讀取失敗：${
        error?.message ||
        "未知錯誤"
      }`,
      "error"
    );
  }
);

/* =========================================================
   讀取所有使用者
   ========================================================= */

async function loadUsers() {
  if (
    !pendingMemberList ||
    !memberList
  ) {
    console.error(
      "admin-members.html 缺少必要元素。"
    );

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
    const snapshot =
      await getDocs(
        collection(
          db,
          "users"
        )
      );

    allUsers =
      snapshot.docs.map(
        (documentSnapshot) => {
          const data =
            documentSnapshot.data();

          return {
            uid:
              documentSnapshot.id,

            ...data,

            /*
             * 舊社員文件可能沒有 points。
             * 沒有積分時預設為 0。
             */
            points:
              normalizePoints(
                data.points
              )
          };
        }
      );

    renderPendingMembers();
    renderApprovedMembers();
  } catch (error) {
    console.error(
      "社員資料載入失敗：",
      error
    );

    const errorText =
      error?.message ||
      "未知錯誤";

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

/* =========================================================
   待審核社員列表
   ========================================================= */

function renderPendingMembers() {
  if (!pendingMemberList) {
    return;
  }

  pendingMemberList.innerHTML = "";

  const pendingMembers =
    allUsers
      .filter(
        (user) =>
          user.status === "pending"
      )
      .sort(
        (first, second) =>
          String(
            first.name || ""
          ).localeCompare(
            String(
              second.name || ""
            ),
            "zh-Hant"
          )
      );

  if (
    pendingMembers.length === 0
  ) {
    pendingMemberList.innerHTML = `
      <p class="empty-state">
        目前沒有待審核社員。
      </p>
    `;

    return;
  }

  pendingMembers.forEach(
    (member) => {
      pendingMemberList.appendChild(
        createPendingMemberCard(
          member
        )
      );
    }
  );
}

/* =========================================================
   建立待審核社員卡片
   ========================================================= */

function createPendingMemberCard(
  member
) {
  const article =
    document.createElement(
      "article"
    );

  const information =
    document.createElement(
      "div"
    );

  const title =
    document.createElement(
      "h3"
    );

  const details =
    document.createElement(
      "div"
    );

  const controls =
    document.createElement(
      "div"
    );

  const paymentSelect =
    createPaymentSelect(
      member.paymentStatus ||
      "pending"
    );

  const approveButton =
    document.createElement(
      "button"
    );

  const rejectButton =
    document.createElement(
      "button"
    );

  article.className =
    "member-review-card";

  information.className =
    "member-review-information";

  details.className =
    "member-detail-grid";

  controls.className =
    "member-review-controls";

  title.textContent =
    member.name ||
    "未命名申請者";

  details.append(
    createDetail(
      "Email",
      member.email
    ),

    createDetail(
      "學號",
      member.studentId
    ),

    createDetail(
      "系級",
      member.department
    ),

    createDetail(
      "電話",
      member.phone
    ),

    createDetail(
      "審核狀態",
      getApplicationStatusText(
        member.status
      )
    )
  );

  /* =====================================================
     通過申請
     ===================================================== */

  approveButton.type =
    "button";

  approveButton.className =
    "button button-small";

  approveButton.textContent =
    "通過申請";

  approveButton.addEventListener(
    "click",

    async () => {
      if (
        paymentSelect.value !==
        "paid"
      ) {
        showStatus(
          memberMessage,
          `請先將 ${
            member.name ||
            "該申請者"
          } 的社費狀態設定為「已繳費」。`,
          "error"
        );

        return;
      }

      const confirmed =
        window.confirm(
          `確定要通過 ${
            member.name ||
            "這位申請者"
          } 的社員申請嗎？`
        );

      if (!confirmed) {
        return;
      }

      approveButton.disabled =
        true;

      rejectButton.disabled =
        true;

      approveButton.textContent =
        "處理中……";

      try {
        await updateDoc(
          doc(
            db,
            "users",
            member.uid
          ),
          {
            role:
              "member",

            status:
              "approved",

            paymentStatus:
              "paid",

            /*
             * 新社員通過審核時，
             * 預設個人積分為 0。
             */
            points:
              normalizePoints(
                member.points
              ),

            /*
             * 沒有家系時預設空字串。
             */
            family:
              String(
                member.family || ""
              ).trim(),

            approvedBy:
              currentAdmin.uid,

            approvedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()
          }
        );

        showStatus(
          memberMessage,
          `${
            member.name ||
            "社員"
          } 已通過認證。`,
          "success"
        );

        await loadUsers();
      } catch (error) {
        console.error(
          "通過社員申請失敗：",
          error
        );

        showStatus(
          memberMessage,
          `通過申請失敗：${
            error?.message ||
            "未知錯誤"
          }`,
          "error"
        );

        approveButton.disabled =
          false;

        rejectButton.disabled =
          false;

        approveButton.textContent =
          "通過申請";
      }
    }
  );

  /* =====================================================
     拒絕申請
     ===================================================== */

  rejectButton.type =
    "button";

  rejectButton.className =
    "button button-small delete-button";

  rejectButton.textContent =
    "拒絕申請";

  rejectButton.addEventListener(
    "click",

    async () => {
      const confirmed =
        window.confirm(
          `確定要拒絕 ${
            member.name ||
            "這位申請者"
          } 的社員申請嗎？`
        );

      if (!confirmed) {
        return;
      }

      approveButton.disabled =
        true;

      rejectButton.disabled =
        true;

      rejectButton.textContent =
        "處理中……";

      try {
        await updateDoc(
          doc(
            db,
            "users",
            member.uid
          ),
          {
            role:
              "pending",

            status:
              "rejected",

            paymentStatus:
              "rejected",

            reviewedBy:
              currentAdmin.uid,

            reviewedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()
          }
        );

        showStatus(
          memberMessage,
          `${
            member.name ||
            "申請者"
          } 的申請已拒絕。`,
          "success"
        );

        await loadUsers();
      } catch (error) {
        console.error(
          "拒絕社員申請失敗：",
          error
        );

        showStatus(
          memberMessage,
          `拒絕申請失敗：${
            error?.message ||
            "未知錯誤"
          }`,
          "error"
        );

        approveButton.disabled =
          false;

        rejectButton.disabled =
          false;

        rejectButton.textContent =
          "拒絕申請";
      }
    }
  );

  information.append(
    title,
    details
  );

  controls.append(
    createLabeledControl(
      "社費狀態",
      paymentSelect
    ),

    approveButton,
    rejectButton
  );

  article.append(
    information,
    controls
  );

  return article;
}

/* =========================================================
   正式社員列表
   ========================================================= */

function renderApprovedMembers() {
  if (!memberList) {
    return;
  }

  memberList.innerHTML = "";

  const approvedMembers =
    allUsers
      .filter(
        (user) =>
          user.role === "admin" ||
          (
            user.role === "member" &&
            user.status ===
              "approved"
          )
      )
      .sort(
        (first, second) =>
          String(
            first.name || ""
          ).localeCompare(
            String(
              second.name || ""
            ),
            "zh-Hant"
          )
      );

  if (
    approvedMembers.length === 0
  ) {
    memberList.innerHTML = `
      <p class="empty-state">
        目前沒有正式社員。
      </p>
    `;

    return;
  }

  approvedMembers.forEach(
    (member) => {
      memberList.appendChild(
        createMemberEditor(
          member
        )
      );
    }
  );
}

/* =========================================================
   建立正式社員編輯列
   ========================================================= */

function createMemberEditor(
  member
) {
  const row =
    document.createElement(
      "article"
    );

  const identity =
    document.createElement(
      "div"
    );

  const name =
    document.createElement(
      "strong"
    );

  const detail =
    document.createElement(
      "span"
    );

  const levelWrapper =
    document.createElement(
      "label"
    );

  const levelLabel =
    document.createElement(
      "span"
    );

  const levelSelect =
    document.createElement(
      "select"
    );

  const familyWrapper =
    document.createElement(
      "label"
    );

  const familyLabel =
    document.createElement(
      "span"
    );

  const familyInput =
    document.createElement(
      "input"
    );

  const pointsWrapper =
    document.createElement(
      "label"
    );

  const pointsLabel =
    document.createElement(
      "span"
    );

  const pointsInput =
    document.createElement(
      "input"
    );

  const paymentWrapper =
    document.createElement(
      "label"
    );

  const paymentLabel =
    document.createElement(
      "span"
    );

  const paymentSelect =
    createPaymentSelect(
      member.paymentStatus ||
      "unpaid"
    );

  const actions =
    document.createElement(
      "div"
    );

  const saveButton =
    document.createElement(
      "button"
    );

  const deleteButton =
    document.createElement(
      "button"
    );

  /* =====================================================
     樣式 class
     ===================================================== */

  row.className =
    "member-row";

  /*
   * 方便 CSS 或其他程式取得社員 UID。
   */
  row.dataset.userId =
    member.uid;

  identity.className =
    "member-row-identity";

  name.className =
    "member-row-name";

  detail.className =
    "member-row-detail";

  levelWrapper.className =
    "member-row-field";

  familyWrapper.className =
    "member-row-field member-row-family";

  pointsWrapper.className =
    "member-row-field member-row-points";

  paymentWrapper.className =
    "member-row-field";

  actions.className =
    "member-row-actions";

  /* =====================================================
     基本資料
     ===================================================== */

  name.textContent =
    `${
      member.name ||
      "未命名社員"
    }${
      member.role === "admin"
        ? "（管理員）"
        : ""
    }`;

  const detailParts = [];

  if (member.email) {
    detailParts.push(
      member.email
    );
  }

  if (member.studentId) {
    detailParts.push(
      member.studentId
    );
  }

  detail.textContent =
    detailParts.join("｜") ||
    "無其他資料";

  identity.append(
    name,
    detail
  );

  /* =====================================================
     Level
     ===================================================== */

  levelLabel.textContent =
    "Level";

  [
    "",
    "Lv.1：漂流木",
    "Lv.2：水筆仔",
    "Lv.3：漁光三寶",
    "Lv.4：奧賽四超人",
    "Lv.5：漁光電線桿"
  ].forEach(
    (level) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        level;

      option.textContent =
        level ||
        "尚未設定";

      option.selected =
        member.level === level;

      levelSelect.appendChild(
        option
      );
    }
  );

  levelWrapper.append(
    levelLabel,
    levelSelect
  );

  /* =====================================================
     家系
     ===================================================== */

  familyLabel.textContent =
    "家系";

  familyInput.type =
    "text";

  familyInput.maxLength =
    50;

  familyInput.placeholder =
    "尚未分配";

  familyInput.value =
    member.family || "";

  familyWrapper.append(
    familyLabel,
    familyInput
  );

  /* =====================================================
     個人積分
     ===================================================== */

  pointsLabel.textContent =
    "個人積分";

  pointsInput.type =
    "number";

  pointsInput.min =
    "0";

  pointsInput.step =
    "1";

  pointsInput.inputMode =
    "numeric";

  pointsInput.placeholder =
    "0";

  pointsInput.value =
    String(
      normalizePoints(
        member.points
      )
    );

  pointsInput.className =
    "member-points-input";

  /*
   * 避免輸入負數。
   */
  pointsInput.addEventListener(
    "input",
    () => {
      const value =
        Number(
          pointsInput.value
        );

      if (
        Number.isFinite(value) &&
        value < 0
      ) {
        pointsInput.value =
          "0";
      }
    }
  );

  pointsWrapper.append(
    pointsLabel,
    pointsInput
  );

  /* =====================================================
     社費
     ===================================================== */

  paymentLabel.textContent =
    "社費";

  paymentWrapper.append(
    paymentLabel,
    paymentSelect
  );

  /* =====================================================
     儲存按鈕
     ===================================================== */

  saveButton.type =
    "button";

  saveButton.className =
    "button button-small member-row-save";

  saveButton.textContent =
    "儲存";

  saveButton.addEventListener(
    "click",

    async () => {
      const points =
        validatePointsInput(
          pointsInput.value
        );

      if (points === null) {
        showStatus(
          memberMessage,
          `${
            member.name ||
            "社員"
          } 的個人積分必須是大於或等於 0 的整數。`,
          "error"
        );

        pointsInput.focus();

        return;
      }

      saveButton.disabled =
        true;

      deleteButton.disabled =
        true;

      saveButton.textContent =
        "儲存中……";

      try {
        const family =
          familyInput
            .value
            .trim();

        await updateDoc(
          doc(
            db,
            "users",
            member.uid
          ),
          {
            level:
              levelSelect.value,

            family,

            points,

            paymentStatus:
              paymentSelect.value,

            updatedAt:
              serverTimestamp()
          }
        );

        /*
         * 同步更新瀏覽器記憶體中的資料，
         * 不必重新讀取 Firestore。
         */
        member.level =
          levelSelect.value;

        member.family =
          family;

        member.points =
          points;

        member.paymentStatus =
          paymentSelect.value;

        showStatus(
          memberMessage,
          `${
            member.name ||
            "社員"
          } 的資料與積分已更新。`,
          "success"
        );

        saveButton.textContent =
          "已儲存";

        window.setTimeout(
          () => {
            saveButton.textContent =
              "儲存";
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
          `更新失敗：${
            error?.message ||
            "未知錯誤"
          }`,
          "error"
        );

        saveButton.textContent =
          "儲存";
      } finally {
        saveButton.disabled =
          false;

        /*
         * 目前登入的管理員不能刪除自己，
         * 因此不能在這裡直接一律解除 disabled。
         */
        if (
          currentAdmin &&
          member.uid ===
            currentAdmin.uid
        ) {
          deleteButton.disabled =
            true;
        } else {
          deleteButton.disabled =
            false;
        }
      }
    }
  );

  /* =====================================================
     刪除按鈕
     ===================================================== */

  deleteButton.type =
    "button";

  deleteButton.className =
    "button button-small delete-button member-row-delete";

  deleteButton.textContent =
    "刪除";

  /*
   * 避免管理員刪除自己的 Firestore 文件。
   */
  if (
    currentAdmin &&
    member.uid === currentAdmin.uid
  ) {
    deleteButton.disabled =
      true;

    deleteButton.textContent =
      "目前管理員";

    deleteButton.title =
      "不能刪除目前登入中的管理員帳號";
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

      saveButton.disabled =
        true;

      deleteButton.disabled =
        true;

      deleteButton.textContent =
        "刪除中……";

      try {
        await deleteDoc(
          doc(
            db,
            "users",
            member.uid
          )
        );

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
          `刪除失敗：${
            error?.message ||
            "未知錯誤"
          }`,
          "error"
        );

        saveButton.disabled =
          false;

        deleteButton.disabled =
          false;

        deleteButton.textContent =
          "刪除";
      }
    }
  );

  /* =====================================================
     組合社員列
     ===================================================== */

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
    actions
  );

  return row;
}

/* =========================================================
   CSV 匯出
   ========================================================= */

exportMembersButton?.addEventListener(
  "click",

  () => {
    const members =
      allUsers.filter(
        (user) =>
          user.role === "admin" ||
          (
            user.role === "member" &&
            user.status ===
              "approved"
          )
      );

    if (
      members.length === 0
    ) {
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
        "個人積分",
        "社費狀態",
        "審核狀態",
        "UID"
      ]
    ];

    members.forEach(
      (member) => {
        rows.push([
          member.name ?? "",
          member.email ?? "",
          member.studentId ?? "",
          member.department ?? "",
          member.phone ?? "",
          member.role ?? "",
          member.level ?? "",
          member.family ?? "",
          normalizePoints(
            member.points
          ),
          member.paymentStatus ?? "",
          member.status ?? "",
          member.uid
        ]);
      }
    );

    const csvContent =
      "\uFEFF" +
      rows
        .map(
          (row) =>
            row
              .map(
                escapeCsvValue
              )
              .join(",")
        )
        .join("\r\n");

    const blob =
      new Blob(
        [csvContent],
        {
          type:
            "text/csv;charset=utf-8;"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href =
      url;

    link.download =
      `surf-club-members-${
        new Date()
          .toISOString()
          .slice(0, 10)
      }.csv`;

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    URL.revokeObjectURL(
      url
    );

    showStatus(
      exportMessage,
      `已匯出 ${
        members.length
      } 筆正式社員資料。`,
      "success"
    );
  }
);

/* =========================================================
   登出
   ========================================================= */

logoutButton?.addEventListener(
  "click",

  async () => {
    logoutButton.disabled =
      true;

    logoutButton.textContent =
      "登出中……";

    try {
      await signOut(auth);

      window.location.replace(
        "./login.html"
      );
    } catch (error) {
      console.error(
        "登出失敗：",
        error
      );

      logoutButton.disabled =
        false;

      logoutButton.textContent =
        "登出";

      showStatus(
        adminStatus,
        `登出失敗：${
          error?.message ||
          "未知錯誤"
        }`,
        "error"
      );
    }
  }
);

/* =========================================================
   建立社費選單
   ========================================================= */

function createPaymentSelect(
  currentValue
) {
  const select =
    document.createElement(
      "select"
    );

  [
    [
      "pending",
      "尚未確認"
    ],

    [
      "paid",
      "已繳費"
    ],

    [
      "unpaid",
      "尚未繳費"
    ],

    [
      "rejected",
      "資料有誤"
    ]
  ].forEach(
    ([value, label]) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        value;

      option.textContent =
        label;

      option.selected =
        currentValue === value;

      select.appendChild(
        option
      );
    }
  );

  return select;
}

/* =========================================================
   建立有標題的控制元件
   ========================================================= */

function createLabeledControl(
  labelText,
  control
) {
  const wrapper =
    document.createElement(
      "label"
    );

  const label =
    document.createElement(
      "span"
    );

  wrapper.className =
    "field-stack";

  label.textContent =
    labelText;

  wrapper.append(
    label,
    control
  );

  return wrapper;
}

/* =========================================================
   建立資料顯示欄位
   ========================================================= */

function createDetail(
  labelText,
  value
) {
  const wrapper =
    document.createElement(
      "div"
    );

  const label =
    document.createElement(
      "span"
    );

  const data =
    document.createElement(
      "strong"
    );

  wrapper.className =
    "member-detail-item";

  label.textContent =
    labelText;

  data.textContent =
    String(
      value ?? ""
    ).trim() ||
    "未填寫";

  wrapper.append(
    label,
    data
  );

  return wrapper;
}

/* =========================================================
   審核狀態文字
   ========================================================= */

function getApplicationStatusText(
  status
) {
  const statusMap = {
    pending:
      "待審核",

    approved:
      "已通過",

    rejected:
      "已拒絕"
  };

  return (
    statusMap[status] ||
    "未知狀態"
  );
}

/* =========================================================
   積分轉換
   ========================================================= */

function normalizePoints(
  value
) {
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

/* =========================================================
   驗證積分輸入

   成功：回傳整數
   失敗：回傳 null
   ========================================================= */

function validatePointsInput(
  value
) {
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

/* =========================================================
   CSV 欄位跳脫
   ========================================================= */

function escapeCsvValue(
  value
) {
  let text =
    String(
      value ?? ""
    );

  /*
   * 避免 Excel 將內容視為公式。
   */
  if (
    /^[=+\-@]/.test(text)
  ) {
    text =
      `'${text}`;
  }

  return `"${text.replaceAll(
    '"',
    '""'
  )}"`;
}

/* =========================================================
   HTML 跳脫
   ========================================================= */

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

/* =========================================================
   顯示狀態訊息
   ========================================================= */

function showStatus(
  element,
  text,
  type = ""
) {
  if (!element) {
    return;
  }

  element.textContent =
    text;

  element.className =
    "status-message";

  if (type) {
    element.classList.add(
      type
    );
  }
}
