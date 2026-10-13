/**
 * ============================================================================
 * FairShare GAS - Main Controller & API Endpoints (รหัส.js)
 * รองรับทั้ง:
 * - การเปิดจากเมนู Google Sheets (Modal Dialog + หน้า Dashboard รวมลิงก์)
 * - การเรียกผ่าน REST API จาก GitHub Pages & Android .APK (doGet/doPost → JSON)
 * ============================================================================
 */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : null;

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

  try { initDatabase(true); } catch (err) { console.warn('DB init note:', err); }
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialSessionId = (e && e.parameter && e.parameter.session) ? String(e.parameter.session) : '';
  return template.evaluate()
    .setTitle('FairShare Cozy | ระบบจัดสรรอย่างยุติธรรม')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

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
      case 'syncSession':
        result = syncFullSessionFromClient(payload.session);
        break;
      case 'syncAllSessions':
        result = syncAllSessionsFromClient(payload.sessions);
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
    .addItem('🏠 สร้าง/อัปเดตหน้า "ศูนย์รวมลิงก์ & ตารางสรุปผล"', 'menuInitDatabase')
    .addItem('🚀 เปิดหน้าต่างแอป FairShare (บน Sheet)', 'openFairShareModal')
    .addSeparator()
    .addItem('🔄 รีเซ็ตและเพิ่มข้อมูลตัวอย่างใหม่', 'menuSeedDemo')
    .addToUi();
}

function openFairShareModal() {
  initDatabase(true);
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialSessionId = '';
  const html = template.evaluate().setWidth(1200).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, '🧸 FairShare Cozy - ระบบจัดสรรอย่างยุติธรรม');
}

function menuInitDatabase() {
  initDatabase(true);
  SpreadsheetApp.getUi().alert('✅ สร้างหน้า "🏠 ศูนย์รวมและสรุปผล" (พร้อมลิงก์ Web App, คู่มือ PDF, ลิงก์โหลด .APK และตารางสรุปผล) เรียบร้อยแล้ว!');
}

function menuSeedDemo() {
  initDatabase(false);
  seedDemoSessions_();
  SpreadsheetApp.getUi().alert('✅ รีเซ็ตข้อมูลตัวอย่างและอัปเดตตารางสรุปผลเรียบร้อยแล้ว!');
}

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
    try { runFairDivisionForSession(sessionId); } catch (e) {}
  }
  refreshDashboardSheet_();
  return getAllSessionsData();
}

function apiComputeFairDivision(sessionId, algorithmOverride) {
  const computed = runFairDivisionForSession(sessionId, algorithmOverride);
  refreshDashboardSheet_();
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
