/**
 * ============================================================================
 * سرور همگام‌سازی مستقیم LexiFlow روی گوگل شیت (۱۰۰٪ بدون نیاز به فیلترشکن)
 * ============================================================================
 * راهنمای نصب ۱ دقیقه‌ای:
 * 1) یک گوگل شیت بساز (یا فایل قبلی خودت را باز کن) -> Extensions -> Apps Script
 * 2) کل کد زیر را داخل Code.gs بگذار و مقدار SECRET_PIN را به رمز دلخواه خودت تغییر بده.
 * 3) بالا سمت راست بزن: Deploy -> New deployment -> Select type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4) لینک Web App ساخته‌شده (https://script.google.com/macros/s/.../exec) و رمزت را
 *    در تب «تنظیمات» اپلیکیشن LexiFlow (گوشی و لپ‌تاپ) وارد کن.
 */

const SECRET_PIN = '123456'; // <--- رمز اختصاصی خودت را اینجا بگذار (در اپ هم همین را وارد کن)

const ENTRIES_SHEET_NAME = 'بانک_داده_اپ';
const LOGS_SHEET_NAME = 'تاریخچه_مرور_اپ';

const ENTRY_HEADERS = [
  'id',
  'category',
  'session',
  'english',
  'persian',
  'meta',
  'example',
  'notes',
  'favorite',
  'state',
  'stability',
  'difficulty',
  'reps',
  'lapses',
  'elapsedDays',
  'scheduledDays',
  'lastReview',
  'due',
  'createdAt',
  'updatedAt',
  'deletedAt'
];

const LOG_HEADERS = ['id', 'entryId', 'rating', 'reviewedAt', 'dayKey'];

const CATEGORY_SHEETS = [
  { id: 'word', name: 'کلمات', color: '#17365d' },
  { id: 'phrase', name: 'عبارات و اصطلاحات', color: '#0f766e' },
  { id: 'grammar', name: 'گرامر', color: '#6d28d9' },
  { id: 'sentence', name: 'جملات کاربردی', color: '#1d4ed8' },
  { id: 'phrasal', name: 'افعال عبارتی', color: '#047857' },
  { id: 'speaking', name: 'تلفظ و اسپیکینگ', color: '#9f1239' }
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📘 همگام‌ساز LexiFlow')
    .addItem('ساخت / به‌روزرسانی شیت‌های خوانا به تفکیک دسته', 'rebuildReadableSheets')
    .addToUi();
}

function doGet(e) {
  return jsonOutput_({
    ok: true,
    service: 'LexiFlow Google Sheets Sync Backend',
    status: 'ready',
    serverTime: new Date().toISOString()
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'سرور مشغول است؛ چند ثانیه بعد دوباره تلاش کن.' });
  }

  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(rawBody);

    if (String(body.secret || '').trim() !== String(SECRET_PIN).trim()) {
      return jsonOutput_({ ok: false, error: 'رمز همگام‌سازی گوگل شیت اشتباه است.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const entriesSheet = ensureSheet_(ss, ENTRIES_SHEET_NAME, ENTRY_HEADERS, '#17365d');
    const logsSheet = ensureSheet_(ss, LOGS_SHEET_NAME, LOG_HEADERS, '#334155');

    // ۱) خواندن و ادغام یادداشت‌ها (Last-Write-Wins)
    const entryMap = readEntriesMap_(entriesSheet);
    const incomingEntries = Array.isArray(body.entries) ? body.entries : [];
    let entriesChanged = false;

    for (let i = 0; i < incomingEntries.length; i++) {
      const inc = normalizeEntry_(incomingEntries[i]);
      if (!inc) continue;

      const cur = entryMap[inc.id];
      const incMs = parseTimeMs_(inc.updatedAt);
      const curMs = cur ? parseTimeMs_(cur.updatedAt) : -1;

      if (!cur || incMs >= curMs) {
        entryMap[inc.id] = inc;
        entriesChanged = true;
      }
    }

    const allEntries = Object.keys(entryMap).map(function (k) {
      return entryMap[k];
    });

    if (entriesChanged) {
      writeEntriesAll_(entriesSheet, allEntries);
    }

    // ۲) خواندن و ادغام لاگ‌های مرور
    const logMap = readLogsMap_(logsSheet);
    const incomingLogs = Array.isArray(body.reviewLogs) ? body.reviewLogs : [];
    let logsChanged = false;

    for (let j = 0; j < incomingLogs.length; j++) {
      const lg = normalizeLog_(incomingLogs[j]);
      if (!lg) continue;
      if (!logMap[lg.id]) {
        logMap[lg.id] = lg;
        logsChanged = true;
      }
    }

    const allLogs = Object.keys(logMap).map(function (k) {
      return logMap[k];
    });

    if (logsChanged) {
      writeLogsAll_(logsSheet, allLogs);
    }

    SpreadsheetApp.flush();

    return jsonOutput_({
      ok: true,
      entries: allEntries,
      reviewLogs: allLogs,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    return jsonOutput_({
      ok: false,
      error: 'خطای داخلی گوگل شیت: ' + (err && err.message ? err.message : String(err))
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * ابزار کمکی داخل منوی گوگل شیت برای ساخت ۶ شیت تفکیک‌شده و خوانا از روی بانک داده اپ
 */
function rebuildReadableSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const entriesSheet = ensureSheet_(ss, ENTRIES_SHEET_NAME, ENTRY_HEADERS, '#17365d');
  const map = readEntriesMap_(entriesSheet);
  const active = Object.keys(map)
    .map(function (k) { return map[k]; })
    .filter(function (e) { return !e.deletedAt; })
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });

  const viewHeaders = ['جلسه / منبع', 'متن انگلیسی', 'معنی فارسی', 'ساختار / تلفظ', 'مثال انگلیسی', 'توضیحات', 'تعداد مرور'];

  CATEGORY_SHEETS.forEach(function (cat) {
    let sh = ss.getSheetByName(cat.name);
    if (!sh) sh = ss.insertSheet(cat.name);
    sh.clear();
    sh.setRightToLeft(true);
    sh.getRange(1, 1, 1, viewHeaders.length)
      .setValues([viewHeaders])
      .setBackground(cat.color)
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);

    const rows = active
      .filter(function (e) { return e.category === cat.id; })
      .map(function (e) {
        return [
          safeSheetStr_(e.session),
          safeSheetStr_(e.english),
          safeSheetStr_(e.persian),
          safeSheetStr_(e.meta),
          safeSheetStr_(e.example),
          safeSheetStr_(e.notes),
          e.reps
        ];
      });

    if (rows.length > 0) {
      sh.getRange(2, 1, rows.length, viewHeaders.length)
        .setNumberFormat('@')
        .setValues(rows)
        .setWrap(true);
    }
  });

  SpreadsheetApp.getUi().alert('شیت‌های تفکیک‌شده با موفقیت از روی بانک داده به‌روزرسانی شدند.');
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureSheet_(ss, name, headers, headerColor) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.setRightToLeft(true);
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground(headerColor)
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readEntriesMap_(sheet) {
  const map = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;

  const values = sheet.getRange(2, 1, lastRow - 1, ENTRY_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const id = String(r[0] || '').trim();
    if (!id) continue;
    map[id] = {
      id: id,
      category: String(r[1] || 'word'),
      session: String(r[2] || ''),
      english: String(r[3] || ''),
      persian: String(r[4] || ''),
      meta: String(r[5] || ''),
      example: String(r[6] || ''),
      notes: String(r[7] || ''),
      tags: [],
      favorite: String(r[8]) === 'true' || r[8] === true,
      state: Number(r[9]) || 0,
      stability: Number(r[10]) || 0,
      difficulty: Number(r[11]) || 0,
      reps: Number(r[12]) || 0,
      lapses: Number(r[13]) || 0,
      elapsedDays: Number(r[14]) || 0,
      scheduledDays: Number(r[15]) || 0,
      lastReview: String(r[16] || '').trim() || null,
      due: String(r[17] || '').trim() || new Date().toISOString(),
      createdAt: String(r[18] || '').trim() || new Date().toISOString(),
      updatedAt: String(r[19] || '').trim() || new Date().toISOString(),
      deletedAt: String(r[20] || '').trim() || null
    };
  }
  return map;
}

function writeEntriesAll_(sheet, entries) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, ENTRY_HEADERS.length).clearContent();
  }
  if (!entries.length) return;

  entries.sort(function (a, b) {
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  const rows = entries.map(function (e) {
    return [
      safeSheetStr_(e.id),
      safeSheetStr_(e.category),
      safeSheetStr_(e.session),
      safeSheetStr_(e.english),
      safeSheetStr_(e.persian),
      safeSheetStr_(e.meta),
      safeSheetStr_(e.example),
      safeSheetStr_(e.notes),
      e.favorite ? 'true' : 'false',
      String(e.state || 0),
      String(e.stability || 0),
      String(e.difficulty || 0),
      String(e.reps || 0),
      String(e.lapses || 0),
      String(e.elapsedDays || 0),
      String(e.scheduledDays || 0),
      safeSheetStr_(e.lastReview || ''),
      safeSheetStr_(e.due || ''),
      safeSheetStr_(e.createdAt || ''),
      safeSheetStr_(e.updatedAt || ''),
      safeSheetStr_(e.deletedAt || '')
    ];
  });

  const range = sheet.getRange(2, 1, rows.length, ENTRY_HEADERS.length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function readLogsMap_(sheet) {
  const map = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;

  const values = sheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const id = String(r[0] || '').trim();
    if (!id) continue;
    map[id] = {
      id: id,
      entryId: String(r[1] || ''),
      rating: Number(r[2]) || 3,
      reviewedAt: String(r[3] || ''),
      dayKey: String(r[4] || '')
    };
  }
  return map;
}

function writeLogsAll_(sheet, logs) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).clearContent();
  }
  if (!logs.length) return;

  const rows = logs.map(function (l) {
    return [
      safeSheetStr_(l.id),
      safeSheetStr_(l.entryId),
      String(l.rating || 3),
      safeSheetStr_(l.reviewedAt || ''),
      safeSheetStr_(l.dayKey || '')
    ];
  });

  const range = sheet.getRange(2, 1, rows.length, LOG_HEADERS.length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function normalizeEntry_(raw) {
  if (!raw || !raw.id || !raw.english) return null;
  const nowIso = new Date().toISOString();
  return {
    id: String(raw.id).trim(),
    category: String(raw.category || 'word'),
    session: String(raw.session || ''),
    english: String(raw.english || ''),
    persian: String(raw.persian || ''),
    meta: String(raw.meta || ''),
    example: String(raw.example || ''),
    notes: String(raw.notes || ''),
    tags: [],
    favorite: Boolean(raw.favorite),
    state: Number(raw.state) || 0,
    stability: Number(raw.stability) || 0,
    difficulty: Number(raw.difficulty) || 0,
    reps: Number(raw.reps) || 0,
    lapses: Number(raw.lapses) || 0,
    elapsedDays: Number(raw.elapsedDays) || 0,
    scheduledDays: Number(raw.scheduledDays) || 0,
    lastReview: raw.lastReview ? String(raw.lastReview) : null,
    due: raw.due ? String(raw.due) : nowIso,
    createdAt: raw.createdAt ? String(raw.createdAt) : nowIso,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : nowIso,
    deletedAt: raw.deletedAt ? String(raw.deletedAt) : null
  };
}

function normalizeLog_(raw) {
  if (!raw || !raw.id || !raw.entryId) return null;
  return {
    id: String(raw.id).trim(),
    entryId: String(raw.entryId).trim(),
    rating: Number(raw.rating) || 3,
    reviewedAt: String(raw.reviewedAt || new Date().toISOString()),
    dayKey: String(raw.dayKey || '')
  };
}

function parseTimeMs_(iso) {
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

function safeSheetStr_(v) {
  const s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}
