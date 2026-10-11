/**
 * 盲盒决策引擎
 * ---------------------------------------------------------------
 * 输入：一句心情 + 一组约束（预算 / 人数 / 辣度 / 忌口 / 热量上限）
 * 输出：3 个盲盒（稳妥款 / 惊喜款 / 反套路款）+ 确定性开盒结果
 *
 * 设计要点
 *  1. 「盲盒」不是抽奖。开盒结果由 FNV-1a 哈希(日期 + 情绪 + 约束)决定，
 *     同一天、同一心情、同一约束，结果永远一致 —— 可复现、可分享、可核对。
 *  2. 所有约束都是硬过滤 + 打分，不存在「算出来超预算」的情况。
 *  3. 不依赖任何外部库，Node 与浏览器共用同一份实现。
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./content.js'), require('./menu.demo.js'));
  } else {
    root.MMB = root.MMB || {};
    root.MMB.blindbox = factory(root.MMB.content, root.MMB.menu);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (contentMod, menuMod) {
  'use strict';

  var MOODS = contentMod.MOODS;

  /* ===================== 打分权重（参考手册以此为准） ===================== */
  var WEIGHTS = {
    dnaHit: 0.9,        // 每个「必须命中的标签」额外加分（单品维度）
    dnaCombo: 0.8,      // 整盒每命中一个 dna 标签再加分
    spicyFit: 0.4,      // 辣度符合情绪偏好
    spicyOver: 0.5,     // 每超出一级辣度扣分
    kcalMax: 2.0,       // 热量贴近度满分
    kcalTol: 1.0,       // 热量偏离超过容差后衰减到 0
    protein: 1.6,       // 蛋白质达标满分
    budget: 2.2,        // 预算贴近度满分
    budgetWindow: 0.5,  // 与期望花费比例的偏离窗口（0.5 = 差 50% 时归零）
    treatRequired: 1.5, // 情绪要求甜品却缺席的扣分
    treatBonus: 0.2,    // 非必需时给甜品的加分
    personFit: 0.6      // 份数与人数匹配
  };

  /** 组合枚举前每个品类保留的候选数（性能与质量的折中，保证确定性） */
  var PRUNE = { main: 9, side: 8, drink: 8, treat: 6 };

  /**
   * 单次枚举的合法组合数上限。
   * 多人 + 庆祝（双主食 + 甜品）时笛卡尔积会膨胀到百万级，
   * 这里用「确定性剪尾」把规模压回可计算范围：
   * 每次只裁剪当前组合数贡献最大的那个品类的最后一名（分数最低的那个），
   * 因此剪枝结果只取决于数据本身，不依赖运行环境。
   */
  var MAX_COMBOS = 8000;

  var AVOID_IDS = {};
  (menuMod.AVOID_OPTIONS || []).forEach(function (o) { AVOID_IDS[o.id] = o.label; });

  /* ============================ 基础工具 ============================ */

  /** FNV-1a 32bit：同步、确定性、Node 与浏览器结果一致 */
  function hash32(str) {
    var h = 0x811c9dc5;
    str = String(str == null ? '' : str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function round2(n) { return Math.round(n * 100) / 100; }

  /** 两个数组是否相同（顺序无关） */
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    return a.slice().sort().join('|') === b.slice().sort().join('|');
  }

  /** 从数组里取 k 个的组合，k=0 时返回 [[]] */
  function combinations(arr, k) {
    var out = [];
    (function walk(start, picked) {
      if (picked.length === k) { out.push(picked.slice()); return; }
      for (var i = start; i < arr.length; i++) {
        picked.push(arr[i]);
        walk(i + 1, picked);
        picked.pop();
      }
    })(0, []);
    return out;
  }

  /** 组合数 C(n, k)，用于估算枚举规模 */
  function combCount(n, k) {
    if (k > n || k < 0) return 0;
    if (k === 0) return 1;
    var r = 1;
    for (var i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return Math.round(r);
  }

  function estimateCombos(pools, counts) {
    return combCount(pools.main.length, counts.main) *
      (counts.side > 0 ? combCount(pools.side.length, counts.side) : 1) *
      combCount(pools.drink.length, counts.drink) *
      (counts.treat > 0 ? combCount(pools.treat.length, counts.treat) : 1);
  }

  /** 确定性剪枝：把枚举规模压到 cap 之内 */
  function fitPools(pools, counts, cap) {
    cap = cap || MAX_COMBOS;
    var p = {
      main: pools.main.slice(), side: pools.side.slice(),
      drink: pools.drink.slice(), treat: pools.treat.slice()
    };
    var cats = ['main', 'side', 'drink', 'treat'];
    var guard = 0;
    while (estimateCombos(p, counts) > cap && guard < 300) {
      guard++;
      var bestCat = null, bestVal = -1;
      cats.forEach(function (cat) {
        var need = counts[cat];
        if (!need || need <= 0) return;
        if (p[cat].length <= need) return;             // 再删就不够用了
        var delta = combCount(p[cat].length, need) - combCount(p[cat].length - 1, need);
        if (delta > bestVal) { bestVal = delta; bestCat = cat; }
      });
      if (!bestCat) break;
      p[bestCat].pop();                                // 池子已按得分降序排列，去掉末位
    }
    return p;
  }

  /* ============================ 情绪识别 ============================ */

  function getMood(idOrText) {
    if (!idOrText) return MOODS[0];
    var s = String(idOrText).trim();
    for (var i = 0; i < MOODS.length; i++) {
      if (MOODS[i].id === s || MOODS[i].label === s || MOODS[i].code === s) return MOODS[i];
    }
    return detectMood(s);
  }

  /** 从一句自然语言里识别情绪：命中越长的别名越优先，全不中则落到「说不清」 */
  function detectMood(text) {
    var t = String(text || '').trim();
    if (!t) return MOODS[0];
    var best = null, bestLen = 0;
    MOODS.forEach(function (m) {
      m.aliases.forEach(function (a) {
        if (t.indexOf(a) !== -1 && a.length > bestLen) { best = m; bestLen = a.length; }
      });
    });
    return best || MOODS[0];
  }

  /* ============================ 约束归一化 ============================ */

  function normalizeConstraints(raw) {
    raw = raw || {};
    var people = parseInt(raw.people, 10);
    if (!isFinite(people) || people < 1) people = 1;
    people = clamp(people, 1, 6);

    var budget = parseFloat(raw.budget);
    if (!isFinite(budget) || budget <= 0) budget = 45;
    budget = clamp(budget, 12, 600);

    var avoid = (raw.avoid || []).filter(function (id) { return !!AVOID_IDS[id]; });
    avoid = avoid.filter(function (v, i) { return avoid.indexOf(v) === i; });

    var spicyMax = raw.spicyMax === undefined || raw.spicyMax === null ? 2 : parseInt(raw.spicyMax, 10);
    spicyMax = clamp(isFinite(spicyMax) ? spicyMax : 2, 0, 2);

    var kcalMax = parseFloat(raw.kcalMax);
    kcalMax = isFinite(kcalMax) && kcalMax > 0 ? clamp(kcalMax, 120, 3000) : null;

    var mealTime = raw.mealTime || 'auto';
    if (['auto', 'breakfast', 'all'].indexOf(mealTime) === -1) mealTime = 'auto';

    return { budget: budget, people: people, spicyMax: spicyMax, avoid: avoid, kcalMax: kcalMax, mealTime: mealTime };
  }

  /** 依据时间判断可选池：10:30 前视为早餐时段 */
  function resolveMealTime(mealTime, now) {
    if (mealTime !== 'auto') return mealTime;
    if (!now) return 'all';
    var h = now.getHours() + now.getMinutes() / 60;
    return h < 10.5 ? 'breakfast' : 'all';
  }

  /* ============================ 选品过滤 ============================ */

  function inMeal(item, mealTime) {
    if (mealTime === 'breakfast') return item.meal === 'breakfast' || item.meal === 'all';
    if (mealTime === 'all') return item.meal === 'all';
    return true;
  }

  function violatesAvoid(item, avoid) {
    for (var i = 0; i < avoid.length; i++) {
      if (item.contains.indexOf(avoid[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * 单品得分：标签加分 - 标签扣分 + DNA 命中 + 辣度契合
   * 口径与整盒打分保持一致，同时用于剪枝排序。
   */
  function itemScore(item, mood) {
    var s = 0;
    (item.tags || []).forEach(function (t) {
      if (mood.tagBoost && mood.tagBoost[t]) s += mood.tagBoost[t];
      if (mood.tagPenalty && mood.tagPenalty[t]) s -= mood.tagPenalty[t];
    });
    (mood.dna || []).forEach(function (t) {
      if ((item.tags || []).indexOf(t) !== -1) s += WEIGHTS.dnaHit;
    });
    if (mood.spicyPref !== null && mood.spicyPref !== undefined) {
      var diff = item.spicy - mood.spicyPref;
      if (diff > 0) s -= WEIGHTS.spicyOver * diff; else s += WEIGHTS.spicyFit;
    }
    return s;
  }

  function buildPools(menu, mood, constraints, mealTime, prune) {
    if (prune === undefined) prune = true;
    var pools = { main: [], side: [], drink: [], treat: [] };
    (menu || []).forEach(function (item) {
      if (!pools[item.category]) return;
      if (!inMeal(item, mealTime)) return;
      if (violatesAvoid(item, constraints.avoid)) return;
      if (item.spicy > constraints.spicyMax) return;
      if (mood.hardRules && mood.hardRules.handheld && !item.handheld) return;
      pools[item.category].push({ item: item, score: itemScore(item, mood) });
    });
    Object.keys(pools).forEach(function (cat) {
      pools[cat].sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.code < b.item.code ? -1 : 1;   // 同分按编码字典序，保证可复现
      });
      if (prune) pools[cat] = pools[cat].slice(0, PRUNE[cat]);
      pools[cat] = pools[cat].map(function (x) { return x.item; });
    });
    return pools;
  }

  /** 当前约束下「一主食 + 一饮品」的最低花费，用于预算不够时给出明确建议 */
  function minViableBudget(menu, mood, constraints, mealTime) {
    var full = buildPools(menu, mood, constraints, mealTime, false);
    var cheapest = function (arr) {
      if (!arr.length) return null;
      return arr.reduce(function (m, it) { return it.price < m.price ? it : m; }, arr[0]);
    };
    var m = cheapest(full.main), d = cheapest(full.drink);
    if (!m) return null;
    var need = m.price + (d ? d.price : 0);
    return { amount: round2(need), main: m.name, drink: d ? d.name : null };
  }

  /** 套餐骨架：结构份数 × 人数 */
  function slotCounts(structure, people) {
    return {
      main: Math.max(structure.main, people),
      side: structure.side > 0 ? Math.max(structure.side, Math.min(people, 2)) : 0,
      drink: Math.max(structure.drink || 1, people),
      treat: structure.treat >= 1
        ? Math.max(1, Math.round(structure.treat * Math.min(people, 3)))
        : (structure.treat > 0 ? 1 : 0)
    };
  }

  /* ============================ 整盒打分 ============================ */

  function scoreCombo(combo, mood, constraints) {
    var items = combo.items;
    var people = constraints.people;
    var price = 0, kcal = 0, protein = 0, affinity = 0;
    var tagSet = {};
    items.forEach(function (it) {
      price += it.price;
      kcal += it.kcal;
      protein += it.protein;
      affinity += itemScore(it, mood);
      (it.tags || []).forEach(function (t) { tagSet[t] = true; });
    });

    if (price > constraints.budget) return null;                          // 预算硬约束
    var kcalPP = kcal / people;
    var proteinPP = protein / people;
    if (constraints.kcalMax && kcalPP > constraints.kcalMax) return null;  // 热量硬约束

    var bonus = 0;
    (mood.dna || []).forEach(function (t) { if (tagSet[t]) bonus += WEIGHTS.dnaCombo; });

    var dev = Math.abs(kcalPP - mood.kcalTarget) / mood.kcalTarget;
    var kcalScore = WEIGHTS.kcalMax * Math.max(0, 1 - Math.min(1, dev / mood.kcalTolerance));
    var proteinScore = WEIGHTS.protein * Math.min(1, proteinPP / Math.max(1, mood.proteinMin));
    var ratio = price / constraints.budget;
    var budgetScore = WEIGHTS.budget * Math.max(0, 1 - Math.abs(ratio - mood.budgetUse) / WEIGHTS.budgetWindow);

    var hasTreat = items.some(function (it) { return it.category === 'treat'; });
    var structureScore = 0;
    if (mood.structure.treat >= 1) structureScore += hasTreat ? 0 : -WEIGHTS.treatRequired;
    else if (hasTreat) structureScore += WEIGHTS.treatBonus;

    return {
      items: items,
      price: round2(price),
      kcal: kcal,
      protein: protein,
      kcalPerPerson: Math.round(kcalPP),
      proteinPerPerson: Math.round(proteinPP),
      score: affinity + bonus + kcalScore + proteinScore + budgetScore + structureScore,
      parts: {
        affinity: round2(affinity), dna: round2(bonus), kcal: round2(kcalScore),
        protein: round2(proteinScore), budget: round2(budgetScore), structure: round2(structureScore)
      },
      tagSet: tagSet
    };
  }

  function signature(combo) {
    return combo.items.map(function (i) { return i.code; }).sort().join('+');
  }

  function enumerate(pools, counts, mood, constraints) {
    var out = [];
    var mainSets = combinations(pools.main, counts.main);
    var sideSets = counts.side > 0 ? combinations(pools.side, counts.side) : [[]];
    var drinkSets = combinations(pools.drink, counts.drink);
    var treatSets = counts.treat > 0 ? combinations(pools.treat, counts.treat) : [[]];

    mainSets.forEach(function (ms) {
      sideSets.forEach(function (ss) {
        drinkSets.forEach(function (ds) {
          treatSets.forEach(function (ts) {
            var items = ms.concat(ss, ds, ts);
            var seen = {}, dup = false;
            items.forEach(function (it) { if (seen[it.code]) dup = true; seen[it.code] = true; });
            if (dup || items.length === 0) return;
            var scored = scoreCombo({ items: items }, mood, constraints);
            if (scored) {
              scored.main = ms; scored.side = ss; scored.drink = ds; scored.treat = ts;
              out.push(scored);
            }
          });
        });
      });
    });
    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return signature(a) < signature(b) ? -1 : 1;
    });
    return out;
  }

  /** 结构降级：预算太紧时依次让掉甜品、配餐、第二份主食 */
  function structureVariants(structure, people) {
    var base = {
      main: structure.main, side: structure.side,
      drink: structure.drink, treat: structure.treat
    };
    var variants = [
      { v: base, relaxed: [] },
      { v: { main: base.main, side: base.side, drink: base.drink, treat: 0 }, relaxed: ['甜品'] },
      { v: { main: base.main, side: 0, drink: base.drink, treat: base.treat }, relaxed: ['配餐'] },
      { v: { main: base.main, side: 0, drink: base.drink, treat: 0 }, relaxed: ['配餐', '甜品'] },
      { v: { main: 1, side: 0, drink: base.drink, treat: 0 }, relaxed: ['第二份主食', '配餐', '甜品'] }
    ];
    return variants.map(function (x) {
      return { counts: slotCounts(x.v, people), relaxed: x.relaxed };
    });
  }

  function countsTooBig(pools, counts) {
    return counts.main > pools.main.length || counts.side > pools.side.length ||
      counts.drink > pools.drink.length || counts.treat > pools.treat.length;
  }

  /* ============================ 三盒产出 ============================ */

  function nameBox(mood, index, combo) {
    var main = combo.main[0] || combo.items[0];
    var tpl = mood.boxStyle[index] || '{main}';
    return tpl.replace('{main}', main.name);
  }

  var ROLES = [
    { key: 'A', role: '稳妥款', hint: '最贴着你的约束来的那一盒' },
    { key: 'B', role: '惊喜款', hint: '换掉了两个位置，但一样好吃' },
    { key: 'C', role: '反套路款', hint: '三个位置全换，试一个没想到的' }
  ];

  function differentSlots(a, b) {
    var n = 0;
    if (!sameSet(a.main.map(function (i) { return i.code; }), b.main.map(function (i) { return i.code; }))) n++;
    if (!sameSet(a.side.map(function (i) { return i.code; }), b.side.map(function (i) { return i.code; }))) n++;
    if (!sameSet(a.drink.map(function (i) { return i.code; }), b.drink.map(function (i) { return i.code; }))) n++;
    if (!sameSet(a.treat.map(function (i) { return i.code; }), b.treat.map(function (i) { return i.code; }))) n++;
    return n;
  }

  function pickThree(combos) {
    if (!combos.length) return [];
    var a = combos[0];
    var mainSig = function (c) { return c.main.map(function (i) { return i.code; }).sort().join('+'); };
    var aMain = mainSig(a);

    /** 在按分数排好序的候选里，取第一个满足条件的组合 */
    var find = function (pred, taken) {
      for (var i = 1; i < combos.length; i++) {
        if (combos[i] === a) continue;
        if (taken.indexOf(combos[i]) !== -1) continue;
        if (pred(combos[i])) return combos[i];
      }
      return null;
    };

    var picked = [a];
    // 惊喜款：主食必须换掉，并且整体至少换掉两个位置
    var b = find(function (x) { return mainSig(x) !== aMain && differentSlots(a, x) >= 2; }, picked)
      || find(function (x) { return differentSlots(a, x) >= 2; }, picked);
    if (b) picked.push(b);
    // 反套路款：主食、配餐、饮品三个位置一起换
    var c = find(function (x) { return mainSig(x) !== aMain && differentSlots(a, x) >= 3; }, picked)
      || find(function (x) { return mainSig(x) !== aMain && differentSlots(a, x) >= 2; }, picked)
      || find(function (x) { return differentSlots(a, x) >= 2; }, picked);
    if (c) picked.push(c);

    // 极端约束下组合不足 3 个时，允许重复结构，但必须保证 3 张可展示的盒子
    while (picked.length < 3 && combos.length) picked.push(combos[picked.length % combos.length]);
    return picked.slice(0, 3);
  }

  /**
   * 「还能加一份什么」：在剩余预算内找出最能提升这一盒体验的加料。
   * 这既是给用户的贴心提示，也是一次自然的加购建议。
   */
  function suggestAddon(combo, pools, mood, constraints) {
    var remain = round2(constraints.budget - combo.price);
    if (remain <= 0) return null;
    var used = {};
    combo.items.forEach(function (it) { used[it.code] = true; });
    var best = null;
    ['main', 'side', 'drink', 'treat'].forEach(function (cat) {
      (pools[cat] || []).forEach(function (it) {
        if (used[it.code] || it.price > remain) return;
        var trial = scoreCombo({ items: combo.items.concat([it]) }, mood, constraints);
        if (!trial) return;
        var gain = trial.score - combo.score;
        if (gain <= 0.15) return;
        if (!best || gain > best.gain) {
          best = { item: it, gain: round2(gain), newScore: round2(trial.score), remainAfter: round2(remain - it.price) };
        }
      });
    });
    if (!best) return null;
    var it = best.item;
    var reason;
    if (combo.proteinPerPerson < mood.proteinMin && it.protein >= 3) reason = '蛋白质还差一点，这份补得上';
    else if (combo.kcalPerPerson < mood.kcalTarget * 0.8) reason = '这一盒偏轻，加它更扛得住';
    else if (it.category === 'treat') reason = '加一点甜的收尾';
    else if (it.category === 'side') reason = '配上一份配餐更完整';
    else reason = '这样搭配更顺口';
    return {
      code: it.code, name: it.name, price: it.price, kcal: it.kcal, protein: it.protein,
      category: it.category, reason: reason, remainAfter: best.remainAfter
    };
  }

  function poemFor(mood, seed, index) {
    var list = mood.poems || [];
    if (!list.length) return '';
    return list[hash32(seed + '::poem::' + index) % list.length];
  }

  function pickupCode(seed) {
    return '#M' + String(hash32(seed + '::pickup') % 10000).padStart(4, '0');
  }

  function orderNo(seed) {
    return 'MM' + String(hash32(seed + '::order') % 1000000).padStart(6, '0');
  }

  /* ============================ 主入口 ============================ */

  /**
   * @param {Object} opts
   *   mood        情绪 id / 中文标签 / 一句自然语言
   *   utterance   用户原话（会印在小票上，可选）
   *   constraints { budget, people, spicyMax, avoid, kcalMax, mealTime }
   *   menu        菜单数组（默认使用演示菜单；接 MCP 时传 query-meals 的结果）
   *   now         Date（默认当前时间）
   *   seedExtra   额外种子（例如门店号），让不同门店的同一心情也有差异
   */
  function generate(opts) {
    opts = opts || {};
    var mood = getMood(opts.mood);
    var constraints = normalizeConstraints(opts.constraints);
    var menu = opts.menu && opts.menu.length ? opts.menu : menuMod.MENU_DEMO;
    var now = opts.now instanceof Date ? opts.now : new Date();
    var mealTime = resolveMealTime(constraints.mealTime, now);
    var pools = buildPools(menu, mood, constraints, mealTime);

    // 取「最早能满足 3 盒选择」的那一档结构；都不满足时取候选最多的那一档，
    // 并如实记录降级了哪些位置（会印在小票上）。
    var variants = structureVariants(mood.structure, constraints.people);
    var chosen = null, bestEffort = null, lastTried = null;
    for (var i = 0; i < variants.length; i++) {
      var c = variants[i].counts;
      if (countsTooBig(pools, c)) continue;
      var got = enumerate(fitPools(pools, c), c, mood, constraints);
      lastTried = { combos: got, relaxed: variants[i].relaxed, counts: c };
      if (got.length >= 3) { chosen = lastTried; break; }
      if (!bestEffort || got.length > bestEffort.combos.length) bestEffort = lastTried;
    }
    if (!chosen) {
      // 没有任何一档能凑出 3 盒：优先给候选最多的那档；
      // 若连一盒都凑不出来，就用最激进的那档并如实说明降级了什么。
      chosen = (bestEffort && bestEffort.combos.length) ? bestEffort
        : (lastTried || { combos: [], relaxed: [], counts: null });
    }
    var combos = chosen.combos, relaxed = chosen.relaxed, usedCounts = chosen.counts;
    var minBudget = combos.length ? null : minViableBudget(menu, mood, constraints, mealTime);

    var dateKey = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var seed = [dateKey, mood.id, constraints.budget, constraints.people, constraints.spicyMax,
      constraints.avoid.slice().sort().join('+'), constraints.kcalMax || '-', mealTime, opts.seedExtra || ''].join('|');

    var boxes = pickThree(combos).map(function (combo, idx) {
      var addon = suggestAddon(combo, pools, mood, constraints);
      return {
        key: ROLES[idx].key,
        role: ROLES[idx].role,
        roleHint: ROLES[idx].hint,
        name: nameBox(mood, idx, combo),
        items: combo.items.map(function (it) {
          return {
            code: it.code, name: it.name, qty: 1, price: it.price, kcal: it.kcal, protein: it.protein,
            tags: it.tags, contains: it.contains, spicy: it.spicy,
            handheld: it.handheld, hot: it.hot, category: it.category
          };
        }),
        price: combo.price,
        kcal: combo.kcal,
        protein: combo.protein,
        kcalPerPerson: combo.kcalPerPerson,
        proteinPerPerson: combo.proteinPerPerson,
        budgetLeft: round2(constraints.budget - combo.price),
        score: round2(combo.score),
        scoreParts: combo.parts,
        reason: mood.reasons[idx % mood.reasons.length],
        poem: poemFor(mood, seed, idx),
        addon: addon,
        tagSet: combo.tagSet
      };
    });

    var revealIndex = boxes.length ? (hash32(seed + '::reveal') % boxes.length) : 0;

    return {
      mood: {
        id: mood.id, code: mood.code, label: mood.label, icon: mood.icon,
        vibe: mood.vibe, diagnosis: mood.diagnosis, closing: mood.closing
      },
      utterance: opts.utterance || '',
      constraints: constraints,
      mealTime: mealTime,
      seed: seed,
      dateKey: dateKey,
      pickupCode: pickupCode(seed),
      orderNo: orderNo(seed),
      revealIndex: revealIndex,
      revealed: boxes[revealIndex] || null,
      boxes: boxes,
      relaxed: relaxed,
      feasible: boxes.length > 0,
      limited: combos.length > 0 && combos.length < 3,
      minBudget: minBudget,
      poolSize: { main: pools.main.length, side: pools.side.length, drink: pools.drink.length, treat: pools.treat.length },
      comboCandidates: combos.length,
      usedCounts: usedCounts,
      dataSource: opts.menu && opts.menu.length ? 'mcp' : 'demo'
    };
  }

  /** 单盒复检：用户手动改选后重新校验约束是否仍然成立 */
  function validateBox(box, constraints, mood) {
    var problems = [];
    var c = normalizeConstraints(constraints);
    var total = box.items.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
    if (total > c.budget) problems.push('超出预算 ' + round2(total - c.budget) + ' 元');
    box.items.forEach(function (i) {
      if ((i.contains || []).some(function (x) { return c.avoid.indexOf(x) !== -1; })) problems.push(i.name + ' 命中忌口');
      if (i.spicy > c.spicyMax) problems.push(i.name + ' 辣度超出上限');
    });
    var kcalPP = box.kcal / c.people;
    if (c.kcalMax && kcalPP > c.kcalMax) problems.push('人均热量超出上限');
    if (mood && mood.hardRules && mood.hardRules.handheld && box.items.some(function (i) { return i.handheld === false; })) {
      problems.push('赶时间场景不适合需要坐下来吃的餐品');
    }
    return { ok: problems.length === 0, problems: problems, total: round2(total) };
  }

  return {
    WEIGHTS: WEIGHTS, PRUNE: PRUNE, ROLES: ROLES, MOODS: MOODS, MAX_COMBOS: MAX_COMBOS,
    hash32: hash32, getMood: getMood, detectMood: detectMood,
    normalizeConstraints: normalizeConstraints, resolveMealTime: resolveMealTime,
    itemScore: itemScore, buildPools: buildPools, scoreCombo: scoreCombo,
    combCount: combCount, estimateCombos: estimateCombos, fitPools: fitPools,
    generate: generate, validateBox: validateBox, pickupCode: pickupCode, orderNo: orderNo,
    suggestAddon: suggestAddon
  };
});
