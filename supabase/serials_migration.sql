-- 貨件序號：指定廠商（設定頁勾「需記錄序號」）的料件，收貨時必填序號。
-- items.serials：一行一個序號；vendors.need_serials：該廠商是否需記錄序號。
-- 只新增欄位，不修改、不刪除任何既有資料；已在用的資料庫在 SQL Editor 執行這一份即可（可重複執行）。

alter table public.items   add column if not exists serials text;
alter table public.vendors add column if not exists need_serials boolean not null default false;
