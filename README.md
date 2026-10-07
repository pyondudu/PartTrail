# PartTrail — 料件委外交期追蹤

| 元件 | 說明 |
|---|---|
| `supabase/schema.sql` | 資料庫結構、權限（RLS）、附檔 Storage、交期與狀態歷程 trigger |
| `web/` | 追蹤總表網頁（Vue 3 + Vite），手機/電腦皆可用，可加到手機主畫面 |
| `widget/` | Windows 桌面精靈（Electron），常駐提醒 3 日內（含逾期）要到貨的料件 |

狀態流程：**已報價** → **已下單**（已用印回傳、交期已確認）→ **已收貨**（記錄到貨日）

---

## 1. 建立 Supabase（約 10 分鐘，一次性）

> 本專案進度：✅ 1-1 建立專案（`https://pcujnsjukppnobdvwijl.supabase.co`，Tokyo）　✅ 1-2 執行 schema.sql　⏸ 1-3 起尚未完成

### 1-1 建立專案
1. 到 <https://supabase.com> 註冊，建立 Organization（Plan 選 **Free**）。
2. **New project**：
   - Project name：`parttrail`
   - Database Password：按 Generate 產生並另外保存
   - Region：**Northeast Asia (Tokyo)**
   - Security options：**Enable Data API** 打勾、**Automatically expose new tables** 打勾（資料安全由 RLS 保護）
3. 按 **Create new project**，等狀態變成 **Healthy**。

### 1-2 建立資料表
左側 **SQL Editor** → **+** 新查詢 → 貼上 `supabase/schema.sql` 全部內容 → **Run**，出現 `Success. No rows returned` 即完成。

### 1-3 建立自己的帳號
**Authentication → Users → Add user → Create new user**：輸入 Email、密碼，**勾選 Auto Confirm User**。

### 1-4 設為編輯者
SQL Editor 新查詢執行（email 換成你的），結果中 role 應為 `editor`：
```sql
update public.profiles set role = 'editor' where email = '你的email';
select email, role from public.profiles;
```

### 1-5 關閉公開註冊
**Authentication → Sign In / Providers**（或 Configuration 底下）：關閉 **Allow new users to sign up** → Save。之後只有你從後台邀請的人能登入。

### 1-6 取得連線金鑰
**Project Settings → API Keys**：複製 **Publishable key**（`sb_publishable_…`）；若只看到舊版畫面，則用 **anon public** key（`eyJ…`）。兩者擇一即可，填到下方的 `VITE_SUPABASE_ANON_KEY`。

### 邀請主管/同事（唯讀）
**Authentication → Users → Invite user** 輸入對方 Email。對方收信設定後即可登入，預設是唯讀（viewer）。
若要讓對方用 Email 連結登入（免密碼），請到 **Authentication → URL Configuration** 把網頁網址加入 *Site URL* / *Redirect URLs*。

---

## 2. 網頁追蹤總表

### 本機試用
```bash
cd web
cp .env.example .env     # 填入 Project URL 與 Publishable / anon key
npm install
npm run dev              # 同一個 Wi-Fi 下手機也可用顯示的 Network 網址開啟
```

### 部署到網路（手機隨時可看）
**方法 A：GitHub Pages（推薦）**
1. 把整個專案推到 GitHub repo。
2. Repo → Settings → Secrets and variables → Actions，新增 `SUPABASE_URL`、`SUPABASE_ANON_KEY`。
3. Repo → Settings → Pages → Source 選 **GitHub Actions**。
4. Actions → **Deploy web** → Run workflow。網址會是 `https://<帳號>.github.io/<repo>/`。

**方法 B：Netlify** — `npm run build` 後把 `web/dist` 資料夾拖到 <https://app.netlify.com/drop>（需先建立 `.env`）。

> Publishable / anon key 是設計上可公開的金鑰，資料安全由資料庫的 RLS 權限保護：未登入者讀不到任何資料，viewer 無法寫入。

### 手機加到主畫面
- iPhone：Safari 開啟 → 分享 → 加入主畫面
- Android：Chrome 開啟 → 選單 → 安裝應用程式／加到主畫面

### 功能
- 總表：逾期／3 日內／進行中／本月已收貨摘要（可點擊篩選）、搜尋、依狀態/廠商/需求人篩選，即時同步。
- 料件明細：一鍵 **📋 複製進度**（貼給追問的主管/同事）、**✓ 已收貨**、拍照或上傳報價單 PDF、交期變更紀錄、狀態歷程。
- 修改已確認的交期時會要求填寫變更原因，系統自動保留舊交期。
- 必填欄位：品名、需求人、數量、廠商；已下單另需**交期**；已收貨另需**到貨日**。其餘（規格、報價單號/金額（含稅）、備註、附檔）選填。廠商從下拉選單選擇，可用「＋ 新增廠商…」加入清單；附檔可在新增時一併選擇。漏填時欄位標紅並自動捲到該欄。

---

## 3. Windows 桌面精靈

### 取得 .exe
**方法 A：GitHub Actions 打包（推薦）**
1. 在 repo Secrets 再加一個 `WEB_URL`（網頁網址）。
2. Actions → **Build widget (Windows)** → Run workflow。
3. 完成後在該次執行頁面下載 `PartTrail-Widget`，內含：
   - `PartTrail-Widget-1.0.0-setup.exe`：安裝版（建議）
   - `PartTrail-Widget-1.0.0-portable.exe`：免安裝單一檔

**方法 B：在 Windows 電腦上自行打包**
```powershell
cd widget
copy config.example.json config.json   # 填入網址與 key（可省略，首次啟動再填）
npm install
npm run dist                            # 產出在 widget\dist\
```

### 使用
- 首次啟動會跳出「設定與登入」視窗，輸入 Email 密碼即可（之後自動登入，登入資訊以 Windows 加密保存）。
- 精靈預設在桌面右下角，可拖曳移動；**點精靈**展開清單，點料件開啟網頁明細。
- 心情：😊 沒有要到貨／📦 跳動＋徽章 = 3 日內有到貨／😰 發抖流汗 = 有逾期。
- 每天第一次開機與早上 9:00 會跳 Windows 通知。
- 右下角系統匣圖示（右鍵）：顯示/隱藏、立即更新、開啟總表、開機自動啟動、設定/登入、結束。
- 提前天數、提醒時間可在設定視窗調整。

### 開發預覽（不需 Supabase）
```bash
cd widget && npm install
PARTTRAIL_DEMO=1 npm start      # Windows PowerShell：$env:PARTTRAIL_DEMO=1; npm start
npm run icons                   # 重新產生圖示 PNG
```
