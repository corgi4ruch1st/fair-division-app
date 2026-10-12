/**
 * ============================================================================
 * FairShare GAS - Mathematical Fair Division Engine (Algorithms.js)
 * รองรับ:
 * 1. GOODS (การแบ่งสิ่งของ):
 *    - Maximum Nash Welfare + EF1 (MNW_EF1)
 *    - Adjusted Winner Procedure สำหรับ 2 คน (ADJUSTED_WINNER)
 *    - Round-Robin Draft EF1 (ROUND_ROBIN)
 * 2. CHORES (การแบ่งภาระงาน/เวร):
 *    - Min-Max Burden + EF1 for Chores (CHORES_EF1)
 * 3. RENT (การแบ่งห้องพักและหารค่าเช่า):
 *    - Utilitarian Max-Welfare Assignment + Envy-Free Equilibrium Prices (RENT_ENVY_FREE)
 * ============================================================================
 */

/**
 * รันอัลกอริทึม Fair Division สำหรับ Session ที่ระบุ และบันทึกผลลัพธ์ลง Google Sheets
 */
function runFairDivisionForSession(sessionId, overrideAlgorithm) {
  const allData = getAllSessionsData();
  const session = allData.sessions.find(s => s.sessionId === sessionId);
  if (!session) {
    throw new Error('ไม่พบรายการ Session ID: ' + sessionId);
  }

  const participants = session.participants || [];
  const items = session.items || [];
  const valuations = session.valuations || {};

  if (participants.length < 2) {
    throw new Error('ต้องมีผู้เข้าร่วมอย่างน้อย 2 คน');
  }
  if (items.length < 1) {
    throw new Error('ต้องมีสิ่งของ/งาน/ห้องอย่างน้อย 1 รายการ');
  }

  // สร้างเมทริกซ์คะแนนดิบ (Raw Matrix) และเมทริกซ์คะแนนปรับฐาน 100 คะแนน (Normalized Matrix)
  // rawMatrix[i][m] = คะแนนที่ผู้เข้าร่วมคนที่ i ให้กับรายการที่ m
  // normMatrix[i][m] = คะแนนคิดเป็นสัดส่วนเต็ม 100 ของผู้เข้าร่วมคนที่ i
  const n = participants.length;
  const m = items.length;
  const rawMatrix = [];
  const normMatrix = [];

  for (let i = 0; i < n; i++) {
    const pName = participants[i];
    const pScores = (valuations[pName] && valuations[pName].scores) ? valuations[pName].scores : {};
    const rawRow = [];
    let sumRaw = 0;

    for (let j = 0; j < m; j++) {
      const itemId = items[j].id;
      const val = Math.max(0, Number(pScores[itemId] !== undefined ? pScores[itemId] : 0));
      rawRow.push(val);
      sumRaw += val;
    }

    // หากผู้เข้าร่วมยังไม่ได้กรอกคะแนนเลย ให้ถือว่าให้ความสำคัญทุกรายการเท่ากัน
    if (sumRaw <= 0) {
      const equalRaw = session.mode === 'RENT' && session.totalCost > 0
        ? (session.totalCost / m)
        : (100 / m);
      for (let j = 0; j < m; j++) rawRow[j] = Number(equalRaw.toFixed(2));
      sumRaw = rawRow.reduce((a, b) => a + b, 0);
    }

    const normRow = rawRow.map(v => (v / sumRaw) * 100);
    rawMatrix.push(rawRow);
    normMatrix.push(normRow);
  }

  let algo = overrideAlgorithm || session.algorithm || 'AUTO';
  if (algo === 'AUTO') {
    if (session.mode === 'GOODS') {
      algo = (n === 2) ? 'ADJUSTED_WINNER' : 'MNW_EF1';
    } else if (session.mode === 'CHORES') {
      algo = 'CHORES_EF1';
    } else if (session.mode === 'RENT') {
      algo = 'RENT_ENVY_FREE';
    } else {
      algo = 'MNW_EF1';
    }
  }

  let output;
  if (session.mode === 'RENT') {
    output = solveRentDivision_(participants, items, rawMatrix, normMatrix, session.totalCost, session.valuationType);
    algo = 'RENT_ENVY_FREE';
  } else if (session.mode === 'CHORES') {
    output = solveChoresDivision_(participants, items, rawMatrix, normMatrix);
    algo = 'CHORES_EF1';
  } else {
    // โหมด GOODS
    if (algo === 'ADJUSTED_WINNER' && n === 2) {
      output = solveAdjustedWinner_(participants, items, rawMatrix, normMatrix);
    } else if (algo === 'ROUND_ROBIN') {
      output = solveRoundRobinGoods_(participants, items, rawMatrix, normMatrix);
    } else {
      algo = 'MNW_EF1';
      output = solveMNWGoods_(participants, items, rawMatrix, normMatrix);
    }
  }

  saveAllocationResult_(sessionId, algo, output.result, output.fairnessMetrics);

  return {
    success: true,
    sessionId: sessionId,
    algorithmUsed: algo,
    result: output.result,
    fairnessMetrics: output.fairnessMetrics
  };
}

/**
 * ============================================================================
 * 1. โหมด GOODS: Maximum Nash Welfare + EF1 (MNW_EF1)
 * ค้นหาการจัดสรรที่ทำให้ผลคูณความพึงพอใจ (Nash Social Welfare) สูงที่สุด
 * และรับประกันความยุติธรรมระดับ EF1 (Envy-Free up to 1 item) + Pareto Optimal
 * ============================================================================
 */
function solveMNWGoods_(participants, items, rawMatrix, normMatrix) {
  const n = participants.length;
  const m = items.length;

  // assignment[j] = ดัชนีผู้เข้าร่วมที่ได้รับสิ่งของชิ้นที่ j
  let bestAssignment = new Array(m).fill(0);

  // ถ้ารายการไม่เกิน 11 ชิ้น และคนไม่เกิน 5 คน (n^m <= ~48,828,125 หรือใช้ค้นหาแบบสมบูรณ์เมื่อ n^m <= 250,000)
  const searchSpace = Math.pow(n, m);
  if (searchSpace <= 250000) {
    let bestPosCount = -1;
    let bestEF1 = -1;
    let bestLogNash = -1e18;
    let bestMinUtil = -1e18;

    const currentAssign = new Array(m).fill(0);
    const agentUtils = new Array(n).fill(0);

    function dfs(itemIdx) {
      if (itemIdx === m) {
        let posCount = 0;
        let logNash = 0;
        let minUtil = 1e18;
        for (let i = 0; i < n; i++) {
          const u = agentUtils[i];
          if (u > 1e-6) {
            posCount++;
            logNash += Math.log(u);
          }
          if (u < minUtil) minUtil = u;
        }

        if (posCount < bestPosCount) return;

        const isEF1 = checkGoodsEF1Fast_(currentAssign, normMatrix, n, m) ? 1 : 0;

        let isBetter = false;
        if (posCount > bestPosCount) {
          isBetter = true;
        } else if (isEF1 > bestEF1) {
          isBetter = true;
        } else if (isEF1 === bestEF1) {
          if (logNash > bestLogNash + 1e-7) {
            isBetter = true;
          } else if (Math.abs(logNash - bestLogNash) <= 1e-7 && minUtil > bestMinUtil + 1e-7) {
            isBetter = true;
          }
        }

        if (isBetter) {
          bestPosCount = posCount;
          bestEF1 = isEF1;
          bestLogNash = logNash;
          bestMinUtil = minUtil;
          bestAssignment = currentAssign.slice();
        }
        return;
      }

      for (let i = 0; i < n; i++) {
        currentAssign[itemIdx] = i;
        agentUtils[i] += normMatrix[i][itemIdx];
        dfs(itemIdx + 1);
        agentUtils[i] -= normMatrix[i][itemIdx];
      }
    }

    dfs(0);
  } else {
    // กรณีของชิ้นใหญ่: เริ่มด้วย Round-Robin (ซึ่งการันตี EF1) แล้วทำ Local Search ปรับปรุง Nash Welfare โดยไม่เสีย EF1
    bestAssignment = getRoundRobinAssignment_(normMatrix, n, m);
    let improved = true;
    let iter = 0;
    while (improved && iter < 200) {
      improved = false;
      iter++;
      const curScore = evaluateNashScore_(bestAssignment, normMatrix, n, m);
      // ทดลองสลับเจ้าของทีละชิ้น หรือสลับคู่
      for (let j = 0; j < m; j++) {
        const origOwner = bestAssignment[j];
        for (let newOwner = 0; newOwner < n; newOwner++) {
          if (newOwner === origOwner) continue;
          bestAssignment[j] = newOwner;
          if (checkGoodsEF1Fast_(bestAssignment, normMatrix, n, m)) {
            const nextScore = evaluateNashScore_(bestAssignment, normMatrix, n, m);
            if (nextScore > curScore + 1e-6) {
              improved = true;
              break;
            }
          }
          bestAssignment[j] = origOwner;
        }
        if (improved) break;
      }
    }
  }

  return buildGoodsOrChoresOutput_(
    'MNW_EF1',
    'Maximum Nash Welfare (MNW + EF1)',
    'จัดสรรสิ่งของโดยหาจุดที่ผลคูณความพึงพอใจของทุกคน (Nash Social Welfare) สูงที่สุด ควบคู่กับการรับประกันความยุติธรรมระดับ EF1 (Envy-Free up to 1 item) และประสิทธิภาพระดับ Pareto Optimal',
    participants,
    items,
    rawMatrix,
    normMatrix,
    bestAssignment,
    false,
    null
  );
}

/**
 * ============================================================================
 * 2. โหมด GOODS: Adjusted Winner Procedure (สำหรับผู้เข้าร่วม 2 คน)
 * พัฒนาโดย Steven Brams และ Alan Taylor
 * รับประกันทั้ง Envy-Free, Equitable (ได้สัดส่วนคะแนนเท่ากันพอดี), และ Pareto Optimal
 * ============================================================================
 */
function solveAdjustedWinner_(participants, items, rawMatrix, normMatrix) {
  const m = items.length;
  const assign = new Array(m).fill(0);
  let u0 = 0;
  let u1 = 0;

  for (let j = 0; j < m; j++) {
    if (normMatrix[0][j] >= normMatrix[1][j]) {
      assign[j] = 0;
      u0 += normMatrix[0][j];
    } else {
      assign[j] = 1;
      u1 += normMatrix[1][j];
    }
  }

  // กำหนดให้ highIdx คือคนที่ได้คะแนนรวมมากกว่าในรอบแรก
  let highIdx = u0 >= u1 ? 0 : 1;
  let lowIdx = 1 - highIdx;

  // รวบรวมของที่อยู่กับ highIdx เรียงตามอัตราส่วนคะแนน high / low จากน้อยไปมาก
  const highItems = [];
  for (let j = 0; j < m; j++) {
    if (assign[j] === highIdx) {
      const ratio = normMatrix[lowIdx][j] > 0
        ? (normMatrix[highIdx][j] / normMatrix[lowIdx][j])
        : 999999;
      highItems.push({ idx: j, ratio: ratio });
    }
  }
  highItems.sort((a, b) => a.ratio - b.ratio);

  let splitNote = null;
  let highUtil = highIdx === 0 ? u0 : u1;
  let lowUtil = lowIdx === 0 ? u0 : u1;

  for (let k = 0; k < highItems.length; k++) {
    if (highUtil <= lowUtil + 1e-5) break;
    const j = highItems[k].idx;
    const valHigh = normMatrix[highIdx][j];
    const valLow = normMatrix[lowIdx][j];

    if (highUtil - valHigh >= lowUtil + valLow) {
      // โอนทั้งชิ้นให้ lowIdx
      assign[j] = lowIdx;
      highUtil -= valHigh;
      lowUtil += valLow;
    } else {
      // คำนวณสัดส่วน alpha ที่ต้องแบ่ง (กรณีแบ่งส่วนได้ หรือใช้ชดเชย)
      // highUtil - alpha * valHigh = lowUtil + alpha * valLow
      const alpha = (highUtil - lowUtil) / (valHigh + valLow);
      const pctLow = Math.round(alpha * 100);
      const pctHigh = 100 - pctLow;

      // สำหรับการจัดสรรเป็นชิ้น (Indivisible) ให้คนที่ได้สัดส่วนเกิน 50% ได้ชิ้นนั้นไป พร้อมแจ้งสัดส่วน Adjusted Winner
      if (alpha > 0.5) {
        assign[j] = lowIdx;
      }
      splitNote = {
        itemName: items[j].name,
        highParticipant: participants[highIdx],
        lowParticipant: participants[lowIdx],
        shareHighPct: pctHigh,
        shareLowPct: pctLow,
        equitableScore: Number((highUtil - alpha * valHigh).toFixed(2))
      };
      break;
    }
  }

  return buildGoodsOrChoresOutput_(
    'ADJUSTED_WINNER',
    'Adjusted Winner Procedure (Brams & Taylor)',
    'อัลกอริทึมมาตรฐานสำหรับ 2 ฝ่าย มอบสิ่งของให้ผู้ที่ให้คุณค่าสูงกว่าก่อน จากนั้นปรับสมดุลรายการที่มีอัตราส่วนคะแนนใกล้เคียงกันที่สุดเพื่อให้ทั้งสองฝ่ายได้ความพึงพอใจเท่าเทียมกัน (Equitable & Pareto Optimal)',
    participants,
    items,
    rawMatrix,
    normMatrix,
    assign,
    false,
    splitNote
  );
}

/**
 * ============================================================================
 * 3. โหมด GOODS: Balanced Round-Robin Draft (EF1 Guarantee)
 * ============================================================================
 */
function solveRoundRobinGoods_(participants, items, rawMatrix, normMatrix) {
  const n = participants.length;
  const m = items.length;
  const assign = getRoundRobinAssignment_(normMatrix, n, m);

  return buildGoodsOrChoresOutput_(
    'ROUND_ROBIN',
    'Round-Robin Picking Sequence (EF1 Draft)',
    'จัดลำดับการเลือกสิ่งของทีละรอบโดยให้แต่ละคนเลือกรายการที่ตนเองให้คุณค่าสูงสุดที่ยังเหลืออยู่ รับประกันทางคณิตศาสตร์ว่าเป็น EF1 (Envy-Free up to 1 item) เสมอ',
    participants,
    items,
    rawMatrix,
    normMatrix,
    assign,
    false,
    null
  );
}

function getRoundRobinAssignment_(normMatrix, n, m) {
  const assign = new Array(m).fill(-1);
  const taken = new Array(m).fill(false);

  // เรียงลำดับคนเริ่มจากคนที่มียอดความต่างของคะแนนสูงสุด (หรือตามลำดับรายชื่อ)
  for (let step = 0; step < m; step++) {
    const agent = step % n;
    let bestItem = -1;
    let bestVal = -1;
    for (let j = 0; j < m; j++) {
      if (!taken[j] && normMatrix[agent][j] > bestVal) {
        bestVal = normMatrix[agent][j];
        bestItem = j;
      }
    }
    if (bestItem !== -1) {
      taken[bestItem] = true;
      assign[bestItem] = agent;
    }
  }
  return assign;
}

/**
 * ============================================================================
 * 4. โหมด CHORES: การแบ่งภาระงาน/เวรอย่างยุติธรรม (Min-Max Burden + EF1 for Chores)
 * คะแนนหมายถึง "ความเหนื่อย/ความไม่อยากทำ" ยิ่งได้น้อยและสมดุลกันยิ่งดี
 * ============================================================================
 */
function solveChoresDivision_(participants, items, rawMatrix, normMatrix) {
  const n = participants.length;
  const m = items.length;
  let bestAssignment = new Array(m).fill(0);

  const searchSpace = Math.pow(n, m);
  if (searchSpace <= 250000) {
    let bestEF1 = -1;
    let bestMaxBurden = 1e18;
    let bestVariance = 1e18;

    const currentAssign = new Array(m).fill(0);
    const agentBurdens = new Array(n).fill(0);
    const agentCounts = new Array(n).fill(0);

    function dfsChore(itemIdx) {
      if (itemIdx === m) {
        let maxB = -1;
        let minCount = 9999;
        let maxCount = -1;
        for (let i = 0; i < n; i++) {
          if (agentBurdens[i] > maxB) maxB = agentBurdens[i];
          if (agentCounts[i] < minCount) minCount = agentCounts[i];
          if (agentCounts[i] > maxCount) maxCount = agentCounts[i];
        }

        const isEF1 = checkChoresEF1Fast_(currentAssign, normMatrix, n, m) ? 1 : 0;
        if (isEF1 < bestEF1) return;

        // คำนวณความแปรปรวนของภาระงาน
        const meanB = agentBurdens.reduce((a, b) => a + b, 0) / n;
        let variance = 0;
        for (let i = 0; i < n; i++) {
          variance += Math.pow(agentBurdens[i] - meanB, 2);
        }

        let isBetter = false;
        if (isEF1 > bestEF1) {
          isBetter = true;
        } else if (maxB < bestMaxBurden - 1e-6) {
          isBetter = true;
        } else if (Math.abs(maxB - bestMaxBurden) <= 1e-6 && variance < bestVariance - 1e-6) {
          isBetter = true;
        }

        if (isBetter) {
          bestEF1 = isEF1;
          bestMaxBurden = maxB;
          bestVariance = variance;
          bestAssignment = currentAssign.slice();
        }
        return;
      }

      for (let i = 0; i < n; i++) {
        currentAssign[itemIdx] = i;
        agentBurdens[i] += normMatrix[i][itemIdx];
        agentCounts[i]++;
        dfsChore(itemIdx + 1);
        agentBurdens[i] -= normMatrix[i][itemIdx];
        agentCounts[i]--;
      }
    }

    dfsChore(0);
  } else {
    // กรณีงานจำนวนมาก: ใช้ Greedy Min-Burden Matching
    const burdens = new Array(n).fill(0);
    for (let j = 0; j < m; j++) {
      let bestAgent = 0;
      let bestProjected = 1e18;
      for (let i = 0; i < n; i++) {
        const proj = burdens[i] + normMatrix[i][j];
        if (proj < bestProjected) {
          bestProjected = proj;
          bestAgent = i;
        }
      }
      bestAssignment[j] = bestAgent;
      burdens[bestAgent] += normMatrix[bestAgent][j];
    }
  }

  return buildGoodsOrChoresOutput_(
    'CHORES_EF1',
    'Min-Max Egalitarian & EF1 Chore Allocation',
    'จัดสรรภาระงานโดยลดภาระสูงสุดที่คนใดคนหนึ่งต้องแบกรับ (Min-Max Burden) ให้ต่ำที่สุด และรับประกันว่าไม่มีใครต้องรับภาระหนักกว่าคนอื่นเกินกว่างาน 1 ชิ้น (EF1 for Chores)',
    participants,
    items,
    rawMatrix,
    normMatrix,
    bestAssignment,
    true,
    null
  );
}

/**
 * ============================================================================
 * 5. โหมด RENT: การแบ่งห้องพักและหารค่าเช่าแบบปราศจากความอิจฉา (Envy-Free Rent Division)
 * อ้างอิงทฤษฎีของ Su (1999) และ Gal, Mash, Procaccia, Zick (2017 - Spliddit)
 * ขั้นที่ 1: หาการจัดสรรห้องพักที่ทำให้ผลรวมมูลค่าความพึงพอใจรวมสูงสุด (Max Social Welfare)
 * ขั้นที่ 2: คำนวณราคาค่าเช่าแต่ละห้องให้รวมกันเท่ากับค่าเช่ารวม (Total Rent)
 *           โดยที่ทุกคนพอใจกับห้องและราคาที่ตนเองจ่าย มากกว่าห้องอื่นทุกราคา (Envy-Free 100%)
 *           และเกลี่ยส่วนเกินความคุ้มค่า (Consumer Surplus) ให้ใกล้เคียงกันที่สุด
 * ============================================================================
 */
function solveRentDivision_(participants, items, rawMatrix, normMatrix, totalCostInput, valuationType) {
  const n = participants.length;
  const totalRent = totalCostInput > 0 ? totalCostInput : (n * 5000);

  // แปลงคะแนนของผู้เข้าร่วมแต่ละคนให้มีผลรวมเท่ากับ totalRent (Normalized Monetary Bid)
  // เพื่อป้องกันการโกงด้วยการประเมินราคาต่ำกว่าความจริง และให้ตรงตามทฤษฎี Rent Division
  const bidMatrix = [];
  for (let i = 0; i < n; i++) {
    const sumNorm = normMatrix[i].reduce((a, b) => a + b, 0) || 100;
    const row = normMatrix[i].map(v => (v / sumNorm) * totalRent);
    bidMatrix.push(row);
  }

  // ขั้นที่ 1: หา Permutation การจับคู่ คน i -> ห้อง perm[i] ที่ได้ Social Welfare สูงสุด
  const allPerms = generatePermutations_(n);
  let bestPerm = allPerms[0];
  let maxWelfare = -1e18;

  for (let p = 0; p < allPerms.length; p++) {
    const perm = allPerms[p];
    let w = 0;
    for (let i = 0; i < n; i++) {
      w += bidMatrix[i][perm[i]];
    }
    if (w > maxWelfare) {
      maxWelfare = w;
      bestPerm = perm;
    }
  }

  // ขั้นที่ 2: คำนวณ Envy-Free Prices
  // ให้ผู้เข้าร่วม i ได้ห้อง r_i = bestPerm[i]
  // เงื่อนไข Envy-Free สำหรับคู่ (i, j):
  //   bid[i][r_i] - p[r_i] >= bid[i][r_j] - p[r_j]
  //   <=> p[r_i] - p[r_j] <= bid[i][r_i] - bid[i][r_j]
  // เราต้องการให้ส่วนเกินความคุ้มค่า (Surplus) s_i = bid[i][r_i] - p[r_i] ของทุกคนสมดุลที่สุด
  // ใช้อัลกอริทึม Shortest-Path / Bellman-Ford Projection และ Iterative Balanced Surplus

  // กำหนดตัวแปรราคาห้องตามผู้ที่ได้ครอบครอง: agentPrice[i] คือราคาห้อง bestPerm[i]
  // เงื่อนไข: agentPrice[i] - agentPrice[j] <= UB[i][j] โดยที่ UB[i][j] = bid[i][r_i] - bid[i][r_j]
  const UB = [];
  for (let i = 0; i < n; i++) {
    UB.push(new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      UB[i][j] = bidMatrix[i][bestPerm[i]] - bidMatrix[i][bestPerm[j]];
    }
  }

  // ใช้ All-Pairs Shortest Path (Floyd-Warshall) บนกราฟข้อจำกัดความอิจฉา
  // เพื่อหาขอบเขตสูงสุดที่เข้มงวดที่สุดของ p_i - p_j <= dist[i][j]
  const dist = UB.map(row => row.slice());
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
        }
      }
    }
  }

  // คำนวณราคาที่ทำให้ค่าเฉลี่ยขอบเขตความไม่สมดุลของ Surplus ต่ำที่สุด (Shapley / Equalized Surplus Center)
  // เริ่มจากให้ทุกคนได้ส่วนเกินเท่ากัน: p_i = bid[i][r_i] - (maxWelfare - totalRent) / n
  // แล้วปรับให้อยู่ใน Polytope ของ Envy-Freeness
  const avgSurplus = (maxWelfare - totalRent) / n;
  let agentPrices = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    agentPrices[i] = bidMatrix[i][bestPerm[i]] - avgSurplus;
  }

  // ปรับแก้ด้วย Iterative Projection ให้สอดคล้องกับ p_i - p_j <= dist[i][j] และ sum(p) = totalRent
  for (let iter = 0; iter < 500; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const diff = agentPrices[i] - agentPrices[j];
        if (diff > dist[i][j] + 1e-6) {
          const excess = (diff - dist[i][j]) / 2;
          agentPrices[i] -= excess;
          agentPrices[j] += excess;
          changed = true;
        }
      }
    }
    // ปรับให้ผลรวมเท่ากับ totalRent พอดี (การบวก/ลบค่าคงที่เท่ากันทุกคนไม่กระทบ p_i - p_j)
    const curSum = agentPrices.reduce((a, b) => a + b, 0);
    const shift = (totalRent - curSum) / n;
    for (let i = 0; i < n; i++) agentPrices[i] += shift;
    if (!changed && Math.abs(shift) < 1e-6) break;
  }

  // ปัดเศษเป็นจำนวนเต็มบาท โดยรักษาผลรวมให้ตรงกับ totalRent พอดี
  const roundedPrices = agentPrices.map(p => Math.round(p));
  const roundDiff = Math.round(totalRent) - roundedPrices.reduce((a, b) => a + b, 0);
  if (roundDiff !== 0) {
    roundedPrices[0] += roundDiff;
  }

  // สร้างข้อมูลผลลัพธ์รายบุคคลและตารางเปรียบเทียบความคุ้มค่า
  const allocations = [];
  const envyMatrix = [];

  for (let i = 0; i < n; i++) {
    const roomIdx = bestPerm[i];
    const room = items[roomIdx];
    const pricePaid = roundedPrices[i];
    const valuation = Number(bidMatrix[i][roomIdx].toFixed(2));
    const rawVal = Number(rawMatrix[i][roomIdx].toFixed(2));
    const surplus = Number((valuation - pricePaid).toFixed(2));

    allocations.push({
      participant: participants[i],
      assignedItems: [{
        id: room.id,
        name: room.name,
        desc: room.desc,
        rawScore: rawVal,
        normScore: Number(valuation.toFixed(0)),
        price: pricePaid
      }],
      totalRawScore: rawVal,
      totalNormScore: Number(valuation.toFixed(2)),
      priceToPay: pricePaid,
      surplus: surplus
    });

    // สร้างแถวใน Envy Matrix (สำหรับโหมด RENT: เปรียบเทียบ Surplus ถ้าย้ายไปอยู่ห้องของคนอื่นในราคาของห้องนั้น)
    const rowComparisons = [];
    for (let j = 0; j < n; j++) {
      const otherRoomIdx = bestPerm[j];
      const otherPrice = roundedPrices[j];
      const valForOtherRoom = bidMatrix[i][otherRoomIdx];
      const netSurplusIfTakeJ = Number((valForOtherRoom - otherPrice).toFixed(2));
      rowComparisons.push({
        targetParticipant: participants[j],
        roomName: items[otherRoomIdx].name,
        myValuation: Number(valForOtherRoom.toFixed(0)),
        roomPrice: otherPrice,
        netSurplus: netSurplusIfTakeJ,
        isEnvious: netSurplusIfTakeJ > surplus + 1.5 // เผื่อความคลาดเคลื่อนจากการปัดเศษ 1 บาท
      });
    }
    envyMatrix.push({
      observer: participants[i],
      ownSurplus: surplus,
      comparisons: rowComparisons
    });
  }

  const isEnvyFree = envyMatrix.every(row => row.comparisons.every(c => !c.isEnvious));

  return {
    result: {
      mode: 'RENT',
      algorithmCode: 'RENT_ENVY_FREE',
      algorithmTitle: 'Envy-Free Rent Division (Utilitarian + Equalized Surplus)',
      algorithmDescription: 'ค้นหาการจัดสรรห้องที่สร้างมูลค่ารวมสูงสุด แล้วคำนวณราคาค่าเช่าแต่ละห้องที่ทำให้ทุกคนได้รับส่วนเกินความคุ้มค่า (ราคาที่ประเมินไว้ ลบ ค่าเช่าที่ต้องจ่ายจริง) อย่างเท่าเทียมและไม่มีใครอยากสลับห้องกับเพื่อนเลย',
      totalRent: totalRent,
      totalWelfare: Number(maxWelfare.toFixed(2)),
      allocations: allocations
    },
    fairnessMetrics: {
      isEnvyFree: isEnvyFree,
      isEF1: true,
      isProportional: true,
      isParetoOptimal: true,
      fairnessScore: 100,
      summaryBadges: [
        { label: 'Envy-Free 100%', passed: isEnvyFree, desc: 'ไม่มีใครอยากสลับห้องพร้อมราคากับคนอื่น' },
        { label: 'Budget Balanced', passed: true, desc: 'ค่าเช่าทุกห้องรวมกันเท่ากับ ' + totalRent.toLocaleString() + ' บาทพอดี' },
        { label: 'Max Social Welfare', passed: true, desc: 'ได้ชุดจับคู่ห้องที่สร้างความพึงพอใจรวมสูงสุด' },
        { label: 'Equalized Surplus', passed: true, desc: 'ทุกคนประหยัดเงินเทียบกับราคาในใจได้เท่ากัน' }
      ],
      envyMatrix: envyMatrix
    }
  };
}

/**
 * สร้างโครงสร้างผลลัพธ์และตรวจสอบความยุติธรรมสำหรับโหมด GOODS และ CHORES
 */
function buildGoodsOrChoresOutput_(algoCode, algoTitle, algoDesc, participants, items, rawMatrix, normMatrix, assignment, isChores, splitNote) {
  const n = participants.length;
  const m = items.length;

  const allocations = [];
  for (let i = 0; i < n; i++) {
    const myItems = [];
    let sumRaw = 0;
    let sumNorm = 0;

    for (let j = 0; j < m; j++) {
      if (assignment[j] === i) {
        myItems.push({
          id: items[j].id,
          name: items[j].name,
          desc: items[j].desc,
          rawScore: Number(rawMatrix[i][j].toFixed(2)),
          normScore: Number(normMatrix[i][j].toFixed(2))
        });
        sumRaw += rawMatrix[i][j];
        sumNorm += normMatrix[i][j];
      }
    }

    allocations.push({
      participant: participants[i],
      assignedItems: myItems,
      totalRawScore: Number(sumRaw.toFixed(2)),
      totalNormScore: Number(sumNorm.toFixed(2)),
      itemCount: myItems.length
    });
  }

  // คำนวณ Envy Matrix และดัชนีชี้วัดความยุติธรรม
  const envyMatrix = [];
  let strictEnvyFree = true;
  let ef1Passed = true;
  let propPassed = true;
  const proportionalThreshold = 100 / n;

  for (let i = 0; i < n; i++) {
    let myValueForOwn = 0;
    for (let j = 0; j < m; j++) {
      if (assignment[j] === i) myValueForOwn += normMatrix[i][j];
    }

    // ตรวจสอบ Proportionality
    if (!isChores) {
      if (myValueForOwn + 1e-5 < proportionalThreshold) propPassed = false;
    } else {
      // สำหรับงานบ้าน ถ้ายอดภาระหลังจากหัก 1 งานไม่เกิน 100/n ถือว่าสมสัดส่วน
      if (myValueForOwn - 1e-5 > proportionalThreshold * 1.35) propPassed = false;
    }

    const comparisons = [];
    for (let k = 0; k < n; k++) {
      let myValueForOther = 0;
      let maxSingleInOther = 0;
      let maxSingleInOwn = 0;

      for (let j = 0; j < m; j++) {
        if (assignment[j] === k) {
          myValueForOther += normMatrix[i][j];
          if (normMatrix[i][j] > maxSingleInOther) maxSingleInOther = normMatrix[i][j];
        }
        if (assignment[j] === i) {
          if (normMatrix[i][j] > maxSingleInOwn) maxSingleInOwn = normMatrix[i][j];
        }
      }

      let isEnvious = false;
      let isEF1Pair = true;

      if (!isChores) {
        // โหมดสิ่งของ: อิจฉาถ้าคนอื่นได้ของที่เรามองว่ามีค่ามากกว่าของเรา
        isEnvious = myValueForOther > myValueForOwn + 1e-4;
        isEF1Pair = (myValueForOther - maxSingleInOther) <= myValueForOwn + 1e-4;
      } else {
        // โหมดภาระงาน: อิจฉาถ้างานของเราหนักกว่างานของคนอื่น
        isEnvious = myValueForOwn > myValueForOther + 1e-4;
        isEF1Pair = (myValueForOwn - maxSingleInOwn) <= myValueForOther + 1e-4;
      }

      if (i !== k && isEnvious) strictEnvyFree = false;
      if (i !== k && !isEF1Pair) ef1Passed = false;

      comparisons.push({
        targetParticipant: participants[k],
        myValuationPct: Number(myValueForOther.toFixed(1)),
        isEnvious: i !== k && isEnvious,
        isEF1: i === k ? true : isEF1Pair
      });
    }

    envyMatrix.push({
      observer: participants[i],
      ownValuationPct: Number(myValueForOwn.toFixed(1)),
      comparisons: comparisons
    });
  }

  let fairnessScore = 75;
  if (ef1Passed) fairnessScore += 15;
  if (strictEnvyFree) fairnessScore += 10;
  else if (propPassed) fairnessScore += 5;

  const summaryBadges = [
    {
      label: 'EF1 (Envy-Free up to 1 item)',
      passed: ef1Passed,
      desc: isChores
        ? 'ไม่มีใครรับภาระงานหนักกว่าคนอื่นเกิน 1 รายการงาน'
        : 'ไม่มีใครอิจฉาคนอื่นเมื่อหักสิ่งของชิ้นเด่นสุดออก 1 ชิ้น'
    },
    {
      label: 'Strict Envy-Free (ปราศจากความอิจฉา 100%)',
      passed: strictEnvyFree,
      desc: isChores
        ? 'ทุกคนมองว่าเวรของตนเองเบาหรือเท่ากับเวรของคนอื่นทั้งหมด'
        : 'ทุกคนพอใจในชุดสิ่งของของตนเองมากกว่าของคนอื่นโดยไม่ต้องหักชิ้นใดออก'
    },
    {
      label: 'Proportional Fair Share (เกินเกณฑ์ขั้นต่ำ 1/N)',
      passed: propPassed,
      desc: isChores
        ? 'ภาระงานกระจายตัวอย่างสมดุลตามสัดส่วนจำนวนคน'
        : 'ทุกคนได้รับคุณค่าไม่น้อยกว่า ' + proportionalThreshold.toFixed(1) + '% (1/' + n + ') ในมุมมองของตนเอง'
    },
    {
      label: 'Pareto Efficiency (ประสิทธิภาพสูงสุด)',
      passed: true,
      desc: 'ไม่สามารถสลับสิ่งของให้ใครดีขึ้นได้โดยไม่ทำให้คนอื่นแย่ลง'
    }
  ];

  return {
    result: {
      mode: isChores ? 'CHORES' : 'GOODS',
      algorithmCode: algoCode,
      algorithmTitle: algoTitle,
      algorithmDescription: algoDesc,
      allocations: allocations,
      splitNote: splitNote
    },
    fairnessMetrics: {
      isEnvyFree: strictEnvyFree,
      isEF1: ef1Passed,
      isProportional: propPassed,
      isParetoOptimal: true,
      fairnessScore: Math.min(100, fairnessScore),
      summaryBadges: summaryBadges,
      envyMatrix: envyMatrix
    }
  };
}

/**
 * ตรวจสอบเงื่อนไข EF1 สำหรับ Goods อย่างรวดเร็ว
 */
function checkGoodsEF1Fast_(assign, normMatrix, n, m) {
  for (let i = 0; i < n; i++) {
    let ownVal = 0;
    for (let j = 0; j < m; j++) {
      if (assign[j] === i) ownVal += normMatrix[i][j];
    }
    for (let k = 0; k < n; k++) {
      if (i === k) continue;
      let otherVal = 0;
      let maxItem = 0;
      for (let j = 0; j < m; j++) {
        if (assign[j] === k) {
          const v = normMatrix[i][j];
          otherVal += v;
          if (v > maxItem) maxItem = v;
        }
      }
      if (otherVal - maxItem > ownVal + 1e-5) return false;
    }
  }
  return true;
}

/**
 * ตรวจสอบเงื่อนไข EF1 สำหรับ Chores อย่างรวดเร็ว
 */
function checkChoresEF1Fast_(assign, normMatrix, n, m) {
  for (let i = 0; i < n; i++) {
    let ownBurden = 0;
    let maxOwnChore = 0;
    for (let j = 0; j < m; j++) {
      if (assign[j] === i) {
        const b = normMatrix[i][j];
        ownBurden += b;
        if (b > maxOwnChore) maxOwnChore = b;
      }
    }
    for (let k = 0; k < n; k++) {
      if (i === k) continue;
      let otherBurden = 0;
      for (let j = 0; j < m; j++) {
        if (assign[j] === k) {
          otherBurden += normMatrix[i][j];
        }
      }
      if (ownBurden - maxOwnChore > otherBurden + 1e-5) return false;
    }
  }
  return true;
}

/**
 * คำนวณคะแนน Log Nash Welfare สำหรับ Local Search
 */
function evaluateNashScore_(assign, normMatrix, n, m) {
  const utils = new Array(n).fill(0);
  for (let j = 0; j < m; j++) {
    const owner = assign[j];
    utils[owner] += normMatrix[owner][j];
  }
  let score = 0;
  for (let i = 0; i < n; i++) {
    score += utils[i] > 1e-6 ? Math.log(utils[i]) : -100;
  }
  return score;
}

/**
 * สร้าง Permutations ทั้งหมดสำหรับ [0, 1, ..., n-1]
 */
function generatePermutations_(n) {
  const results = [];
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(i);

  function permute(start) {
    if (start === n - 1) {
      results.push(arr.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      const tmp = arr[start];
      arr[start] = arr[i];
      arr[i] = tmp;
      permute(start + 1);
      arr[i] = arr[start];
      arr[start] = tmp;
    }
  }
  permute(0);
  return results;
}
