/**
 * ============================================================================
 * FairShare GAS - Database Layer (Google Sheets Backend)
 * จัดการฐานข้อมูลบน Google Sheets อัตโนมัติสำหรับ Web App
 * ============================================================================
 */

const DB_SHEETS = {
  SESSIONS: 'Sessions',
  VALUATIONS: 'Valuations',
  ALLOCATIONS: 'Allocations'
};

/**
 * ตรวจสอบและสร้างตารางฐานข้อมูลใน Google Sheets อัตโนมัติ พร้อมข้อมูลตัวอย่าง (Demo)
 */
function initDatabase(seedDemoIfEmpty = true) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('ไม่พบ Google Spreadsheet ที่เชื่อมโยงกับโปรเจกต์นี้');
  }

  // 1. ตาราง Sessions
  let sessionSheet = ss.getSheetByName(DB_SHEETS.SESSIONS);
  if (!sessionSheet) {
    sessionSheet = ss.insertSheet(DB_SHEETS.SESSIONS);
    sessionSheet.appendRow([
      'sessionId',
      'title',
      'description',
      'mode',           // GOODS | CHORES | RENT
      'valuationType',  // POINTS_100 | RATING_10 | MONETARY
      'totalCost',      // ใช้ในโหมด RENT หรือหารค่าใช้จ่าย
      'participantsJson',
      'itemsJson',
      'algorithm',      // AUTO | MNW_EF1 | ADJUSTED_WINNER | ROUND_ROBIN | CHORES_EF1 | RENT_ENVY_FREE
      'status',         // OPEN | COMPUTED
      'createdAt'
    ]);
    styleHeaderRow_(sessionSheet, 11, '#1e3a8a');
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
    styleHeaderRow_(allocSheet, 5, '#4c1d95');
  }

  // หากยังไม่มีข้อมูลใน Sessions เลย ให้สร้างข้อมูลตัวอย่าง 3 โหมด
  if (seedDemoIfEmpty && sessionSheet.getLastRow() <= 1) {
    seedDemoSessions_();
  }

  return {
    success: true,
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl()
  };
}

/**
 * ตกแต่งแถวหัวตารางใน Google Sheets
 */
function styleHeaderRow_(sheet, numCols, bgColor) {
  const range = sheet.getRange(1, 1, 1, numCols);
  range.setBackground(bgColor)
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

/**
 * สร้างข้อมูลตัวอย่าง (Demo Sessions) ครบทั้ง 3 โหมด เพื่อให้ทดสอบได้ทันที
 */
function seedDemoSessions_() {
  const now = new Date().toISOString();

  // Demo 1: แบ่งสิ่งของ (Goods Allocation) - แจกคนละ 100 คะแนน
  const demoGoodsId = 'FD-GOODS-01';
  const demoGoods = {
    title: '🎁 แบ่งอุปกรณ์และของรางวัลทีมโปรเจกต์',
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
  saveParticipantValuation(demoGoodsId, 'ก้อง (Kong)', {
    'item_1': 45, 'item_2': 20, 'item_3': 15, 'item_4': 10, 'item_5': 5, 'item_6': 5
  });
  saveParticipantValuation(demoGoodsId, 'มายด์ (Mind)', {
    'item_1': 15, 'item_2': 10, 'item_3': 45, 'item_4': 5, 'item_5': 20, 'item_6': 5
  });
  saveParticipantValuation(demoGoodsId, 'เจมส์ (James)', {
    'item_1': 20, 'item_2': 35, 'item_3': 10, 'item_4': 25, 'item_5': 5, 'item_6': 5
  });
  runFairDivisionForSession(demoGoodsId);

  // Demo 2: แบ่งภาระงาน/เวร (Chores Allocation) - ให้คะแนนความหนัก 1-10
  const demoChoresId = 'FD-CHORES-02';
  const demoChores = {
    title: '🧹 แบ่งเวรทำความสะอาดและงานบ้านประจำสัปดาห์',
    description: 'ให้คะแนนความเหนื่อย/ความไม่อยากทำ (1-10) ระบบจะจัดเวรให้เกิดความเหนื่อยสมดุลที่สุด (EF1 for Chores)',
    mode: 'CHORES',
    valuationType: 'RATING_10',
    totalCost: 0,
    participants: ['ต้น (Ton)', 'แพรว (Praew)', 'บีม (Beam)'],
    items: [
      { id: 'chore_1', name: 'ล้างห้องน้ำ', desc: 'ขัดพื้นและสุขภัณฑ์' },
      { id: 'chore_2', name: 'ล้างจานและทำความสะอาดครัว', desc: 'หลังมื้อเย็นทุกวัน' },
      { id: 'chore_3', name: 'ดูดฝุ่นและถูพื้นห้องนั่งเล่น', desc: 'ทำสัปดาห์ละ 2 ครั้ง' },
      { id: 'chore_4', name: 'แยกขยะและนำไปทิ้ง', desc: 'ทุกวันอังคารและศุกร์' },
      { id: 'chore_5', name: 'ซักผ้าปูที่นอนและผ้าเช็ดตัวส่วนกลาง', desc: 'สัปดาห์ละ 1 ครั้ง' },
      { id: 'chore_6', name: 'จ่ายตลาดและซื้อของใช้เข้าบ้าน', desc: 'เช็กสต๊อกและสั่งของ' }
    ],
    algorithm: 'CHORES_EF1'
  };
  createSessionRecord_(demoChoresId, demoChores, now);
  saveParticipantValuation(demoChoresId, 'ต้น (Ton)', {
    'chore_1': 9, 'chore_2': 6, 'chore_3': 3, 'chore_4': 4, 'chore_5': 5, 'chore_6': 2
  });
  saveParticipantValuation(demoChoresId, 'แพรว (Praew)', {
    'chore_1': 8, 'chore_2': 3, 'chore_3': 7, 'chore_4': 8, 'chore_5': 2, 'chore_6': 4
  });
  saveParticipantValuation(demoChoresId, 'บีม (Beam)', {
    'chore_1': 4, 'chore_2': 8, 'chore_3': 6, 'chore_4': 3, 'chore_5': 7, 'chore_6': 6
  });
  runFairDivisionForSession(demoChoresId);

  // Demo 3: แบ่งห้องพักและหารค่าเช่า (Rent Division) - ตีมูลค่าเป็นเงินบาท
  const demoRentId = 'FD-RENT-03';
  const demoRent = {
    title: '🏠 หารค่าเช่าคอนโด 3 ห้องนอน (Envy-Free Rent Division)',
    description: 'ค่าเช่ารวม 18,000 บาท/เดือน แต่ละห้องขนาดไม่เท่ากัน ให้แต่ละคนประเมินราคาที่ตนเองยอมจ่ายสำหรับแต่ละห้อง',
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
  saveParticipantValuation(demoRentId, 'เอิร์ธ (Earth)', {
    'room_1': 8500, 'room_2': 5500, 'room_3': 4000
  });
  saveParticipantValuation(demoRentId, 'นนท์ (Non)', {
    'room_1': 7200, 'room_2': 6300, 'room_3': 4500
  });
  saveParticipantValuation(demoRentId, 'กานต์ (Kan)', {
    'room_1': 7000, 'room_2': 5800, 'room_3': 5200
  });
  runFairDivisionForSession(demoRentId);
}

/**
 * บันทึกแถว Session ลง Sheet
 */
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

/**
 * ดึงข้อมูลทั้งหมดสำหรับหน้า Dashboard ของ Web App
 */
function getAllSessionsData() {
  initDatabase(true);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(DB_SHEETS.SESSIONS);
  const valSheet = ss.getSheetByName(DB_SHEETS.VALUATIONS);
  const allocSheet = ss.getSheetByName(DB_SHEETS.ALLOCATIONS);

  const sessionsRaw = sessionSheet.getDataRange().getValues();
  const valuationsRaw = valSheet.getDataRange().getValues();
  const allocationsRaw = allocSheet.getDataRange().getValues();

  // แปลง Valuations เป็น Map ตาม sessionId
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

  // แปลง Allocations เป็น Map ตาม sessionId
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

  // เรียงลำดับจากใหม่ไปเก่า
  sessions.reverse();

  return {
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    sessions: sessions
  };
}

/**
 * สร้าง Session ใหม่จากหน้า Web App
 */
function createNewSession(payload) {
  initDatabase(false);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const sessionId = 'FD-' + (payload.mode || 'GEN') + '-' + randomSuffix;

  const cleanItems = (payload.items || []).map((it, idx) => ({
    id: it.id || ('item_' + (idx + 1)),
    name: String(it.name || '').trim(),
    desc: String(it.desc || '').trim()
  })).filter(it => it.name.length > 0);

  const cleanParticipants = (payload.participants || [])
    .map(p => String(p || '').trim())
    .filter(p => p.length > 0);

  if (cleanParticipants.length < 2) {
    throw new Error('ต้องมีผู้เข้าร่วมอย่างน้อย 2 คนขึ้นไป');
  }
  if (cleanItems.length < 1) {
    throw new Error('ต้องมีรายการสิ่งของ/งาน/ห้องอย่างน้อย 1 รายการ');
  }
  if (payload.mode === 'RENT' && cleanItems.length !== cleanParticipants.length) {
    throw new Error('สำหรับโหมดหารค่าห้องพัก จำนวนห้อง (' + cleanItems.length + ') ต้องเท่ากับจำนวนผู้เข้าร่วม (' + cleanParticipants.length + ') พอดี');
  }

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

  return {
    success: true,
    sessionId: sessionId
  };
}

/**
 * บันทึกหรืออัปเดตคะแนนความพึงพอใจของผู้เข้าร่วม
 */
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

/**
 * บันทึกผลลัพธ์การจัดสรรลงตาราง Allocations และอัปเดตสถานะใน Sessions
 */
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

  // อัปเดตสถานะใน Sessions เป็น COMPUTED
  const sessData = sessionSheet.getDataRange().getValues();
  for (let i = 1; i < sessData.length; i++) {
    if (String(sessData[i][0]) === String(sessionId)) {
      sessionSheet.getRange(i + 1, 10).setValue('COMPUTED');
      break;
    }
  }
}

/**
 * ลบ Session และข้อมูลที่เกี่ยวข้อง
 */
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
  return { success: true };
}
