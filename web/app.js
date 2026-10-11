/**
 * 交互 Demo 的前端逻辑
 * ---------------------------------------------------------------
 * 依赖 ../engine/*.js（普通脚本，挂在 window.MMB 上），
 * 所以这个页面双击打开就能跑：不需要服务器、不需要 Token、不需要构建。
 *
 * 页面结构对应 Industrial Skeuomorphism 的三条物理规律：
 *   机盖滑开（材质守恒）→ LED 点亮（状态可视化）→ 小票从托盘吐出。
 * 逻辑只做三件事：收集心情与约束 → 调用引擎 → 渲染情绪小票。
 */
(function () {
  'use strict';

  var bb = window.MMB.blindbox;
  var rc = window.MMB.receipt;
  var menuApi = window.MMB.menu;

  var CHASSIS = '#e0e5ec';   // 与 web/style.css 的 --chassis 保持一致

  var state = {
    moodId: null,
    budget: 60,
    people: 1,
    spicyMax: 0,
    kcalMax: null,
    avoid: [],
    result: null,
    shownIndex: null,
    receipt: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var toastTimer = null;

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  function shortSeed(seed) {
    return bb.hash32(seed).toString(16).toUpperCase().slice(0, 8);
  }

  /* ======================= 设备屏幕读数 ======================= */

  /** 待机/就绪态：只做情绪识别，不跑组合枚举（键盘输入时也要够快） */
  function updateScreenIdle() {
    var text = $('utterance').value.trim();
    var mood = state.moodId ? bb.getMood(state.moodId) : bb.detectMood(text);
    paintMood(mood);
    $('dev-meter').style.width = '0%';
    $('dev-combos').textContent = '—';
    $('dev-pool').textContent = '—';
    $('dev-slot').textContent = '—';
    $('dev-seed').textContent = '—';
    $('dev-hint').textContent = text || state.moodId ? 'READY · 点击「开一个盲盒」' : 'STANDBY · 等待输入心情';
  }

  function paintMood(mood) {
    $('dev-mood-icon').textContent = mood.icon;
    $('dev-mood-label').textContent = mood.label;
    $('dev-mood-code').textContent = mood.code + ' · ' + mood.vibe;
  }

  /** 出盒后：把引擎的实际计算结果打到屏幕上（含种子，与小票上的一致） */
  function updateScreenResult(result) {
    paintMood(bb.getMood(result.mood.id));
    var idx = state.shownIndex === null ? result.revealIndex : state.shownIndex;
    var box = result.boxes[idx] || result.boxes[0];
    var p = result.poolSize;
    $('dev-combos').textContent = result.comboCandidates;
    $('dev-pool').textContent = p.main + ' / ' + p.side + ' / ' + p.drink + ' / ' + p.treat;
    $('dev-slot').textContent = result.mealTime === 'breakfast' ? '早餐段' : '正餐段';
    $('dev-seed').textContent = shortSeed(result.seed);
    var usePct = result.constraints.budget ? Math.round(box.price / result.constraints.budget * 100) : 0;
    $('dev-meter').style.width = Math.min(100, usePct) + '%';
    $('dev-hint').textContent = 'BOX ' + (idx + 1) + ' / ' + result.boxes.length +
      ' · ' + box.role + ' · 预算使用 ' + usePct + '%';
  }

  /* ======================= 控件构建 ======================= */

  function buildMoodKeys() {
    var host = $('mood-chips');
    bb.MOODS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      b.dataset.mood = m.id;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span aria-hidden="true">' + m.icon + '</span><span>' + m.label + '</span>';
      b.addEventListener('click', function () {
        state.moodId = m.id;
        Array.prototype.forEach.call(host.children, function (c) {
          c.setAttribute('aria-pressed', String(c === b));
        });
        if (!$('utterance').value.trim()) {
          $('utterance').value = m.aliases[0] + '，' + m.diagnosis;
        }
        updateScreenIdle();
      });
      host.appendChild(b);
    });
  }

  function buildAvoidKeys() {
    var host = $('avoid-chips');
    menuApi.AVOID_OPTIONS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      b.dataset.avoid = o.id;
      b.setAttribute('aria-pressed', 'false');
      b.textContent = o.label;
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') === 'true';
        b.setAttribute('aria-pressed', String(!on));
        state.avoid = on
          ? state.avoid.filter(function (x) { return x !== o.id; })
          : state.avoid.concat([o.id]);
      });
      host.appendChild(b);
    });
  }

  function syncMoodKeys() {
    Array.prototype.forEach.call($('mood-chips').children, function (c) {
      c.setAttribute('aria-pressed', String(c.dataset.mood === state.moodId));
    });
  }

  function syncAvoidKeys() {
    Array.prototype.forEach.call($('avoid-chips').children, function (c) {
      c.setAttribute('aria-pressed', String(state.avoid.indexOf(c.dataset.avoid) !== -1));
    });
  }

  function syncSeg(id, attr, value) {
    Array.prototype.forEach.call($(id).children, function (c) {
      c.setAttribute('aria-pressed', String(c.dataset[attr] === String(value)));
    });
  }

  /** 分段开关：aria-pressed 既是无障碍状态，也是样式的唯一钩子 */
  function bindSeg(id, onPick) {
    var host = $(id);
    host.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-val]');
      if (!btn) return;
      Array.prototype.forEach.call(host.children, function (c) {
        c.setAttribute('aria-pressed', String(c === btn));
      });
      onPick(btn.dataset.val);
    });
  }

  function bindControls() {
    $('budget').addEventListener('input', function (e) {
      state.budget = Number(e.target.value);
      $('budget-out').textContent = state.budget + ' 元';
    });

    $('people').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-step]');
      if (!btn) return;
      state.people = Math.max(1, Math.min(6, state.people + Number(btn.dataset.step)));
      $('people-val').textContent = state.people;
      $('people-out').textContent = state.people + ' 人';
    });

    bindSeg('spicy', function (val) { state.spicyMax = Number(val); });
    bindSeg('kcal', function (val) { state.kcalMax = val ? Number(val) : null; });

    $('utterance').addEventListener('input', function () {
      state.moodId = null;
      syncMoodKeys();
      updateScreenIdle();
    });
  }

  /* ======================= 生成与开盒 ======================= */

  function generate() {
    return bb.generate({
      mood: state.moodId || bb.detectMood($('utterance').value.trim()).id,
      utterance: $('utterance').value.trim(),
      constraints: {
        budget: state.budget,
        people: state.people,
        spicyMax: state.spicyMax,
        avoid: state.avoid,
        kcalMax: state.kcalMax
      },
      now: new Date()
    });
  }

  function onOpen() {
    var result = generate();
    state.result = result;
    state.shownIndex = result.revealIndex;

    if (!result.feasible) {
      $('stage').hidden = false;
      $('boxes').innerHTML = '';
      $('stage-note').textContent = result.minBudget
        ? '这个预算装不下任何一盒。最低 ' + result.minBudget.amount.toFixed(2) + ' 元起（' +
          result.minBudget.main + (result.minBudget.drink ? ' + ' + result.minBudget.drink : '') + '）。'
        : '当前约束下没有可选的餐品，试试放宽忌口或辣度。';
      $('result').hidden = true;
      $('dev-hint').textContent = 'ERROR · 预算装不下，请上调预算';
      $('dev-meter').style.width = '0%';
      toast('预算装不下任何一盒，我已经把最低价算给你了。');
      return;
    }

    renderStage(result);
    updateScreenResult(result);
    // 等机盖滑开（520ms）之后再出小票，符合"先开箱、再出票"的物理因果
    window.setTimeout(function () { renderReceipt(result, state.shownIndex); }, 540);
    $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderStage(result) {
    var host = $('boxes');
    host.innerHTML = '';

    result.boxes.forEach(function (box, i) {
      var picked = i === result.revealIndex;
      var card = document.createElement('button');
      card.type = 'button';
      // 选中态在首次渲染时就要生效（LED 点亮 + 贴纸 + 描边），不是等用户点才亮
      card.className = 'box-card ' + (picked ? 'is-picked' : 'is-dim');
      card.dataset.index = i;
      card.setAttribute('aria-pressed', String(picked));
      card.innerHTML =
        '<span class="screws" aria-hidden="true"></span>' +
        '<span class="led box-card__led" aria-hidden="true"></span>' +
        '<span class="label mono box-card__sticker">开盒结果</span>' +
        '<span class="box-card__cover" aria-hidden="true"><span class="label mono">SEALED · ' + box.key + '</span></span>' +
        '<span class="box-card__body">' +
          '<span class="label mono box-card__tag">' + box.key + ' / ' + box.role + '</span>' +
          '<span class="box-card__name">' + box.name + '</span>' +
          '<span class="box-card__meta">' + box.items.length + ' 件 · 人均 ' + box.kcalPerPerson +
            ' kcal · 蛋白 ' + box.proteinPerPerson + ' g</span>' +
          '<span class="box-card__price">¥ ' + box.price.toFixed(2) + '</span>' +
          '<span class="box-card__items">' + box.items.map(function (it) { return it.name; }).join(' · ') + '</span>' +
        '</span>';

      card.addEventListener('click', function () { selectBox(result, i); });

      host.appendChild(card);
      // 下一帧再加 is-open，让机盖有"从上方滑开"的过渡起点
      window.requestAnimationFrame(function () {
        window.setTimeout(function () { card.classList.add('is-open'); }, picked ? 60 : 140 + i * 70);
      });
    });

    $('stage').hidden = false;
    $('stage-note').textContent =
      '开盒种子：' + shortSeed(result.seed) + '　第 ' + (result.revealIndex + 1) + ' 盒被揭晓。' +
      (result.relaxed.length ? '　受预算与口味约束，省去了：' + result.relaxed.join('、') + '。' : '');
  }

  function selectBox(result, index) {
    state.shownIndex = index;
    Array.prototype.forEach.call($('boxes').children, function (c, k) {
      var picked = k === index;
      c.classList.toggle('is-picked', picked);
      c.classList.toggle('is-dim', !picked);
      c.setAttribute('aria-pressed', String(picked));
    });
    renderReceipt(result, index);
    updateScreenResult(result);
  }

  function renderReceipt(result, index) {
    var receipt = rc.build(result, { boxIndex: index, now: new Date() });
    state.receipt = receipt;
    $('receipt-holder').innerHTML = rc.renderSVG(receipt);
    $('result').hidden = false;
    $('result-title').textContent = '第 ' + (index + 1) + ' 盒 · ' + receipt.box.role + ' —— ' + receipt.box.name;
    $('result-sub').textContent = receipt.moodCode + ' ' + receipt.moodLabel + ' · ' + receipt.vibe +
      '　取餐码 ' + receipt.pickupCode + '　SEED ' + receipt.seedShort;
    $('data-note').textContent = result.dataSource === 'mcp'
      ? '数据来源：麦当劳 MCP 实时菜单与营养结果。'
      : '数据来源：内置演示菜单（离线模式）。接入 MCP 后会自动替换为实时菜单、价格与营养数据。';
  }

  /* ======================= 语音祝福 ======================= */

  function speak() {
    if (!state.receipt) return;
    var text = rc.renderVoice(state.receipt);
    if (!('speechSynthesis' in window)) {
      toast('这个浏览器不支持语音播放。文案已经印在小票上，可以直接复制。');
      return;
    }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.98;
    u.pitch = 1.02;
    window.speechSynthesis.speak(u);
  }

  /* ======================= 导出与复制 ======================= */

  function download(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function saveImage() {
    if (!state.receipt) return;
    var svg = $('receipt-holder').innerHTML;
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    var img = new Image();
    var name = 'mood-receipt-' + state.receipt.pickupCode.replace('#', '') + '.png';
    img.onload = function () {
      try {
        var scale = 2;
        var canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = CHASSIS;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) { fallbackSvg(svg, name); return; }
          download(name, blob);
          toast('长图已保存，可以直接发出去。');
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        fallbackSvg(svg, name);
      }
    };
    img.onerror = function () { URL.revokeObjectURL(url); fallbackSvg(svg, name); };
    img.src = url;
  }

  function fallbackSvg(svg, name) {
    download(name.replace(/\.png$/, '.svg'), new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    toast('浏览器限制了图片导出，已改为下载矢量小票（可无损放大）。');
  }

  function copyText() {
    if (!state.receipt) return;
    var text = rc.renderText(state.receipt);
    var done = function () { toast('文本小票已复制，可以粘到聊天窗口里。'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
    } else legacyCopy(text, done);
  }

  function legacyCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选中小票文字。'); }
    ta.remove();
  }

  function switchBox() {
    if (!state.result || !state.result.boxes.length) return;
    selectBox(state.result, (state.shownIndex + 1) % state.result.boxes.length);
  }

  /* ======================= 深链 ======================= */

  /**
   * index.html?mood=overtime&budget=60&people=2&spicy=1&kcal=750&avoid=beef,dairy&utterance=...
   * 打开链接即自动开盒，方便把「某个心情的盲盒」直接分享给别人。
   */
  function applyDeepLink() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (!q || !q.toString()) return;

    var mood = q.get('mood');
    if (mood) {
      var hit = bb.MOODS.filter(function (m) { return m.id === mood || m.label === mood; })[0];
      if (hit) { state.moodId = hit.id; syncMoodKeys(); }
    }
    if (q.get('budget')) {
      state.budget = Math.max(20, Math.min(150, Number(q.get('budget')) || state.budget));
      $('budget').value = state.budget;
      $('budget-out').textContent = state.budget + ' 元';
    }
    if (q.get('people')) {
      state.people = Math.max(1, Math.min(6, Number(q.get('people')) || 1));
      $('people-val').textContent = state.people;
      $('people-out').textContent = state.people + ' 人';
    }
    if (q.get('spicy') !== null) {
      state.spicyMax = Math.max(0, Math.min(2, Number(q.get('spicy')) || 0));
      syncSeg('spicy', 'val', state.spicyMax);
    }
    if (q.get('kcal')) {
      state.kcalMax = Number(q.get('kcal')) || null;
      syncSeg('kcal', 'val', state.kcalMax || '');
    }
    if (q.get('avoid')) {
      state.avoid = q.get('avoid').split(',').map(function (s) { return s.trim(); })
        .filter(function (id) {
          return menuApi.AVOID_OPTIONS.some(function (o) { return o.id === id; });
        });
      syncAvoidKeys();
    }
    var text = q.get('utterance');
    if (text) $('utterance').value = text;

    if (mood || text) {
      onOpen();
      var box = q.get('box');
      if (box !== null && state.result && state.result.boxes[box]) {
        selectBox(state.result, Number(box));
      }
    }
  }

  /* ======================= 启动 ======================= */

  buildMoodKeys();
  buildAvoidKeys();
  bindControls();

  $('open-btn').addEventListener('click', onOpen);
  $('hero-open').addEventListener('click', function () {
    // Hero 的主按钮必须"按下去就有东西出来"：没有输入时按「说不清」档案开一盒，
    // 再顺势告诉用户怎么让结果更准，而不是把一个不响应的按钮丢给第一次来的人。
    if (!$('utterance').value.trim() && !state.moodId) {
      toast('还没说心情，先按「说不清」给你开一盒。想更准就说一句话或点个标签。');
    }
    onOpen();
  });
  $('speak-btn').addEventListener('click', speak);
  $('save-btn').addEventListener('click', saveImage);
  $('copy-btn').addEventListener('click', copyText);
  $('switch-btn').addEventListener('click', switchBox);

  updateScreenIdle();
  applyDeepLink();

  // 自检：把引擎最关键的几条断言在页面上跑一遍，不一致会在控制台报错
  (function selfTest() {
    var problems = [];
    ['overtime', 'fit', 'rush', 'celebrate'].forEach(function (mood) {
      var r = bb.generate({ mood: mood, constraints: { budget: 60, people: 2 }, now: new Date() });
      if (r.boxes.length !== 3) problems.push(mood + ' 未产出 3 盒');
      r.boxes.forEach(function (b) {
        if (b.price > 60) problems.push(mood + ' 超预算');
      });
      var rec = rc.build(r, { now: new Date() });
      if (rc.checkLayout(rec).issues.length) problems.push(mood + ' 小票版式溢出');
    });
    if (problems.length) console.error('[mood-blindbox] 自检未通过：', problems);
  })();
})();
