/**
 * ============================================================================
 * FairShare GAS - Main Controller & API Endpoints (รหัส.js)
 * รองรับทั้ง:
 * - การเปิดจากเมนู Google Sheets (Modal Dialog)
 * - การเรียกผ่าน REST API จาก GitHub Pages Frontend (doGet/doPost → JSON)
 * ============================================================================
 */

/**
 * doGet: รับ API Request แบบ GET หรือ serve HTML สำหรับ Sheet Modal
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : null;

  // --- API Mode: คืน JSON ---
  if (action) {
    let result;
    try {
      switch (action) {
        case 'getAll':
          result = apiGetInitialData();
          break;
        default:
          result = { error: 'Unknown GET action: ' + action };
      }
    } catch (err) {
      result = { error: err.message || String(err) };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- HTML Mode: serve หน้า Web App สำหรับ Sheet Modal ---
  try { initDatabase(true); } catch (err) { console.warn('DB init note:', err); }
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialSessionId = (e && e.parameter && e.parameter.session) ? String(e.parameter.session) : '';
  return template.evaluate()
    .setTitle('FairShare | ระบบจัดสรรอย่างยุติธรรม')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * doPost: รับ API Request แบบ POST จาก GitHub Pages Frontend (JSON body)
 */
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid JSON body' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = payload.action || '';
  let result;

  try {
    switch (action) {
      case 'getAll':
        result = apiGetInitialData();
        break;
      case 'createSession':
        result = apiCreateSession(payload.data);
        break;
      case 'submitValuation':
        result = apiSubmitValuation(payload.sessionId, payload.participantName, payload.scores, payload.autoCompute);
        break;
      case 'compute':
        result = apiComputeFairDivision(payload.sessionId, payload.algorithm);
        break;
      case 'deleteSession':
        result = apiDeleteSession(payload.sessionId);
        break;
      case 'resetDemo':
        result = apiResetDemoSessions();
        break;
      default:
        result = { error: 'Unknown POST action: ' + action };
    }
  } catch (err) {
    result = { error: err.message || String(err) };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * สร้างเมนู Custom Menu บน Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚖️ Fair Division App')
    .addItem('🚀 เปิดหน้าต่างแอป FairShare (บน Sheet)', 'openFairShareModal')
    .addSeparator()
    .addItem('🗄️ สร้าง/ตรวจสอบตาราง DB (Initialize)', 'menuInitDatabase')
    .addItem('🔄 รีเซ็ตและเพิ่มข้อมูลตัวอย่าง 3 โหมด', 'menuSeedDemo')
    .addToUi();
}

function openFairShareModal() {
  initDatabase(true);
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialSessionId = '';
  const html = template.evaluate().setWidth(1200).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, '⚖️ FairShare - ระบบจัดสรรอย่างยุติธรรม');
}

function menuInitDatabase() {
  const res = initDatabase(true);
  SpreadsheetApp.getUi().alert('✅ ฐานข้อมูลพร้อมใช้งาน!');
}

function menuSeedDemo() {
  initDatabase(false);
  seedDemoSessions_();
  SpreadsheetApp.getUi().alert('✅ เพิ่มข้อมูลตัวอย่าง 3 โหมดเรียบร้อยแล้ว!');
}

/**
 * ============================================================================
 * API Functions (เรียกจากทั้ง google.script.run และ doPost)
 * ============================================================================
 */
function apiGetInitialData() {
  return getAllSessionsData();
}

function apiCreateSession(payload) {
  const created = createNewSession(payload);
  return { created: created, appData: getAllSessionsData() };
}

function apiSubmitValuation(sessionId, participantName, scoresObj, autoCompute) {
  saveParticipantValuation(sessionId, participantName, scoresObj);
  if (autoCompute) {
    runFairDivisionForSession(sessionId);
  }
  return getAllSessionsData();
}

function apiComputeFairDivision(sessionId, algorithmOverride) {
  const computed = runFairDivisionForSession(sessionId, algorithmOverride);
  return { computed: computed, appData: getAllSessionsData() };
}

function apiDeleteSession(sessionId) {
  deleteSessionById(sessionId);
  return getAllSessionsData();
}

function apiResetDemoSessions() {
  initDatabase(false);
  seedDemoSessions_();
  return getAllSessionsData();
}
