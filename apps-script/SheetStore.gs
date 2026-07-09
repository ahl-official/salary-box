/**
 * Low-level SpreadsheetApp access — mirrors backend/models/sheets.py
 * Uses in-memory cache per request to avoid repeated tab reads.
 */

var _cache = {};

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(tabName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    throw new Error('Missing tab: ' + tabName);
  }
  return sheet;
}

function clearSheetCache_() {
  _cache = {};
}

function getRecords_(tabName) {
  if (_cache[tabName]) {
    return _cache[tabName];
  }
  var sheet = getSheet_(tabName);
  var values = sheet.getDataRange().getValues();
  if (!values.length) {
    _cache[tabName] = [];
    return [];
  }
  var headers = values[0].map(String);
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] === undefined || row[j] === null ? '' : row[j];
    }
    rows.push(obj);
  }
  _cache[tabName] = rows;
  return rows;
}

function nextId_(tabName) {
  var records = getRecords_(tabName);
  var max = 0;
  records.forEach(function (r) {
    var id = parseInt(r.id, 10);
    if (!isNaN(id) && id > max) max = id;
  });
  return max + 1;
}

function findRowIndex_(tabName, colName, value) {
  var sheet = getSheet_(tabName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  var colIdx = headers.indexOf(colName);
  if (colIdx < 0) return null;
  var col = sheet.getRange(2, colIdx + 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(value)) {
      return i + 2;
    }
  }
  return null;
}

function appendRow_(tabName, rowValues) {
  var sheet = getSheet_(tabName);
  sheet.appendRow(rowValues);
  delete _cache[tabName];
}

function updateRow_(tabName, rowIndex, rowValues) {
  var sheet = getSheet_(tabName);
  sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  delete _cache[tabName];
}

function updateCell_(tabName, rowIndex, colIndex, value) {
  getSheet_(tabName).getRange(rowIndex, colIndex).setValue(value);
  delete _cache[tabName];
}

function deleteRow_(tabName, rowIndex) {
  getSheet_(tabName).deleteRow(rowIndex);
  delete _cache[tabName];
}

function rowToArray_(tabName, obj) {
  var headers = HEADERS[tabName];
  return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
}

function nowIso_() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
}
