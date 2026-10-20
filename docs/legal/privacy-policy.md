# 隐私政策 · PageSew

> **适用产品**：PageSew（Chrome 扩展，原名 Markdown Reader，版本 1.3.0）
> **版本**：v1.3.0-draft（本地稿）
> **最后更新：2026-10-20；生效日：首次公开发布日**
> **发布者**：yiyan-yixing（一言一行）
> **联系方式**：联系邮箱：yiyanyixing880@gmail.com ｜ https://github.com/yiyan-yixing/markdown-reader

---

## 摘要

PageSew 是一个在浏览器里阅读 Markdown 文件的扩展：它把 `.md` 文件（本地文件，以及 GitHub / GitLab / Bitbucket 上的 Markdown）渲染成带目录、文件树和主题的阅读界面，并可以选择性地接入你自己的 AI 模型做翻译与摘要。

本扩展的设计原则是**默认不收集**：

- **没有开发者运营的服务器**，扩展没有任何后端；
- **没有账号系统**；
- **没有 analytics / telemetry、没有广告、没有追踪**；
- **全部功能免费**，没有付费版本，没有收费功能；
- **不向开发者上传你的文档内容**。

唯一会离开你浏览器的**用户内容**，是你在**主动使用 AI 翻译/摘要**时，由浏览器直接发给你**自己配置的模型服务**的文本。这条链路不经过开发者。

---

## 1. 单一用途

本扩展的单一用途（single purpose）是**增强 Markdown 文档的阅读与渲染体验**。AI 翻译/摘要、文件树侧边栏、主题切换等，都是服务于这一阅读体验的子能力，不是独立目的。

---

## 2. 数据地图（7 类）

下表列出本扩展涉及的全部数据类别。逐项说明见第 3 节。

| # | 数据类别 | 何时产生 | 存放位置 | 去向 | 开发者是否接触 |
|---|----------|----------|----------|------|----------------|
| 1 | 页面 Markdown 文本 | 打开/拦截 Markdown 页面时 | 不持久化，仅内存中渲染 | 不上传 | 否 |
| 2 | 你选中的文本 | 你触发 AI 翻译/摘要时 | 不持久化 | 直发你配置的 AI endpoint | 否 |
| 3 | AI 模型 API Key | 你在设置中填写时 | `chrome.storage.local`（键名 `mdReaderApiKey`，明文） | 仅随 AI 请求发给你配置的 endpoint | 否 |
| 4 | 设置 | 你调整主题、字号、布局、AI 配置等时 | `chrome.storage.sync`（键名 `mdReaderSettings`） | 若开启 Chrome 同步，同步到你自己的 Google 账号 | 否 |
| 5 | 你配置的 AI endpoint（baseUrl） | 你在设置中填写时 | 同上，位于 `mdReaderSettings` 内 | 作为 AI 请求的目标地址 | 否 |
| 6 | GitHub / GitLab / Bitbucket 请求 | 阅读远程 Markdown、加载目录列表时 | 不持久化 | 对应站点及其 API | 否（浏览器直接发出） |
| 7 | AI 输出 | AI 请求返回时 | 仅当前页面内存中显示，不写入扩展存储 | 无 | 否 |

---

## 3. 逐项说明

### 3.1 页面 Markdown 文本

- **处理方式**：扩展读取当前页面的 Markdown 文本，在本地完成渲染、目录生成、代码高亮、搜索等。
- **不持久化**：渲染结果只存在于当前页面，不写入扩展存储。
- **不上传**：这些内容不会发送给开发者，也不会发送给任何第三方（除非你另外主动触发 3.2 的 AI 功能）。

### 3.2 你选中的文本

- 只有在你**主动**选中一段文字并点击「翻译」或「总结」时，这段文本才会被处理。
- 文本由浏览器**直接从你的设备**发送到**你自己配置的 AI endpoint**（见 3.5）。请求体包含待处理文本，以及完成该任务所需的指令内容。
- 扩展不经过开发者的服务器中转，开发者不拦截、不存储、不查看这些内容。
- 该请求同时受你所选 AI 服务商自身条款与隐私政策约束。

### 3.3 AI 模型 API Key

- **存储**：保存在 `chrome.storage.local` 的 `mdReaderApiKey` 中，**以明文形式存储**。这是浏览器本地存储，不是加密保险箱。
- **不同步**：该 Key 不进入 `chrome.storage.sync`，不会随 Chrome 同步到 Google 账号。
- **不进入页面脚本**：只有后台 service worker 读取它；content script（页面内的阅读界面脚本）拿不到 Key 的值，只能向 service worker 询问「是否已配置」。
- **传输**：仅在你触发 AI 功能时，随请求发送到**你自己配置的 AI endpoint**，按其要求放在 `Authorization: Bearer` 或 `x-api-key` 请求头中。扩展不会把它发给开发者或任何其他地址。
- **建议**：请使用可随时吊销、权限范围受限的 Key；不要复用高权限主账号 Key。

### 3.4 设置

- **存储**：保存在 `chrome.storage.sync` 的 `mdReaderSettings` 中。
- **内容**：主题、字号、内容宽度、是否居中、是否显示大纲、是否显示文件树、自动刷新、自定义 CSS、插件开关，以及 AI 相关配置（服务商 / 接口类型 / baseUrl / 模型），还有翻译目标语言、划词翻译开关、摘要开关。
- **同步说明**：如果你在 Chrome 中开启了同步，这些设置（包括你配置的 AI endpoint 地址，**但不包括 API Key**）会通过 Chrome 同步到你自己的 Google 账号。该同步由 Google 提供并受 Google 的条款与隐私政策约束，不经过开发者。
- 自定义 CSS 同样只存在于上述设置中，不联网。

### 3.5 你配置的 AI endpoint

- 你可以在设置里填写任意兼容的模型服务地址（例如 OpenAI 兼容的 chat completions 接口、Anthropic messages 接口，或本机 Ollama / LM Studio 等）。
- 该地址保存在上述 `mdReaderSettings` 中。
- 扩展只把它当作请求目标使用，不另行上报、不向开发者披露。
- 对公网 endpoint 的访问权限在运行时通过 `optional_host_permissions` 向你申请；你可以拒绝，拒绝后 AI 功能不可用，其余功能不受影响。

### 3.6 GitHub / GitLab / Bitbucket 请求

- 阅读这些站点上的 Markdown 时，扩展会请求对应的原始文件地址（`raw.githubusercontent.com`、`gitlab.com`、`bitbucket.org`），并在需要文件树时请求 GitHub 目录列表接口（`api.github.com`）。
- 这些请求由浏览器正常发出。**浏览器是否附带你已登录站点既有的会话信息，由浏览器自身的 cookie 策略决定**；本扩展不读取、不使用这些会话信息，开发者也接触不到。
- 请求结果只用于当前页面渲染或侧边栏展示，不写入扩展存储。

### 3.7 AI 输出

- AI 返回的内容只显示在当前页面的结果面板中，**不写入扩展存储**，也不会自动上传或分享。
- 只有你主动点击复制，内容才会进入剪贴板并离开页面。

---

## 4. 网络请求目的地

本扩展只向下列目的地发起请求，**没有其他外联**：

| 目的地 | 用途 | 触发条件 |
|--------|------|----------|
| `raw.githubusercontent.com` | 获取 GitHub 上的原始 Markdown | 打开 GitHub Markdown 页面并点击阅读，或直接访问原始地址 |
| `gitlab.com` | 获取 GitLab 上的原始 Markdown | 同上 |
| `bitbucket.org` | 获取 Bitbucket 上的原始 Markdown | 同上 |
| `api.github.com` | 获取仓库目录列表（文件树） | 打开侧边栏文件树 |
| 你配置的 AI endpoint | AI 翻译 / 摘要 | 你主动触发，且已配置模型 |
| `file://` | 读取本地 Markdown 文件 | 打开本地文件；**不联网** |

---

## 5. 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 保存设置与 API Key（见 3.3、3.4） |
| `sidePanel` | 提供文件树侧边栏 |
| `scripting` | 在你请求本地 file:// 目录的文件树时，于后台打开该目录页并读取其中的链接以生成文件树；不用于远程站点，也不读取页面正文。 |
| `declarativeNetRequest` | 仅用于第 6 节所述的本地请求头规则 |
| `host_permissions`：`https://raw.githubusercontent.com/*`、`https://gitlab.com/*`、`https://bitbucket.org/*`、`file:///*` | 获取远程原始 Markdown、渲染本地文件 |
| `optional_host_permissions`：`http://*/*`、`https://*/*` | 运行时按需申请，仅用于你配置的 AI endpoint；不申请则不授予 |

---

## 6. `declarativeNetRequest` 的精确用途

本扩展在 **service worker 启动时**注册一条 **session 规则（id `1001`）**，事实如下：

- **动作类型**：`modifyHeaders`；
- **只处理请求头**：对 `Origin` 请求头执行 `remove`；
- **生效范围**：`requestDomains` 为 `localhost`、`127.0.0.1`、`0.0.0.0`；`initiatorDomains` 为**本扩展自身**（`chrome.runtime.id`）；`resourceTypes` 为 `xmlhttprequest`、`other`。

也就是说：**它只会移除「本扩展自己发往这三个本地主机」的请求中的 `Origin` 请求头**，目的是让本地运行的模型服务（如 Ollama、LM Studio）接受来自扩展的请求。

它**不会**：

- 修改任何响应头；
- 读取请求体或响应体；
- 作用于任何公网域名或其他站点；
- 读取、修改或转发 cookie、令牌、凭证；
- 拦截或记录你的浏览流量。

该规则是会话级规则，浏览器重启后由 service worker 重新注册；它不修改你的系统或浏览器全局设置。

---

## 7. 数据保留与删除

| 数据 | 保留至 | 如何删除 |
|------|--------|----------|
| API Key | 你删除或卸载扩展 | 在扩展设置中清除；卸载扩展会清除 `chrome.storage.local` |
| 设置（含 AI endpoint） | 你删除或卸载扩展 | 在扩展设置中恢复默认；同步副本可在 Chrome 同步设置中管理 |
| 页面文本、选中文本、AI 输出 | 不保留 | 关闭页面即消失 |

说明：卸载扩展会清除本机的 `chrome.storage.local`；已同步到 Google 账号的设置副本是否保留，取决于你的 Chrome 同步设置，可在 Google 账号的同步管理中删除。

---

## 8. 第三方

本扩展不集成任何分析、广告或追踪 SDK。与你数据相关的第三方只有以下几类：

| 第三方 | 关系 | 说明 |
|--------|------|------|
| 你选择的 AI 服务商 | 你与其直接建立请求关系 | 你触发 AI 功能时，文本与 API Key 由浏览器直接发往该服务；其处理行为受其自身条款约束 |
| GitHub / GitLab / Bitbucket | 你访问的站点 | 扩展仅按正常方式请求原始文件与目录列表 |
| Google（Chrome 同步） | 仅当你开启同步 | 设置（不含 API Key）同步到你自己的 Google 账号 |

除此之外没有其他第三方数据流向。

---

## 9. 国际用户

- 本扩展不收集个人身份信息，没有账号，也没有面向开发者的数据传输，因此开发者侧不存在需要跨境传输的用户数据。
- 若你开启 Chrome 同步，设置数据由 Google 按其条款处理；若你使用 AI 功能，文本由你与服务商之间直接处理。两者都不经过开发者。
- 如你对本政策有疑问，可通过第 12 节联系。

---

## 10. 儿童隐私

本扩展面向一般开发者与技术文档读者，不针对儿童设计，也不会有意收集儿童的个人信息。由于扩展没有账号系统、没有分析上报，开发者不会获得任何用户的个人数据。

---

## 11. 政策变更

本政策可能随扩展版本更新。变更时我们会更新本页的版本号与生效日期；重要变更会在扩展说明页或代码仓库中提示。历史版本保留在仓库的 git 历史中。

---

## 12. 联系我们

- 邮箱：yiyanyixing880@gmail.com
- 仓库 / Issues：https://github.com/yiyan-yixing/markdown-reader

---

## 13. Key Clauses (English Summary)

This summary is for international readers. If there is any conflict, the Chinese text above prevails.

- **Single purpose**: PageSew renders Markdown files (local files and pages on GitHub / GitLab / Bitbucket) in a reading interface with outline, file tree and themes. AI translation and summarization are sub-features serving that purpose.
- **No developer server**: the extension has no backend of its own. There is no account system, no analytics or telemetry, no advertising, no tracking, and no paid tier — every feature is free.
- **Page text**: read and rendered locally; never uploaded to the developer and never stored by the extension.
- **Selected text**: sent only when you actively trigger AI translation or summarization, directly from your browser to the AI endpoint you configured. The developer does not relay, intercept or store it.
- **API key**: stored in plain text in `chrome.storage.local` (key `mdReaderApiKey`). It is not synced, is never exposed to the in-page content script, and is read only by the background service worker. It is sent only to the AI endpoint you configured, as `Authorization: Bearer` or `x-api-key`.
- **Settings**: stored in `chrome.storage.sync` (key `mdReaderSettings`) — theme, font size, content width, centering, outline, file tree, auto-refresh, custom CSS, plugin toggles, AI service / interface type / base URL / model, target language, translation switch and summary switch. If you enable Chrome sync, they sync to your own Google account under Google's terms; the API key is never included.
- **AI endpoint**: the base URL you enter is stored in the same synced settings and used only as the request target. Host access to it is requested at runtime through `optional_host_permissions`.
- **Remote requests**: only to `raw.githubusercontent.com`, `gitlab.com`, `bitbucket.org` (raw Markdown) and `api.github.com` (directory listing). Whether the browser attaches your existing site sessions is decided by the browser; the extension does not read them and the developer never sees them. Local `file://` reading makes no network request.
- **AI output**: displayed in the current page only, never written to extension storage. It leaves the page only if you copy it yourself.
- **declarativeNetRequest**: a single session rule (id `1001`) with action `modifyHeaders` that removes the `Origin` **request** header. It applies only to this extension's own requests to `localhost`, `127.0.0.1` and `0.0.0.0`, for `xmlhttprequest` and `other` resource types — so that local model servers (Ollama, LM Studio, …) accept the request. It does not modify response headers, does not read request or response bodies, never touches public domains, and never reads cookies or credentials.
- **Deletion**: uninstalling the extension clears its local storage. Synced settings may remain in your Google account until you remove them in Chrome's sync settings. AI output is not retained.
- **Contact**: yiyanyixing880@gmail.com; issues can also be opened at https://github.com/yiyan-yixing/markdown-reader.

---

<!-- 内部备注（发布前处理，勿对外呈现）
1. 支持邮箱：已使用 yiyanyixing880@gmail.com（2026-10-20 董事长拍板），页首与第 12 节均已替换。
2. 生效日期：正文已统一为「最后更新：2026-10-20；生效日：首次公开发布日」；版本号 v1.3.0-draft 在正式发布时改为 v1.3.0。
3. 发布方式与托管地址未定：本文件仅为本地稿，不发布、不购买域名。
4. 仓库链接需确认公开可访问：https://github.com/yiyan-yixing/markdown-reader
5. eu-withdrawal-consent.md 与 ai-disclaimer.md 已完成免费版清理（2026-10-20）：删除第三方销售服务商、许可证密钥、付费版本与欧盟撤回权放弃文案，改为免费版说明。
6. 若未来重新引入任何收费功能，本政策与 refund-policy.md 需同步重写，并在此之前不得对外承诺。
-->
