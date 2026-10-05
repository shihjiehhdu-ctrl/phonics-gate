/** @OnlyCurrentDoc */
/* 上面這行讓試算表的授權範圍只限「這一份試算表」。另外會要求寄信的權限，用來寄出測驗連結。 */

/**
 * Phonics 入門門檻測驗：線上報名、學生名單與成績（Google 試算表後端）
 * 這份試算表只給這個測驗使用，不和其他測驗共用。
 *
 * 流程：家長在網站報名 → 這裡產生專屬代碼並寄出連結 → 家長點連結（等於驗證 Email）→ 孩子作答 → 成績寫回。
 * 每位孩子只能測一次。要開放重測，在 gate_students 分頁該列的 allow_retake 欄填 Y，測完會自動清空。
 *
 * 三個分頁會自動建立：gate_students（報名名單）、gate_summary（每次施測一列）、gate_responses（每題一列）。
 *
 * 部署：部署 → 新增部署作業 → 網頁應用程式；執行身分「我」；存取權「所有人」。
 * 之後修改程式，要到「管理部署作業 → 編輯 → 新版本」重新部署才會生效。
 */

/* ===== 部署前請填這三項 ===== */
const SITE_URL = 'PASTE_YOUR_SITE_URL_HERE';   // 測驗網站的網址，結尾要有斜線，例如 https://gate.example.com/
const SENDER_NAME = 'Phonics 入門門檻測驗';      // 信件上顯示的寄件人名稱
const NOTIFY_EMAIL = '';                         // 有孩子完成測驗時通知這個信箱；留空就不通知
/* ============================ */

const TEST_TITLE = 'Phonics 入門門檻測驗';
const STUDENT_SHEET = 'gate_students';
const SUMMARY_SHEET = 'gate_summary';
const RESPONSE_SHEET = 'gate_responses';
const STUDENT_HEAD = ['token', 'child_name', 'age', 'parent_name', 'email', 'experience', 'marketing_ok',
  'registered_at', 'mail_status', 'verified_at', 'started_at', 'starts', 'allow_retake', 'note'];
const SUMMARY_HEAD = ['attempt_id', 'token', 'name', 'attempt_no', 'attempt_at', 'finished_at', 'duration_s',
  'A_stage1', 'A_ctrl', 'B_diff', 'B_same', 'C', 'profile', 'result_code', 'borderline',
  'practice_A', 'practice_B', 'practice_C', 'assets', 'version', 'device'];
const RESPONSE_HEAD = ['attempt_id', 'token', 'item_id', 'subtest', 'stimulus', 'response', 'correct', 'error_type', 'rt_ms', 'replays', 'tag'];
const SUBTESTS = ['A_stage1', 'A_ctrl', 'B_diff', 'B_same', 'C'];
const MAILS_PER_HOUR = 3;   // 同一個信箱每小時最多寄幾封

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function norm_(t) { return String(t == null ? '' : t).trim().toUpperCase(); }
function yes_(v) { return v === true || /^(y|yes|true|1|是)$/i.test(String(v).trim()); }
/* 清理家長輸入的文字：去掉換行、網址和角括號，限制長度。這些文字會出現在寄出的信裡。 */
function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\r\n\t<>]/g, ' ').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function esc_(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* 讀一個分頁：回傳 { sh, rows（不含標題列）, col（欄名 → 第幾欄，從 0 起算） }；分頁不存在時自動建立 */
function table_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  const all = sh.getDataRange().getValues();
  const h = (all[0] || head).map(function (x) { return String(x).trim(); });
  const col = {};
  head.forEach(function (k) { col[k] = h.indexOf(k); });
  return { sh: sh, rows: all.slice(1), col: col };
}
function setCell_(t, rowIndex, key, value) { if (t.col[key] >= 0) t.sh.getRange(rowIndex + 2, t.col[key] + 1).setValue(value); }
function findStudent_(t, token) {
  for (let i = 0; i < t.rows.length; i++) if (norm_(t.rows[i][t.col.token]) === token) return i;
  return -1;
}
/* 這位學生已存的施測紀錄，依時間先後 */
function attempts_(token) {
  const t = table_(SUMMARY_SHEET, SUMMARY_HEAD), out = [];
  t.rows.forEach(function (r) {
    if (norm_(r[t.col.token]) !== token) return;
    const o = {}; SUMMARY_HEAD.forEach(function (k) { o[k] = t.col[k] >= 0 ? r[t.col[k]] : ''; });
    out.push(o);
  });
  return out;
}
function newToken_(t) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let n = 0; n < 50; n++) {
    const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    let s = '';
    for (let i = 0; i < 8; i++) s += A.charAt(parseInt(hex.substr(i * 2, 2), 16) % A.length);
    const tok = s.slice(0, 4) + '-' + s.slice(4);
    if (findStudent_(t, tok) < 0) return tok;
  }
  throw new Error('token_generation_failed');
}

/* ---------- 寄信 ---------- */
function sendLink_(email, parent, child, token) {
  const link = SITE_URL + '?t=' + encodeURIComponent(token);
  const lines = [
    '測驗約 12 分鐘。請讓孩子在安靜的地方，用平板或電腦作答（手機也可以，但圖比較小）。',
    '請讓孩子自己聽、自己點，不要提示。提示會讓結果失準，對孩子沒有幫助。',
    '每位孩子只能測一次。中途離開的話，12 小時內用同一台裝置點同一個連結可以接續。',
    '測完之後，用同一個連結可以再看結果。'];
  const text = parent + ' 您好：\n\n謝謝您為 ' + child + ' 報名「' + TEST_TITLE + '」。請點下面的連結開始：\n\n' + link +
    '\n\n開始之前請留意：\n' + lines.map(function (l) { return '・' + l; }).join('\n') +
    '\n\n這個連結是 ' + child + ' 專用的，請不要轉寄給別人。\n如果您沒有報名，請忽略這封信。';
  const html = '<p>' + esc_(parent) + ' 您好：</p><p>謝謝您為 ' + esc_(child) + ' 報名「' + esc_(TEST_TITLE) + '」。請點下面的按鈕開始：</p>' +
    '<p><a href="' + esc_(link) + '" style="display:inline-block;background:#2f6fb0;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">開始測驗</a></p>' +
    '<p style="color:#666;font-size:13px">按鈕打不開時，請複製這個網址到瀏覽器：<br>' + esc_(link) + '</p>' +
    '<p>開始之前請留意：</p><ul>' + lines.map(function (l) { return '<li>' + esc_(l) + '</li>'; }).join('') + '</ul>' +
    '<p>這個連結是 ' + esc_(child) + ' 專用的，請不要轉寄給別人。<br>如果您沒有報名，請忽略這封信。</p>';
  MailApp.sendEmail({ to: email, subject: '【' + TEST_TITLE + '】請點連結開始測驗（' + child + '）', body: text, htmlBody: html, name: SENDER_NAME });
}

/* ---------- 報名 ---------- */
function register_(d) {
  if (String(d.website == null ? '' : d.website).trim()) return { ok: true };               // 隱藏欄位被填了，是機器人；假裝成功但不做任何事
  if (!/^https?:\/\/.+\/$/.test(SITE_URL)) return { ok: false, error: 'not_configured' };
  const email = String(d.email || '').trim().toLowerCase();
  const child = clean_(d.child_name, 20), parent = clean_(d.parent_name, 20), age = parseInt(d.age, 10);
  if (!/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(email) || email.length > 100) return { ok: false, error: 'invalid_email' };
  if (!child || !parent || !(age >= 3 && age <= 12) || d.consent !== true) return { ok: false, error: 'missing_field' };

  const cache = CacheService.getScriptCache(), key = 'mail:' + email, sent = Number(cache.get(key) || 0);
  if (sent >= MAILS_PER_HOUR) return { ok: false, error: 'too_many' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const t = table_(STUDENT_SHEET, STUDENT_HEAD);
    /* 同一個信箱、同一個孩子名字再報名：不發新代碼，重寄原本的連結 */
    let i = -1;
    for (let k = 0; k < t.rows.length; k++) {
      if (String(t.rows[k][t.col.email]).trim().toLowerCase() === email && String(t.rows[k][t.col.child_name]).trim().toLowerCase() === child.toLowerCase()) { i = k; break; }
    }
    const resent = i >= 0;
    let token;
    if (resent) token = norm_(t.rows[i][t.col.token]);
    else {
      token = newToken_(t);
      const row = STUDENT_HEAD.map(function () { return ''; });
      const set = function (k, v) { row[STUDENT_HEAD.indexOf(k)] = v; };
      set('token', token); set('child_name', child); set('age', age); set('parent_name', parent); set('email', email);
      set('experience', clean_(d.experience, 40)); set('marketing_ok', d.marketing === true ? 'Y' : ''); set('registered_at', new Date()); set('mail_status', 'pending');
      t.sh.appendRow(row); i = t.rows.length; t.rows.push(row);
      Object.keys(t.col).forEach(function (k) { if (t.col[k] < 0) t.col[k] = STUDENT_HEAD.indexOf(k); });
    }
    if (MailApp.getRemainingDailyQuota() < 1) { setCell_(t, i, 'mail_status', 'quota'); return { ok: false, error: 'mail_quota' }; }
    try { sendLink_(email, resent ? String(t.rows[i][t.col.parent_name]) : parent, resent ? String(t.rows[i][t.col.child_name]) : child, token); }
    catch (err) { setCell_(t, i, 'mail_status', 'failed'); return { ok: false, error: 'mail_failed' }; }
    setCell_(t, i, 'mail_status', 'sent');
    cache.put(key, String(sent + 1), 3600);
    return { ok: true, resent: resent };
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/* ---------- 用代碼查詢（點信裡的連結時呼叫；第一次查詢視為 Email 驗證完成） ---------- */
function lookup_(tokenRaw) {
  const token = norm_(tokenRaw), t = table_(STUDENT_SHEET, STUDENT_HEAD), i = findStudent_(t, token);
  if (!token || i < 0) return { ok: false, error: 'token_not_found' };
  if (!t.rows[i][t.col.verified_at]) setCell_(t, i, 'verified_at', new Date());
  const at = attempts_(token), retake = yes_(t.rows[i][t.col.allow_retake]);
  const out = { ok: true, name: String(t.rows[i][t.col.child_name]), attempts: at.length, can_take: at.length === 0 || retake };
  if (at.length) {
    const a = at[at.length - 1], counts = {};
    SUBTESTS.forEach(function (k) { counts[k] = Number(a[k]) || 0; });
    out.result = { attempt_at: a.attempt_at, counts: counts, code: String(a.result_code || ''), profile: String(a.profile || ''), borderline: yes_(a.borderline), assets: String(a.assets || '') };
  }
  return out;
}

/* ---------- 記錄孩子按下「開始測驗」 ---------- */
function start_(d) {
  const token = norm_(d.token), t = table_(STUDENT_SHEET, STUDENT_HEAD), i = findStudent_(t, token);
  if (i < 0) return { ok: false, error: 'token_not_found' };
  if (!t.rows[i][t.col.started_at]) setCell_(t, i, 'started_at', new Date());
  setCell_(t, i, 'starts', (Number(t.rows[i][t.col.starts]) || 0) + 1);
  return { ok: true };
}

/* ---------- 寫入成績 ---------- */
function save_(d) {
  const token = norm_(d.token), responses = d.responses || [];
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const st = table_(STUDENT_SHEET, STUDENT_HEAD), i = findStudent_(st, token);
    if (i < 0) return { ok: false, error: 'token_not_found' };
    const id = String(d.attempt_id || (token + '|' + d.attempt_at)), prev = attempts_(token);
    for (let k = 0; k < prev.length; k++) if (String(prev[k].attempt_id) === id) return { ok: true, duplicate: true };
    if (prev.length && !yes_(st.rows[i][st.col.allow_retake])) return { ok: false, error: 'already_taken' };
    /* 各分測驗的答對題數在這裡依作答紀錄重新加總，不採用網頁端送來的總分 */
    const sum = {};
    SUBTESTS.forEach(function (k) { sum[k] = 0; });
    responses.forEach(function (r) { if (sum.hasOwnProperty(r.subtest) && Number(r.correct) === 1) sum[r.subtest]++; });
    const pe = d.practice_errors || {}, name = String(st.rows[i][st.col.child_name]);
    const row = { attempt_id: id, token: token, name: name, attempt_no: prev.length + 1, attempt_at: d.attempt_at, finished_at: d.finished_at, duration_s: d.duration_s,
      A_stage1: sum.A_stage1, A_ctrl: sum.A_ctrl, B_diff: sum.B_diff, B_same: sum.B_same, C: sum.C, profile: d.profile, result_code: d.result_code || '', borderline: d.borderline === true,
      practice_A: pe.A || 0, practice_B: pe.B || 0, practice_C: pe.C || 0, assets: d.assets || '', version: d.version || '', device: d.ua || '' };
    table_(SUMMARY_SHEET, SUMMARY_HEAD).sh.appendRow(SUMMARY_HEAD.map(function (k) { return row[k]; }));
    if (responses.length) {
      const rows = responses.map(function (r) { return [id, token, r.item_id, r.subtest, r.stimulus, r.response, r.correct, r.error_type, r.rt_ms, r.replays, r.tag]; });
      const sh = table_(RESPONSE_SHEET, RESPONSE_HEAD).sh;
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, RESPONSE_HEAD.length).setValues(rows);
    }
    if (prev.length) setCell_(st, i, 'allow_retake', '');            // 重測用掉了，自動關閉
    if (NOTIFY_EMAIL) {
      try {
        MailApp.sendEmail({ to: NOTIFY_EMAIL, name: SENDER_NAME, subject: '[入門測驗] ' + name + ' 完成測驗：' + d.profile,
          body: name + '（' + st.rows[i][st.col.age] + ' 歲）完成了測驗。\n\n判讀：' + d.profile + (d.borderline === true ? '（接近門檻）' : '') +
            '\n第一階段詞 ' + sum.A_stage1 + '/24　對照詞 ' + sum.A_ctrl + '/8　不同題 ' + sum.B_diff + '/16　相同題 ' + sum.B_same + '/8　句子 ' + sum.C + '/18' +
            (d.assets === 'incomplete' ? '\n注意：素材未齊全，成績不可採計。' : '') +
            '\n\n家長：' + st.rows[i][st.col.parent_name] + '　' + st.rows[i][st.col.email] + '\n代碼：' + token });
      } catch (err) {}
    }
    return { ok: true, attempt_no: prev.length + 1, rows: responses.length };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'lookup') return json_(lookup_(p.token));
  return json_({ ok: false, error: 'unknown_action' });
}
function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    if (d.action === 'register') return json_(register_(d));
    if (d.action === 'start') return json_(start_(d));
    if (d.action === 'save') return json_(save_(d));
  } catch (err) { return json_({ ok: false, error: String(err) }); }
  return json_({ ok: false, error: 'unknown_action' });
}

/* ---------- 你可以在編輯器裡手動執行的工具 ---------- */
/* 第一次部署前執行一次：建立三個分頁，並觸發寄信權限的授權畫面 */
function setup() {
  table_(STUDENT_SHEET, STUDENT_HEAD); table_(SUMMARY_SHEET, SUMMARY_HEAD); table_(RESPONSE_SHEET, RESPONSE_HEAD);
  Logger.log('今天還能寄 ' + MailApp.getRemainingDailyQuota() + ' 封信。網站網址：' + SITE_URL);
}
/* 把沒寄成功的報名（mail_status 是 quota、failed 或 pending）重寄一次 */
function resendUnsent() {
  const t = table_(STUDENT_SHEET, STUDENT_HEAD); let n = 0;
  for (let i = 0; i < t.rows.length; i++) {
    const s = String(t.rows[i][t.col.mail_status]);
    if (s !== 'quota' && s !== 'failed' && s !== 'pending') continue;
    if (MailApp.getRemainingDailyQuota() < 1) break;
    try { sendLink_(String(t.rows[i][t.col.email]), String(t.rows[i][t.col.parent_name]), String(t.rows[i][t.col.child_name]), norm_(t.rows[i][t.col.token])); setCell_(t, i, 'mail_status', 'sent'); n++; } catch (err) {}
  }
  Logger.log('重寄了 ' + n + ' 封。');
}
