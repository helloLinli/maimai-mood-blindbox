/**
 * 演示菜单（离线兜底数据）
 * ---------------------------------------------------------------
 * 作用：在没有 MCP Token、或 MCP 临时不可用时，让盲盒引擎依然可以跑通。
 * 真实运行时，这一份数据会被麦当劳 MCP 的 query-meals / list-nutrition-foods
 * / query-meal-detail 的返回值替换（见 MCP_INTEGRATION.md）。
 *
 * 字段说明
 *  code       餐品编码（真实环境使用 MCP 返回的 mcProductCode）
 *  name       餐品名称
 *  category   main 主食 | side 配餐 | drink 饮品 | treat 甜品
 *  meal       all 全时段 | breakfast 早餐时段专属
 *  tags       风味/结构标签，用于情绪匹配与场景约束
 *  contains   成分标签，用于忌口过滤
 *  spicy      辣度 0 不辣 / 1 微辣 / 2 辣
 *  kcal       热量（千卡，估算值）
 *  protein    蛋白质（克，估算值）
 *  price      参考单价（元）
 *  handheld   是否单手可食（赶时间场景）
 *  hot        是否热食/热饮（安慰感场景）
 *  shareable  是否适合分享（多人场景）
 *
 * 免责声明：价格为参考价且会随门店、时段、活动变化，
 * 热量与营养为估算值，一切以麦当劳官方渠道实时结果为准。
 */

(function (root) {
  'use strict';

  var MENU_DEMO = [
    /* ---------------------------- 主食 ---------------------------- */
    { code: 'BIGMAC',     name: '巨无霸',           category: 'main',  meal: 'all', tags: ['classic', 'protein', 'hot', 'share'], contains: ['beef', 'sesame', 'dairy'], spicy: 0, kcal: 550, protein: 26, price: 24.5, handheld: true,  hot: true,  shareable: false },
    { code: 'SPICYCHK',   name: '麦辣鸡腿堡',       category: 'main',  meal: 'all', tags: ['spicy', 'hot', 'handheld', 'energy'], contains: ['chicken'],                  spicy: 2, kcal: 500, protein: 24, price: 22.5, handheld: true,  hot: true,  shareable: false },
    { code: 'GRILLCHK',   name: '板烧鸡腿堡',       category: 'main',  meal: 'all', tags: ['light', 'protein', 'hot', 'handheld'], contains: ['chicken'],            spicy: 0, kcal: 470, protein: 25, price: 23.0, handheld: true,  hot: true,  shareable: false },
    { code: 'DBLCHEESE',  name: '双层吉士汉堡',     category: 'main',  meal: 'all', tags: ['classic', 'comfort', 'hot'], contains: ['beef', 'dairy'],           spicy: 0, kcal: 440, protein: 22, price: 18.0, handheld: true,  hot: true,  shareable: false },
    { code: 'CHEESE',     name: '吉士汉堡',         category: 'main',  meal: 'all', tags: ['classic', 'comfort', 'light'], contains: ['beef', 'dairy'],          spicy: 0, kcal: 300, protein: 15, price: 12.0, handheld: true,  hot: true,  shareable: false },
    { code: 'FILET',      name: '麦香鱼',           category: 'main',  meal: 'all', tags: ['light', 'comfort', 'handheld'], contains: ['fish', 'dairy'],          spicy: 0, kcal: 340, protein: 15, price: 16.0, handheld: true,  hot: true,  shareable: false },
    { code: 'MCCHICKEN',  name: '麦香鸡汉堡',       category: 'main',  meal: 'all', tags: ['crisp', 'comfort', 'handheld'], contains: ['chicken'],                 spicy: 0, kcal: 380, protein: 16, price: 15.0, handheld: true,  hot: true,  shareable: false },
    { code: 'CODFISH',    name: '深海鳕鱼堡',       category: 'main',  meal: 'all', tags: ['light', 'protein', 'hot'], contains: ['fish', 'dairy'],               spicy: 0, kcal: 400, protein: 18, price: 19.0, handheld: true,  hot: true,  shareable: false },
    { code: 'ANGUS',      name: '安格斯厚牛堡',     category: 'main',  meal: 'all', tags: ['premium', 'protein', 'energy'], contains: ['beef', 'dairy'],            spicy: 0, kcal: 650, protein: 35, price: 32.0, handheld: true,  hot: true,  shareable: false },
    { code: 'BACONVEG',   name: '培根蔬萃双层牛堡', category: 'main',  meal: 'all', tags: ['protein', 'veggie', 'energy'], contains: ['beef', 'pork', 'dairy'],    spicy: 0, kcal: 500, protein: 27, price: 25.0, handheld: true,  hot: true,  shareable: false },
    { code: 'GRILLVEG',   name: '蔬萃板烧鸡腿堡',   category: 'main',  meal: 'all', tags: ['light', 'veggie', 'protein'], contains: ['chicken'],                   spicy: 0, kcal: 420, protein: 24, price: 24.0, handheld: true,  hot: true,  shareable: false },
    { code: 'BIGMACD',    name: '巨无霸（双份牛肉）', category: 'main', meal: 'all', tags: ['protein', 'energy', 'premium'], contains: ['beef', 'sesame', 'dairy'], spicy: 0, kcal: 700, protein: 40, price: 33.0, handheld: true, hot: true, shareable: false },

    /* -------------------------- 早餐主食 -------------------------- */
    { code: 'EGGMCMUFF',  name: '吉士蛋麦满分',     category: 'main',  meal: 'breakfast', tags: ['protein', 'hot', 'handheld'], contains: ['egg', 'dairy', 'pork'], spicy: 0, kcal: 300, protein: 17, price: 15.0, handheld: true,  hot: true, shareable: false },
    { code: 'SLTMCMUFF',  name: '猪柳蛋麦满分',     category: 'main',  meal: 'breakfast', tags: ['protein', 'hot', 'energy'], contains: ['pork', 'egg', 'dairy'],    spicy: 0, kcal: 380, protein: 19, price: 17.0, handheld: true,  hot: true, shareable: false },
    { code: 'SLMCMUFF',   name: '猪柳麦满分',       category: 'main',  meal: 'breakfast', tags: ['protein', 'hot', 'handheld'], contains: ['pork', 'dairy'],          spicy: 0, kcal: 330, protein: 16, price: 14.0, handheld: true,  hot: true,  shareable: false },
    { code: 'MCMUFFCHK',  name: '鸡通粉麦满分',     category: 'main',  meal: 'breakfast', tags: ['light', 'hot'], contains: ['chicken'],                              spicy: 0, kcal: 320, protein: 15, price: 15.5, handheld: true,  hot: true,  shareable: false },
    { code: 'HOTCAKE',    name: '热香饼（3块）',    category: 'main',  meal: 'breakfast', tags: ['sweet', 'comfort', 'hot'], contains: ['dairy', 'egg'],             spicy: 0, kcal: 320, protein: 6,  price: 13.0, handheld: false, hot: true,  shareable: true  },
    { code: 'GRIDDLE',    name: '热香饼配猪柳',     category: 'main',  meal: 'breakfast', tags: ['sweet', 'protein', 'hot'], contains: ['pork', 'dairy', 'egg'],     spicy: 0, kcal: 470, protein: 17, price: 21.0, handheld: false, hot: true,  shareable: false },

    /* ---------------------------- 配餐 ---------------------------- */
    { code: 'FRIES_M',    name: '中薯条',           category: 'side',  meal: 'all', tags: ['crisp', 'classic', 'comfort', 'handheld'], contains: [],                spicy: 0, kcal: 230, protein: 3,  price: 11.5, handheld: true,  hot: true,  shareable: false },
    { code: 'FRIES_L',    name: '大薯条',           category: 'side',  meal: 'all', tags: ['crisp', 'classic', 'share'], contains: [],                        spicy: 0, kcal: 340, protein: 4,  price: 13.5, handheld: false, hot: true,  shareable: true  },
    { code: 'FRIES_S',    name: '小薯条',           category: 'side',  meal: 'all', tags: ['crisp', 'light', 'handheld'], contains: [],                       spicy: 0, kcal: 150, protein: 2,  price: 8.5,  handheld: true,  hot: true,  shareable: false },
    { code: 'NUGGET5',    name: '麦乐鸡（5块）',    category: 'side',  meal: 'all', tags: ['protein', 'crisp', 'handheld'], contains: ['chicken'],               spicy: 0, kcal: 210, protein: 12, price: 13.0, handheld: true,  hot: true,  shareable: false },
    { code: 'NUGGET10',   name: '麦乐鸡（10块）',   category: 'side',  meal: 'all', tags: ['protein', 'crisp', 'share'], contains: ['chicken'],                  spicy: 0, kcal: 420, protein: 24, price: 24.0, handheld: false, hot: true,  shareable: true  },
    { code: 'WINGS2',     name: '麦辣鸡翅（2块）',  category: 'side',  meal: 'all', tags: ['spicy', 'crisp', 'comfort'], contains: ['chicken'],                    spicy: 2, kcal: 300, protein: 18, price: 14.5, handheld: true,  hot: true,  shareable: false },
    { code: 'BIGCUTLET',  name: '那么大鸡排',       category: 'side',  meal: 'all', tags: ['protein', 'crisp', 'energy'], contains: ['chicken'],                    spicy: 1, kcal: 430, protein: 22, price: 18.0, handheld: false, hot: true,  shareable: true  },
    { code: 'CORNCUP',    name: '玉米杯',           category: 'side',  meal: 'all', tags: ['veggie', 'light', 'hot'], contains: [],                             spicy: 0, kcal: 90,  protein: 3,  price: 9.0,  handheld: true,  hot: true,  shareable: false },
    { code: 'SALAD',      name: '鲜蔬沙拉',         category: 'side',  meal: 'all', tags: ['veggie', 'light', 'fresh'], contains: [],                           spicy: 0, kcal: 70,  protein: 2,  price: 12.0, handheld: false, hot: false, shareable: false },
    { code: 'APPLE',      name: '苹果片',           category: 'side',  meal: 'all', tags: ['fruit', 'light', 'fresh'], contains: [],                            spicy: 0, kcal: 40,  protein: 0,  price: 6.0,  handheld: true,  hot: false, shareable: false },
    { code: 'HASHPB',     name: '薯饼',             category: 'side',  meal: 'breakfast', tags: ['crisp', 'hot', 'handheld', 'comfort'], contains: [],         spicy: 0, kcal: 150, protein: 2,  price: 6.0,  handheld: true,  hot: true,  shareable: false },
    { code: 'YOGURT',     name: '原味酸奶杯',       category: 'side',  meal: 'breakfast', tags: ['light', 'dairy_free_milk', 'fresh'], contains: ['dairy'],       spicy: 0, kcal: 120, protein: 5,  price: 9.0,  handheld: true,  hot: false, shareable: false },

    /* ---------------------------- 饮品 ---------------------------- */
    { code: 'COKE_M',     name: '可口可乐（中）',   category: 'drink', meal: 'all', tags: ['cold', 'sweet', 'classic'], contains: ['ice', 'sugar'],              spicy: 0, kcal: 150, protein: 0,  price: 10.5, handheld: true,  hot: false, shareable: false },
    { code: 'COKE_ZERO',  name: '零度可乐（中）',   category: 'drink', meal: 'all', tags: ['cold', 'zero_sugar', 'classic'], contains: ['ice'],                      spicy: 0, kcal: 1,   protein: 0,  price: 10.5, handheld: true,  hot: false, shareable: false },
    { code: 'SPRITE_M',   name: '雪碧（中）',       category: 'drink', meal: 'all', tags: ['cold', 'sweet'], contains: ['ice', 'sugar'],                            spicy: 0, kcal: 140, protein: 0,  price: 10.5, handheld: true,  hot: false, shareable: false },
    { code: 'OJ_S',       name: '橙汁（小）',       category: 'drink', meal: 'all', tags: ['cold', 'fruit', 'fresh'], contains: ['ice', 'sugar'],                    spicy: 0, kcal: 110, protein: 1,  price: 12.0, handheld: true,  hot: false, shareable: false },
    { code: 'COFFEE_S',   name: '鲜煮咖啡（小）',   category: 'drink', meal: 'all', tags: ['caffeine', 'hot', 'warm_drink'], contains: ['caffeine'],                  spicy: 0, kcal: 5,   protein: 0,  price: 9.0,  handheld: true,  hot: true,  shareable: false },
    { code: 'AMERICANO',  name: '麦咖啡美式（中）', category: 'drink', meal: 'all', tags: ['caffeine', 'hot', 'zero_sugar'], contains: ['caffeine'],                  spicy: 0, kcal: 10,  protein: 1,  price: 15.0, handheld: true,  hot: true,  shareable: false },
    { code: 'LATTE_M',    name: '麦咖啡拿铁（中）', category: 'drink', meal: 'all', tags: ['caffeine', 'hot', 'warm_drink', 'comfort'], contains: ['caffeine', 'dairy'], spicy: 0, kcal: 150, protein: 9, price: 17.0, handheld: true, hot: true, shareable: false },
    { code: 'MILK',       name: '纯牛奶',           category: 'drink', meal: 'all', tags: ['hot', 'warm_drink', 'protein'], contains: ['dairy'],                     spicy: 0, kcal: 120, protein: 6,  price: 8.0,  handheld: true,  hot: true,  shareable: false },
    { code: 'SOYBEAN',    name: '豆浆',             category: 'drink', meal: 'breakfast', tags: ['hot', 'warm_drink', 'comfort', 'protein'], contains: [],          spicy: 0, kcal: 110, protein: 6,  price: 7.0,  handheld: true,  hot: true,  shareable: false },
    { code: 'WATER',      name: '矿泉水',           category: 'drink', meal: 'all', tags: ['cold', 'zero_sugar', 'light'], contains: [],                            spicy: 0, kcal: 0,   protein: 0,  price: 5.5,  handheld: true,  hot: false, shareable: false },
    { code: 'HOT_WATER',  name: '热柠檬水',         category: 'drink', meal: 'all', tags: ['hot', 'warm_drink', 'zero_sugar', 'comfort'], contains: [],           spicy: 0, kcal: 8,   protein: 0,  price: 6.0,  handheld: true,  hot: true,  shareable: false },
    { code: 'MILKTEA',    name: '麦咖啡锡兰奶茶',   category: 'drink', meal: 'all', tags: ['caffeine', 'sweet', 'warm_drink', 'comfort'], contains: ['caffeine', 'dairy'], spicy: 0, kcal: 210, protein: 5, price: 16.0, handheld: true, hot: true, shareable: false },

    /* ---------------------------- 甜品 ---------------------------- */
    { code: 'MCWIND_ORI', name: '麦旋风（原味）',   category: 'treat', meal: 'all', tags: ['sweet', 'cold', 'comfort'], contains: ['dairy', 'ice'],              spicy: 0, kcal: 250, protein: 5,  price: 10.0, handheld: true,  hot: false, shareable: false },
    { code: 'MCWIND_OREO', name: '麦旋风（奥利奥）', category: 'treat', meal: 'all', tags: ['sweet', 'cold', 'comfort'], contains: ['dairy', 'ice'],            spicy: 0, kcal: 300, protein: 6,  price: 12.0, handheld: true,  hot: false, shareable: false },
    { code: 'CONE',       name: '圆筒冰淇淋',       category: 'treat', meal: 'all', tags: ['sweet', 'cold', 'light', 'handheld'], contains: ['dairy', 'ice'],       spicy: 0, kcal: 120, protein: 3,  price: 5.0,  handheld: true,  hot: false, shareable: false },
    { code: 'SUNDAE_CHO', name: '新地（巧克力）',   category: 'treat', meal: 'all', tags: ['sweet', 'cold', 'comfort'], contains: ['dairy', 'ice'],              spicy: 0, kcal: 200, protein: 4,  price: 8.0,  handheld: true,  hot: false, shareable: false },
    { code: 'EGGTART',    name: '蛋挞',             category: 'treat', meal: 'all', tags: ['sweet', 'hot', 'comfort', 'warm_drink'], contains: ['dairy', 'egg'],       spicy: 0, kcal: 200, protein: 3,  price: 7.5,  handheld: true,  hot: true,  shareable: false },
    { code: 'TAROPIE',    name: '香芋派',           category: 'treat', meal: 'all', tags: ['sweet', 'hot', 'comfort'], contains: ['dairy'],                       spicy: 0, kcal: 250, protein: 3,  price: 8.5,  handheld: true,  hot: true,  shareable: false },
    { code: 'PINEAPPLEPIE', name: '菠萝派',         category: 'treat', meal: 'all', tags: ['sweet', 'hot', 'fruit'], contains: ['dairy'],                         spicy: 0, kcal: 240, protein: 3,  price: 8.5,  handheld: true,  hot: true,  shareable: false },
    { code: 'MUFFIN_CHO', name: '麦芬（巧克力）',   category: 'treat', meal: 'breakfast', tags: ['sweet', 'comfort', 'caffeine_hint'], contains: ['dairy', 'egg'], spicy: 0, kcal: 320, protein: 5, price: 11.0, handheld: true, hot: true, shareable: false },
    { code: 'CROISSANT',  name: '可颂',             category: 'treat', meal: 'breakfast', tags: ['crisp', 'comfort', 'warm_drink'], contains: ['dairy'],            spicy: 0, kcal: 260, protein: 5,  price: 10.0, handheld: true,  hot: true,  shareable: false, note: '14:00 后视门店供应情况' }
  ];

  var TAG_LABELS = {
    classic: '经典招牌', protein: '高蛋白', energy: '能量充足', light: '轻负担', crisp: '酥脆口感',
    spicy: '辣的',
    hot: '热食热饮', cold: '冰的', warm_drink: '暖胃', comfort: '安慰感', sweet: '甜的',
    caffeine: '含咖啡因', zero_sugar: '零糖', veggie: '有蔬菜', fruit: '水果', fresh: '清爽',
    share: '适合分享', handheld: '单手可拿', premium: '够排面', dairy_free_milk: '乳基甜品',
    caffeine_hint: '微咖啡因'
  };

  var CONTAINS_LABELS = {
    beef: '牛肉', pork: '猪肉', chicken: '鸡肉', fish: '鱼肉海鲜', dairy: '奶制品', egg: '鸡蛋',
    sesame: '芝麻', nut: '坚果', sugar: '含糖', ice: '冰饮', caffeine: '咖啡因', wheat: '小麦'
  };

  var AVOID_OPTIONS = [
    { id: 'beef',     label: '不吃牛肉' },
    { id: 'pork',     label: '不吃猪肉' },
    { id: 'fish',     label: '不吃鱼肉海鲜' },
    { id: 'dairy',    label: '乳糖不耐（避开奶制品）' },
    { id: 'egg',      label: '不吃鸡蛋' },
    { id: 'sesame',   label: '不吃芝麻' },
    { id: 'nut',      label: '不吃坚果' },
    { id: 'caffeine', label: '不喝咖啡因' },
    { id: 'ice',      label: '不要冰的' },
    { id: 'sugar',    label: '控糖（避开含糖饮料）' }
  ];

  var api = { MENU_DEMO: MENU_DEMO, TAG_LABELS: TAG_LABELS, CONTAINS_LABELS: CONTAINS_LABELS, AVOID_OPTIONS: AVOID_OPTIONS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.MMB = window.MMB || {}; window.MMB.menu = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
