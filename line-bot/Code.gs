/* =========================================================
   檔案：line-bot/Code.gs（貼到 Google Apps Script）
   團練 LINE 小幫手：把參加名單傳到教練群組

   1. 自動：報名截止時，傳最終名單（每 5 分鐘檢查一次，同一團只傳一次）
      → 在團練寫上 deadlineNotifiedAt
   2. 手動：幹部在後台「團練管理」按「請小幫手通知教練」，馬上傳目前名單
      → 在團練寫上 manualNotifiedAt

   指令碼屬性（專案設定 → 指令碼屬性）：
     FIREBASE_PROJECT_ID  Firebase 專案 ID，例如 surfclub-web
     FIREBASE_API_KEY     Firebase 網頁 API 金鑰（js/firebase-config.js 的 apiKey），用來確認是幹部按的
     LINE_CHANNEL_TOKEN   LINE Messaging API 的 Channel access token
     LINE_GROUP_ID        教練群組的 ID（把官方帳號邀進群組，它會回覆這個 ID）

   執行這支程式的 Google 帳號，必須是 Firebase 專案的擁有者或編輯者。
   修改程式後要到「部署 → 管理部署作業」發布新版本，後台按鈕才會用到新程式。
   ========================================================= */

const TIME_ZONE = "Asia/Taipei";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/* =========================================================
   自動：報名截止時傳最終名單
   ========================================================= */

function checkPractices() {
  runCheck_(false);
}

/*
 * 只看會傳哪些團、訊息長怎樣，不會真的傳出去
 * 第一次設定時先跑這個，確認讀得到 Firestore
 */
function previewPractices() {
  runCheck_(true);
}

function runCheck_(dryRun) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    console.log("上一次還沒跑完，這次先跳過。");
    return;
  }

  try {
    const config = getConfig_(dryRun);
    const now = new Date();

    const practices =
      loadUpcomingPractices_(config, now)
        .filter(function (practice) {
          return needsFinalList_(practice, now);
        });

    if (practices.length === 0) {
      console.log("沒有需要傳最終名單的團練。");
      return;
    }

    const names = loadMemberNames_(config, collectUids_(practices));
    const errors = [];

    practices.forEach(function (practice) {
      const text =
        buildMessage_(practice, getNames_(practice, names), now, "final");

      if (dryRun) {
        console.log("【預覽】會傳出這則訊息：\n" + text);
        return;
      }

      try {
        pushLineMessage_(config, text);
        markNotified_(config, practice, "deadline", now);

        console.log("已傳最終名單：" + practice.date + " " + practice.start + " " + practice.spot);
      } catch (error) {
        console.error("傳送失敗：" + practice.date + " " + practice.start + "：" + error.message);
        errors.push(error.message);
      }
    });

    /*
     * 有失敗的話丟出錯誤，Apps Script 會寄信通知
     */
    if (errors.length > 0) {
      throw new Error(errors.length + " 團傳送失敗：" + errors.join("；"));
    }
  } finally {
    lock.releaseLock();
  }
}

/*
 * 報名截止了、還沒開始、沒取消、有人報名、還沒傳過最終名單
 */
function needsFinalList_(practice, now) {
  const start = getPracticeStart_(practice);

  const deadline =
    practice.signupDeadline instanceof Date ? practice.signupDeadline : start;

  return practice.status !== "cancelled" &&
    practice.participants.length > 0 &&
    !practice.deadlineNotifiedAt &&
    now >= deadline &&
    start > now;
}

/* =========================================================
   手動：後台按鈕
   ========================================================= */

/*
 * 後台送來 { action: "notify", practiceId, idToken }
 * 確認是幹部之後，馬上把目前名單傳到教練群組
 */
function handleNotifyRequest_(body) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(20000)) {
    return jsonOutput_({ ok: false, error: "小幫手正在忙，請過幾秒再按一次。" });
  }

  try {
    const config = getConfig_(false);

    if (!config.apiKey) {
      throw new Error("還沒設定指令碼屬性 FIREBASE_API_KEY。");
    }

    const uid = verifyIdToken_(config, body.idToken);
    const user = getDocument_(config, "users/" + uid);

    if (!user || user.role !== "admin") {
      throw new Error("只有幹部可以請小幫手傳通知。");
    }

    const practiceId = String(body.practiceId || "");

    if (!/^[A-Za-z0-9_-]+$/.test(practiceId)) {
      throw new Error("找不到這團團練。");
    }

    const practice = getDocument_(config, "practices/" + practiceId);

    if (!practice) {
      throw new Error("找不到這團團練。");
    }

    practice.participants = practice.participants || [];

    if (practice.status === "cancelled") {
      throw new Error("這團已經取消了。");
    }

    if (practice.participants.length === 0) {
      throw new Error("這團還沒有人報名。");
    }

    const now = new Date();

    const names =
      loadMemberNames_(config, practice.participants);

    pushLineMessage_(
      config,
      buildMessage_(practice, getNames_(practice, names), now, "manual")
    );

    markNotified_(config, practice, "manual", now);

    console.log("幹部手動通知：" + practice.date + " " + practice.start + " " + practice.spot);

    return jsonOutput_({ ok: true, count: practice.participants.length });
  } catch (error) {
    console.error("手動通知失敗：" + error.message);

    return jsonOutput_({ ok: false, error: error.message });
  } finally {
    lock.releaseLock();
  }
}

/*
 * 用 Firebase 確認登入憑證，回傳使用者 uid
 */
function verifyIdToken_(config, idToken) {
  if (!idToken) {
    throw new Error("請重新登入後再試一次。");
  }

  const response =
    UrlFetchApp.fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(config.apiKey),
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
      }
    );

  const data =
    JSON.parse(response.getContentText() || "{}");

  const user =
    data.users && data.users[0];

  if (response.getResponseCode() !== 200 || !user || !user.localId) {
    throw new Error("登入已過期，請重新整理頁面後再試一次。");
  }

  return user.localId;
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   設定
   ========================================================= */

/*
 * 讀指令碼屬性；複製貼上時多出來的空白、換行會去掉
 */
function getProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || "").trim();
}

function getConfig_(dryRun) {
  const config = {
    projectId: getProperty_("FIREBASE_PROJECT_ID"),
    apiKey: getProperty_("FIREBASE_API_KEY"),
    lineToken: getProperty_("LINE_CHANNEL_TOKEN"),
    groupId: getProperty_("LINE_GROUP_ID")
  };

  const required =
    dryRun
      ? { FIREBASE_PROJECT_ID: config.projectId }
      : {
        FIREBASE_PROJECT_ID: config.projectId,
        LINE_CHANNEL_TOKEN: config.lineToken,
        LINE_GROUP_ID: config.groupId
      };

  const missing =
    Object.keys(required).filter(function (key) {
      return !required[key];
    });

  if (missing.length > 0) {
    throw new Error("還沒設定指令碼屬性：" + missing.join("、"));
  }

  return config;
}

/*
 * 每 5 分鐘自動執行 checkPractices；重複執行也只會有一個排程
 */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "checkPractices") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("checkPractices")
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log("已設定每 5 分鐘檢查一次團練。");
}

/*
 * 顯示 Webhook 最近收到的群組 ID（機器人沒回覆時用）
 */
function showGroupId() {
  const id =
    getProperty_("LAST_SEEN_GROUP_ID");

  console.log(
    id
      ? "最近收到訊息的群組 ID：" + id + "\n確認是教練群組後，貼到指令碼屬性 LINE_GROUP_ID。"
      : "還沒收到任何群組訊息，代表 LINE 的 Webhook 還沒送到這裡，請檢查 Webhook 設定。"
  );
}

/*
 * 傳一則測試訊息到教練群組，確認 LINE 設定正確
 */
function testLine() {
  pushLineMessage_(
    getConfig_(false),
    "✅ 團練通知小幫手設定完成！報名截止時會在這裡傳最終名單。"
  );

  console.log("已傳出測試訊息。");
}

/* =========================================================
   Firestore
   ========================================================= */

function getDocumentsUrl_(config) {
  return "https://firestore.googleapis.com/v1/projects/" +
    config.projectId +
    "/databases/(default)/documents";
}

function firestoreRequest_(config, url, method, payload) {
  const options = {
    method: method,
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken(),
      "x-goog-user-project": config.projectId
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code === 404 && method === "get") {
    return null;
  }

  if (code >= 300) {
    throw new Error("Firestore 讀寫失敗（" + code + "）：" + response.getContentText());
  }

  return JSON.parse(response.getContentText() || "{}");
}

function fromValue_(value) {
  if (!value) {
    return null;
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("integerValue" in value) {
    return Number(value.integerValue);
  }

  if ("doubleValue" in value) {
    return value.doubleValue;
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("timestampValue" in value) {
    return new Date(value.timestampValue);
  }

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fromValue_);
  }

  if ("mapValue" in value) {
    return fromFields_(value.mapValue.fields);
  }

  return null;
}

function fromFields_(fields) {
  const data = {};

  Object.keys(fields || {}).forEach(function (key) {
    data[key] = fromValue_(fields[key]);
  });

  return data;
}

/*
 * 讀一筆文件，例如 "users/abc"；不存在時回傳 null
 */
function getDocument_(config, path) {
  const document =
    firestoreRequest_(config, getDocumentsUrl_(config) + "/" + path, "get");

  if (!document) {
    return null;
  }

  const data = fromFields_(document.fields);

  data.documentName = document.name;

  return data;
}

function loadUpcomingPractices_(config, now) {
  const today =
    Utilities.formatDate(now, TIME_ZONE, "yyyy-MM-dd");

  const rows =
    firestoreRequest_(
      config,
      getDocumentsUrl_(config) + ":runQuery",
      "post",
      {
        structuredQuery: {
          from: [{ collectionId: "practices" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "date" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { stringValue: today }
            }
          }
        }
      }
    );

  return rows
    .filter(function (row) {
      return row.document;
    })
    .map(function (row) {
      const practice = fromFields_(row.document.fields);

      practice.documentName = row.document.name;
      practice.participants = practice.participants || [];

      return practice;
    })
    .sort(function (first, second) {
      return (first.date + first.start).localeCompare(second.date + second.start);
    });
}

function collectUids_(practices) {
  const uids = [];

  practices.forEach(function (practice) {
    practice.participants.forEach(function (uid) {
      if (uids.indexOf(uid) === -1) {
        uids.push(uid);
      }
    });
  });

  return uids;
}

/*
 * 社員的本名；沒填本名才用綽號
 */
function loadMemberNames_(config, uids) {
  const names = {};

  if (uids.length === 0) {
    return names;
  }

  const prefix =
    "projects/" + config.projectId + "/databases/(default)/documents/users/";

  const rows =
    firestoreRequest_(
      config,
      getDocumentsUrl_(config) + ":batchGet",
      "post",
      {
        documents: uids.map(function (uid) {
          return prefix + uid;
        })
      }
    );

  rows.forEach(function (row) {
    if (!row.found) {
      return;
    }

    const data = fromFields_(row.found.fields);
    const uid = row.found.name.split("/").pop();

    names[uid] =
      data.name ||
      (data.profile && data.profile.nickname) ||
      "社員";
  });

  return names;
}

function getNames_(practice, names) {
  return practice.participants.map(function (uid) {
    return names[uid] || "（已不是社員）";
  });
}

/*
 * 記下傳過的時間和當時人數
 * kind：deadline（最終名單）或 manual（幹部手動）
 */
function markNotified_(config, practice, kind, now) {
  const prefix =
    kind === "deadline" ? "deadlineNotified" : "manualNotified";

  const fields = {};

  fields[prefix + "At"] = { timestampValue: now.toISOString() };
  fields[prefix + "Count"] = { integerValue: String(practice.participants.length) };

  firestoreRequest_(
    config,
    "https://firestore.googleapis.com/v1/" + practice.documentName +
      "?updateMask.fieldPaths=" + prefix + "At" +
      "&updateMask.fieldPaths=" + prefix + "Count" +
      "&currentDocument.exists=true",
    "patch",
    { fields: fields }
  );
}

/* =========================================================
   訊息
   ========================================================= */

function getPracticeStart_(practice) {
  return new Date(practice.date + "T" + practice.start + ":00+08:00");
}

function formatPracticeDate_(practice) {
  const parts = practice.date.split("-").map(Number);
  const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();

  return parts[1] + "/" + parts[2] + "（" + WEEKDAYS[weekday] + "）";
}

/*
 * kind：final（報名截止自動傳）或 manual（幹部手動傳）
 * 手動傳的時候如果已經過了截止時間，也算最終名單
 */
function buildMessage_(practice, names, now, kind) {
  const count = names.length;
  const min = practice.minParticipants || 1;
  const enough = count >= min;

  const deadline =
    practice.signupDeadline instanceof Date ? practice.signupDeadline : getPracticeStart_(practice);

  const isFinal =
    kind === "final" || now >= deadline;

  let headline;

  if (isFinal) {
    headline =
      enough
        ? "⏰ 團練報名截止！最終名單 " + count + " 人（" + min + " 人成團）"
        : "⏰ 團練報名截止，只有 " + count + " 人報名（未達成團人數 " + min + " 人）";
  } else {
    headline =
      enough
        ? "📣 團練目前名單：" + count + " 人報名（" + min + " 人成團）"
        : "📣 團練目前名單：" + count + " 人報名（還差 " + (min - count) + " 人成團）";
  }

  let closing;

  if (practice.status === "confirmed") {
    closing = "已確定成團，名單如上，謝謝教練！🙏";
  } else if (enough) {
    closing = "麻煩教練確認這團可以帶，謝謝！🙏";
  } else if (isFinal) {
    closing = "人數不足，幹部會再決定要不要照常團練。";
  } else {
    closing = "還在招募中，報名截止時會再傳最終名單。";
  }

  const lines = [
    headline,
    "",
    "📅 " + formatPracticeDate_(practice) + " " + practice.start + "–" + practice.end,
    "📍 " + (practice.spot || "浪點未定")
  ];

  if (practice.status === "confirmed") {
    lines.push("✅ 已確定成團");
  }

  lines.push("", "👥 參加名單：");

  names.forEach(function (name, index) {
    lines.push((index + 1) + ". " + name);
  });

  if (practice.note) {
    lines.push("", "📝 " + practice.note);
  }

  lines.push("", closing);

  return lines.join("\n");
}

/* =========================================================
   LINE
   ========================================================= */

function lineRequest_(token, path, payload) {
  const response =
    UrlFetchApp.fetch(
      "https://api.line.me/v2/bot/message/" + path,
      {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + token },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

  const code = response.getResponseCode();

  if (code !== 200) {
    throw new Error("LINE 傳送失敗（" + code + "）：" + response.getContentText());
  }
}

function pushLineMessage_(config, text) {
  lineRequest_(
    config.lineToken,
    "push",
    {
      to: config.groupId,
      messages: [{ type: "text", text: text.slice(0, 5000) }]
    }
  );
}

/* =========================================================
   網頁應用程式入口
   - 後台按鈕：{ action: "notify", ... }
   - LINE Webhook：{ events: [...] }，用來取得教練群組的 ID
   ========================================================= */

function doPost(e) {
  let body = {};

  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (error) {
    body = {};
  }

  if (body.action === "notify") {
    return handleNotifyRequest_(body);
  }

  handleLineWebhook_(body);

  return ContentService.createTextOutput("OK");
}

/*
 * - 官方帳號被邀進群組時，自動回覆群組 ID
 * - 在群組輸入「群組ID」也會回覆
 * 這裡只會回覆訊息、記下最近看到的群組 ID，不會改任何設定
 */
function handleLineWebhook_(body) {
  const token =
    getProperty_("LINE_CHANNEL_TOKEN");

  (body.events || []).forEach(function (event) {
    const source = event.source || {};
    const id = source.groupId || source.roomId;

    if (id) {
      PropertiesService.getScriptProperties().setProperty("LAST_SEEN_GROUP_ID", id);
      console.log("收到群組訊息，群組 ID：" + id);
    }

    const isAskingId =
      event.type === "message" &&
      event.message &&
      event.message.type === "text" &&
      event.message.text.trim() === "群組ID";

    if (!(event.type === "join" || isAskingId)) {
      return;
    }

    if (!token || !event.replyToken) {
      console.error("沒辦法回覆：還沒設定指令碼屬性 LINE_CHANNEL_TOKEN。");
      return;
    }

    const text =
      id
        ? "大家好，我是團練通知小幫手 🏄\n\n這個群組的 ID：\n" + id +
          "\n\n請幹部把它貼到 Apps Script 的指令碼屬性 LINE_GROUP_ID。"
        : "請把我邀進教練群組，再在群組裡輸入「群組ID」。";

    try {
      lineRequest_(token, "reply", {
        replyToken: event.replyToken,
        messages: [{ type: "text", text: text }]
      });
    } catch (error) {
      console.error("回覆群組 ID 失敗：" + error.message);
    }
  });
}
