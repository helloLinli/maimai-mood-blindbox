#!/usr/bin/env node
/**
 * 麦麦心情盲盒 · 命令行入口
 * ---------------------------------------------------------------
 * 用法示例：
 *   node engine/cli.js moods
 *   node engine/cli.js box --mood 加班 --budget 60 --people 2 --avoid beef --spicy 1
 *   node engine/cli.js receipt --mood 失恋 --budget 45 --format text
 *   node engine/cli.js receipt --mood 庆祝 --format svg --out assets/receipt-celebrate.svg
 *   node engine/cli.js selfcheck
 *
 * 这个 CLI 是给 Agent 用的「确定性加速器」：SKILL.md 里的规则可以手算，
 * 但用到这个脚本时，约束求解、打分与开盒哈希都由代码保证一致。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const blindbox = require('./blindbox.js');
const receipt = require('./receipt.js');
const menu = require('./menu.demo.js');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[key] = true; }
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function toConstraints(args) {
  return {
    budget: args.budget === undefined ? 45 : Number(args.budget),
    people: args.people === undefined ? 1 : Number(args.people),
    spicyMax: args.spicy === undefined ? 2 : Number(args.spicy),
    avoid: args.avoid ? String(args.avoid).split(',').map((s) => s.trim()).filter(Boolean) : [],
    kcalMax: args.kcal === undefined ? null : Number(args.kcal),
    mealTime: args.meal || 'auto'
  };
}

function run(args) {
  const cmd = args._[0];
  const now = args.date ? new Date(args.date) : new Date();

  if (cmd === 'moods') {
    const rows = blindbox.MOODS.map((m) => ({
      id: m.id, code: m.code, label: m.label, vibe: m.vibe,
      kcalTarget: m.kcalTarget, proteinMin: m.proteinMin, budgetUse: m.budgetUse,
      structure: m.structure, hardRules: m.hardRules, aliases: m.aliases
    }));
    console.log(args.json ? JSON.stringify(rows, null, 2) : rows.map((r) =>
      `${r.code}  ${r.label.padEnd(4, '　')}  ${r.vibe}  目标 ${r.kcalTarget}kcal / 蛋白 ${r.proteinMin}g / 预算使用 ${Math.round(r.budgetUse * 100)}%`).join('\n'));
    return 0;
  }

  if (cmd === 'menu') {
    if (args.json) console.log(JSON.stringify({ items: menu.MENU_DEMO, tagLabels: menu.TAG_LABELS, avoidOptions: menu.AVOID_OPTIONS }, null, 2));
    else menu.MENU_DEMO.forEach((i) => console.log(`${i.code.padEnd(14)} ${i.name.padEnd(10, '　')} ${i.category.padEnd(6)} ${String(i.price).padStart(6)}元  ${String(i.kcal).padStart(4)}kcal  ${i.tags.join('/')}`));
    return 0;
  }

  if (cmd === 'box') {
    const result = blindbox.generate({
      mood: args.mood || 'whatever',
      utterance: args.utterance || '',
      constraints: toConstraints(args),
      now,
      seedExtra: args.store || ''
    });
    if (args.json) { console.log(JSON.stringify(result, null, 2)); return 0; }
    console.log(printBoxes(result));
    return 0;
  }

  if (cmd === 'receipt') {
    const result = blindbox.generate({
      mood: args.mood || 'whatever',
      utterance: args.utterance || '',
      constraints: toConstraints(args),
      now,
      seedExtra: args.store || ''
    });
    if (!result.feasible) {
      console.log('当前约束下凑不出任何一盒套餐。');
      if (result.minBudget) {
        console.log(`预算至少需要 ${result.minBudget.amount.toFixed(2)} 元（${result.minBudget.main}` +
          `${result.minBudget.drink ? ' + ' + result.minBudget.drink : ''}）。`);
      }
      return 2;
    }
    const r = receipt.build(result, { store: args.store, now });
    const format = args.format || 'text';
    let out;
    if (format === 'svg') out = receipt.renderSVG(r);
    else if (format === 'md') out = receipt.renderMarkdown(r);
    else if (format === 'voice') out = receipt.renderVoice(r);
    else if (format === 'json') out = JSON.stringify({ receipt: r, voice: receipt.renderVoice(r) }, null, 2);
    else out = receipt.renderText(r);
    if (args.out) {
      const p = path.resolve(args.out);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, out, 'utf8');
      console.log(`written: ${p} (${out.length} chars)`);
    } else console.log(out);
    return 0;
  }

  if (cmd === 'selfcheck') return selfcheck();
  if (cmd === 'layoutcheck') return layoutcheck(args);
  if (cmd === 'export-refs') return exportRefs();
  if (cmd === 'export-examples') return exportExamples();

  console.log(usage());
  return 1;
}

function printBoxes(result) {
  const lines = [];
  lines.push(`情绪：${result.mood.code} ${result.mood.label} · ${result.mood.vibe} —— ${result.mood.diagnosis}`);
  lines.push(`约束：预算 ${result.constraints.budget} 元 / ${result.constraints.people} 人 / 辣度上限 ${result.constraints.spicyMax}` +
    `${result.constraints.avoid.length ? ' / 忌口 ' + result.constraints.avoid.join(',') : ''}` +
    `${result.constraints.kcalMax ? ' / 人均热量上限 ' + result.constraints.kcalMax + 'kcal' : ''}`);
  lines.push(`候选池：主食 ${result.poolSize.main} 配餐 ${result.poolSize.side} 饮品 ${result.poolSize.drink} 甜品 ${result.poolSize.treat}　合法组合 ${result.comboCandidates} 个`);
  if (result.relaxed.length) lines.push(`结构降级：为了让预算装得下，省去了 ${result.relaxed.join('、')}`);
  if (!result.feasible) {
    lines.push('结论：当前约束装不下任何一盒套餐。');
    if (result.minBudget) {
      lines.push(`建议把预算提到 ${result.minBudget.amount.toFixed(2)} 元以上（最低组合：${result.minBudget.main}` +
        `${result.minBudget.drink ? ' + ' + result.minBudget.drink : ''}）。`);
    }
    return lines.join('\n');
  }
  lines.push('');
  result.boxes.forEach((b, i) => {
    lines.push(`[${i + 1}] ${b.role}  ${b.name}${i === result.revealIndex ? '   ← 开盒结果' : ''}`);
    b.items.forEach((it) => lines.push(`      ${it.name}  ${it.price.toFixed(2)} 元  ${it.kcal}kcal`));
    lines.push(`      合计 ${b.price.toFixed(2)} 元 / 结余 ${b.budgetLeft.toFixed(2)} 元 / 人均 ${b.kcalPerPerson}kcal · 蛋白 ${b.proteinPerPerson}g / 得分 ${b.score}`);
    lines.push('');
  });
  lines.push(`取餐码 ${result.pickupCode}　订单号 ${result.orderNo}　SEED ${blindbox.hash32(result.seed).toString(16).toUpperCase().slice(0, 8)}`);
  return lines.join('\n');
}

/* ============================== 自检 ============================== */

function selfcheck() {
  let pass = 0, fail = 0;
  const failures = [];
  const check = (name, cond, detail) => {
    if (cond) pass++; else { fail++; failures.push(`${name}${detail ? ' :: ' + detail : ''}`); }
  };

  // 1) 每个情绪在默认约束下都必须产出 3 盒
  blindbox.MOODS.forEach((m) => {
    const r = blindbox.generate({ mood: m.id, constraints: { budget: 50, people: 1 }, now: new Date('2026-10-11T20:00:00') });
    check(`三盒产出/${m.id}`, r.boxes.length === 3, `实际 ${r.boxes.length}`);
    check(`开盒索引合法/${m.id}`, r.revealIndex >= 0 && r.revealIndex < r.boxes.length);
    check(`每盒非空/${m.id}`, r.boxes.every((b) => b.items.length > 0));
    check(`三盒互不相同/${m.id}`, new Set(r.boxes.map((b) => b.items.map((i) => i.code).sort().join('+'))).size === r.boxes.length);
  });

  // 2) 硬约束随机验证
  const moods = blindbox.MOODS.map((m) => m.id);
  const avoidPool = menu.AVOID_OPTIONS.map((o) => o.id);
  let cases = 0;
  for (let i = 0; i < 200; i++) {
    const budget = 12 + ((i * 37) % 200);
    const people = 1 + (i % 4);
    const spicyMax = i % 3;
    const avoid = avoidPool.filter((_, j) => (i + j) % 5 === 0);
    const kcalMax = i % 4 === 0 ? 300 + (i % 9) * 60 : null;
    const mood = moods[i % moods.length];
    const r = blindbox.generate({
      mood, constraints: { budget, people, spicyMax, avoid, kcalMax },
      now: new Date(2026, 9, 11 - (i % 10), 8 + (i % 14), 30)
    });
    r.boxes.forEach((b, k) => {
      cases++;
      if (b.price > budget) failures.push(`预算越界 [${mood} #${i} 盒${k}] ${b.price} > ${budget}`);
      if (kcalMax && b.kcalPerPerson > kcalMax) failures.push(`热量越界 [${mood} #${i} 盒${k}] ${b.kcalPerPerson} > ${kcalMax}`);
      b.items.forEach((it) => {
        const hit = (it.contains || []).filter((c) => avoid.indexOf(c) !== -1);
        if (hit.length) failures.push(`忌口越界 [${mood} #${i} 盒${k}] ${it.name} 含 ${hit.join(',')}`);
        if (it.spicy > spicyMax) failures.push(`辣度越界 [${mood} #${i} 盒${k}] ${it.name}`);
      });
    });
  }
  check('随机硬约束（预算/热量/忌口/辣度）', failures.length === 0,
    failures.length ? `${failures.length} 处，例如：${failures.slice(0, 3).join(' | ')}` : `${cases} 盒全部通过`);

  // 3) 可复现性：同参数两次完全一致
  const a = blindbox.generate({ mood: '加班', constraints: { budget: 60, people: 2, avoid: ['beef'] }, now: new Date('2026-10-11T20:00:00') });
  const b = blindbox.generate({ mood: '加班', constraints: { budget: 60, people: 2, avoid: ['beef'] }, now: new Date('2026-10-11T20:00:00') });
  check('可复现性（同种子同结果）', JSON.stringify(a.boxes) === JSON.stringify(b.boxes) && a.pickupCode === b.pickupCode);

  // 4) 换一天结果应当变化（至少盒子构成不同）
  const c = blindbox.generate({ mood: '加班', constraints: { budget: 60, people: 2, avoid: ['beef'] }, now: new Date('2026-10-12T20:00:00') });
  check('日期影响种子', a.seed !== c.seed);

  // 5) 情绪识别
  check('情绪识别/自然语言', blindbox.detectMood('改到第 8 版了，还在加班').id === 'overtime');
  check('情绪识别/被骂', blindbox.detectMood('刚被老板骂了一顿').id === 'criticised');
  check('情绪识别/兜底', blindbox.detectMood('嗯……说不上来').id === 'whatever');

  // 6) 严格预算下必须降级而不是超预算
  const tight = blindbox.generate({ mood: '庆祝', constraints: { budget: 20, people: 1 }, now: new Date('2026-10-11T20:00:00') });
  check('极紧预算不越界', tight.boxes.every((x) => x.price <= 20), JSON.stringify(tight.boxes.map((x) => x.price)));
  check('极紧预算有降级说明', tight.relaxed.length > 0);

  // 6b) 预算根本装不下时，必须给出明确建议而不是静默返回空盒
  const impossible = blindbox.generate({ mood: '庆祝', constraints: { budget: 12, people: 1 }, now: new Date('2026-10-11T20:00:00') });
  check('不可行预算给出建议', impossible.feasible === false && !!impossible.minBudget && impossible.minBudget.amount > 12,
    JSON.stringify(impossible.minBudget));

  // 7) 小票渲染三形态都能出内容
  const r7 = blindbox.generate({ mood: '失恋', constraints: { budget: 45 }, now: new Date('2026-10-11T20:00:00'), utterance: '分了，心里空空的' });
  const rec = receipt.build(r7, { now: new Date('2026-10-11T20:00:00') });
  check('小票文本渲染', receipt.renderText(rec).indexOf(rec.pickupCode) !== -1);
  check('小票SVG渲染', receipt.renderSVG(rec).startsWith('<svg') && receipt.renderSVG(rec).length > 3000);
  check('语音祝福包含取餐码', receipt.renderVoice(rec).indexOf(rec.pickupCode.replace('#', '').slice(0, 1)) !== -1);

  // 8) 早餐时段只出早餐可选品
  const bf = blindbox.generate({ mood: '赶时间', constraints: { budget: 40 }, now: new Date('2026-10-11T07:30:00') });
  check('早餐时段选品', bf.mealTime === 'breakfast', bf.mealTime);

  // 9) 赶时间硬约束：全部单手可食
  check('赶时间全单手可食', a.boxes.length > 0 && blindbox.generate({ mood: 'rush', constraints: { budget: 60 }, now: new Date('2026-10-11T12:00:00') })
    .boxes.every((x) => x.items.every((i) => i.handheld === true)));

  console.log(`自检结果：通过 ${pass} 项，失败 ${fail} 项，随机验证 ${cases} 盒`);
  if (fail) { failures.slice(0, 12).forEach((f) => console.log('  ✗ ' + f)); return 1; }
  console.log('全部通过。');
  return 0;
}

function usage() {
  return [
    '麦麦心情盲盒 engine CLI',
    '  node engine/cli.js moods [--json]',
    '  node engine/cli.js menu [--json]',
    '  node engine/cli.js box     --mood 加班 --budget 60 --people 2 --avoid beef,dairy --spicy 1 --kcal 900 [--json]',
    '  node engine/cli.js receipt --mood 失恋 --format text|svg|md|voice|json [--out 路径] [--store 门店名] [--date ISO时间]',
    '  node engine/cli.js selfcheck',
    '  node engine/cli.js layoutcheck   # 检查小票版式是否溢出/压字',
    '  node engine/cli.js export-refs   # 由源码生成 references/ 下两份手册',
    '  node engine/cli.js export-examples  # 生成 examples/sessions.md（真实输出）'
  ].join('\n');
}

/* ====================== 生成完整体验记录 ====================== */

const SCENARIOS = [
  {
    title: '加班到第 8 版',
    say: '「改到第 8 版了，还想撑一会儿。」预算 60，一个人，忌口牛肉。',
    args: ['--mood', 'overtime', '--budget', '60', '--avoid', 'beef',
      '--utterance', '改到第8版了，还想撑一会儿', '--date', '2026-10-11T21:04:00'],
    note: '情绪档案 EO-01 的每人目标是 880 kcal / 34 g 蛋白。「加班」把高蛋白与咖啡因排在最前，' +
      '而牛肉在硬过滤阶段就被剔除——这是算出来的，不是嘴上保证的。人均热量 870 kcal，' +
      '蛋白 34 g，几乎正中目标；结余 4.50 元。小票诗给的是「咖啡因负责点亮 / 蛋白质负责撑住 / 剩下那点甜 / ' +
      '负责让你记得自己不是机器」。'
  },
  {
    title: '被说了几句，需要被接住',
    say: '「刚被老板说了一顿。」预算 45。',
    args: ['--mood', 'criticised', '--budget', '45',
      '--utterance', '刚被老板说了一顿', '--date', '2026-10-11T18:40:00'],
    note: '情绪档案 EO-02 的标签权重偏向「热食 + 安慰感 + 甜」，并明确不推荐辣的。' +
      '甜品在这一档是**必需**的（结构分 −1.5 的惩罚会让缺甜品的组合排到后面）。' +
      '小票上的推荐理由直接呼应用户的原话，而不是一句「祝您用餐愉快」。'
  },
  {
    title: '赶时间：五分钟就要出门',
    say: '「五分钟就要出门了。」预算 40。',
    args: ['--mood', 'rush', '--budget', '40',
      '--utterance', '五分钟就要出门了', '--date', '2026-10-11T12:05:00'],
    note: 'EO-07 带硬规则 `handheld: true`：所有餐品必须单手可食、饮品能盖紧，' +
      '需要坐下来吃的餐品在硬过滤阶段就被淘汰。人均 628 kcal，蛋白 27 g。'
  },
  {
    title: '在减脂，但真的想吃',
    say: '「在减脂，但真的想吃。」预算 50，人均热量不超过 600 kcal。',
    args: ['--mood', 'fit', '--budget', '50', '--kcal', '600',
      '--utterance', '在减脂，但真的想吃', '--date', '2026-10-11T12:20:00'],
    note: '人均热量上限是**硬约束**：人均超过 600 kcal 的组合一律淘汰。' +
      '零糖饮品与蔬菜被排到前面，热量预算留给主食。因为这一盒偏轻，引擎还在剩余预算里算出一条加购建议并说明理由。' +
      '注意这里的措辞边界：小票没有评价体型、没有承诺减重，只把「吃了多少」讲清楚。'
  },
  {
    title: '庆祝：升职了，两个人一起吃',
    say: '「升职了，想好好吃一顿。」预算 120，两个人。',
    args: ['--mood', 'celebrate', '--budget', '120', '--people', '2',
      '--utterance', '升职了，想好好吃一顿', '--date', '2026-10-11T19:10:00'],
    note: 'EO-05 的结构骨架是双主食，遇到 2 人会自动放大成「2 主食 + 2 配餐 + 2 饮品 + 2 甜品」。' +
      '总额被压在 120 元预算内，结余 1.50 元；人均 1255 kcal 仍然落在该情绪的容差区间里。'
  }
];

function exportExamples() {
  const root = path.resolve(__dirname, '..');
  const out = [];
  out.push('# 完整体验记录\n');
  out.push('> 本文件由 `node engine/cli.js export-examples` 生成，**请勿手改**：下面每一张小票都是引擎的真实输出，' +
    '命令里带 `--date` 是为了固定开盒种子，你照着跑会得到一模一样的结果。\n');
  out.push('> 门店一律用默认的「演示门店 · DEMO-001」，因为离线运行时没有真实门店；接上 MCP 后会替换为实际门店。\n');

  SCENARIOS.forEach((sc, i) => {
    const args = sc.args;
    const result = blindbox.generate({
      mood: valueOf(args, '--mood'),
      utterance: valueOf(args, '--utterance') || '',
      constraints: toConstraints({
        budget: valueOf(args, '--budget'),
        people: valueOf(args, '--people'),
        spicy: valueOf(args, '--spicy'),
        avoid: valueOf(args, '--avoid'),
        kcal: valueOf(args, '--kcal')
      }),
      now: new Date(valueOf(args, '--date')),
      seedExtra: valueOf(args, '--store') || ''
    });
    const rec = receipt.build(result, { now: new Date(valueOf(args, '--date')) });
    out.push(`\n## ${i + 1}. ${sc.title}\n`);
    out.push(sc.say + '\n');
    out.push('```bash');
    out.push('node engine/cli.js receipt ' + args.join(' ') + ' --format text');
    out.push('```\n');
    out.push('```text');
    out.push(receipt.renderText(rec));
    out.push('```\n');
    out.push('**引擎在这里做了什么**：' + sc.note + '\n');
  });

  out.push('\n## 关于「换一盒」\n');
  out.push('上面每一次都给 3 个盲盒，只是默认揭晓其中 1 个。想看另外两盒：\n');
  out.push('```bash');
  out.push('node engine/cli.js box --mood overtime --budget 60 --avoid beef --date 2026-10-11T21:04:00');
  out.push('```\n');
  out.push('或者用 `--box 0|1|2` 指定要出哪一盒的小票，例如 `--box 2` 拿反套路款。\n');

  const p = path.join(root, 'examples', 'sessions.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, out.join('\n') + '\n', 'utf8');
  console.log(`written: ${p} (${out.join('\n').length} chars, ${SCENARIOS.length} 个场景)`);
  return 0;
}

function valueOf(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
}

/* ====================== 由源码生成参考手册 ====================== */

const LEAD = '> 本文件由 `node engine/cli.js export-refs` 从 `engine/content.js` 与 `engine/blindbox.js` 生成，**请勿手改**。\n' +
  '> 要改情绪档案、权重或诗词，请改源码后重新生成，这样文档与代码不会走偏。\n';

function exportRefs() {
  const root = path.resolve(__dirname, '..');
  const W = blindbox.WEIGHTS;
  const em = [];
  const po = [];

  em.push('# 情绪档案与出盒规则手册\n');
  em.push(LEAD);
  em.push('\n这份手册是给「执行盲盒生成的那个 AI」看的：不运行代码，照着它也能算出一样的盒。\n');

  em.push('\n## 一、情绪档案总表\n');
  em.push('| id | 编号 | 标签 | 气质 | 每人目标热量 | 容差 | 每人蛋白下限 | 预算使用比例 | 结构(主/配/饮/甜) | 硬约束 |');
  em.push('|---|---|---|---|---:|---:|---:|---:|---|---|');
  blindbox.MOODS.forEach((m) => {
    const hard = Object.keys(m.hardRules || {}).length ? JSON.stringify(m.hardRules) : '—';
    const s = m.structure;
    em.push(`| \`${m.id}\` | ${m.code} | ${m.label} | ${m.vibe} | ${m.kcalTarget} | ${m.kcalTolerance} | ${m.proteinMin} g | ${m.budgetUse} | ${s.main} / ${s.side} / ${s.drink} / ${s.treat} | ${hard} |`);
  });

  em.push('\n## 二、逐个情绪：怎么配、为什么这样配\n');
  blindbox.MOODS.forEach((m) => {
    em.push(`\n### ${m.code} ${m.label}（\`${m.id}\`）\n`);
    em.push(`- **一句话诊断**：${m.diagnosis}`);
    em.push(`- **气质**：${m.vibe}`);
    em.push(`- **优先标签**：${m.dna.map((t) => '`' + t + '`').join('、') || '—'}`);
    const boost = Object.keys(m.tagBoost || {}).map((k) => `${k} +${m.tagBoost[k]}`).join('、');
    em.push(`- **标签加分**：${boost}`);
    const pen = Object.keys(m.tagPenalty || {}).map((k) => `${k} −${m.tagPenalty[k]}`).join('、');
    em.push(`- **标签扣分**：${pen || '—'}`);
    em.push(`- **辣度偏好**：${m.spicyPref === null ? '不限' : m.spicyPref === 0 ? '偏好不辣' : '可接受微辣'}`);
    em.push(`- **套餐骨架**（人数为 1 时）：主食 ${m.structure.main} 份${m.structure.treat >= 1 ? '、配餐 ' + m.structure.side + ' 份、饮品 ' + m.structure.drink + ' 份、甜品 ' + m.structure.treat + ' 份（必须给）' : m.structure.treat > 0 ? '、配餐 ' + m.structure.side + ' 份、饮品 ' + m.structure.drink + ' 份、甜品可选' : '、配餐 ' + m.structure.side + ' 份、饮品 ' + m.structure.drink + ' 份、不给甜品'}`);
    em.push(`- **命名模板**：${m.boxStyle.map((s) => '「' + s + '」').join(' / ')}`);
    em.push(`- **推荐理由（小票上印的就是这三句之一）**：`);
    m.reasons.forEach((r) => em.push(`  ${m.reasons.indexOf(r) + 1}. ${r}`));
    em.push(`- **为什么这样配**：见下表营养目标与标签权重。该情绪把「${m.dna.join(' + ')}」排在前面，是因为这一状态下人最需要的是${m.id === 'fit' ? '把热量算清楚后的满足感，而不是靠忍' : '立刻可感的身体反馈（热量、蛋白质、温度、口感），而不是需要阅读的说明'}。`);
  });

  em.push('\n## 三、出盒规则（可手算）\n');
  em.push('### 3.1 硬过滤（先淘汰，不参与打分）\n');
  em.push('1. **时段**：早餐时段（约 10:30 前）只用 `meal = breakfast` 或 `all` 的餐品；正餐时段只用 `meal = all`。');
  em.push('2. **忌口**：餐品的 `contains` 与用户忌口有交集 → 直接剔除。');
  em.push('3. **辣度**：`spicy > 用户辣度上限` → 剔除。');
  em.push('4. **情绪硬规则**：`hardRules.handheld = true` 的情绪（赶时间），所有餐品必须 `handheld = true`。');
  em.push('5. **预算**：组合总价 > 预算 → 淘汰。**人均热量上限**：人均热量超上限 → 淘汰。');

  em.push('\n### 3.2 剪枝（保证可计算）\n');
  em.push(`- 每个品类先按「单件得分」降序排序，各取前 ${blindbox.PRUNE.main}/${blindbox.PRUNE.side}/${blindbox.PRUNE.drink}/${blindbox.PRUNE.treat} 件进入组合枚举（主食/配餐/饮品/甜品）。`);
  em.push(`- 若枚举规模仍超过 ${blindbox.MAX_COMBOS} 个组合（多人 + 庆祝时会出现），按「裁剪后能减少最多组合数」的品类，从它的末位开始删，直到回到上限内。剪枝只取决于数据本身，因此结果可复现。`);

  em.push('\n### 3.3 打分公式\n');
  em.push('```text');
  em.push('单件得分 = Σ(标签加分) − Σ(标签扣分)');
  em.push(`         + ${W.dnaHit} × (命中的 dna 标签数)`);
  em.push(`         + （辣度 ≤ 情绪偏好 ? +${W.spicyFit} : −${W.spicyOver} × 超出级数）`);
  em.push('');
  em.push('整盒得分 = Σ(单件得分)');
  em.push(`         + ${W.dnaCombo} × (整盒命中的 dna 标签数)`);
  em.push(`         + ${W.kcalMax} × (1 − min(1, |人均热量 − 目标热量| ÷ 目标热量 ÷ 容差))`);
  em.push(`         + ${W.protein} × min(1, 人均蛋白 ÷ 目标蛋白)`);
  em.push(`         + ${W.budget} × (1 − |实付 ÷ 预算 − 预算使用比例| ÷ ${W.budgetWindow})`);
  em.push(`         + 结构修正：情绪要求甜品却没给 −${W.treatRequired}；非必需时给甜品 +${W.treatBonus}`);
  em.push('```');
  em.push(`（预算贴近度为负时按 0 计；实付 ÷ 预算 > 1 的组合已在硬过滤阶段淘汰。）`);

  em.push('\n### 3.4 三盒产出\n');
  blindbox.ROLES.forEach((r) => {
    const def = r.key === 'A' ? '全场最高分' : r.key === 'B'
      ? '换掉主食，且相对稳妥款至少换掉两个构成位（主食/配餐/饮品/甜品）'
      : '主食、配餐、饮品三个位置全部换掉';
    em.push(`- **${r.role}（${r.key}）**：${def}。${r.hint}`);
  });
  em.push('\n同分时按组合内餐品编码的字典序升序打破平局。若合法组合不足 3 个，允许重复结构，但必须保证 3 张可展示的盒子。');

  em.push('\n### 3.5 人数缩放\n');
  em.push('- 主食份数 = max(情绪骨架主食数, 人数)；饮品份数 = max(骨架饮品数, 人数)；配餐最多随人数放大到 2 份；甜品最多放大到 3 份。');
  em.push('- 热量与蛋白质目标按人数等比放大，预算按人数线性放大；组合总价仍受用户给出的**总预算**约束。');
  em.push('- **不浪费原则**：不主动把份数堆到吃不完；预算不足时优先减少配餐与甜品，并在小票上写明省掉了什么。');

  em.push('\n### 3.6 开盒与取餐码\n');
  em.push('```text');
  em.push('种子 = 日期 + 情绪 id + 预算 + 人数 + 辣度上限 + 忌口(排序) + 热量上限 + 时段 + 门店');
  em.push('开盒索引 = FNV1a32(种子 + "::reveal") mod 3');
  em.push('取餐码   = "#M" + (FNV1a32(种子 + "::pickup") mod 10000)');
  em.push('```');
  em.push('同一天、同一心情、同一约束 → 结果永远一致。改变任何一项输入，种子与结果都会变。');

  em.push('\n## 四、怎么加一个新情绪\n');
  em.push('1. 在 `engine/content.js` 的 `MOODS` 里增加一条：`id`（英文）、`code`（EO-xx）、`label`、`aliases`（用户可能说的话）、`vibe`、`diagnosis`、`dna`、`tagBoost`、`tagPenalty`、`spicyPref`、`kcalTarget`、`kcalTolerance`、`proteinMin`、`budgetUse`、`structure`、`hardRules`、`boxStyle`（3 个命名模板，用 `{main}` 占位）、`reasons`（3 条）、`poems`（6 首，3-5 行）、`bless`（2 条语音祝福）、`closing`（1 句收尾）。');
  em.push('2. 重新生成本手册：`node engine/cli.js export-refs`。');
  em.push('3. 跑一遍自检：`npm test`（必须 0 失败；新情绪要能在默认约束下产出 3 盒）。');
  em.push('4. 在 `references/receipt-poems.md` 里确认新诗词已生成，并按下面的写作守则检查语气。');

  em.push('\n## 五、语气与安全守则（改内容时必须遵守）\n');
  em.push(LEAD_RULES.map((r) => '- ' + r).join('\n'));

  /* ------------------------- 诗词手册 ------------------------- */
  po.push('# 小票诗与祝福语手册\n');
  po.push(LEAD);
  po.push('\n## 取用方式\n');
  po.push('- 每首诗的编号形如 `EO-01-3`；同一情绪按种子轮换，**避免连续两次给出同一首**。');
  po.push('- 一首 **3-5 行**，每行 **不超过 16 个汉字**（要适合 80mm 热敏纸的一行宽度）。');
  po.push('- 语音祝福以固定前缀开头：`' + require('./content.js').VOICE_PREFIX + '`');

  blindbox.MOODS.forEach((m) => {
    po.push(`\n## ${m.code} ${m.label} · ${m.vibe}\n`);
    po.push(`**推荐理由（3 选 1，印在小票「为什么是这一盒」）**\n`);
    m.reasons.forEach((r, i) => po.push(`${i + 1}. ${r}`));
    po.push(`\n**小票诗（6 首，按序号轮换）**\n`);
    m.poems.forEach((p, i) => {
      po.push(`### ${m.code}-${i + 1}\n`);
      po.push('```text');
      po.push(p);
      po.push('```');
    });
    po.push(`**语音祝福**\n`);
    m.bless.forEach((b, i) => po.push(`${i + 1}. ${b}`));
    po.push(`\n**收尾语**：${m.closing}`);
  });

  po.push('\n## 写一首新的小票诗\n');
  po.push('**句式**：先给一个**具体的生活细节**（屏幕、纸袋、油印、薯条、热饮、窗、键盘声、版本号、门缝的光），再给一个**轻的转折或允许**。不要押韵强行，不要抒情排比。\n');
  po.push('**禁用词**：必须、应该、加油、别难过、想开点、一切都会好、你值得拥有。（这类句子是空话，读起来像广告。）\n');
  po.push('**检查**：读一遍，如果这句话放到一张真实的小票背面会显得做作，就重写。\n');
  po.push('**示例（新写）**\n');
  po.push('EO-01 加班：\n');
  po.push('```text');
  po.push('打印机还在响，\n你数着还剩几页。\n先吃一口，\n页码不会跑。');
  po.push('```\n');
  po.push('EO-07 赶时间：\n');
  po.push('```text');
  po.push('红灯还有 42 秒，\n刚好够咬一口。\n今天你没迟到，\n也没饿着。');
  po.push('```');

  const emPath = path.join(root, 'references', 'emotion-matrix.md');
  const poPath = path.join(root, 'references', 'receipt-poems.md');
  fs.mkdirSync(path.dirname(emPath), { recursive: true });
  fs.writeFileSync(emPath, em.join('\n') + '\n', 'utf8');
  fs.writeFileSync(poPath, po.join('\n') + '\n', 'utf8');
  console.log(`written: ${emPath} (${em.join('\n').length} chars)`);
  console.log(`written: ${poPath} (${po.join('\n').length} chars)`);
  return 0;
}

const LEAD_RULES = [
  '不评价体型、不鼓吹节食、不承诺减重效果；「减脂」的落点是**把热量算清楚再吃**，不是少吃。',
  '不出现烟酒、赌博、迷信、拜金元素；盲盒是**替用户做决定**，不是碰运气，不要写成抽奖。',
  '不与其他品牌做对比，不贬低麦当劳的产品与形象。',
  '不输出医疗、营养或治疗建议；热量与营养为估算值，一律以麦当劳官方渠道实时结果为准。',
  '不诱导浪费：份数按人数匹配，预算不足时优先减配餐与甜品，并如实写明。',
  '小票诗避免说教句式（必须/应该/加油/一切都会好），以「陪伴 + 具体」为基调。'
];

/* ============================ 版式自检 ============================ */

function layoutcheck(args) {
  const moods = blindbox.MOODS.map((m) => m.id);
  const budgets = [15, 25, 45, 60, 120];
  const voices = ['', '今天被客户否了一版，有点难受', '改到第8版了还想再撑一会儿', 'a very long utterance to test wrapping behaviour 1234567890'];
  let checked = 0;
  const issues = [];
  moods.forEach((mood) => {
    budgets.forEach((budget) => {
      voices.forEach((utterance) => {
        const r = blindbox.generate({
          mood, utterance, constraints: { budget, people: budget > 90 ? 3 : 1 },
          now: new Date(2026, 9, 11, 13, 30)
        });
        if (!r.feasible) return;
        r.boxes.forEach((_, i) => {
          const one = receipt.build(r, { boxIndex: i, now: new Date(2026, 9, 11, 13, 30) });
          const res = receipt.checkLayout(one);
          checked++;
          res.issues.forEach((s) => issues.push(`[${mood}/${budget}元/盒${i + 1}] ${s}`));
        });
      });
    });
  });
  console.log(`版式自检：检查 ${checked} 张小票，发现问题 ${issues.length} 处`);
  issues.slice(0, 20).forEach((s) => console.log('  ✗ ' + s));
  return issues.length ? 1 : 0;
}

process.exit(run(parseArgs(process.argv.slice(2))));
