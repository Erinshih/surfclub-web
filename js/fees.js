/* =========================================================
   檔案：js/fees.js
   費用與待繳管理

   charges/{chargeId}：費用項目（只有管理員讀寫）
   { title, amount, dueDate, note, tripId, createdAt, createdBy }

   payments/{chargeId}_{uid}：每個人每筆費用的繳費狀態
   { chargeId, uid, title, amount, dueDate, note, status,
     reportNote, reportedAt, paidAt, confirmedBy, createdAt }
   名稱、金額、期限、轉帳資訊在建立時複製一份，社員不用讀 charges。

   status：
   - unpaid    未繳
   - reported  社員回報已轉帳，等幹部確認
   - paid      已繳
   - waived    免繳
   ========================================================= */

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export const PAYMENT_STATUS = {
  unpaid: { label: "未繳", tone: "danger" },
  reported: { label: "已回報，待確認", tone: "warning" },
  paid: { label: "已繳", tone: "success" },
  waived: { label: "免繳", tone: "muted" }
};

/*
 * 還要追的錢：未繳＋已回報但還沒確認
 */
export function isOutstanding(payment) {
  return payment.status === "unpaid" || payment.status === "reported";
}

export function formatMoney(amount) {
  return `NT$${Number(amount || 0).toLocaleString("zh-TW")}`;
}

function sortByNewest(items) {
  return items.sort((first, second) =>
    (second.createdAt?.toMillis?.() || 0) - (first.createdAt?.toMillis?.() || 0)
  );
}

/* =========================================================
   社員
   ========================================================= */

export async function loadMyPayments(db, uid) {
  const snapshot =
    await getDocs(
      query(
        collection(db, "payments"),
        where("uid", "==", uid)
      )
    );

  return sortByNewest(
    snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }))
  );
}

/*
 * 社員回報已轉帳（填帳號末五碼或備註）
 */
export async function reportPayment(db, paymentId, reportNote) {
  await updateDoc(
    doc(db, "payments", paymentId),
    {
      status: "reported",
      reportNote: String(reportNote || "").trim().slice(0, 30),
      reportedAt: serverTimestamp()
    }
  );
}

/* =========================================================
   管理員
   ========================================================= */

export async function loadCharges(db) {
  const [chargeSnapshot, paymentSnapshot] =
    await Promise.all([
      getDocs(collection(db, "charges")),
      getDocs(collection(db, "payments"))
    ]);

  const paymentsByCharge = new Map();

  paymentSnapshot.docs.forEach((documentSnapshot) => {
    const payment = {
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    };

    if (!paymentsByCharge.has(payment.chargeId)) {
      paymentsByCharge.set(payment.chargeId, []);
    }

    paymentsByCharge.get(payment.chargeId).push(payment);
  });

  return sortByNewest(
    chargeSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data(),
      payments: paymentsByCharge.get(documentSnapshot.id) || []
    }))
  );
}

/*
 * 只讀還沒繳清的（管理首頁的總覽用）
 */
export async function loadOutstandingPayments(db) {
  const snapshot =
    await getDocs(
      query(
        collection(db, "payments"),
        where("status", "in", ["unpaid", "reported"])
      )
    );

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data()
  }));
}

export async function createCharge(db, { title, amount, dueDate, note, tripId, uids, createdBy }) {
  const chargeReference =
    doc(collection(db, "charges"));

  const charge = {
    title: String(title).trim(),
    amount: Math.round(Number(amount)),
    dueDate: dueDate || "",
    note: String(note || "").trim(),
    tripId: tripId || "",
    createdBy,
    createdAt: serverTimestamp()
  };

  /*
   * 一個 batch 最多 500 筆，社團人數用不到
   */
  const batch =
    writeBatch(db);

  batch.set(chargeReference, charge);

  uids.forEach((uid) => {
    batch.set(
      doc(db, "payments", `${chargeReference.id}_${uid}`),
      {
        chargeId: chargeReference.id,
        uid,
        title: charge.title,
        amount: charge.amount,
        dueDate: charge.dueDate,
        note: charge.note,
        status: "unpaid",
        reportNote: "",
        createdAt: serverTimestamp()
      }
    );
  });

  await batch.commit();

  return chargeReference.id;
}

export async function setPaymentStatus(db, paymentId, status, adminUid) {
  const changes = {
    status,
    updatedAt: serverTimestamp()
  };

  if (status === "paid") {
    changes.paidAt = serverTimestamp();
    changes.confirmedBy = adminUid;
  }

  await updateDoc(doc(db, "payments", paymentId), changes);
}

export async function deleteCharge(db, charge) {
  const batch =
    writeBatch(db);

  charge.payments.forEach((payment) => {
    batch.delete(doc(db, "payments", payment.id));
  });

  batch.delete(doc(db, "charges", charge.id));

  await batch.commit();
}
