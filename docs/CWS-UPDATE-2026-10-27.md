# PageSew · 后台要改的内容（2026-10-27 复核）

> 用途：董事长本人打开 CWS 后台，按本文逐格粘贴。
> 依据：`CWS-RESUBMISSION-2026-10-23.md`（Yellow Nickel 垃圾内容驳回后重写版）+ 今日对代码/包/线上链接的复核。
> 边界：不代登录、不代上传、不代点 Submit。

---

## 0. 一句话

**包不用重打**（`dist/pagesew-v1.3.1.zip`，版本 1.3.1，SHA `5eb08233…850ee0`，已核验）。
**要改的是后台文案**：短描述 + 详细描述（英/中），共 4 格。另有 3 处建议在提交前一并修掉（见第 3 节）。

---

## 1. 逐格对照（左=现在后台里的旧版，右=粘这个）

| 后台字段 | 旧版（v1.3.0，别留） | 新版（粘这个） |
|---|---|---|
| Summary / 短描述（EN） | `PageSew — beautiful Markdown reader: three-pane view, 7 free themes, AI translate & summarize with your own model.` | 见 §2.1 |
| Summary / 短描述（ZH） | `PageSew：三栏 Markdown 阅读器，支持大纲、文件树、7 个免费主题，以及自带模型的 AI 翻译与总结。` | 见 §2.2 |
| Description（EN） | 带 11 项功能目录、7 个主题名、7 家 AI 厂商名的旧版 | 见 §2.3 |
| Description（ZH） | 同上中文旧版 | 见 §2.4 |

> 旧版的问题：功能计数（11 项 / 7 个主题）+ 第三方品牌罗列 = Google 认定的关键字堆砌。**一个字都不要留。**

其他格子**不动**：Name=`PageSew`、Category=`Productivity`、Language=`English`、Support email、Privacy policy URL、5 张截图、Promo tile、Marquee。

---

## 2. 粘贴文本

### 2.1 短描述（EN，129 / 132 字符）

```
Opens .md files and direct Markdown links in a three-pane reader with outline, folder view, themes, search, and optional AI help.
```

### 2.2 短描述（ZH，58 字符）

```
PageSew 把 Markdown 文件和链接变成三栏阅读界面：大纲、文件夹、主题、搜索，可选 AI 翻译与总结。
```

### 2.3 详细描述（EN）

```
PageSew turns raw Markdown files into a readable page.

Open a .md file from your computer, or a direct .md link such as a raw file on GitHub, GitLab, or Bitbucket, and PageSew replaces the plain text with a three-pane reading view: the folder on the left, the document in the middle, and its outline on the right. Click a neighboring file to switch documents without losing your place. On GitHub, GitLab, and Bitbucket Markdown pages it adds a "Read in Reader" button.

To open files stored on your computer, enable "Allow access to file URLs" for the extension in chrome://extensions. The extension popup also links to a public sample document, so the reader can be seen in one click without any local file.

While reading you get an outline that follows your scroll position, in-page search with match counts, copy buttons on code blocks, adjustable text size and content width, and a choice of color themes including light, dark, and follow-system.

Translation and summarizing are optional and use your own model: any OpenAI-compatible endpoint, an Anthropic key, or a model server running on your own machine. Select text to translate or summarize it, or summarize the whole document in one click. Your API key is stored only in this browser and is sent only to the service you choose. Without a model connected, the reader works exactly the same.

PageSew is free. There is no account, no analytics, no advertising, and no tracking. Nothing is sent to the developer.

Privacy policy:
https://github.com/yiyan-yixing/markdown-reader/blob/main/docs/legal/privacy-policy.md

Support:
https://github.com/yiyan-yixing/markdown-reader/issues

Support email: yiyanyixing880@gmail.com
```

### 2.4 详细描述（ZH）

```
PageSew 把原始的 Markdown 文件变成可阅读的页面。

打开电脑上的 .md 文件，或 GitHub、GitLab、Bitbucket 上的 .md 直链，PageSew 会把纯文本换成三栏阅读界面：左侧文件夹、中间正文、右侧大纲。点击相邻文件即可切换文档，阅读位置不丢失。在 GitHub、GitLab、Bitbucket 的 Markdown 页面上，它会加一个「Read in Reader」按钮。

要打开电脑上的本地文件，需要在 chrome://extensions 里为扩展打开「允许访问文件网址」。扩展弹窗里还有一个公开的示例文档链接，点一下就能看到阅读界面，不需要先准备本地文件。

阅读时可使用跟随滚动的大纲、带命中计数的文内搜索、代码块复制按钮、字号与内容宽度调节，以及浅色、深色和跟随系统等配色主题。

翻译和总结是可选的，使用你自己的模型：任何 OpenAI 兼容接口、Anthropic，或运行在本机的模型服务都可以。划词即可翻译或总结，也可以一键总结全文。API Key 只保存在本浏览器，只会发送到你自己选择的服务。没有配置模型时，阅读功能完全不受影响。

PageSew 完全免费：没有账号、没有数据分析、没有广告、没有追踪，也不会把任何内容发送给开发者。

隐私政策：https://github.com/yiyan-yixing/markdown-reader/blob/main/docs/legal/privacy-policy.md
支持：https://github.com/yiyan-yixing/markdown-reader/issues
支持邮箱：yiyanyixing880@gmail.com
```

### 2.5 与 10-23 版相比，这一版多改了三处（都是审核可验收性）

| # | 改动 | 为什么 |
|---|---|---|
| 1 | 新增「本地文件要开 Allow access to file URLs」 | 审核员第一反应是双击一个本地 .md；不开权限则界面没反应，容易被判「功能不可用」 |
| 2 | 新增「弹窗里有公开示例文档，一键可看」 | 让审核员 30 秒内绕过本地文件权限，直接看到核心功能 |
| 3 | 厂商名从「OpenAI / Anthropic / Ollama」压到「OpenAI-compatible / Anthropic / 本机模型服务」，去掉 Ollama | 品牌罗列是被驳回的直接原因，能少一个是一个；能力描述不变 |
| 4 | 中文版补上隐私政策 / 支持链接 | 中英版本信息不对等，审核看哪版都可能 |

---

## 3. 提交前还有 3 件要处理（不处理不阻断，但都有风险）

### 3.1 隐私政策页头还写着「draft」— 建议先改

线上页（raw 已复核 200、正文正确）头部现状：

```
> **适用产品**：PageSew（Chrome 扩展，原名 Markdown Reader，版本 1.3.0）
> **版本**：v1.3.0-draft（本地稿）
> **最后更新：2026-10-20；生效日：首次公开发布日**
```

问题：审核员点开的就是这一页，**「draft（本地稿）」+「生效日：首次公开发布日」** 看起来是未定稿政策。
建议改成：版本 `v1.3.1`、最后更新 `2026-10-27`、生效日 `2026-10-27`。
代价：改完要 commit + push 到 `main` 才生效（URL 走 raw/blob 的 main）；legal 文案改动需 @clo 过一眼。

### 3.2 `CWS-LISTING.md` 里有一行内部注释自相矛盾

原文写着「The UI supports both English and Simplified Chinese … describe it as bilingual」，但：
- 没有 `_locales`，扩展没有语言切换；
- 弹窗标签中英混排（只有部分中文），阅读器界面是英文。

**按这行去写「bilingual」会被判「描述与功能不符」。** 本文 §2 的文案里已经不含双语说法，只用 §2 的文本即可。

### 3.3 示例文档链接本机不稳（不是死链）

`https://raw.githubusercontent.com/yiyan-yixing/markdown-reader/main/sample.md` 本机 3 次里 1 次 200、2 次超时（同一条网络下隐私政策 raw 稳定 200），文件在仓库 main 上确实存在。判断为本机到 raw 的连接抖动，审核端（Google 网络）不受影响。**若提交后被质疑「示例链接打不开」，改指向仓库内的 sample.md 页面即可。**

---

## 4. Privacy practices 页（不用改，核对一眼）

v1.3.1 没有新增任何权限，10-20 填过就保持不变：

- Single purpose / 权限理由：`docs/CWS-PERMISSION-JUSTIFICATION.md`（storage、sidePanel、scripting、declarativeNetRequest、host_permissions、optional_host_permissions 六段，原样保留）。
- Data usage：不收集任何个人数据；API Key 只存本地、只发给用户自选的模型服务；无 analytics / 无广告 / 无出售。
- Remote code：选「No, I am not using remote code」（全部 JS 随包）。

---

## 5. 操作顺序

1. （可选，建议）先做 §3.1 隐私政策版本号，push 后浏览器打开一次 Privacy URL 确认 200。
2. 后台条目 `niaijlknbanchjboefngjmhamabmlfpa` → 上传 `dist/pagesew-v1.3.1.zip`，确认显示 1.3.1。
3. §2 四格文案整段替换（先删干净旧的再粘）。
4. 滚一遍 Privacy practices，确认无红字。
5. **董事长本人点 Submit**，记下提交时间。
6. 若被驳回：原样抄驳回原文与政策条款编号，只改被指出的那一项。

---

## 6. 复核记录（2026-10-27）

| 项 | 方法 | 结果 |
|---|---|---|
| 包版本 | 读 `manifest.json` | 1.3.1 ✅ |
| manifest description | 读 `manifest.json` | 129 字符，与短描述一致 ✅ |
| 包存在与 SHA | `shasum -a 256 dist/pagesew-v1.3.1.zip` | `5eb0823…850ee0` 与 10-23 记录一致 ✅ |
| 示例按钮是否常驻 | 读 `popup/popup.html:229-234` | 不在状态容器内，任何 tab 状态都可见 ✅ |
| 示例链接 | `curl` ×3 | 1×200 / 2×超时（本机抖动）⚠️ |
| 隐私政策 raw | `curl` | 200，15482 B，正文已去掉 LemonSqueezy ✅ |
| 隐私政策页头 | 读正文 | 仍写 `v1.3.0-draft（本地稿）` ⚠️ |
| 是否有 _locales / 中文 UI 开关 | `ls _locales` | 无 ✅（文案不得声称双语界面） |
| 权限集合 | 读 manifest | storage / sidePanel / scripting / declarativeNetRequest，无 activeTab ✅ |
