-- 報價明細：料件新增可為空的 quote_lines（jsonb 陣列，每列 { name, qty, unit, price }，price 為未稅單價）。
-- 只新增欄位，不修改、不刪除任何既有資料；已在用的資料庫在 SQL Editor 執行這一份即可（可重複執行）。

alter table public.items add column if not exists quote_lines jsonb;
