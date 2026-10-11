/**
 * 情绪小票渲染器
 * ---------------------------------------------------------------
 * 小票只有两个「形态」，一处改动全端一致：
 *   renderSVG()  小票长图（浏览器内直接展示、可导出 PNG、可放进 README）
 *   renderText() 纯文本小票（复制分享、终端预览、examples 文档）
 * 另有 renderVoice() 生成「会说话的小票」要朗读的那段话。
 *
 * SVG 只使用 <text>/<rect>/<path>/<line>，不使用 foreignObject 与脚本，
 * 因此在 GitHub 的 SVG 沙箱里也能正常显示。
 *
 * 版式安全由 checkLayout() 保证：它和 renderSVG() 共用同一份排版结果，
 * 检查文字是否越出票面、同一行是否互相压字，避免「肉眼看不出但确实溢出」。
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./blindbox.js'), require('./content.js'));
  } else {
    root.MMB = root.MMB || {};
    root.MMB.receipt = factory(root.MMB.blindbox, root.MMB.content);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (blindbox, contentMod) {
  'use strict';

  /**
   * 调色板与 web/style.css 的 design token 一一对应：
   * 冷调工业底盘 + 安全橙强调色，热敏纸用中性偏冷的纸白（material honesty）。
   */
  var C = {
    plate: '#e0e5ec',   // 打印托盘（与页面底盘同色）
    sheet: '#c9d0dc',   // 纸张下方的投影层
    paper: '#f7f6f2',   // 热敏纸
    ink: '#2d3436',
    muted: '#4a5568',
    faint: '#a3b1c6',
    accent: '#ff4757',  // 品牌识别色：只用于大字（取餐码）与装饰
    accentInk: '#b3202f' // 纸面上的小字强调：#ff4757 在纸上只有 3.1:1，达不到 AA(4.5:1)
  };

  var W = 460;          // 纸张内容宽度（排版坐标系）
  var PAD = 30;         // 纸张内边距
  var M = 16;           // 纸张四周留给托盘与投影的余量
  var FONT = "'Inter','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif";
  var MONO = "'JetBrains Mono','SF Mono',Menlo,Consolas,'PingFang SC','Microsoft YaHei',monospace";

  /* ============================ 文本工具 ============================ */

  /** 中文按 2 列宽计算，用于纯文本对齐与宽度估算 */
  function vwidth(s) {
    var w = 0;
    s = String(s == null ? '' : s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      w += (c > 0x2E80 && c !== 0xFFFD) ? 2 : 1;
    }
    return w;
  }

  /** 估算一段文字在给定字号下占用的像素宽度（中文 1em、半角 0.5em） */
  function measure(s, size) { return vwidth(s) * size / 2; }

  function padRight(s, width) {
    var pad = width - vwidth(s);
    return s + new Array(pad > 0 ? pad + 1 : 1).join(' ');
  }

  function centerText(s, width) {
    var pad = Math.max(0, Math.floor((width - vwidth(s)) / 2));
    return new Array(pad + 1).join(' ') + s;
  }

  /** 不另起一行的收尾标点 */
  var CLOSERS = '。，、；：！？）】》」”’%…—';
  function isWordChar(c) { return !!c && /[0-9A-Za-z.:%]/.test(c); }

  /**
   * 按视觉宽度折行。两条中文排版细节：
   *  1) 收尾标点（。，、）不另起一行；
   *  2) 数字与英文词（如 6.50、#M1024）不被拆开。
   */
  function wrap(s, maxWidth) {
    var lines = [], cur = '', w = 0;
    s = String(s == null ? '' : s);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '\n') { lines.push(cur); cur = ''; w = 0; continue; }
      var cw = vwidth(ch);
      if (!cur) { cur = ch; w = cw; continue; }
      if (w + cw > maxWidth) {
        if (CLOSERS.indexOf(ch) !== -1) { cur += ch; w += cw; continue; }
        if (isWordChar(ch) && isWordChar(cur[cur.length - 1])) {
          var m = /[0-9A-Za-z.:%]+$/.exec(cur);
          if (m && m[0].length < cur.length) {
            var tail = m[0];
            lines.push(cur.slice(0, cur.length - tail.length));
            cur = tail + ch;
            w = vwidth(cur);
            continue;
          }
        }
        lines.push(cur); cur = ''; w = 0;
      }
      cur += ch; w += cw;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function money(n) { return (Math.round(n * 100) / 100).toFixed(2); }

  function fmtTime(d) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ' 周' + week;
  }

  /* ============================ 小票数据组装 ============================ */

  /**
   * @param {Object} result  blindbox.generate() 的返回值
   * @param {Object} opts    { boxIndex, store, now, sourceNote }
   */
  function build(result, opts) {
    opts = opts || {};
    var idx = opts.boxIndex === undefined ? result.revealIndex : opts.boxIndex;
    var box = result.boxes[idx] || result.boxes[0];
    var mood = result.mood;
    var now = opts.now instanceof Date ? opts.now : new Date();
    var blessList = (moodRaw(result.mood.id) || {}).bless || [''];
    var bless = blessList[blindbox.hash32(result.seed + '::bless') % blessList.length];

    return {
      title: '麦麦心情盲盒',
      subtitle: 'M-MOOD BLINDBOX RECEIPT',
      store: opts.store || '演示门店 · DEMO-001',
      timeText: fmtTime(now),
      moodCode: mood.code,
      moodLabel: mood.label,
      moodIcon: mood.icon,
      vibe: mood.vibe,
      diagnosis: mood.diagnosis,
      utterance: result.utterance || '',
      boxIndex: idx,
      boxCount: result.boxes.length,
      box: box,
      orderNo: result.orderNo,
      pickupCode: result.pickupCode,
      constraints: result.constraints,
      budgetLeft: box.budgetLeft,
      relaxed: result.relaxed || [],
      blessing: bless,
      closing: mood.closing,
      dataSource: result.dataSource,
      sourceNote: opts.sourceNote || (result.dataSource === 'mcp'
        ? '菜单与营养数据来自麦当劳 MCP 的实时结果'
        : '演示模式：使用内置演示菜单，价格与热量仅供参考'),
      seedShort: blindbox.hash32(result.seed).toString(16).toUpperCase().slice(0, 8)
    };
  }

  function moodRaw(moodId) {
    for (var i = 0; i < contentMod.MOODS.length; i++) {
      if (contentMod.MOODS[i].id === moodId) return contentMod.MOODS[i];
    }
    return contentMod.MOODS[0];
  }

  /* ============================ 语音祝福 ============================ */

  function renderVoice(r) {
    return contentMod.VOICE_PREFIX + '「' + r.box.name + '」，' + r.blessing +
      '你的取餐码是 ' + r.pickupCode.replace('#', '').split('').join(' ') + '。';
  }

  /* ============================ 纯文本小票 ============================ */

  var TW = 34; // 文本小票可视宽度（半角单位）

  function renderText(r) {
    var L = [];
    var sep = new Array(TW + 1).join('-');
    var eq = new Array(TW + 1).join('=');
    L.push(centerText(r.title, TW));
    L.push(centerText(r.subtitle, TW));
    L.push(eq);
    L.push('情绪小票 / MOOD RECEIPT');
    L.push(padRight('门店', 10) + r.store);
    L.push(padRight('时间', 10) + r.timeText);
    L.push(sep);
    L.push('情绪诊断  ' + r.moodCode + '  ' + r.moodLabel + ' · ' + r.vibe);
    if (r.utterance) {
      wrap('你说：' + r.utterance, TW - 2).forEach(function (l, i) {
        L.push((i === 0 ? '' : '  ') + l);
      });
    }
    L.push(sep);
    L.push('开盒结果  第 ' + (r.boxIndex + 1) + ' 盒 / 共 ' + r.boxCount + ' 盒 · ' + r.box.role);
    L.push('套餐  ' + r.box.name);
    L.push(sep);
    r.box.items.forEach(function (it) {
      L.push('  ' + padRight('1× ' + it.name, TW - 10) + money(it.price));
    });
    L.push(sep);
    L.push(padRight('  合计', TW - 10) + money(r.box.price));
    L.push(padRight('  预算', TW - 10) + money(r.constraints.budget));
    L.push(padRight('  结余', TW - 10) + money(r.budgetLeft));
    L.push(padRight('  人均热量', TW - 10) + r.box.kcalPerPerson + ' kcal');
    L.push(padRight('  人均蛋白', TW - 10) + r.box.proteinPerPerson + ' g');
    if (r.box.addon) {
      L.push(sep);
      L.push('  还能加：' + r.box.addon.name + '  +' + money(r.box.addon.price) + ' 元');
      wrap('  （' + r.box.addon.reason + '，加完还剩 ' + money(r.box.addon.remainAfter) + ' 元）', TW)
        .forEach(function (l) { L.push(l); });
    }
    L.push(eq);
    L.push('【为什么是这一盒】');
    wrap(r.box.reason, TW).forEach(function (l) { L.push(l); });
    L.push(eq);
    L.push(centerText('· 小 票 诗 ·', TW));
    L.push('');
    r.box.poem.split('\n').forEach(function (l) { L.push(centerText(l, TW)); });
    L.push('');
    L.push(eq);
    L.push(centerText('取餐码  ' + r.pickupCode, TW));
    L.push(centerText('订单号  ' + r.orderNo, TW));
    L.push(sep);
    L.push('语音祝福：');
    wrap(renderVoice(r), TW).forEach(function (l) { L.push('  ' + l); });
    L.push(sep);
    L.push('【提示】');
    wrap(r.closing, TW).forEach(function (l) { L.push('  ' + l); });
    if (r.relaxed.length) {
      wrap('受预算与口味约束，本盒省去了：' + r.relaxed.join('、'), TW).forEach(function (l) { L.push('  ' + l); });
    }
    wrap(r.sourceNote, TW).forEach(function (l) { L.push('  ' + l); });
    L.push('  热量与营养为估算值，餐品、价格与供应状态');
    L.push('  以麦当劳官方渠道实时结果为准。');
    L.push('  本项目为参赛作品，非麦当劳官方产品。');
    L.push(eq);
    L.push(centerText('SEED ' + r.seedShort + ' · 同一天同一心情结果一致', TW));
    return L.join('\n');
  }

  function renderMarkdown(r) {
    return '```text\n' + renderText(r) + '\n```\n';
  }

  /* ============================ SVG 小票长图 ============================ */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 用种子生成的确定性条形码（纯装饰，不含真实订单信息） */
  function barcode(seedText, x, y, w, h) {
    var h32 = blindbox.hash32(seedText);
    var out = [], cx = x, guard = 0;
    while (cx < x + w && guard < 400) {
      h32 = blindbox.hash32(String(h32 + guard));
      var barW = 1 + (h32 % 3);
      var gapW = 1 + ((h32 >> 3) % 3);
      if (cx + barW > x + w) break;
      out.push('<rect x="' + cx.toFixed(1) + '" y="' + y + '" width="' + barW + '" height="' + h + '" fill="' + C.ink + '"/>');
      cx += barW + gapW;
      guard++;
    }
    return out.join('');
  }

  /** 撕纸边：上边与下边各一串小三角 */
  function tornPaperPath(h) {
    var step = 12, amp = 7;
    var d = 'M0,' + amp;
    for (var x = 0; x < W; x += step) d += ' L' + (x + step / 2) + ',0 L' + (x + step) + ',' + amp;
    d += ' L' + W + ',' + (h - amp);
    for (var x2 = W; x2 > 0; x2 -= step) d += ' L' + (x2 - step / 2) + ',' + h + ' L' + (x2 - step) + ',' + (h - amp);
    return d + ' Z';
  }

  /**
   * 排版：把整张小票算成一组绘图指令 + 总高度。
   * renderSVG 负责画，checkLayout 负责检查，两者共用同一份结果。
   */
  function buildLayout(r) {
    var ops = [];
    var y = PAD + 16;

    function text(str, o) {
      o = o || {};
      var size = o.size || 13;
      ops.push({
        kind: 'text', s: str, x: o.x === undefined ? PAD : o.x, y: y,
        size: size, weight: o.weight || 400, anchor: o.anchor || 'start',
        fill: o.fill || C.ink, family: o.mono ? MONO : FONT,
        spacing: o.spacing || 0, opacity: o.opacity || 1
      });
      y += o.lh || size * 1.55;
    }
    function block(lines, o) { lines.forEach(function (l) { text(l, o); }); }
    function gap(n) { y += n; }
    function rule(style) {
      ops.push({
        kind: 'line', y: y, color: C.faint, w: 1.2,
        dash: style === 'eq' ? '5 4' : '2 4'
      });
      y += 14;
    }
    function row(left, right, o) {
      o = o || {};
      var size = o.size || 13;
      var lh = o.lh || size * 1.55;
      ops.push({
        kind: 'text', s: left, x: PAD, y: y, size: size, weight: o.weight || 400,
        anchor: 'start', fill: o.fill || C.ink, family: o.mono ? MONO : FONT, spacing: 0, opacity: 1
      });
      ops.push({
        kind: 'text', s: right, x: W - PAD, y: y, size: size, weight: o.weight || 400,
        anchor: 'end', fill: o.fill || C.ink, family: MONO, spacing: 0, opacity: 1
      });
      y += lh;
    }

    /* 抬头 */
    text(r.title, { size: 21, weight: 700, anchor: 'middle', x: W / 2, lh: 26 });
    text(r.subtitle, { size: 9.5, anchor: 'middle', x: W / 2, fill: C.muted, spacing: 2.4, mono: true, lh: 20 });
    rule('eq');

    /* 基本信息 */
    row('门店', r.store, { size: 11.5, fill: C.muted });
    row('时间', r.timeText, { size: 11.5, fill: C.muted });
    rule();

    /* 情绪诊断 */
    text('情绪诊断  ' + r.moodCode + '  ' + r.moodLabel + ' · ' + r.vibe, { size: 13.5, weight: 600 });
    text(r.diagnosis, { size: 11.5, fill: C.muted });
    if (r.utterance) {
      gap(4);
      block(wrap('“' + r.utterance + '”', 30), { size: 12.5, fill: C.accentInk, lh: 19 });
    }
    rule();

    /* 开盒结果 */
    text('开盒结果   第 ' + (r.boxIndex + 1) + ' 盒 / 共 ' + r.boxCount + ' 盒   ' + r.box.role,
      { size: 11.5, fill: C.muted });
    text(r.box.name, { size: 16.5, weight: 700, lh: 25 });
    gap(2);

    /* 明细 */
    r.box.items.forEach(function (it) { row('1×  ' + it.name, money(it.price), { size: 13 }); });
    rule();

    row('合计', money(r.box.price), { size: 14, weight: 700 });
    row('预算 / 结余', money(r.constraints.budget) + '  /  ' + money(r.budgetLeft), { size: 12, fill: C.muted });
    row('人均热量', r.box.kcalPerPerson + ' kcal', { size: 12, fill: C.muted });
    row('人均蛋白', r.box.proteinPerPerson + ' g', { size: 12, fill: C.muted });
    if (r.box.addon) {
      rule();
      text('还能加：' + r.box.addon.name + '  +' + money(r.box.addon.price) + ' 元', { size: 12, weight: 600, lh: 19 });
      block(wrap(r.box.addon.reason + '，加完还剩 ' + money(r.box.addon.remainAfter) + ' 元预算。', 32),
        { size: 11, fill: C.muted, lh: 17 });
    }
    rule('eq');

    /* 推荐理由 */
    text('【 为什么是这一盒 】', { size: 12.5, weight: 700, fill: C.accentInk, lh: 22 });
    block(wrap(r.box.reason, 32), { size: 12.5, lh: 20 });
    rule('eq');

    /* 小票诗 */
    text('·  小  票  诗  ·', { size: 11.5, anchor: 'middle', x: W / 2, fill: C.muted, spacing: 1.2, lh: 22 });
    gap(2);
    r.box.poem.split('\n').forEach(function (l) {
      text(l, { size: 14.5, anchor: 'middle', x: W / 2, lh: 25 });
    });
    gap(6);
    rule('eq');

    /* 取餐码 + 条形码 */
    text(r.pickupCode, { size: 30, weight: 700, anchor: 'middle', x: W / 2, mono: true, lh: 38, fill: C.accent });
    ops.push({ kind: 'raw', s: barcode(r.seedShort, PAD + 40, y, W - 2 * (PAD + 40), 26) });
    y += 36;
    text('取餐码 / PICK-UP CODE    订单号 ' + r.orderNo,
      { size: 10, anchor: 'middle', x: W / 2, fill: C.muted, mono: true, lh: 20 });
    gap(4);

    /* 语音祝福 */
    text('▶  会说话的小票', { size: 12, weight: 700, lh: 20 });
    block(wrap(r.blessing, 30), { size: 12, lh: 19 });
    gap(6);
    rule();

    /* 页脚 */
    block(wrap('提示：' + r.closing, 34), { size: 11.5, fill: C.muted, lh: 18 });
    if (r.relaxed.length) {
      block(wrap('受预算与口味约束，本盒省去了：' + r.relaxed.join('、'), 34), { size: 11, fill: C.muted, lh: 17 });
    }
    block(wrap(r.sourceNote, 34), { size: 11, fill: C.muted, lh: 17 });
    block([
      '热量与营养为估算值；餐品、价格与供应状态',
      '以麦当劳官方渠道实时结果为准。',
      '参赛作品，非麦当劳官方产品。'
    ], { size: 11, fill: C.muted, lh: 17 });
    gap(2);
    text('SEED ' + r.seedShort + ' · 同一天同一心情，结果一致',
      { size: 9.5, anchor: 'middle', x: W / 2, fill: C.faint, mono: true, lh: 16 });

    var paperH = Math.ceil(y + PAD - 6);
    return {
      ops: ops,
      height: paperH,               // 纸张高度（排版坐标系）
      width: W,
      pad: PAD,
      margin: M,
      viewWidth: W + M * 2,         // 含托盘余量后的实际画布尺寸
      viewHeight: paperH + M * 2
    };
  }

  function serialize(layout) {
    var ops = layout.ops;
    var paperH = layout.height;
    var VW = layout.viewWidth;
    var VH = layout.viewHeight;
    var body = ops.map(function (o) {
      if (o.kind === 'raw') return o.s;
      if (o.kind === 'line') {
        return '<line x1="' + PAD + '" y1="' + o.y.toFixed(1) + '" x2="' + (W - PAD) + '" y2="' + o.y.toFixed(1) +
          '" stroke="' + o.color + '" stroke-width="' + o.w + '" stroke-dasharray="' + o.dash + '"/>';
      }
      return '<text x="' + o.x + '" y="' + o.y.toFixed(1) + '" font-size="' + o.size + '" font-weight="' + o.weight +
        '" text-anchor="' + o.anchor + '" fill="' + o.fill + '" font-family="' + o.family.replace(/"/g, '&apos;') + '"' +
        (o.spacing ? ' letter-spacing="' + o.spacing + '"' : '') +
        (o.opacity !== 1 ? ' opacity="' + o.opacity + '"' : '') + '>' + esc(o.s) + '</text>';
    }).join('\n  ');

    var torn = tornPaperPath(paperH);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" width="' + VW + '" height="' + VH + '" ' +
      'role="img" aria-label="麦麦心情盲盒情绪小票">\n' +
      '  <rect width="' + VW + '" height="' + VH + '" rx="10" fill="' + C.plate + '"/>\n' +
      '  <g transform="translate(' + M + ',' + M + ')">\n' +
      '    <path d="' + torn + '" fill="' + C.sheet + '" transform="translate(0,3)"/>\n' +
      '    <path d="' + torn + '" fill="' + C.paper + '"/>\n' +
      '    <g>\n  ' + body + '\n    </g>\n' +
      '  </g>\n</svg>\n';
  }

  function renderSVG(r) { return serialize(buildLayout(r)); }

  /**
   * 几何自检：文字是否越出票面、同一行是否互相压字、内容是否超出票面高度。
   * 返回的 issues 为空数组即代表版式安全。
   */
  function checkLayout(r) {
    var layout = buildLayout(r);
    var issues = [];
    var boxes = [];
    layout.ops.forEach(function (o) {
      if (o.kind !== 'text') return;
      var w = measure(o.s, o.size);
      var left, right;
      if (o.anchor === 'end') { right = o.x; left = o.x - w; }
      else if (o.anchor === 'middle') { left = o.x - w / 2; right = o.x + w / 2; }
      else { left = o.x; right = o.x + w; }
      boxes.push({ s: o.s, left: left, right: right, y: o.y });
      if (right > W - PAD + 1.5) issues.push('右侧溢出 ' + Math.round(right - (W - PAD)) + 'px: ' + String(o.s).slice(0, 24));
      if (left < PAD - 1.5) issues.push('左侧溢出 ' + Math.round(PAD - left) + 'px: ' + String(o.s).slice(0, 24));
      if (o.y > layout.height - PAD + 8) issues.push('超出票面高度: ' + String(o.s).slice(0, 24));
    });
    var byLine = {};
    boxes.forEach(function (b) { (byLine[Math.round(b.y)] = byLine[Math.round(b.y)] || []).push(b); });
    Object.keys(byLine).forEach(function (k) {
      var line = byLine[k].sort(function (a, b) { return a.left - b.left; });
      for (var i = 1; i < line.length; i++) {
        if (line[i].left < line[i - 1].right - 1.5) {
          issues.push('同一行压字：「' + line[i - 1].s.slice(0, 16) + '」×「' + line[i].s.slice(0, 16) + '」');
        }
      }
    });
    return { issues: issues, height: layout.height, opCount: layout.ops.length };
  }

  return {
    build: build,
    renderSVG: renderSVG,
    renderText: renderText,
    renderMarkdown: renderMarkdown,
    renderVoice: renderVoice,
    buildLayout: buildLayout,
    checkLayout: checkLayout,
    measure: measure,
    wrap: wrap,
    vwidth: vwidth
  };
});
