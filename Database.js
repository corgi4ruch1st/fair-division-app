/**
 * ============================================================================
 * FairShare GAS - Database Layer (Google Sheets Backend)
 * จัดการฐานข้อมูลบน Google Sheets อัตโนมัติ พร้อมหน้า Dashboard รวมลิงก์และสรุปผลอ่านง่าย
 * ============================================================================
 */

const DB_SHEETS = {
  DASHBOARD: '🏠 ศูนย์รวมและสรุปผล',
  SESSIONS: 'Sessions',
  VALUATIONS: 'Valuations',
  ALLOCATIONS: 'Allocations'
};

const PROJECT_LINKS = {
  WEB_APP: 'https://corgi4ruch1st.github.io/fair-division-app/',
  GUIDE_PDF: 'https://corgi4ruch1st.github.io/fair-division-app/guide.html',
  ANDROID_APK: 'https://github.com/corgi4ruch1st/fair-division-app/releases/latest/download/FairShare-Cozy.apk',
  GITHUB_REPO: 'https://github.com/corgi4ruch1st/fair-division-app'
};

/**
 * ตรวจสอบและสร้างตารางฐานข้อมูลใน Google Sheets อัตโนมัติ พร้อมหน้า Dashboard รวมลิงก์
 */
function initDatabase(seedDemoIfEmpty = true) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('ไม่พบ Google Spreadsheet ที่เชื่อมโยงกับโปรเจกต์นี้');
  }

  // 0. ตาราง Dashboard (ศูนย์รวมลิงก์ & สรุปผลอ่านง่าย)
  let dashSheet = ss.getSheetByName(DB_SHEETS.DASHBOARD);
  if (!dashSheet) {
    dashSheet = ss.insertSheet(DB_SHEETS.DASHBOARD, 0);
  }

  // 1. ตาราง Sessions
  let sessionSheet = ss.getSheetByName(DB_SHEETS.SESSIONS);
  if (!sessionSheet) {
    sessionSheet = ss.insertSheet(DB_SHEETS.SESSIONS);
    sessionSheet.appendRow([
      'sessionId',
      'title',
      'description',
      'mode',           // GOODS | CAKE | CHORES | RENT | ESTATE | COST
      'valuationType',  // POINTS_100 | RATING_10 | MONETARY
      'totalCost',
      'participantsJson',
      'itemsJson',
      'algorithm',
      'status',
      'createdAt'
    ]);
    styleHeaderRow_(sessionSheet, 11, '#5b21b6');
  }

  // 2. ตาราง Valuations
  let valSheet = ss.getSheetByName(DB_SHEETS.VALUATIONS);
  if (!valSheet) {
    valSheet = ss.insertSheet(DB_SHEETS.VALUATIONS);
    valSheet.appendRow([
      'valuationId',
      'sessionId',
      'participantName',
      'scoresJson',
      'updatedAt'
    ]);
    styleHeaderRow_(valSheet, 5, '#0f766e');
  }

  // 3. ตาราง Allocations
  let allocSheet = ss.getSheetByName(DB_SHEETS.ALLOCATIONS);
  if (!allocSheet) {
    allocSheet = ss.insertSheet(DB_SHEETS.ALLOCATIONS);
    allocSheet.appendRow([
      'sessionId',
      'algorithmUsed',
      'resultJson',
      'fairnessMetricsJson',
      'computedAt'
    ]);
    styleHeaderRow_(allocSheet, 5, '#b45309');
  }

  // หากยังไม่มีข้อมูลใน Sessions เลย ให้สร้างข้อมูลตัวอย่าง
  if (seedDemoIfEmpty && sessionSheet.getLastRow() <= 1) {
    seedDemoSessions_();
  }

  // อัปเดตหน้า Dashboard ให้แสดงลิงก์และตารางสรุปผลล่าสุดเสมอ
  refreshDashboardSheet_();

  return {
    success: true,
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl()
  };
}

/**
 * สร้างและอัปเดตหน้า "🏠 ศูนย์รวมและสรุปผล" ใน Google Sheets
 * เก็บทั้งลิงก์ใช้งานทั้งหมด (Web App, คู่มือ PDF, ไฟล์ APK, GitHub) และตารางสรุปผลภาษาคน
 */
function refreshDashboardSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  let dash = ss.getSheetByName(DB_SHEETS.DASHBOARD);
  if (!dash) {
    dash = ss.insertSheet(DB_SHEETS.DASHBOARD, 0);
  }
  dash.clear();

  // ส่วนหัวและตารางรวมลิงก์สำคัญ
  const linkRows = [
    ['🧸 FairShare Cozy Suite — ศูนย์รวมลิงก์ระบบและรายงานสรุปผลความยุติธรรม', '', '', '', '', '', ''],
    ['ประเภทลิงก์ / ทรัพยากร', 'คำอธิบายการใช้งาน', 'URL ลิงก์คลิกเปิดใช้งาน', '', '', '', ''],
    ['🌐 1. หน้าเว็บแอปหลัก (GitHub Pages PWA)', 'เปิดใช้งานได้ทุกเบราว์เซอร์ ไม่ติดปัญหาหลายอีเมล (/u/n)', PROJECT_LINKS.WEB_APP, '', '', '', ''],
    ['📘 2. คู่มือการใช้งาน & ทฤษฎีฉบับการ์ตูน (PDF)', 'อ่านคู่มือพร้อมภาพประกอบ หรือกดดาวน์โหลดเป็นไฟล์ PDF ขนาด A4', PROJECT_LINKS.GUIDE_PDF, '', '', '', ''],
    ['🤖 3. ไฟล์ติดตั้งแอปมือถือ Android (.APK)', 'ดาวน์โหลดไฟล์ FairShare-Cozy.apk ไปติดตั้งลงมือถือ Android ได้ทันที', PROJECT_LINKS.ANDROID_APK, '', '', '', ''],
    ['💻 4. GitHub Repository (Source Code)', 'ที่เก็บซอร์สโค้ดและระบบสร้างไฟล์ .APK อัตโนมัติ (GitHub Actions)', PROJECT_LINKS.GITHUB_REPO, '', '', '', ''],
    ['📊 5. ลิงก์ไฟล์ Google Sheets นี้', 'ฐานข้อมูลคลาวด์สำหรับเก็บประวัติและผลลัพธ์ทั้งหมด', ss.getUrl(), '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['📋 ตารางสรุปผลการจัดสรรทั้งหมด (อ่านง่าย ไม่ต้องแกะโค้ด JSON)', '', '', '', '', '', ''],
    ['รหัสห้อง (Session ID)', 'ชื่อหัวข้อรายการ', 'โหมดทฤษฎี', 'อัลกอริทึม', 'ผู้เข้าร่วม', 'สรุปผลการจัดสรรรายบุคคล (ใครได้อะไร / จ่ายเท่าไหร่)', 'อัปเดตล่าสุด']
  ];

  dash.getRange(1, 1, linkRows.length, 7).setValues(linkRows);

  // ตกแต่งส่วนหัวลิงก์
  dash.getRange(1, 1, 1, 7).merge().setBackground('#4c1d95').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
  dash.getRange(2, 1, 1, 3).setBackground('#fef3c7').setFontColor('#78350f').setFontWeight('bold');
  dash.getRange(3, 1, 5, 3).setBackground('#fffbeb');
  dash.getRange(9, 1, 1, 7).merge().setBackground('#065f46').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
  dash.getRange(10, 1, 1, 7).setBackground('#d1fae5').setFontColor('#064e3b').setFontWeight('bold');

  // ดึงข้อมูลทุก Session มาแปลงเป็นข้อความสรุปอ่านง่าย
  const sessionSheet = ss.getSheetByName(DB_SHEETS.SESSIONS);
  const allocSheet = ss.getSheetByName(DB_SHEETS.ALLOCATIONS);
  if (!sessionSheet || !allocSheet) return;

  const sRows = sessionSheet.getDataRange().getValues();
  const aRows = allocSheet.getDataRange().getValues();
  const allocMap = {};
  for (let i = 1; i < aRows.length; i++) {
    try {
      allocMap[String(aRows[i][0])] = {
        algo: aRows[i][1],
        result: JSON.parse(aRows[i][2] || '{}'),
        computedAt: aRows[i][4]
      };
    } catch (e) {}
  }

  const summaryRows = [];
  for (let i = sRows.length - 1; i >= 1; i--) {
    const r = sRows[i];
    const sId = String(r[0]);
    if (!sId) continue;
    let parts = [];
    try { parts = JSON.parse(r[6] || '[]'); } catch (e) {}
    const al = allocMap[sId];
    let readableSummary = 'รอการคำนวณ';
    let algoUsed = r[8] || 'AUTO';
    let updatedTime = r[10] || '';

    if (al && al.result && Array.isArray(al.result.allocations)) {
      algoUsed = al.algo || algoUsed;
      updatedTime = al.computedAt || updatedTime;
      readableSummary = al.result.allocations.map(a => {
        const itemNames = (a.assignedItems || []).map(it => it.name).join(', ') || 'รับเงินชดเชย';
        if (r[3] === 'RENT' || r[3] === 'COST') {
          return `${a.participant}: ${itemNames} (จ่าย ${Number(a.priceToPay || 0).toLocaleString()}฿)`;
        }
        if (r[3] === 'ESTATE') {
          const cashTxt = Number(a.netCashTransfer || 0) >= 0
            ? `รับเงิน +${Number(a.netCashTransfer || 0).toLocaleString()}฿`
            : `จ่ายกองกลาง ${Number(a.netCashTransfer || 0).toLocaleString()}฿`;
          return `${a.participant}: ${itemNames} [${cashTxt}]`;
        }
        return `${a.participant} (${a.totalNormScore}%): ${itemNames}`;
      }).join('  |  ');
    }

    summaryRows.push([
      sId,
      r[1],
      r[3],
      algoUsed,
      parts.join(', '),
      readableSummary,
      updatedTime
    ]);
  }

  if (summaryRows.length > 0) {
    dash.getRange(11, 1, summaryRows.length, 7).setValues(summaryRows);
    dash.getRange(11, 1, summaryRows.length, 7).setWrap(true).setVerticalAlignment('top');
  }

  dash.setColumnWidth(1, 160);
  dash.setColumnWidth(2, 240);
  dash.setColumnWidth(3, 340);
  dash.setColumnWidth(4, 150);
  dash.setColumnWidth(5, 180);
  dash.setColumnWidth(6, 420);
  dash.setColumnWidth(7, 160);
}

/**
 * ซิงค์ข้อมูล Session + คะแนน + ผลลัพธ์ ที่คำนวณจากหน้าเว็บ/แอป .APK เข้าสู่ Google Sheets โดยตรง
 */
function syncFullSessionFromClient(sessionObj) {
  if (!sessionObj || !sessionObj.sessionId) {
    throw new Error('ข้อมูล Session ไม่ถูกต้อง');
  }
  initDatabase(false);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(DB_SHEETS.SESSIONS);
  const sData = sessionSheet.getDataRange().getValues();
  const sId = String(sessionObj.sessionId);

  let foundRow = -1;
  for (let i = 1; i < sData.length; i++) {
    if (String(sData[i][0]) === sId) {
      foundRow = i + 1;
      break;
    }
  }

  const rowValues = [
    sId,
    sessionObj.title || 'ไม่มีชื่อรายการ',
    sessionObj.description || '',
    sessionObj.mode || 'GOODS',
    sessionObj.valuationType || 'POINTS_100',
    Number(sessionObj.totalCost || 0),
    JSON.stringify(sessionObj.participants || []),
    JSON.stringify(sessionObj.items || []),
    sessionObj.algorithm || 'AUTO',
    sessionObj.allocation ? 'COMPUTED' : 'OPEN',
    sessionObj.createdAt || new Date().toISOString()
  ];

  if (foundRow > 0) {
    sessionSheet.getRange(foundRow, 1, 1, 11).setValues([rowValues]);
  } else {
    sessionSheet.appendRow(rowValues);
  }

  // บันทึก Valuations
  if (sessionObj.valuations && typeof sessionObj.valuations === 'object') {
    Object.keys(sessionObj.valuations).forEach(pName => {
      const vEntry = sessionObj.valuations[pName];
      if (vEntry && vEntry.scores) {
        saveParticipantValuation(sId, pName, vEntry.scores);
      }
    });
  }

  // บันทึก Allocation
  if (sessionObj.allocation && sessionObj.allocation.result) {
    saveAllocationResult_(
      sId,
      sessionObj.allocation.algorithmUsed || sessionObj.algorithm || 'AUTO',
      sessionObj.allocation.result,
      sessionObj.allocation.fairnessMetrics || {}
    );
  }

  refreshDashboardSheet_();
  return {
    success: true,
    sessionId: sId,
    spreadsheetUrl: ss.getUrl()
  };
}

/**
 * ซิงค์หลาย Sessions พร้อมกันจากหน้าเว็บ/แอป .APK เข้าสู่ Google Sheets
 */
function syncAllSessionsFromClient(sessionsArray) {
  initDatabase(false);
  if (Array.isArray(sessionsArray)) {
    sessionsArray.forEach(s => {
      if (s && s.sessionId) {
        syncFullSessionFromClient(s);
      }
    });
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    success: true,
    count: Array.isArray(sessionsArray) ? sessionsArray.length : 0,
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName()
  };
}

function styleHeaderRow_(sheet, numCols, bgColor) {
  const range = sheet.getRange(1, 1, 1, numCols);
  range.setBackground(bgColor)
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

function seedDemoSessions_() {
  const now = new Date().toISOString();

  const demoGoodsId = 'FD-GOODS-01';
  const demoGoods = {
    title: '🎁 1. แบ่งอุปกรณ์และของรางวัลทีมโปรเจกต์',
    description: 'จัดสรรอุปกรณ์ไอทีและของรางวัล 6 ชิ้นให้สมาชิก 3 คน โดยใช้ระบบกระจาย 100 คะแนน',
    mode: 'GOODS',
    valuationType: 'POINTS_100',
    totalCost: 0,
    participants: ['ก้อง (Kong)', 'มายด์ (Mind)', 'เจมส์ (James)'],
    items: [
      { id: 'item_1', name: 'จอมอนิเตอร์ 27 นิ้ว', desc: '4K IPS Monitor' },
      { id: 'item_2', name: 'คีย์บอร์ดไร้สาย Mechanical', desc: 'Keychron K8' },
      { id: 'item_3', name: 'หูฟังตัดเสียงรบกวน', desc: 'Sony WH-1000XM5' },
      { id: 'item_4', name: 'เมาส์สุขภาพ Ergonomic', desc: 'Logitech MX Master' },
      { id: 'item_5', name: 'บัตรกำนัลกาแฟ 2,000 บาท', desc: 'Starbucks Card' },
      { id: 'item_6', name: 'แท่นวางโน้ตบุ๊กอะลูมิเนียม', desc: 'Laptop Stand' }
    ],
    algorithm: 'MNW_EF1'
  };
  createSessionRecord_(demoGoodsId, demoGoods, now);
  saveParticipantValuation(demoGoodsId, 'ก้อง (Kong)', { 'item_1': 45, 'item_2': 20, 'item_3': 15, 'item_4': 10, 'item_5': 5, 'item_6': 5 });
  saveParticipantValuation(demoGoodsId, 'มายด์ (Mind)', { 'item_1': 15, 'item_2': 10, 'item_3': 45, 'item_4': 5, 'item_5': 20, 'item_6': 5 });
  saveParticipantValuation(demoGoodsId, 'เจมส์ (James)', { 'item_1': 20, 'item_2': 35, 'item_3': 10, 'item_4': 25, 'item_5': 5, 'item_6': 5 });
  runFairDivisionForSession(demoGoodsId);

  const demoChoresId = 'FD-CHORES-03';
  const demoChores = {
    title: '🧹 3. แบ่งเวรทำความสะอาดและงานบ้านประจำสัปดาห์',
    description: 'ให้คะแนนความเหนื่อย (1-10) ระบบจะจัดเวรให้เกิดความเหนื่อยสมดุลที่สุด (EF1 for Chores)',
    mode: 'CHORES',
    valuationType: 'RATING_10',
    totalCost: 0,
    participants: ['ต้น (Ton)', 'แพรว (Praew)', 'บีม (Beam)'],
    items: [
      { id: 'chore_1', name: 'ล้างห้องน้ำ', desc: 'ขัดพื้นและสุขภัณฑ์' },
      { id: 'chore_2', name: 'ล้างจานและทำความสะอาดครัว', desc: 'หลังมื้อเย็นทุกวัน' },
      { id: 'chore_3', name: 'ดูดฝุ่นและถูพื้นห้องนั่งเล่น', desc: 'ทำสัปดาห์ละ 2 ครั้ง' },
      { id: 'chore_4', name: 'แยกขยะและนำไปทิ้ง', desc: 'ทุกวันอังคารและศุกร์' },
      { id: 'chore_5', name: 'ซักผ้าปูที่นอนส่วนกลาง', desc: 'สัปดาห์ละ 1 ครั้ง' },
      { id: 'chore_6', name: 'จ่ายตลาดและซื้อของใช้เข้าบ้าน', desc: 'เช็กสต๊อกและสั่งของ' }
    ],
    algorithm: 'CHORES_EF1'
  };
  createSessionRecord_(demoChoresId, demoChores, now);
  saveParticipantValuation(demoChoresId, 'ต้น (Ton)', { 'chore_1': 9, 'chore_2': 6, 'chore_3': 3, 'chore_4': 4, 'chore_5': 5, 'chore_6': 2 });
  saveParticipantValuation(demoChoresId, 'แพรว (Praew)', { 'chore_1': 8, 'chore_2': 3, 'chore_3': 7, 'chore_4': 8, 'chore_5': 2, 'chore_6': 4 });
  saveParticipantValuation(demoChoresId, 'บีม (Beam)', { 'chore_1': 4, 'chore_2': 8, 'chore_3': 6, 'chore_4': 3, 'chore_5': 7, 'chore_6': 6 });
  runFairDivisionForSession(demoChoresId);

  const demoRentId = 'FD-RENT-04';
  const demoRent = {
    title: '🏠 4. หารค่าเช่าคอนโด 3 ห้องนอน (Envy-Free Rent Division)',
    description: 'ค่าเช่ารวม 18,000 บาท/เดือน แต่ละห้องขนาดไม่เท่ากัน คำนวณราคาแต่ละห้องให้ไม่มีใครอยากสลับห้อง',
    mode: 'RENT',
    valuationType: 'MONETARY',
    totalCost: 18000,
    participants: ['เอิร์ธ (Earth)', 'นนท์ (Non)', 'กานต์ (Kan)'],
    items: [
      { id: 'room_1', name: 'ห้อง Master Bedroom (มีห้องน้ำในตัว)', desc: 'ห้องใหญ่สุด วิวเมือง มีระเบียง' },
      { id: 'room_2', name: 'ห้องนอนกลาง (Medium Room)', desc: 'ขนาดมาตรฐาน หน้าต่างทิศตะวันออก' },
      { id: 'room_3', name: 'ห้องนอนเล็ก (Compact Room)', desc: 'ขนาดกะทัดรัด เงียบสงบ' }
    ],
    algorithm: 'RENT_ENVY_FREE'
  };
  createSessionRecord_(demoRentId, demoRent, now);
  saveParticipantValuation(demoRentId, 'เอิร์ธ (Earth)', { 'room_1': 8500, 'room_2': 5500, 'room_3': 4000 });
  saveParticipantValuation(demoRentId, 'นนท์ (Non)', { 'room_1': 7200, 'room_2': 6300, 'room_3': 4500 });
  saveParticipantValuation(demoRentId, 'กานต์ (Kan)', { 'room_1': 7000, 'room_2': 5800, 'room_3': 5200 });
  runFairDivisionForSession(demoRentId);

  refreshDashboardSheet_();
}

function createSessionRecord_(sessionId, payload, createdAt) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.SESSIONS);
  sheet.appendRow([
    sessionId,
    payload.title || 'ไม่มีชื่อรายการ',
    payload.description || '',
    payload.mode || 'GOODS',
    payload.valuationType || 'POINTS_100',
    Number(payload.totalCost || 0),
    JSON.stringify(payload.participants || []),
    JSON.stringify(payload.items || []),
    payload.algorithm || 'AUTO',
    'OPEN',
    createdAt || new Date().toISOString()
  ]);
}

function getAllSessionsData() {
  initDatabase(true);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(DB_SHEETS.SESSIONS);
  const valSheet = ss.getSheetByName(DB_SHEETS.VALUATIONS);
  const allocSheet = ss.getSheetByName(DB_SHEETS.ALLOCATIONS);

  const sessionsRaw = sessionSheet.getDataRange().getValues();
  const valuationsRaw = valSheet.getDataRange().getValues();
  const allocationsRaw = allocSheet.getDataRange().getValues();

  const valMap = {};
  for (let i = 1; i < valuationsRaw.length; i++) {
    const row = valuationsRaw[i];
    const sId = String(row[1]);
    if (!sId) continue;
    if (!valMap[sId]) valMap[sId] = {};
    try {
      valMap[sId][String(row[2])] = {
        scores: JSON.parse(row[3] || '{}'),
        updatedAt: row[4]
      };
    } catch (e) {
      valMap[sId][String(row[2])] = { scores: {}, updatedAt: row[4] };
    }
  }

  const allocMap = {};
  for (let i = 1; i < allocationsRaw.length; i++) {
    const row = allocationsRaw[i];
    const sId = String(row[0]);
    if (!sId) continue;
    try {
      allocMap[sId] = {
        algorithmUsed: row[1],
        result: JSON.parse(row[2] || '{}'),
        fairnessMetrics: JSON.parse(row[3] || '{}'),
        computedAt: row[4]
      };
    } catch (e) {}
  }

  const sessions = [];
  for (let i = 1; i < sessionsRaw.length; i++) {
    const row = sessionsRaw[i];
    const sId = String(row[0]);
    if (!sId) continue;
    let participants = [];
    let items = [];
    try { participants = JSON.parse(row[6] || '[]'); } catch (e) {}
    try { items = JSON.parse(row[7] || '[]'); } catch (e) {}

    sessions.push({
      sessionId: sId,
      title: row[1],
      description: row[2],
      mode: row[3],
      valuationType: row[4],
      totalCost: Number(row[5] || 0),
      participants: participants,
      items: items,
      algorithm: row[8] || 'AUTO',
      status: row[9] || 'OPEN',
      createdAt: row[10],
      valuations: valMap[sId] || {},
      allocation: allocMap[sId] || null
    });
  }

  sessions.reverse();

  return {
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    links: PROJECT_LINKS,
    sessions: sessions
  };
}

function createNewSession(payload) {
  if (payload && payload.sessionId && payload.allocation) {
    return syncFullSessionFromClient(payload);
  }
  initDatabase(false);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const sessionId = (payload && payload.sessionId) ? payload.sessionId : ('FD-' + (payload.mode || 'GEN') + '-' + randomSuffix);

  const cleanItems = (payload.items || []).map((it, idx) => ({
    id: it.id || ('item_' + (idx + 1)),
    name: String(it.name || '').trim(),
    desc: String(it.desc || '').trim()
  })).filter(it => it.name.length > 0);

  const cleanParticipants = (payload.participants || [])
    .map(p => String(p || '').trim())
    .filter(p => p.length > 0);

  createSessionRecord_(sessionId, {
    title: payload.title,
    description: payload.description,
    mode: payload.mode,
    valuationType: payload.valuationType,
    totalCost: Number(payload.totalCost || 0),
    participants: cleanParticipants,
    items: cleanItems,
    algorithm: payload.algorithm || 'AUTO'
  }, new Date().toISOString());

  refreshDashboardSheet_();
  return {
    success: true,
    sessionId: sessionId
  };
}

function saveParticipantValuation(sessionId, participantName, scoresObj) {
  initDatabase(false);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const valSheet = ss.getSheetByName(DB_SHEETS.VALUATIONS);
  const data = valSheet.getDataRange().getValues();
  const now = new Date().toISOString();

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(sessionId) && String(data[i][2]) === String(participantName)) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    valSheet.getRange(foundRow, 4).setValue(JSON.stringify(scoresObj));
    valSheet.getRange(foundRow, 5).setValue(now);
  } else {
    const valId = 'VAL-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    valSheet.appendRow([
      valId,
      sessionId,
      participantName,
      JSON.stringify(scoresObj),
      now
    ]);
  }

  return {
    success: true,
    sessionId: sessionId,
    participantName: participantName
  };
}

function saveAllocationResult_(sessionId, algorithmUsed, resultObj, fairnessMetricsObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allocSheet = ss.getSheetByName(DB_SHEETS.ALLOCATIONS);
  const sessionSheet = ss.getSheetByName(DB_SHEETS.SESSIONS);
  const now = new Date().toISOString();

  const allocData = allocSheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < allocData.length; i++) {
    if (String(allocData[i][0]) === String(sessionId)) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    allocSheet.getRange(foundRow, 2, 1, 4).setValues([[
      algorithmUsed,
      JSON.stringify(resultObj),
      JSON.stringify(fairnessMetricsObj),
      now
    ]]);
  } else {
    allocSheet.appendRow([
      sessionId,
      algorithmUsed,
      JSON.stringify(resultObj),
      JSON.stringify(fairnessMetricsObj),
      now
    ]);
  }

  const sessData = sessionSheet.getDataRange().getValues();
  for (let i = 1; i < sessData.length; i++) {
    if (String(sessData[i][0]) === String(sessionId)) {
      sessionSheet.getRange(i + 1, 10).setValue('COMPUTED');
      break;
    }
  }
  refreshDashboardSheet_();
}

function deleteSessionById(sessionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [DB_SHEETS.SESSIONS, DB_SHEETS.VALUATIONS, DB_SHEETS.ALLOCATIONS].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const idCol = sheetName === DB_SHEETS.VALUATIONS ? 1 : 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idCol]) === String(sessionId)) {
        sheet.deleteRow(i + 1);
      }
    }
  });
  refreshDashboardSheet_();
  return { success: true };
}
