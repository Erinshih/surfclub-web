/* =========================================================
   檔案：line-bot/Code.gs（貼到 Google Apps Script）
   團練人數湊齊時，自動用 LINE 通知教練群組

   每 5 分鐘執行一次 checkPractices（執行一次 setupTrigger 就會建立）：
   1. 讀 Firestore 今天以後的團練
   2. 找出「招募中、人數到了成團人數、還沒通知過、還沒開始」的團
   3. 把日期、浪點、參加名單推播到教練群組
   4. 在團練寫上 coachNotifiedAt，同一團不會重複通知

   指令碼屬性（專案設定 → 指令碼屬性）：
     FIREBASE_PROJECT_ID  Firebase 專案 ID，例如 surfclub-web
     LINE_CHANNEL_TOKEN   LINE Messaging API 的 Channel access token
     LINE_GROUP_ID        教練群組的 ID（把官方帳號邀進群組，它會回覆這個 ID）

   執行這支程式的 Google 帳號，必須是 Firebase 專案的擁有者或編輯者。
   ========================================================= */

const TIME_ZONE = "Asia/Taipei";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/* =========================================================
   主程式：檢查團練、通知教練
   ========================================================= */

function checkPractices() {
  runCheck_(false);
}

/*
 * 只看會通知哪些團、訊息長怎樣，不會真的傳出去
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
          return practice.status === "open" &&
            !practice.coachNotifiedAt &&
            practice.participants.length >= (practice.minParticipants || 1) &&
            getPracticeStart_(practice) > now;
        });

    if (practices.length === 0) {
      console.log("沒有需要通知的團練。");
      return;
    }

    const uids = [];

    practices.forEach(function (practice) {
      practice.participants.forEach(function (uid) {
        if (uids.indexOf(uid) === -1) {
          uids.push(uid);
        }
      });
    });

    const names = loadMemberNames_(config, uids);
    const errors = [];

    practices.forEach(function (practice) {
      const text =
        buildMessage_(
          practice,
          practice.participants.map(function (uid) {
            return names[uid] || "（已不是社員）";
          })
        );

      if (dryRun) {
        console.log("【預覽】會傳出這則訊息：\n" + text);
        return;
      }

      try {
        pushLineMessage_(config, text);
        markNotified_(config, practice, now);

        console.log("已通知教練：" + practice.date + " " + practice.start + " " + practice.spot);
      } catch (error) {
        console.error("通知失敗：" + practice.date + " " + practice.start + "：" + error.message);
        errors.push(error.message);
      }
    });

    /*
     * 有失敗的話丟出錯誤，Apps Script 會寄信通知
     */
    if (errors.length > 0) {
      throw new Error(errors.length + " 團通知失敗：" + errors.join("；"));
    }
  } finally {
    lock.releaseLock();
  }
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
    PropertiesService.getScriptProperties().getProperty("LAST_SEEN_GROUP_ID");

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
    "✅ 團練通知小幫手設定完成！之後團練人數湊齊時，會自動在這裡通知教練。"
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

function markNotified_(config, practice, now) {
  firestoreRequest_(
    config,
    "https://firestore.googleapis.com/v1/" +
      practice.documentName +
      "?updateMask.fieldPaths=coachNotifiedAt" +
      "&updateMask.fieldPaths=coachNotifiedCount" +
      "&currentDocument.exists=true",
    "patch",
    {
      fields: {
        coachNotifiedAt: { timestampValue: now.toISOString() },
        coachNotifiedCount: { integerValue: String(practice.participants.length) }
      }
    }
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
 * 跟網站上「用 LINE 通知教練」的訊息一樣
 */
function buildMessage_(practice, names) {
  const lines = [
    "🏄 團練人數湊齊了！目前 " + names.length + " 人報名（" + (practice.minParticipants || 1) + " 人成團）",
    "",
    "📅 " + formatPracticeDate_(practice) + " " + practice.start + "–" + practice.end,
    "📍 " + (practice.spot || "浪點未定"),
    "",
    "👥 參加名單："
  ];

  names.forEach(function (name, index) {
    lines.push((index + 1) + ". " + name);
  });

  if (practice.note) {
    lines.push("", "📝 " + practice.note);
  }

  lines.push("", "麻煩教練確認這團可以帶，謝謝！🙏");

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

/*
 * LINE Webhook：用來取得教練群組的 ID
 * - 官方帳號被邀進群組時，自動回覆群組 ID
 * - 在群組輸入「群組ID」也會回覆
 * 這裡只會回覆訊息，不會改任何設定
 */
function doPost(e) {
  const token =
    getProperty_("LINE_CHANNEL_TOKEN");

  let body = {};

  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (error) {
    body = {};
  }

  (body.events || []).forEach(function (event) {
    const source = event.source || {};
    const id = source.groupId || source.roomId;

    /*
     * 記下最近一次收到訊息的群組 ID，機器人沒回覆時也能在指令碼屬性找到
     * 只是記錄，真正用來傳訊息的還是 LINE_GROUP_ID
     */
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

  return ContentService.createTextOutput("OK");
}
