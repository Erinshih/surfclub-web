# 團練 LINE 小幫手

把團練的參加名單（本名）傳到「教練群組」，內容包含日期、時間、浪點和備註。

- ⏰ **自動**：報名截止時，自動傳 **最終名單**（每 5 分鐘檢查一次，同一團只傳一次）。人數不足也會傳，讓教練知道。
- 📨 **手動**：幹部在後台「團練管理」的團練卡片按 **「請小幫手通知教練」**，馬上把目前名單傳到教練群組。
- 傳過之後，後台卡片會顯示「📨 小幫手已通知教練：手動 10/8 09:00（4 人）、最終名單 10/9 18:05（7 人）」。
- 程式放在 Google Apps Script，免費，不用綁信用卡。LINE 的金鑰只存在 Apps Script 裡，不會出現在網站上。
- 手動按鈕會先用登入憑證確認是幹部才傳，社員或外人拿到網址也沒辦法亂傳。

第一次設定大約 20 分鐘，照順序做就可以。

---

## 一、建立 LINE 官方帳號

> 以下都要用 **電腦** 操作，手機 App 找不到 Messaging API。

1. 打開 <https://manager.line.biz>，用自己的 LINE 帳號登入，按「建立 LINE 官方帳號」。帳號名稱可以取「衝浪社團練小幫手」。
2. 進入剛建立的帳號，按 **右上角「⚙️ 設定」**：
   - 左側「Messaging API」→「啟用 Messaging API」→ 建立一個服務提供者（名稱隨意，例如「衝浪社」）→ 確定。
   - 左側「帳號設定」→「功能切換」→「加入群組或多人聊天室」改成 **接受邀請**。
   - 左側「回應設定」→ **自動回應訊息關閉**（Webhook 等第三步拿到網址後再開）。
3. 打開 <https://developers.line.biz/console> → 點服務提供者 → 點官方帳號的頻道 → 上方切到 **「Messaging API」** 分頁：
   - 拉到最下面 **Channel access token (long-lived)** → 按「Issue」→ 按 📋 複製。
   - ⚠️ 要複製的是「Messaging API」分頁最下面那串 **很長的 access token**（約 170 字），不是「Basic settings」分頁的 **Channel secret**（32 字）。填錯會出現 401 錯誤。
   - 這串等同官方帳號的密碼，不要截圖、不要貼到群組或網站程式碼。

---

## 二、建立 Google Apps Script

> 一定要用 **Firebase 專案的擁有者（或編輯者）Google 帳號**，不然讀不到 Firestore。

1. 打開 <https://script.google.com> →「新專案」，名稱改成「團練通知小幫手」。
2. 左側 ⚙️「專案設定」→ 勾選 **在編輯器中顯示「appsscript.json」資訊清單檔案**。
3. 左側 `< >`「編輯器」：
   - `程式碼.gs` 內容全部換成這個資料夾的 [Code.gs](Code.gs)。
   - `appsscript.json` 內容全部換成這個資料夾的 [appsscript.json](appsscript.json)。
   - 按 💾 儲存。
4. 左側 ⚙️「專案設定」→ 最下面「指令碼屬性」→ 新增：

   | 屬性 | 值 |
   |---|---|
   | `FIREBASE_PROJECT_ID` | `surfclub-web` |
   | `FIREBASE_API_KEY` | `js/firebase-config.js` 裡 `apiKey` 的值（`AIza` 開頭） |
   | `LINE_CHANNEL_TOKEN` | 第一步複製的 Channel access token |

5. 編輯器上方函式選單選 **previewPractices** → 執行。
   - 第一次會要求授權：選帳號 →「進階」(Advanced) →「前往 團練通知小幫手（不安全）」→ 全部勾選 →「允許」。程式是自己寫的、沒有送 Google 審核，所以會有這個警告，屬於正常情況。
   - 執行記錄出現「沒有需要傳最終名單的團練。」或【預覽】訊息，就代表讀得到 Firestore。

---

## 三、部署、設定 Webhook、取得群組 ID

1. Apps Script 右上角「部署」→「新增部署作業」→ 齒輪選 **網頁應用程式**：
   - 執行身分：**我**
   - 誰可以存取：**所有人**
   - 按「部署」，複製 `https://script.google.com/macros/s/……/exec` 這個網址。
2. LINE Developers →「Messaging API」分頁：
   - **Webhook URL** 貼上網址 → Update，打開 **Use webhook**。（按 Verify 顯示 302 錯誤可以忽略）
3. manager.line.biz →「⚙️ 設定」→「回應設定」→ **Webhook 開啟**。
4. 用手機掃「Messaging API」分頁上的 QR code，把官方帳號加為好友，再把它 **邀請進教練群組**。
   - 它會回覆「這個群組的 ID：C……」；沒回覆的話在群組輸入 `群組ID`。
   - 還是沒回覆：在群組隨便傳一句話，到 Apps Script 執行 **showGroupId**，執行記錄會顯示群組 ID。
5. 指令碼屬性新增：

   | 屬性 | 值 |
   |---|---|
   | `LINE_GROUP_ID` | C 開頭的群組 ID |

---

## 四、測試、開始自動執行、接上網站

1. 執行 **testLine** → 教練群組會收到「✅ 團練通知小幫手設定完成！」。
2. 執行 **setupTrigger** → 之後每 5 分鐘檢查一次，報名截止就傳最終名單。
3. 到網站後台「團練管理」→ 下方「新增團練的預設值」→ **LINE 小幫手網址** 貼上第三步的 `/exec` 網址 → 儲存預設值。
4. 在任一有人報名的團練卡片按「📨 請小幫手通知教練」，教練群組應該馬上收到名單。

完成 🎉

---

## 注意事項

- **LINE 免費額度**：官方帳號免費方案每月可傳的訊息數有限（大約 200 則），而且是照「收到的人數」計算，例如教練群組有 6 個人，傳一次就算 6 則。實際額度以 LINE 官方帳號管理後台「方案」頁面為準。
- **截止時間改了**：在後台把截止時間延後到現在之後，最終名單的紀錄會清掉，新的截止時間到了會再傳一次。
- **有錯誤時**：Apps Script 左側「執行項目」可以看每次執行的紀錄。排程失敗時 Apps Script 也會寄信到 Gmail。常見錯誤：
  - `Firestore 讀寫失敗（403）`：執行程式的 Google 帳號不是 Firebase 專案的擁有者或編輯者。
  - `LINE 傳送失敗（401）`：Channel access token 錯誤（例如填成 Channel secret）或被重新發行過。
  - `LINE 傳送失敗（400）`：`LINE_GROUP_ID` 填錯，或官方帳號被踢出群組。
  - 後台按鈕顯示「登入已過期」：重新整理後台頁面再按一次。
  - 後台按鈕顯示「還沒設定指令碼屬性 FIREBASE_API_KEY」：補上第二步的 `FIREBASE_API_KEY`。
- **修改 Code.gs 之後**：要到「部署」→「管理部署作業」→ ✏️ →「版本：新版本」→「部署」，後台按鈕和 Webhook 才會用到新程式（網址不變）。自動排程則會直接用最新程式。
- **換教練群組**：把官方帳號邀進新群組，輸入 `群組ID`，更新 `LINE_GROUP_ID`。
- **幹部交接**：把 Apps Script 專案共用給新幹部（或改用社團共用帳號），確認那個帳號是 Firebase 專案成員，再執行一次 setupTrigger。
