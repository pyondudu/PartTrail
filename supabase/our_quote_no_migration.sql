-- 公司報價單號：我們給客戶的報價單號（客戶回簽後視為訂單），與廠商的報價單號 quote_no 不同。
-- 只新增可為空的欄位，不修改、不刪除任何既有資料；已在用的資料庫在 SQL Editor 執行這一份即可（可重複執行）。

alter table public.items add column if not exists our_quote_no text;
