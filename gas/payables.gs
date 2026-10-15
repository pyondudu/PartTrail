/**
 * PartTrail → 「應付帳款明細表 for 廠商」寫入端（Google Apps Script，綁定在試算表內）
 *
 * 安全原則：只會在「最後一列的下一列」新增一列，絕不修改或刪除既有任何儲存格。
 * 寫入前檢查：密鑰、工作表、標題列 10 欄、發票號碼不重複；任一不符就拒絕，不寫入。
 * 部署方式見專案 README「4. 應付帳款」。
 */

// 目標工作表的 gid（網址列 #gid= 後面的數字）；建立試算表副本時 gid 不變
const SHEET_GID = 1204705896;
const HEADER_ROW = 2;
const HEADERS = ['日期', '廠商', '報價單編號', '品項', '金額(含稅價)', '付款方式', '交易條件', '發票日期與編號', '預計付款日', '備註'];
const COL_INVOICE = 8; // H 欄：發票日期與編號

/** 第一次部署前在編輯器執行一次：產生密鑰並檢查標題列，結果看「執行記錄」 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  Logger.log('TOKEN（貼到 PartTrail 試算表連線設定）：' + token);
  const sheet = getSheet_();
  Logger.log('工作表：' + sheet.getName() + '，標題檢查：' + (checkHeaders_(sheet) || 'OK') + '，目前最後一列：' + sheet.getLastRow());
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || req.token !== token) return reply_({ ok: false, error: '密鑰不正確' });

    const sheet = getSheet_();
    const headerErr = checkHeaders_(sheet);
    if (headerErr) return reply_({ ok: false, error: headerErr });
    if (req.action === 'ping') return reply_({ ok: true, sheet: sheet.getName(), lastRow: sheet.getLastRow() });

    const row = req.row;
    if (!Array.isArray(row) || row.length !== HEADERS.length || row.some(function (c) { return typeof c !== 'string'; })) {
      return reply_({ ok: false, error: '資料格式不正確' });
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(req.invoice_date || '');
    const invoiceNo = String(req.invoice_no || '').trim();
    if (!m || !invoiceNo || !(req.amount >= 0)) return reply_({ ok: false, error: '發票日期、號碼或金額不正確' });

    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(15000)) return reply_({ ok: false, error: '試算表忙碌中，請稍後再試' });
    try {
      const last = sheet.getLastRow();
      if (last > HEADER_ROW) {
        const existing = sheet.getRange(HEADER_ROW + 1, COL_INVOICE, last - HEADER_ROW, 1).getDisplayValues();
        const dup = existing.some(function (r) { return r[0].split('&').pop().trim() === invoiceNo; });
        if (dup) return reply_({ ok: false, error: '試算表已有發票號碼 ' + invoiceNo + '，未寫入' });
      }

      const target = Math.max(last, HEADER_ROW) + 1;
      if (sheet.getMaxRows() < target) sheet.insertRowsAfter(sheet.getMaxRows(), 1); // 只在表格最末端補空白列
      const range = sheet.getRange(target, 1, 1, HEADERS.length);
      if (last > HEADER_ROW) sheet.getRange(last, 1, 1, HEADERS.length).copyTo(range, { formatOnly: true });

      const values = row.slice();
      values[0] = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      values[4] = Number(req.amount);
      sheet.getRange(target, 1).setNumberFormat('M/d');
      sheet.getRange(target, 5).setNumberFormat('"NT$"#,##0');
      sheet.getRange(target, COL_INVOICE).setNumberFormat('@'); // 發票欄維持純文字
      range.setValues([values]);
      SpreadsheetApp.flush();

      const res = { ok: true, row: target };
      const filter = sheet.getFilter();
      if (filter && filter.getRange().getLastRow() < target) res.warning = '新的一列不在篩選範圍內，需要篩選時請重新設定篩選範圍';
      return reply_(res);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message || err) });
  }
}

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets().filter(function (s) { return s.getSheetId() === SHEET_GID; })[0];
  if (!sheet) throw new Error('找不到 gid=' + SHEET_GID + ' 的工作表');
  return sheet;
}

// 標題列與預期不同（欄位被插入、搬移）就拒絕，避免寫錯位置
function checkHeaders_(sheet) {
  const norm = function (s) { return String(s).replace(/\s/g, '').replace(/（/g, '(').replace(/）/g, ')'); };
  const actual = sheet.getRange(HEADER_ROW, 1, 1, HEADERS.length).getDisplayValues()[0].map(norm);
  const diff = HEADERS.map(norm).filter(function (h, i) { return actual[i] !== h; });
  return diff.length ? '標題列與預期不符（' + actual.join('｜') + '），未寫入' : '';
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
