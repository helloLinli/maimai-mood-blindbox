/**
 * 情绪内容库 —— 「麦麦心情盲盒 · 小票诗」的灵魂
 * ---------------------------------------------------------------
 * 这里放着三样东西：
 *   1) 情绪档案（MOODS）：情绪 → 结构倾向 / 营养目标 / 命名风格 / 语气
 *   2) 小票诗（poems）：每个情绪 6 首，3-5 行，短、轻、不说教
 *   3) 语音祝福（bless）与收尾语（closing）
 *
 * 写作守则（合规相关，改内容时请一并遵守）：
 *   - 不评价体型、不鼓吹节食、不承诺减肥效果；「减肥」情绪的落点是"算清楚再吃"。
 *   - 不出现烟酒、赌博、迷信、拜金；「盲盒」是替你做决定，不是碰运气。
 *   - 不贬低任何品牌，不做竞品对比；不嘲讽麦当劳的产品与形象。
 *   - 小票诗以"陪伴 + 具体"为基调，避免"你必须/你应该"这类说教句式。
 */

(function (root) {
  'use strict';

  /**
   * 情绪档案
   *  code        情绪诊断编号（印在小票上）
   *  aliases     用户可能说的话，用于自然语言匹配
   *  dna         这个情绪最该命中的标签，命中越多分越高
   *  tagBoost    单品标签加分（相对权重）
   *  tagPenalty  单品标签扣分
   *  spicyPref   偏好的辣度上限（软约束，用户硬约束优先）
   *  kcalTarget  每人目标热量（千卡）；容差 kcalTolerance
   *  proteinMin  每人最低蛋白质（克）
   *  budgetUse   期望花掉预算的比例（留一点余量更舒服）
   *  structure   套餐骨架：main/side/drink 份数，treat 为 0 表示不给甜品，0.5 表示可选
   *  hardRules   { handheld: true } 表示所有餐品必须单手可食
   */
  var MOODS = [
    {
      id: 'whatever', code: 'EO-00', label: '说不清', icon: '🎲',
      aliases: ['随便', '不知道', '都行', '看看', '来一个', '交给ai', '懒得想'],
      vibe: '交给我决定',
      diagnosis: '今天不想选，那就别选',
      dna: ['classic', 'comfort'],
      tagBoost: { classic: 1.2, comfort: 0.8, premium: 0.4 },
      tagPenalty: {},
      spicyPref: null,
      kcalTarget: 760, kcalTolerance: 0.32, proteinMin: 24, budgetUse: 0.85,
      structure: { main: 1, side: 1, drink: 1, treat: 0.5 },
      hardRules: {},
      boxStyle: ['交给这一盒 · {main}', '不问为什么 · {main}', '今天就听它的 · {main}'],
      reasons: [
        '说不清就可以不选。这一盒替你把决定做完，你只负责吃。',
        '经典款是最不容易出错的答案，今天先要一个不出错的下午。',
        '搭配里留了一点甜的，因为完全没惊喜的一餐也不好吃。'
      ],
      poems: [
        '选择是很累的事，\n今天你已经做够多了。\n所以这一盒\n是自己走过来的。',
        '不选也是一种选，\n而且通常更快。',
        '不知道吃什么，\n是因为什么都可以，\n这是件好事。',
        '它替你想好了，\n你只需要张开手。',
        '今天的答案\n不在你脑子里，\n在你手上。',
        '随便，\n是成年人最诚实的一句话。'
      ],
      bless: ['今天不用选了，我都替你安排好了，趁热吃。', '就先这样吧，这一盒是我替你挑的。'],
      closing: '不用什么都想清楚，先吃饱。'
    },
    {
      id: 'overtime', code: 'EO-01', label: '加班', icon: '🌙',
      aliases: ['加班', '改稿', '赶工', '还没下班', '又开会', '需求又变了', '累死了'],
      vibe: '能量续航',
      diagnosis: '电量见底，但你还要撑到最后一封邮件',
      dna: ['protein', 'caffeine', 'hot'],
      tagBoost: { protein: 1.5, caffeine: 1.3, hot: 0.9, energy: 1.0, zero_sugar: 0.4, comfort: 0.5 },
      tagPenalty: { cold: 0.4 },
      spicyPref: 1,
      kcalTarget: 880, kcalTolerance: 0.3, proteinMin: 34, budgetUse: 0.9,
      structure: { main: 1, side: 1, drink: 1, treat: 0.5 },
      hardRules: {},
      boxStyle: ['续航优先 · {main}', '咖啡因不背叛 · {main}', '不吃力气的味道 · {main}'],
      reasons: [
        '加班时候的饿不是馋，是身体在要蛋白质。这一盒先给你 30 克以上的底气。',
        '咖啡因留在杯子里，力气留在你手上——先喝一口，再改那一版。',
        '热食优先。热的能让人回魂，这一点很难被冷食替代。'
      ],
      poems: [
        '第 8 版的文档还开着，\n你把它折起来压在餐盘下面。\n咬下去的这一口，\n是你今天唯一不需要再改的地方。',
        '城市把灯调暗了，\n你的屏幕还亮着。\n先让胃亮起来，\n剩下的交给明天九点半。',
        '你不需要更努力，\n你只需要一点碳水，\n和一句“今天到这儿吧”。',
        '薯条是竖着的，\n像你明天还要站的姿势。\n今天先横过来躺一会儿。',
        '一份热的，\n一份脆的，\n一份让心跳稳下来的——\n加班的人值得这样被对待。',
        '咖啡因负责点亮，\n蛋白质负责撑住，\n剩下那点甜，\n负责让你记得自己不是机器。'
      ],
      bless: ['这一盒是你的续航。慢一点也没关系，反正我一直在这儿。', '今天的第 8 版就到这儿吧。先吃饭，剩下的明天再说。'],
      closing: '你比这一单更值钱，吃完记得站起来走两步。'
    },
    {
      id: 'criticised', code: 'EO-02', label: '被骂', icon: '🫂',
      aliases: ['被骂', '骂了一顿', '被老板骂', '挨骂', '被批', '挨批', '挨训', '被训', '被怼', '老板说',
        '被说', '委屈', '被否定', '被凶', '骂', '批评我'],
      vibe: '温暖接住',
      diagnosis: '挨了几句重话，需要有人站在你这边',
      dna: ['comfort', 'hot', 'sweet'],
      tagBoost: { comfort: 1.5, hot: 1.2, sweet: 1.1, classic: 0.9, warm_drink: 1.0, crisp: 0.5 },
      tagPenalty: { spicy: 0.5, cold: 0.3 },
      spicyPref: 0,
      kcalTarget: 760, kcalTolerance: 0.3, proteinMin: 24, budgetUse: 0.85,
      structure: { main: 1, side: 1, drink: 1, treat: 1 },
      hardRules: {},
      boxStyle: ['先接住你 · {main}', '热的那一口 · {main}', '不解释的甜 · {main}'],
      reasons: [
        '被说过的话不用再咀嚼第二遍。这一盒给你两样东西：热的和甜的，它们都不评价你。',
        '经典组合最像熟人——不用自我介绍，坐下来就能安慰你。',
        '先吃甜的那一份，再吃咸的，是真的能让情绪回升一点。'
      ],
      poems: [
        '有人说话很快，\n汉堡不用说话。\n它只是坐在你手里，\n热得很稳。',
        '你没有做得不够好，\n你只是被说了一句，\n而那句话不是你的名字。',
        '甜的可以先吃，\n反正今天没人管你顺序。',
        '纸袋上有油印，\n那是它替你挡下的，\n一点点锋利。',
        '把委屈嚼碎、咽下去，\n然后再决定\n要不要捡回来。',
        '你可以什么都不解释，\n先把这口热的吃完。'
      ],
      bless: ['别人说的话，今天可以不用往心里放。先吃这口热的，我陪你一会儿。', '你不是被差评的产品。这一盒是给你的，热的，顺序随你。'],
      closing: '批评只是一句话，不是给你的盖章。'
    },
    {
      id: 'happy', code: 'EO-03', label: '开心', icon: '🎉',
      aliases: ['开心', '高兴', '顺利', '今天很棒', '搞定了', '被夸了', '心情好'],
      vibe: '分享雀跃',
      diagnosis: '顺了一整天，值得被记录一下',
      dna: ['share', 'crisp', 'sweet'],
      tagBoost: { share: 1.3, crisp: 1.2, sweet: 1.0, fruit: 0.6, premium: 0.5 },
      tagPenalty: { light: 0.3 },
      spicyPref: null,
      kcalTarget: 820, kcalTolerance: 0.32, proteinMin: 22, budgetUse: 0.85,
      structure: { main: 1, side: 1, drink: 1, treat: 1 },
      hardRules: {},
      boxStyle: ['撒一点花 · {main}', '顺手分享 · {main}', '今天值得多一点 · {main}'],
      reasons: [
        '开心的胃口是向外扩张的，所以这一盒里有一份是能分出去的。',
        '脆的东西配好消息——咬下去的时候，心情是有声音的。',
        '甜放在最后，给这一天画个句号。'
      ],
      poems: [
        '好消息应该分给两个人：\n一份给现在的你，\n一份给等会儿的你。',
        '今天你说“还行”的时候，\n嘴角有点收不住——\n我看见了。',
        '脆的那一口是给耳朵的，\n甜的那一口是给今天的。',
        '薯条可以分，\n好心情也可以分，\n反正明天还会再有。',
        '给这一天按个快门，\n别用手机，\n用一口热薯条。',
        '顺利是件小事，\n但值得被好好吃掉。'
      ],
      bless: ['今天这一盒，是给你顺手分出去的开心。', '好消息配热薯条，趁热。今天你就该高高兴兴的。'],
      closing: '把开心分出去一半，它会自己长回来。'
    },
    {
      id: 'heartbreak', code: 'EO-04', label: '失恋', icon: '🕯️',
      aliases: ['失恋', '分手', '分了', '前任', '难过', '心里空', '想哭'],
      vibe: '温和着陆',
      diagnosis: '心里空了一块，需要一点点把它填回来',
      dna: ['hot', 'comfort', 'light'],
      tagBoost: { hot: 1.3, comfort: 1.4, classic: 0.9, warm_drink: 1.3, sweet: 0.8, light: 0.6 },
      tagPenalty: { spicy: 0.6, cold: 0.5, energy: 0.3 },
      spicyPref: 0,
      kcalTarget: 620, kcalTolerance: 0.35, proteinMin: 20, budgetUse: 0.8,
      structure: { main: 1, side: 1, drink: 1, treat: 1 },
      hardRules: {},
      boxStyle: ['慢慢着陆 · {main}', '小而暖的一次 · {main}', '陪你吃完 · {main}'],
      reasons: [
        '这一盒做得小一点——难过的时候胃会变小，但它还是能吃完。',
        '热饮放在手边，是为了让你有东西可以握着。',
        '经典的味道先抵达。它不追问，也不安慰，只是熟悉。'
      ],
      poems: [
        '难过的时候胃会变小，\n所以这里只放了一点，\n刚好够你吃完。',
        '手边要有个热的东西，\n不然双手没地方放。',
        '熟悉的配方不需要回忆，\n这是它今天最大的好处。',
        '你没有丢掉什么，\n你只是把一个人\n还给了时间。',
        '慢慢吃，\n没有人催你。',
        '甜的留在最后，\n那口之后，今天就算翻页了。'
      ],
      bless: ['这一盒份量小，你不用努力吃完。慢慢来，我陪着你。', '手里的热饮握紧一点，今天不用假装没事。'],
      closing: '你先是你自己，然后才是谁的谁。'
    },
    {
      id: 'celebrate', code: 'EO-05', label: '庆祝', icon: '🥂',
      aliases: ['庆祝', '升职', '加薪', '生日', '纪念日', '毕业', '拿到offer', '值得'],
      vibe: '仪式感',
      diagnosis: '这是一个应该被记住的日子',
      dna: ['premium', 'share', 'sweet', 'protein'],
      tagBoost: { premium: 1.4, share: 1.2, protein: 1.0, sweet: 0.9, energy: 0.8 },
      tagPenalty: { light: 0.5 },
      spicyPref: null,
      kcalTarget: 1080, kcalTolerance: 0.3, proteinMin: 40, budgetUse: 0.95,
      structure: { main: 2, side: 1, drink: 1, treat: 1 },
      hardRules: {},
      boxStyle: ['排面到位 · {main}', '该有的今天都有 · {main}', '两个人也够 · {main}'],
      reasons: [
        '庆祝的套餐必须一眼看上去就“多”，今天是一年里少数可以放开一点的日子。',
        '厚牛堡垫底，甜品收尾，中间留了一个可以分享的位置。',
        '这一盒是拍得出照片的那种，因为今天值得被记住。'
      ],
      poems: [
        '值得庆祝的事情\n不需要多大，\n大到能装满一份双人餐就够。',
        '今天你不用解释\n为什么吃这么多。',
        '把最好的那块留到最后，\n这是你教给自己的仪式。',
        '拍照要快，\n热的时候最好看，\n就像你现在的样子。',
        '今天不必省，\n省的事留给明天。',
        '记一下日期，\n以后回头看还会笑。'
      ],
      bless: ['今天这一盒，是给你这一整段时间的奖赏。放开吃，值得。', '恭喜你。先把这一顿吃得像样一点，别的以后再说。'],
      closing: '你的努力有人看见了——至少这一盒看见了。'
    },
    {
      id: 'fit', code: 'EO-06', label: '减肥', icon: '🪶',
      aliases: ['减肥', '减脂', '控卡', '热量', '怕胖', '健身', '轻食', '管住嘴'],
      vibe: '轻负担满足',
      diagnosis: '想吃又怕，那就把账算清楚再吃',
      dna: ['light', 'protein', 'veggie', 'zero_sugar'],
      tagBoost: { light: 1.5, protein: 1.3, veggie: 1.2, zero_sugar: 1.2, fresh: 0.9, fruit: 0.7 },
      tagPenalty: { sweet: 0.6, cold: 0.1 },
      spicyPref: null,
      kcalTarget: 560, kcalTolerance: 0.28, proteinMin: 28, budgetUse: 0.75,
      structure: { main: 1, side: 1, drink: 1, treat: 0 },
      hardRules: {},
      boxStyle: ['轻负担当 · {main}', '热量算清楚 · {main}', '满足但不欠账 · {main}'],
      reasons: [
        '把热量算清楚再吃，比忍着不吃更能坚持下去。这一盒控制在目标区间内。',
        '蛋白质优先，是控卡期最不容易亏的那一笔。',
        '零糖饮品不是妥协，是把热量预算留给真正想吃的那一口。'
      ],
      poems: [
        '可以吃，\n只是先知道吃了多少。',
        '不用饿着证明自律，\n算清楚也算一种自律。',
        '把热量留给最想吃的那口，\n剩下的交给零糖。',
        '沙拉是有用的，\n薯条也是，\n区别只在今天排第几。',
        '慢慢吃，\n饱是十分钟之后的事。',
        '瘦不是目的，\n能一直这样吃下去才是。'
      ],
      bless: ['这一盒的热量我算过了，放心吃。想吃就别忍着。', '不用饿着，也不用愧疚，今天这顿在目标区间里。'],
      closing: '能长期吃下去的方案，才是好方案。'
    },
    {
      id: 'rush', code: 'EO-07', label: '赶时间', icon: '⏱️',
      aliases: ['赶时间', '来不及', '要迟到', '五分钟', '快点', '马上走', '赶车'],
      vibe: '三分钟快取',
      diagnosis: '时间比胃口紧，但还是想吃口热的',
      dna: ['handheld', 'hot', 'quick'],
      tagBoost: { handheld: 1.8, hot: 1.0, classic: 0.8, protein: 0.8, crisp: 0.7 },
      tagPenalty: { share: 0.6, fresh: 0.4 },
      spicyPref: 0,
      kcalTarget: 620, kcalTolerance: 0.35, proteinMin: 22, budgetUse: 0.7,
      structure: { main: 1, side: 1, drink: 1, treat: 0 },
      hardRules: { handheld: true },
      boxStyle: ['走着也能吃 · {main}', '三分钟拿稳 · {main}', '不脏手组合 · {main}'],
      reasons: [
        '全部选的是单手能拿的组合：走路、等电梯、等地铁都能吃完。',
        '饮品选的是能盖紧的，不会在包里翻。',
        '不脏手优先——今天你没有时间擦手，更没有时间迟到。'
      ],
      poems: [
        '你已经很快了，\n所以这一份，\n比你更快。',
        '热的东西也可以\n边走边吃——\n这是都市人练出来的技艺。',
        '三分钟，\n够你吃完饭，\n也够你想清楚下一句话。',
        '别跑，\n拿了就走更稳。',
        '今天的效率，\n从不用停下来开始。',
        '包里没有溅出来的那一下，\n就是今天第一个好消息。'
      ],
      bless: ['这一盒三分钟能吃完。拿稳了，别迟到。', '走着吃也行，今天不耽误你。'],
      closing: '先吃，再赶。空腹的效率是假的。'
    },
    {
      id: 'allnighter', code: 'EO-08', label: '通宵', icon: '☕',
      aliases: ['通宵', '熬夜', 'deadline', '今晚不睡', '两点', '天亮', '通宵赶稿'],
      vibe: '长夜续航',
      diagnosis: '今晚不睡，需要稳定输出到天亮',
      dna: ['caffeine', 'protein', 'energy'],
      tagBoost: { caffeine: 1.4, protein: 1.5, energy: 1.2, hot: 0.9, classic: 0.5 },
      tagPenalty: {},
      spicyPref: 1,
      kcalTarget: 1000, kcalTolerance: 0.28, proteinMin: 38, budgetUse: 0.9,
      structure: { main: 1, side: 1, drink: 1, treat: 0.5 },
      hardRules: {},
      boxStyle: ['长夜续航 · {main}', '两点钟也要撑住 · {main}', '天亮前不垮 · {main}'],
      reasons: [
        '通宵最怕的不是困，是几小时后血糖掉下去。所以这里给足蛋白质和一点碳水。',
        '咖啡因安排在中段而不是现在——现在喝掉，后半夜就没牌可打了。',
        '热食优先。凌晨的冷会把疲惫放大一倍。'
      ],
      poems: [
        '凌晨两点的键盘声\n很像下雨，\n你听着听着就困了，\n所以要有一口热的把你叫回来。',
        '咖啡留到三点钟，\n现在先吃咸的。',
        '天亮之前不要做\n任何重大决定，\n包括怀疑自己。',
        '你今天多熬的这一晚，\n我会记得，\n虽然没有人给你发奖状。',
        '慢一点吃，\n这也是休息。',
        '把窗帘拉开一条缝，\n天亮是有声音的。'
      ],
      bless: ['今晚这一盒给你撑到天亮。三点再喝咖啡，现在先吃咸的。', '别硬撑，吃一口热的。天亮之后的事交给天亮之后的你。'],
      closing: '通宵的人也需要被好好喂一顿。'
    },
    {
      id: 'examweek', code: 'EO-09', label: '考试周', icon: '📚',
      aliases: ['考试', '期末', '复习', '背不完', '考试周', '论文', '答辩'],
      vibe: '稳住状态',
      diagnosis: '脑子在转，胃别添乱',
      dna: ['protein', 'comfort', 'hot'],
      tagBoost: { protein: 1.3, comfort: 1.0, hot: 0.9, classic: 0.8, fresh: 0.6 },
      tagPenalty: { spicy: 0.6, sweet: 0.4, energy: 0.2 },
      spicyPref: 0,
      kcalTarget: 720, kcalTolerance: 0.3, proteinMin: 28, budgetUse: 0.8,
      structure: { main: 1, side: 1, drink: 1, treat: 0 },
      hardRules: {},
      boxStyle: ['稳住状态 · {main}', '考试周不踩雷 · {main}', '清爽一点也能饱 · {main}'],
      reasons: [
        '选了不容易犯困的组合：油少一点，蛋白多一点，饭后还能再看两页。',
        '熟悉的味道减少变量。考试周不适合挑战没吃过的口味。',
        '饮品放在温和区间，不给自己加心跳。'
      ],
      poems: [
        '背不完也没关系，\n先把这一顿吃好——\n脑子是烧饭烧出来的。',
        '别在考试周\n挑战没吃过的口味。',
        '胃安稳了，\n心才安静。',
        '你已经复习很久了，\n让这一口替你歇一会儿。',
        '考完再说结果的事，\n现在只需要吃饱。',
        '把书合上十分钟，\n这也是复习的一部分。'
      ],
      bless: ['这一盒稳一点，不给你添乱。吃完再看两页。', '别熬夜背了，先吃好，脑子需要燃料。'],
      closing: '考试周第一原则：别饿着上考场。'
    },
    {
      id: 'mondayblues', code: 'EO-10', label: '周一', icon: '🌤️',
      aliases: ['周一', '上班', '不想上班', '周末结束', '又要开会', '起不来', '上班第一天'],
      vibe: '温柔启动',
      diagnosis: '五天又开始了，需要一个温和的启动',
      dna: ['caffeine', 'comfort', 'classic'],
      tagBoost: { caffeine: 1.3, comfort: 1.1, classic: 1.0, hot: 0.8, sweet: 0.5 },
      tagPenalty: { cold: 0.3 },
      spicyPref: 1,
      kcalTarget: 780, kcalTolerance: 0.3, proteinMin: 25, budgetUse: 0.85,
      structure: { main: 1, side: 1, drink: 1, treat: 0.5 },
      hardRules: {},
      boxStyle: ['温柔启动 · {main}', '周一允许慢慢来 · {main}', '先热起来 · {main}'],
      reasons: [
        '周一到周三靠咖啡撑，先把这一口安排上。',
        '经典组合的确定性，是周一最需要的东西。',
        '给了一点甜的，为了让你愿意坐到工位上。'
      ],
      poems: [
        '周一不需要热爱，\n周一只需要\n一杯热的\n和一件已经会做的事。',
        '把这一周想得太长会累，\n先过完今天。',
        '你不是懒，\n你只是刚从自由的空气里回来。',
        '工位还是一样的工位，\n但今天的你有热咖啡。',
        '慢一点开始，\n也是一种开始。',
        '周一撑过去，\n后面四天都是你的。'
      ],
      bless: ['周一嘛，慢慢来。先喝一口热的，这一周才刚开始。', '今天不用太拼，先把自己启动起来。'],
      closing: '周一撑过去，剩下四天都是你的。'
    }
  ];

  /** 语音祝福的固定开头，让小票“会说话” */
  var VOICE_PREFIX = '叮——你的麦麦心情盲盒已出票。';

  /** 小票诗选择策略：同一天同一情绪，第 n 次开盒按顺序轮换，保证不重复又能预期 */
  function poemsFor(mood) { return mood.poems || []; }

  var api = { MOODS: MOODS, VOICE_PREFIX: VOICE_PREFIX, poemsFor: poemsFor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.MMB = window.MMB || {}; window.MMB.content = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
