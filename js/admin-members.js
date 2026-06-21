
/* =========================================================
   檔案：js/admin-members.js
   功能：社員審核、正式社員管理、CSV 匯出
   已完全移除匯款截圖與 Firebase Storage
   ========================================================= */

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

// import {
//   collection,
//   doc,
//   getDoc,
//   getDocs,
//   serverTimestamp,
//   updateDoc
// } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";


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
   讀取全部使用者
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
        (documentSnapshot) => ({
          uid:
            documentSnapshot.id,

          ...documentSnapshot.data()
        })
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
   待審核社員
   ========================================================= */

function renderPendingMembers() {
  pendingMemberList.innerHTML = "";

  /*
   * 僅顯示 status === pending。
   * 被拒絕後 status 會變成 rejected，
   * 因此會從待審核清單消失。
   */
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
            role: "member",
            status: "approved",
            paymentStatus: "paid",

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
            role: "pending",
            status: "rejected",
            paymentStatus: "rejected",

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

  /*
   * 已移除匯款截圖區塊。
   */
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
   建立條狀社員列
   ========================================================= */

// function createMemberEditor(
//   member
// ) {
//   const row =
//     document.createElement(
//       "article"
//     );

//   const identity =
//     document.createElement(
//       "div"
//     );

//   const name =
//     document.createElement(
//       "strong"
//     );

//   const detail =
//     document.createElement(
//       "span"
//     );

//   const levelWrapper =
//     document.createElement(
//       "label"
//     );

//   const levelLabel =
//     document.createElement(
//       "span"
//     );

//   const levelSelect =
//     document.createElement(
//       "select"
//     );

//   const familyWrapper =
//     document.createElement(
//       "label"
//     );

//   const familyLabel =
//     document.createElement(
//       "span"
//     );

//   const familyInput =
//     document.createElement(
//       "input"
//     );

//   const paymentWrapper =
//     document.createElement(
//       "label"
//     );

//   const paymentLabel =
//     document.createElement(
//       "span"
//     );

//   const paymentSelect =
//     createPaymentSelect(
//       member.paymentStatus ||
//       "unpaid"
//     );

//   const saveButton =
//     document.createElement(
//       "button"
//     );

//   row.className =
//     "member-row";

//   identity.className =
//     "member-row-identity";

//   name.className =
//     "member-row-name";

//   detail.className =
//     "member-row-detail";

//   levelWrapper.className =
//     "member-row-field";

//   familyWrapper.className =
//     "member-row-field member-row-family";

//   paymentWrapper.className =
//     "member-row-field";

//   name.textContent =
//     `${
//       member.name ||
//       "未命名社員"
//     }${
//       member.role === "admin"
//         ? "（管理員）"
//         : ""
//     }`;

//   const detailParts = [];

//   if (member.email) {
//     detailParts.push(
//       member.email
//     );
//   }

//   if (member.studentId) {
//     detailParts.push(
//       member.studentId
//     );
//   }

//   detail.textContent =
//     detailParts.join("｜") ||
//     "無其他資料";

//   identity.append(
//     name,
//     detail
//   );

//   /* =====================================================
//      Level
//      ===================================================== */

//   levelLabel.textContent =
//     "Level";

//   [
//     "",
//     "Lv.1",
//     "Lv.2",
//     "Lv.3",
//     "Lv.4"
//   ].forEach(
//     (level) => {
//       const option =
//         document.createElement(
//           "option"
//         );

//       option.value =
//         level;

//       option.textContent =
//         level ||
//         "尚未設定";

//       option.selected =
//         member.level === level;

//       levelSelect.appendChild(
//         option
//       );
//     }
//   );

//   levelWrapper.append(
//     levelLabel,
//     levelSelect
//   );

//   /* =====================================================
//      家系
//      ===================================================== */

//   familyLabel.textContent =
//     "家系";

//   familyInput.type =
//     "text";

//   familyInput.maxLength =
//     50;

//   familyInput.placeholder =
//     "尚未分配";

//   familyInput.value =
//     member.family || "";

//   familyWrapper.append(
//     familyLabel,
//     familyInput
//   );

//   /* =====================================================
//      社費
//      ===================================================== */

//   paymentLabel.textContent =
//     "社費";

//   paymentWrapper.append(
//     paymentLabel,
//     paymentSelect
//   );

//   /* =====================================================
//      儲存修改
//      ===================================================== */

//   saveButton.type =
//     "button";

//   saveButton.className =
//     "button button-small member-row-save";

//   saveButton.textContent =
//     "儲存";

//   saveButton.addEventListener(
//     "click",
//     async () => {
//       saveButton.disabled =
//         true;

//       saveButton.textContent =
//         "儲存中……";

//       try {
//         await updateDoc(
//           doc(
//             db,
//             "users",
//             member.uid
//           ),
//           {
//             level:
//               levelSelect.value,

//             family:
//               familyInput
//                 .value
//                 .trim(),

//             paymentStatus:
//               paymentSelect.value,

//             updatedAt:
//               serverTimestamp()
//           }
//         );

//         /*
//          * 同步更新目前記憶體資料。
//          */
//         member.level =
//           levelSelect.value;

//         member.family =
//           familyInput
//             .value
//             .trim();

//         member.paymentStatus =
//           paymentSelect.value;

//         showStatus(
//           memberMessage,
//           `${
//             member.name ||
//             "社員"
//           } 的資料已更新。`,
//           "success"
//         );

//         saveButton.textContent =
//           "已儲存";

//         window.setTimeout(
//           () => {
//             saveButton.textContent =
//               "儲存";
//           },
//           1200
//         );
//       } catch (error) {
//         console.error(
//           "社員資料更新失敗：",
//           error
//         );

//         showStatus(
//           memberMessage,
//           `更新失敗：${
//             error?.message ||
//             "未知錯誤"
//           }`,
//           "error"
//         );

//         saveButton.textContent =
//           "儲存";
//       } finally {
//         saveButton.disabled =
//           false;
//       }
//     }
//   );

//   row.append(
//     identity,
//     levelWrapper,
//     familyWrapper,
//     paymentWrapper,
//     saveButton
//   );

//   return row;
// }


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
     樣式
     ===================================================== */

  row.className =
    "member-row";

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
      saveButton.disabled =
        true;

      deleteButton.disabled =
        true;

      saveButton.textContent =
        "儲存中……";

      try {
        await updateDoc(
          doc(
            db,
            "users",
            member.uid
          ),
          {
            level:
              levelSelect.value,

            family:
              familyInput
                .value
                .trim(),

            paymentStatus:
              paymentSelect.value,

            updatedAt:
              serverTimestamp()
          }
        );

        member.level =
          levelSelect.value;

        member.family =
          familyInput
            .value
            .trim();

        member.paymentStatus =
          paymentSelect.value;

        showStatus(
          memberMessage,
          `${
            member.name ||
            "社員"
          } 的資料已更新。`,
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

        deleteButton.disabled =
          false;
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
   * 避免管理員刪除自己的 Firestore 文件，
   * 否則刪除後可能立即失去後台權限。
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
     組合按鈕
     ===================================================== */

  actions.append(
    saveButton,
    deleteButton
  );

  row.append(
    identity,
    levelWrapper,
    familyWrapper,
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
   共用函式
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

function getApplicationStatusText(
  status
) {
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

function escapeCsvValue(
  value
) {
  let text =
    String(
      value ?? ""
    );

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

