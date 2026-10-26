# PageSew 宣称缺口 · QA 证据表（2026-10-20）

> 对应底稿：`corp/plans/claims-2026-10-20.csv` 中 markdown-reader 的 31 条。
> 本表只记录**本次真实执行过**的证据。没有测试名 + 截图/结果 JSON 的条目不标 PASS。

## 如何复跑

```bash
cd eng/markdown-reader

# 真实扩展（--load-extension，无 chrome.* mock；36 条，含 1 条安全回归）
node tests/e2e-real-extension.test.js

# 原有注入式回归（30 条）
cd tests && HEADLESS=true node markdown-reader.test.js

# 两套一起
bash run-tests.sh
```

- 真实扩展套件启动参数：`channel: 'chromium'` + `--disable-extensions-except=<repo>` +
  `--load-extension=<repo>` + `--allow-file-access-from-files`。
- 证据目录：`tests/evidence/2026-10-20/`（截图 + `results.json`）。
- 最终结果：**真实扩展 36/36 PASS；原有回归 30/30 PASS；合计 66/66 PASS**
  （`tests/evidence/2026-10-20/results.json`，2026-10-20 最后一次全量运行）。

## 第一批：17 条“已实现、需复验”

| ID | 状态 | 测试名（真实扩展） | 关键 DOM / 行为断言 | 证据截图 |
|---|---|---|---|---|
| MR-001 | PASS | `MR-001 Three-panel layout with independently collapsible sidebars` | 三栏 rect 宽度 >100/200/100 且 x 顺序 tree<content<outline；单独点 toggle-tree 只折叠左栏，再点 toggle-outline 两栏均折叠 | `MR-001-three-panel.png` |
| MR-002 | PASS | `MR-002 Smart interception: file:// auto, raw .md auto, GitHub blob button` | `file://…features.md` 自动出现 `#md-reader-root` 且含 “Feature Fixture”；本地 HTTP `.md` 同样自动渲染；GitHub blob（route 提供页面）出现 `#md-reader-fab` 文案 “Read in Reader”，点击后 `#md-reader-root` 出现且正文为 SW 抓回的 “Routed Doc” | `MR-002-github-blob-button.png`、`MR-002-blob-reader.png` |
| MR-003 | PASS | `MR-003 GFM tables, task lists, strikethrough, autolinks` | `table tbody tr`=3；复选框 checked 状态 `[true,false,false]`；`del`≥1；`a[href="https://example.org/auto"]` 与 `mailto:` 链接存在 | `MR-003-gfm.png` |
| MR-004 | PASS | `MR-004 Outline from h1-h6 + click scroll + scroll tracking` | 目录条目含 h1/h2/h3 层级类；点 “Scroll Filler” 后 `.md-content.scrollTop>100`；滚动后 `.md-outline-item.active` 命中当前标题 | `MR-004-outline.png` |
| MR-005 | PASS | `MR-005 Center Document Content` | 默认 `.md-centered`，左右 margin 相等且 >0；关闭后 class 移除、左 margin≈0 | `MR-005-center.png` |
| MR-006 | PASS | `MR-006 Custom content width 400–2000px` | 弹窗输入 400/2000 后 `.md-content-inner` computed `max-width` 精确为 400px/2000px | `MR-006-width.png` |
| MR-007 | PASS | `MR-007 Font size 12–28px controls with clamping` | 默认 16px；A+×12 后 28px；A-×20 后 12px（越界不变） | `MR-007-font.png` |
| MR-008 | PASS | `MR-008 Search with match count and Enter/Shift+Enter navigation` | 计数 `1/N` 且高亮 >5；Enter→`2/N`；Shift+Enter→`1/N`；Escape 后高亮 0、输入框清空 | `MR-008-search.png` |
| MR-009 | PASS | `MR-009 Copy code button copies exact code text` | 点击 Copy 后按钮含 “Copied”，`navigator.clipboard.readText()` 与 `<code>` 文本完全相等 | `MR-009-copy.png` |
| MR-010 | PASS | `MR-010 Keyboard shortcuts: Cmd/Ctrl+F, Enter, Shift+Enter, Escape` | Cmd/Ctrl+F 后 activeElement 是 `.md-search-input`；Enter/Shift+Enter 改变 n/m；Escape 清空高亮 | `MR-010-shortcuts.png` |
| MR-011 | PASS | `MR-011 Collapsible sidebars individually and hide-all` | 单独折叠左/右栏；Toggle All 后两栏均 `md-collapsed`，再点按 settings 恢复 | `MR-011-sidebars.png` |
| MR-012 | PASS | `MR-012 Responsive overlays at <=960px (outside click / ESC dismiss)` | 视口 900px 时根节点 `md-narrow`；左栏点开有 `md-sidebar-mobile-open`；点正文外部移除；再次打开后 Escape 移除 | `MR-012-responsive.png` |
| MR-013 | PASS | `MR-013 Loading overlay while fetching GitHub blob, removed on render` | 点击 Read in Reader 后 `#md-reader-loading` 可见且文案 “Loading markdown…”，渲染完成后元素被移除，正文出现 “Loading Fixture” | `MR-013-loading-overlay.png`、`MR-013-rendered.png` |
| MR-014 | PASS | `MR-014 Heading anchor hover + click copies permalink and scrolls` | 锚点≥5；剪贴板 = `origin+pathname+#md-heading-0`；点击后 h1 顶边与内容区顶边差 <6px | `MR-014-anchor.png` |
| MR-015 | PASS | `MR-015 Go-to-top appears after 640px and returns to top` | 初始 `md-fab-hidden`；滚动 >640 后隐藏类移除；点击后 scrollTop<5 | `MR-015-go-top-visible.png`、`MR-015-go-top-clicked.png` |
| MR-016 | PASS | `MR-016 Seven themes apply data-theme and distinct --md-bg` | 弹窗依次点 7 个主题，`data-theme` 逐一匹配；7 组主题调色板（bg/primary/accent/sidebar 组合）互不相同 | `MR-016-theme-dracula.png` |
| MR-027 | PASS | `MR-027 AI translate + whole-document summarize over the real SW proxy` | 配置本地 OpenAI 兼容端点；划词→popover→翻译，结果面板出现流式 “MOCK-TRANSLATION”；SW 实际 POST `/v1/chat/completions`，`model=mock-model`、`stream=true`；工具栏 ✨ 总结发出第二次请求且 prompt 含 Overview/Key points/Action items | `MR-027-ai.png` |
| MR-027（权限时机缺口） | PASS | `MR-027b Host permission is ensured on vendor, key, test and config-close` | 包装真实 `chrome.permissions.request/contains` 记录调用：vendor 切换→deepseek origin；Key/Base URL 保存→127.0.0.1 origin；测试连接→再次确保；关闭配置页→新增调用后才发 `aiConfigDone` | 无截图（记录在 SW `storage.local.__permCalls`，断言见测试） |

## 第二批：真正未实现 / 部分（已实现并补证据）

| ID | 状态 | 测试名（真实扩展） | 关键断言 | 证据截图 |
|---|---|---|---|---|
| MR-017 | PASS | `MR-017 Auto theme follows prefers-color-scheme + three-state toolbar cycle` | 新装 `data-theme-mode=auto`；仅有 `{fontSize:15}` 的旧设置保持 fixed/light（不会误切 auto）；emulate dark/light 时 `data-theme` 实时跟随；工具栏 auto→light→dark→auto；popup Auto 按钮写入 auto | `MR-017-auto-theme.png` |
| MR-018 | PASS | `MR-018 Auto-refresh re-reads the file, preserving scroll and search` | file:// 文档修改后 8s 内正文从 V1→V2；搜索词 “body” 与高亮保留；scrollTop 保持 40（未被 smooth scroll 拉回 0） | `MR-018-auto-refresh.png` |
| MR-019 | PASS | `MR-019 Per-extension markdown plugin options (tables / tasks / strike / autolinks)` | popup 四个复选项逐一切换后：table→0、任务复选框→0（保留 `[ ]` 字面量）、`del`→0、bare-URL 链接→0；storage 中 `pluginOptions.gfmTables=false`；页内设置面板同样有 4 个开关；额外用嵌套列表/松散列表 fixture 验证关闭任务列表后不崩溃、嵌套层级仍渲染、`[x]` 保留为字面量 | `MR-019-plugin-options.png` |
| MR-020 | PASS | `MR-020 Custom CSS enable flag is separate from the CSS string (plus migration)` | 写入 CSS 后 h1 颜色变红；点开关关闭后颜色复原但 `customCSS` 字符串与 textarea 内容完整保留；再开启恢复；把 `customCSS:false` 的损坏值迁移为 `customCSS=''` + `customCSSEnabled=false` | `MR-020-custom-css.png` |
| MR-021 | PASS | `MR-021 Every settings toggle has an observable effect` | 11 个开关逐一验证：customWidth（清空/恢复 inline max-width）、adjustFont（锁 16px/恢复）、allPlugins（GFM 四类全部消失/恢复）、pluginOptions（四个布尔全 false/全 true）、showFileTree/showOutline（对应栏折叠）、centerContent（class 移除/恢复）、autoRefresh（指示条显隐）；AI 两项见 MR-021b | `MR-021-toggles.png` |
| MR-021（AI 两项） | PASS | `MR-021b AI feature toggles gate translate and summarize` | 关闭总结后点 ✨ 不发请求且正文提示已关闭；关闭翻译后划词 popover 不显示“翻译”按钮 | `MR-021b-ai-toggles.png` |
| MR-022 | PASS | `MR-022 External link opens the original page per source type` | file:// → 新标签 `view-source:file://…`；raw URL → `…?pagesew=original` 且该标签不挂载 reader；GitHub blob → `chrome.tabs.create` 实际打开 blob 原页 | `MR-022-external-link.png` |
| MR-023 | PASS | `MR-023a Local file tree lists sibling files and navigates`；`MR-023b GitHub / GitLab / Bitbucket trees use provider APIs`；`MR-023c Tree failure shows an explicit empty state with Retry`；`MR-023d Provider paths with spaces are encoded exactly once` | 本地树列出 `features.md`/`other.md` 且点击切换正文与 URL；GitHub Contents API、GitLab `/repository/tree`、Bitbucket `/2.0/repositories/.../src` 三种 provider 均列出 `more.md` 与目录；API 500 时显示 “GitHub API error (500)” + Retry；含空格目录 `my%20dir` 的 API 请求只编码一次（无 `%2520`）且 current 命中 | `MR-023-local-tree.png`、`MR-023-providers.png`、`MR-023-tree-error.png` |
| MR-024 | PASS | `MR-024 Side panel browser lists cached reader files and navigates` | content 对 `requestFileTree` 返回缓存（≥2 项）；真实 `sidebar.html` 文档列出 features.md/other.md；点击 other.md 使阅读标签页跳到 “Other File”；工具栏 `browse-files` 与弹窗 `#popupBrowseFiles` 入口存在；`MR-024b` 额外验证未挂载 reader 的 blob 页不会被当成 reader、侧栏点击远程文件 soft-render（URL 仍停在 blob 页）且当前文件标记刷新；`MR-024c` 验证快速连点两个文件时慢响应不会覆盖后一次点击 | `MR-024-side-panel.png`、`MR-024b-remote-panel.png`、`MR-024c-nav-race.png` |
| MR-025 | PASS | `MR-025 TOC headings clamp to two lines with an ellipsis` | 长标题计算样式 `-webkit-line-clamp=2`、`white-space=normal`，高度 >1 行且 ≤2 行+padding，短标题更矮 | `MR-025-outline-clamp.png` |
| MR-026 | PASS | `MR-026 TOC indentation steps by 0.618em per heading level` | h1 padding-left=14px；h2..h6 每一级都必须存在，相邻级增量 = 8.034px（0.618 × 13px），误差 <0.2px | `MR-026-golden-indent.png` |
| SEC-001（附加） | PASS | `SEC-001 Markdown cannot claim reader ids/names or inject inline styles` | 恶意 markdown 中的 `id`/`name`/`style` 被 DOMPurify 剥离；`#md-ai-popover` 仍由扩展创建、`#md-outline` 仍正常生成、无脚本执行 | `SEC-001-sanitize.png` |
| MR-028 | PASS | `MR-028 highlight.js adds tokens and theme-specific colors` | 代码块有 `hljs` class 与 ≥3 个 token span；keyword/string 颜色不同；切换全部 7 个主题后每个主题都有非空 keyword 色且随主题变化 | `MR-028-highlight.png` |

## 保持“开发中”，本次未实现（继续保留 Roadmap 文案）

| ID | 状态 | 说明 |
|---|---|---|
| MR-029 | 未完成（按设计保留开发中） | KaTeX 未实现；仍只出现在 “More Features in Development”。没有新增可用宣称。 |
| MR-030 | 未完成（按设计保留开发中） | Mermaid 未实现；同上。 |
| MR-031 | 未完成（按设计保留开发中） | PDF 导出未实现；同上。 |

## 剩余阻断

**0 条**。31 条中 28 条 PASS、3 条（MR-029/030/031）按 CSV 原计划保持“明确开发中”，不阻断上架；本次没有删除任何 Roadmap 文案，也没有新增未实现的宣称。

## 独立代码审查与修复

- 审查由独立子任务执行（实现者不自审）。结论：**P0 = 0**；**P1 = 1**。
- P1（已修复）：关闭 Task lists 后，自定义 list-item renderer 用 `parseInline` 处理含块级 token 的列表项会抛异常（嵌套列表/松散列表常见于 README），导致 reader 不挂载。改为 `parser.parse(tokens, loose)`，新增 `tests/fixtures/nested.md` 与 MR-019 回归断言。
- 第二轮独立复审：确认 P1 已解决、无新增 P0/P1；发现 4 条新 P2（auto 切换后图标家族未同步、provider 路径双重编码、文件树与导航响应乱序、side panel current 不刷新），均已修复并补 MR-017/MR-023d/MR-024b/MR-024c 回归。
- 同轮修复的 P2：非 file:// 页面不再显示自动刷新指示器；命名主题图标按明暗家族显示；sidebar 目录点击不再双重 toggle；未挂载 reader 的 blob 页不再被 side panel 当成 reader；side panel 远程文件走 raw 并 soft-render；DOMPurify 禁止 `id/name/style`（防 UI 劫持）；AI 上游流在 Port 断开时 abort；provider 路径分段编码 + GitLab 子域；文件树竞态丢弃过期结果；页内设置广播/数值 clamp。
- 明确未修、留作已知风险：`customCSS` 的 sync 配额、分支名含 `/` 的 provider URL 解析、provider 分页/限流、真实 side panel UI 与真实厂商授权的人工验证。
- 安全取舍：DOMPurify 禁用 `id/name/style/data-action` 会连带去掉作者自定义的 HTML 锚点；标题锚点（`md-heading-*`）由扩展在净化后生成，不受影响。

## 仍存风险 / 未覆盖边界

1. **真实外网被当前环境阻断**（raw.githubusercontent.com 超时）。因此 GitHub/GitLab/Bitbucket 的**真实 API/CORS/限流**未实测：provider 流程用 Playwright route 返回真实形状的 JSON 验证，blob 抓取只 stub 了 SW 的网络跳转，其余（消息、渲染、树、错误态）均为真实扩展执行。GitHub 未认证 API 有 60 次/小时限流，失败时会走明确的空态 + Retry。
2. **Chrome 侧边栏 UI 无法在 headless 驱动**。已真实加载 `sidebar.html`、真实走 SW `getActiveReaderTree` / content 缓存 / 点击导航；`chrome.sidePanel.open` 本身只在有用户手势时可用，SW 失败时会回退为打开同一文件浏览器标签页。建议上架前人工点一次工具栏/弹窗入口做最后确认。
3. **AI 真实厂商端点未实测**（无 Key）。已用本地 OpenAI 兼容 SSE 服务器验证 SW 代理、流式解析、prompt 与端点拼接；权限调用在 headless 无法真正弹窗授权，因此用**委托式包装**记录真实 `chrome.permissions.*` 调用顺序（不是 fake 返回值）。首次真实授权体验需人工验证。
4. **Auto 主题**用 Playwright `emulateMedia({colorScheme})` 模拟系统配色，真实 macOS/Windows 切换路径相同（`matchMedia` change 事件已监听）。
5. **raw URL 的“原页”**：部分 Chrome 构建会剥离 `view-source:http(s)`，因此 raw 原页使用 `?pagesew=original` 标记，content 检测到该参数不再拦截。file:// 仍用 `view-source:`。
6. **自定义 CSS 在严格 CSP 页面**（如 GitHub）可能被页面 CSP 拦截 `<style>` 注入；本地/raw 文件已验证。若实测被拦，可改用 `chrome.scripting.insertCSS`（会新增 `scripting` 权限调用面，需另行评估）。
7. **Custom CSS 使用 `chrome.storage.sync` 单条 8192 字节配额**：超长 CSS 保存会失败（当前无 UI 报错）。属于已知限制，必要时后续迁到 `storage.local`。
8. **Provider 分支名含 `/`**（如 `feature/docs`）无法从 URL 可靠解析；目录与文件名已做分段编码，GitLab 自建子域已支持。超 100 条目录未分页（GitLab/Bitbucket），GitHub 未认证 API 60 次/小时。
9. **manifest 权限未扩大**：本次只向 `content_scripts.css` 增加本地 `hljs-light.css`/`hljs-dark.css`，`permissions` / `host_permissions` / `optional_host_permissions` 与**本次任务开始时的工作区状态**逐字一致（工作区另有先前遗留的改名/法务改动，未由本次触碰）。

## 测试总数与命令

| 套件 | 数量 | 结果 | 命令 |
|---|---|---|---|
| 真实扩展 E2E | 36 | 36 PASS / 0 FAIL | `node tests/e2e-real-extension.test.js` |
| 原有注入式回归 | 30 | 30 PASS / 0 FAIL | `cd tests && HEADLESS=true node markdown-reader.test.js` |
| **合计** | **66** | **66 PASS / 0 FAIL** | `bash run-tests.sh` |

结果 JSON：`tests/evidence/2026-10-20/results.json`
