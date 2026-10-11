# 设计系统落地说明（Industrial Skeuomorphism）

这一页记录 `web/` 是如何把「工业拟物 / Industrial Realism」设计系统落到这个零依赖静态页面上的，以及**哪一处刻意偏离了原设计系统、为什么**。维护者改样式前请先读这一页。

## 1. 技术栈与硬性约束

| 项目 | 结论 |
|---|---|
| 技术栈 | 原生 HTML + CSS + ES5 级 JS（普通 `<script>`，非模块） |
| 构建步骤 | 无。必须支持 **双击 `web/index.html` 直接用 `file://` 打开**，因此不引入 Tailwind / React / 打包器 |
| 第三方依赖 | 0。所有纹理、阴影、动效都是 CSS / 内联 SVG，不发外部请求 |
| 字体 | Inter + JetBrains Mono 通过 Google Fonts **可选加载**，失败或离线时回落到 `PingFang SC / Microsoft YaHei / system-ui`（`--font-sans`）与 `SF Mono / Consolas`（`--font-mono`） |

设计系统原文里的 Tailwind 类名（如 `shadow-[var(--shadow-card)]`）在这里**翻译成 CSS 自定义属性 + 语义类名**，不改变任何视觉结论。

## 2. Design tokens（唯一定义处：`web/style.css` 的 `:root`）

### 材质与颜色

| Token | 值 | 用途 |
|---|---|---|
| `--chassis` | `#e0e5ec` | Level 0 底盘（哑光 ABS） |
| `--panel` | `#f0f2f5` | 抬升面板 |
| `--recessed` | `#d1d9e6` | 凹陷区：输入槽、散热槽、管道 |
| `--ink` | `#2d3436` | 主文字 |
| `--muted` | `#4a5568` | 次级文字 / 标签 |
| `--border` | `#babecc` | 阴影暗侧 |
| `--border-light` | `#ffffff` | 高光亮侧 |
| `--border-dark` | `#a3b1c6` | 深投影、分割线 |
| `--dark` / `--dark-2` | `#2d3436` / `#2c3e50` | 深色技术面板、设备屏幕 |
| `--dark-dim` | `#a8b2d1` | 深色面板上的次级文字 |
| `--led-on` / `--led-warn` | `#22c55e` / `#f59e0b` | LED 状态指示 |

### 安全橙：**三档拆分**（唯一一处刻意偏离原设计系统）

原设计系统规定「accent `#ff4757` + 白色前景」。实测对比度只有 **3.34:1**，对 13px 加粗的按钮文字**不满足 WCAG AA（4.5:1）**；而设计系统同时要求「Preserve or improve accessibility」。两者冲突时，我保留识别色、拆分功能色：

| Token | 值 | 用途 | 对比度 |
|---|---|---|---|
| `--accent` | `#ff4757` | **只做识别与装饰**：LED、辉光、聚焦环、描边、图钉、`·` 分隔符 | — |
| `--accent-deep` | `#d92b3f` | **填充面与大字强调**：主按钮底色、选中的心情键、贴纸、大标题 | 白字 **4.81:1** ✅ AA |
| `--accent-ink` | `#a8232f` | **底盘上的小字强调**：次级按钮 hover 文字 | **5.63:1** ✅ AA |

实测数据（`node -e` 现场算的，不是估的）：

```text
ink/chassis            10.02:1  AA-text
muted/chassis           5.94:1  AA-text
white/accent(#ff4757)   3.34:1  ← 原方案，小字不达标
white/accent-deep       4.81:1  AA-text
accent-deep/chassis     3.80:1  AA-large-only（用于大标题，达标）
accent-ink/chassis      5.63:1  AA-text
label(dark-dim)/dark    6.01:1  AA-text
led-green/dark          5.57:1  AA-text
accentInk/paper         6.14:1  AA-text   ← 小票纸面
muted/paper             6.96:1  AA-text
accent/paper            3.09:1  AA-large-only（小票取餐码 30px 粗体，达标）
```

同一个 `--accent` 家族也被复用到小票 SVG（`engine/receipt.js` 的 `C.accent` / `C.accentInk`），保证「屏幕上的品牌色」与「纸面上的品牌色」是同一套。

### 阴影（核心视觉签名）

| Token | 值 | 层级 |
|---|---|---|
| `--shadow-recessed` | `inset 4px 4px 8px #babecc, inset -4px -4px 8px #ffffff` | Level −1：输入槽、屏幕、托盘 |
| `--shadow-card` | `8px 8px 16px #babecc, -8px -8px 16px #ffffff` | Level +1：面板、卡片、工序块 |
| `--shadow-floating` | `12px 12px 24px … , inset 1px 1px 0 rgba(255,255,255,.5)` | Level +2：设备外壳、hover 抬升 |
| `--shadow-pressed` | `inset 6px 6px 12px … , inset -6px -6px 12px …` | 按下：阴影方向反相 |
| `--glow` / `--glow-green` | `0 0 10px 2px rgba(...)` | LED 与聚焦 |

### 运动、圆角、字体

- 缓动：`--ease-mech: cubic-bezier(.175,.885,.32,1.275)`（轻微回弹的机械手感）；`--ease-out` 用于阴影/透明度。
- 时长：`150ms` 按压、`200ms` 常规、`300ms` 抬升、`500ms` 出纸与量表。
- 圆角：`4 / 8 / 16 / 24 / 30px`，对应 `--r-sm…--r-2xl`；`9999px` 给 LED、图钉、旋钮。
- 字体：`--font-sans`（Inter）用于文本与标题；`--font-mono`（JetBrains Mono）用于**所有数字、状态读数、seed、取餐码、标签**。

## 3. 物理规律如何在代码里成立

1. **光源恒定左上 45°**：`body` 的 `background-image` 用两个 `radial-gradient` 在左上打白、右上压灰；所有阴影 token 都是「右下暗 + 左上亮」的固定配对，没有一处例外。
2. **材质守恒**：盲盒揭晓走的是 `.box-card__cover` 从 `translateY(0)` → `translateY(102%)` 的**机械盖板滑开**，而不是淡入；小票在开盖完成（540ms）之后才出现，模拟「先开箱、再出纸」。
3. **高度层级**：输入槽与小票托盘用 `recessed`，面板与卡片用 `card`，设备外壳与贴纸用 `floating`，按下的按钮切到 `pressed`。

## 4. 签名元素与实现位置

| 元素 | 实现 |
|---|---|
| 四角螺丝 | `.screws`：4 个 `radial-gradient`，固定在距边 14px 处；面板、盲盒卡片都用它 |
| 散热槽 | `.vents` / `.device__vents`：4×22px 圆角小柱 + `--shadow-inset-sm` |
| LED 指示灯 | `.led`（10px 圆点）+ `--glow-green`；`.led--on` 呼吸动画；盲盒被选中时点亮为橙红 |
| CRT 屏幕 | `.device__screen`：深色底 + `inset` 阴影 + `linear-gradient` 扫描线（`background-size:100% 4px`） |
| 物理管道 | `.pipe`：工序之间的横向圆柱（`hidden` 于 ≤1024px） |
| 遮蔽胶带 | `.tape`：`skewX(-12deg)` + 半透明黄 + `backdrop-filter: blur(2px)` |
| 图钉 | `.pin`：径向高光 + 中心亮点，钉在小票托盘上 |
| 蓝图底纹 | `.schematic::before`：40px 网格，`opacity: .07-.1` |
| 微观噪点 | `.chassis-noise`：内联 SVG `feTurbulence` + `mix-blend-mode: overlay`，`z-index: 0` 保持在内容之下 |
| 碳纤维 | `.device__bezel`：两组 ±45° `repeating-linear-gradient` 交叉线，**不外链图片**（离线可用） |

## 5. 组件清单（语义类名，与设计系统一一对应）

| 组件 | 类名 | 交互物理 |
|---|---|---|
| 物理按键 | `.btn` / `.btn--primary` / `.btn--ghost` | hover 提亮；`:active` `translateY(2px)` + 阴影反相（150ms） |
| 分段切换键 | `.seg button` | `aria-pressed="true"` → 凹陷 + 深色文字 |
| 心情 / 忌口标签键 | `.key` | 选中：橙红填充 + 辉光；忌口键选中为深色凹陷 |
| 步进器 | `.stepper` | 圆形按键 + 绿色数码读数窗（`--dark` 底 + 内阴影） |
| 输入槽 | `.well` | 凹陷；`:focus-within` 出现 2px 橙色聚焦环 |
| 模块面板 | `.panel--bolted` | 螺丝 + 散热槽 + 虚线分割抬头 |
| 盲盒模块 | `.box-card` | 机盖滑开；被选中：橙红描边 + LED + 斜贴纸；未选中 `.is-dim` |
| 小票托盘 | `.tray` | 深凹陷 + 图钉 + `drop-shadow`；小票 `receipt-feed` 出纸动画 |
| 工序块 | `.step` | 深色工序号「金属牌」+ hover 抬升 |

交互状态**只有一个真源**：`aria-pressed` / `:focus-visible` / `:active`。样式里没有任何 `is-active` 之类的影子状态，避免无障碍状态与视觉状态漂移。

## 6. 响应式

| 断点 | 变化 |
|---|---|
| `≤1024px` | Hero 由 60/40 改为上下堆叠（文案在前、设备在后）；工序 5 列 → 2 列；管道隐藏 |
| `≤768px` | 盲盒卡片 3 列 → 1 列；约束栅格 2 列 → 1 列；状态条 4 列 → 2 列；主按钮占满整行；章节间距 96 → 64px |
| `≤520px` | 标题降到 2.25rem；屏幕读数缩小 |

触控目标：所有可交互元素最小高度 **48px**（`.key` 为 44px + 8px 间距，符合移动端最小触达面积）；`.actions .btn` 在移动端各占半行。

实测（`--window-size` 390 / 768 / 1440，探针页读真实值）：三档宽度 `scrollWidth < innerWidth`，**无横向溢出**，无任何元素越出视口；小票在托盘内左右间距对称（12px / 12px）。

## 7. 无障碍

- 焦点可见：所有交互元素 `:focus-visible` 用「底盘色 2px + 安全橙 2px」双层环，在任何底色上都可见。
- 状态语义：心情键、忌口键、分段开关、盲盒卡片全部使用 `aria-pressed`；LED 是纯装饰，标了 `aria-hidden`。
- 语音祝福走浏览器 `speechSynthesis`；不支持的浏览器给文案兜底而不是静默失败。
- 动效：`prefers-reduced-motion: reduce` 时把所有动画/过渡压到 0.001ms，机盖改为直接切换。
- 颜色不承担唯一信息：选中态同时有描边 + 辉光 + 位置，不只靠颜色。

## 8. 如何扩展

1. **新增组件**：先在 `:root` 找现成 token；确实需要新颜色时，只允许加在「材质 / 状态」两类里，不要再造第二个强调色。
2. **新增情绪**：只改 `engine/content.js`（见 `references/emotion-matrix.md` 第 4 节），页面无需改动——心情键是遍历 `MOODS` 渲染的。
3. **改小票配色**：改 `engine/receipt.js` 顶部的 `C` 对象，然后跑 `node engine/cli.js export-refs && node engine/cli.js export-examples` 重新生成派生产物，再执行 `npm test` 确认版式自检仍为 0 问题。
4. **上线前自检**：`npm test`（58 项约束断言 + 528 张小票版式检查），再用浏览器打开 `web/index.html` 确认控制台没有自检报错。

## 9. 已知取舍

- 碳纤维与噪点没有使用外部纹理图（设计系统原文引用了 `transparenttextures.com`），改为 CSS / 内联 SVG 自绘：离线可用、零请求、不会因为外链失效而掉质感。
- Google Fonts 是可选的渐进增强；在内网或受限网络下页面仍按系统字体正确排版。
- 设计系统的示例代码是 React + Tailwind + Framer Motion + lucide-react；本仓库是零依赖静态页，因此只迁移**视觉与物理结论**，不迁移框架与依赖。图标用 Unicode / 内联 SVG 表达，未引入图标库。
