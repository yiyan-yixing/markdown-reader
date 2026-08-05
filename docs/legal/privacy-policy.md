# 隐私政策 · Markdown Reader / Markdown Reader Pro

> **级联追踪**：cascade-20260805-mdrp-linkvalidation
> **用途**：Chrome Web Store 强制要求的隐私政策 + 挂载到 GitHub Pages（@dev 负责挂载）
> **版本**：v1.0 ｜ **版本日期 / 生效日期**：2026-08-05
> **适用产品**：Markdown Reader / Markdown Reader Pro（Chrome 浏览器扩展，以下简称「本扩展」）
> **发布者**：yiyan-yixing（一言一行）
> **联系方式**：support@yiyan-yixing.com ｜ https://github.com/yiyan-yixing/markdown-reader

---

## 引言

本隐私政策说明「Markdown Reader / Markdown Reader Pro」（以下简称「本扩展」）如何处理数据。本扩展的单一用途（single purpose）是**增强 Markdown 文件的阅读与渲染体验**——包括本地 `.md` 文件、以及 GitHub / GitLab / Bitbucket 上的 Markdown 文档。扩展提供的 AI 翻译/摘要、智能渲染拦截等，均为服务于此阅读体验的子能力，而非独立目的。

**我们采用「默认不收集」的原则。** 本扩展不建立用户账号系统、不运行用户行为分析或产品埋点（analytics/telemetry）、不向扩展作者的服务器上传你所浏览的文档内容。下文逐项说明。

---

## 1. 我们不收集的个人数据

本扩展**不收集**以下类别的个人数据：

- ❌ **身份识别信息**（姓名、邮箱、电话、地址）——本扩展无账号系统
- ❌ **浏览历史或访问记录**——我们不对你访问的页面做埋点或上报
- ❌ **用户行为分析 / 产品用埋点**（无 analytics、无 telemetry、无转化追踪）
- ❌ **精确位置信息**
- ❌ **个人通信内容**
- ❌ **财务与支付信息**——支付相关信息（邮箱、信用卡等）由我们的支付服务商 **LemonSqueezy** 直接收集，本扩展作者不经手、不存储、不转发（详见第 3 节）

---

## 2. 本扩展在本地处理的数据

以下数据**仅存储于你本机的 `chrome.storage.local`**（Chrome 浏览器的本地存储区域），不会上传到本扩展作者运营的任何服务器：

### 2.1 License Key（Pro 许可证密钥）

| 维度 | 说明 |
|------|------|
| **来源** | 你完成付费后，由 LemonSqueezy 通过邮件直接发送给你 |
| **存储位置** | `chrome.storage.local`（本机） |
| **用途** | 调用 LemonSqueezy License API（`POST /v1/licenses/activate` 与 `POST /v1/licenses/validate`）校验该 License 的有效性 |
| **传输方向** | License Key 会发送至 **LemonSqueezy 的官方 API**（`api.lemonsqueezy.com`）完成校验——这是 LemonSqueezy 作为密钥发行方的必要通信，**并非发送至扩展作者的服务器** |
| **保留** | 本地缓存校验结果最长 7 天（TTL），到期后静默联网重新校验；密钥本身保留至你卸载扩展、或 License 被退款禁用为止 |
| **离线行为** | 缓存有效期内 Pro 功能可在断网下使用；缓存过期且无法联网时，扩展仅弹出「请联网以验证 License」的提示（**不重锁功能**）；若 LemonSqueezy 明确返回 License 已失效（如退款/封禁），Pro 功能将被重锁 |

### 2.2 AI 模型 API Key（BYOM · Bring Your Own Model）

| 维度 | 说明 |
|------|------|
| **来源** | 你自行在扩展设置中填入（支持 OpenAI / DeepSeek / 智谱 / 自定义 endpoint 的 API Key） |
| **存储位置** | `chrome.storage.local`（本机） |
| **用途** | 当你在阅读 Markdown 时触发「AI 翻译/摘要」等功能，扩展使用该 Key **直接请求你指定的模型服务地址** |
| **关键声明** | **本扩展不对该 Key 进行中转、收集、上传或转发给扩展作者或任何第三方。** Key 从你的浏览器直达你所配置的模型服务商 |
| **保留** | 保留至你自行删除或卸载扩展 |

### 2.3 AI Endpoint（模型服务地址）

- **来源**：你自行配置（如 `https://api.openai.com/v1` 或自托管地址）
- **存储位置**：`chrome.storage.local`（本机）
- **用途**：作为上述 AI 请求的目标地址
- **声明**：本扩展不维护、不收集、不向外泄露你配置的 endpoint

### 2.4 你浏览的 Markdown 内容

- **处理方式**：本扩展在你访问 `file:///`、`github.com`、`gitlab.com`、`bitbucket.org` 上的 Markdown 文档时，读取页面内容用于**本地渲染与排版**（如三栏布局、目录生成、代码高亮、TOC 跟随等）
- **关键声明**：**这些内容仅在本地浏览器内处理，不会被本扩展上传到扩展作者的服务器**，也不会被收集或留存
- **BYOM AI 场景的特别说明**：当你在某段内容上使用「AI 翻译/摘要」时，**相关文本会从你的浏览器直接发送至「你在 2.3 配置的模型 endpoint」**。此传输发生在**你与你的模型服务商之间**，本扩展作者不拦截、不经手、不存储该传输内容

---

## 3. 第三方服务

本扩展在必要环节依赖以下第三方服务。各服务的隐私实践受其各自隐私政策约束：

| 第三方 | 用途 | 是否由本扩展直接通信 | 数据控制者 |
|--------|------|---------------------|-----------|
| **LemonSqueezy**（Merchant of Record） | 支付处理、License 发行与校验、全球税务（EU VAT / 美国 sales tax）代担 | 是（License 校验走其官方 API；支付走其 checkout 外链） | LemonSqueezy 为支付/交易数据的数据控制者 |
| **你选择的 AI 模型服务商**（OpenAI / DeepSeek / 智谱 / 自托管等） | 执行 AI 翻译/摘要请求 | 是（由你的浏览器直接请求） | 该服务商为其所接收请求内容的数据控制者 |
| **GitHub Pages / Cloudflare Pages** | 托管本隐私政策静态页 | 否（仅作为文档托管） | 该托管服务 |

**LemonSqueezy 客户门户外链**：扩展提供「查询我的订单」外链，指向 LemonSqueezy 客户门户（customer portal）。一旦你跳转至该门户，即受 LemonSqueezy 隐私政策约束。

### 关于 License 校验的服务端说明

为支撑「退款后自动失效 License」的链路，本扩展作者在 Cloudflare Workers 上部署了一个最小化的 webhook handler（服务端函数）。该函数：

- 仅接收来自 LemonSqueezy 的**签名** webhook（如「订单已退款」事件）
- 仅处理为完成 License 禁用所必需的最少标识（如 order/license 标识符）
- 严格验证 LemonSqueezy 签名（XSIGN），拒绝任何伪造请求
- **不存储用户档案、不建立用户画像、不对外披露**

---

## 4. 权限说明（Chrome 权限与本扩展用途的对应）

- **`storage`**：用于在 `chrome.storage.local` 存储上述本地配置（License Key、AI Key、endpoint、主题偏好等）
- **`declarativeNetRequest`**：**仅**用于剥离发往本地 Ollama 等本地 AI 服务的响应头，使浏览器能跨域读取本地模型的响应。该权限**仅影响你本机本地服务的请求**，**不用于拦截、收集或转发**你的任何外部网络流量
- **主机权限**（`file:///`、`github.com`、`gitlab.com`、`bitbucket.org`）：用于在这些站点的 Markdown 页面上注入渲染逻辑，内容处理方式见 2.4

---

## 5. 数据保留与删除

- 你可随时在扩展设置中**清除** AI API Key 与 endpoint
- **卸载扩展**将自动清除 `chrome.storage.local` 中的全部本地数据（License 缓存、AI 配置、偏好等）
- **退款成功**后，License Key 将被禁用，Pro 功能重锁；本地缓存的 License 信息将在下次校验后被清除
- 免费版功能在退款后继续可用（不卸载、不报错）

---

## 6. 儿童隐私

本扩展面向一般开发者与技术文档读者，不针对 13 岁以下（或所在司法管辖区适用的最低年龄）儿童，亦不明知地收集其个人信息。若你认为我们误收集了儿童信息，请通过第 9 节方式联系我们。

---

## 7. 国际用户（GDPR / CCPA 等）

- 由于本扩展**不主动收集个人身份信息**（无账号、无邮箱采集、无行为埋点），GDPR（欧盟）、CCPA（加州）等数据保护法项下涉及「本扩展直接收集的数据」的义务极为有限
- 支付与 License 相关数据由 LemonSqueezy 作为数据控制者处理；你就此类数据行使法定权利（访问 / 更正 / 删除 / 可携带性 / 反对处理等）可通过 LemonSqueezy，或直接联系我们（见第 9 节），我们将合理协助
- 你浏览的 Markdown 内容不属于本扩展收集的数据（见 2.4），因此不涉及由本扩展承担的跨境传输义务

---

## 8. 政策变更

我们可能更新本隐私政策。重大变更时，我们将在本页更新「版本日期」并在扩展说明页或代码仓库 README 中提示。继续使用本扩展即视为接受更新后的政策。本政策的历次版本会在代码仓库的 git 历史中保留。

---

## 9. 联系我们

- 邮箱：support@yiyan-yixing.com
- 仓库 / Issues：https://github.com/yiyan-yixing/markdown-reader

---

## 10. 关键条款英文摘要 · Key Clauses (English Summary)

For our international users, here is a concise English summary of the most important points. In case of any conflict, the Chinese version prevails and is authoritative.

- **Single purpose**: This extension enhances the reading and rendering of Markdown documents (local files and GitHub / GitLab / Bitbucket pages). AI translation/summary and smart rendering are sub-features serving this purpose, not separate purposes.
- **No PII collected**: We do not operate an account system and do not collect names, emails, addresses, browsing history, or behavioral analytics.
- **License Key**: Stored only in `chrome.storage.local`; transmitted solely to LemonSqueezy's official License API for validation; **never sent to the extension author's servers**.
- **AI BYOM Keys**: Stored only locally; sent directly from your browser to **your configured** model endpoint; the extension author does **not** relay, collect, or access them.
- **Markdown content**: Processed locally for rendering and **never uploaded to the extension author**. When you trigger BYOM AI features, the relevant text is sent **directly from your browser to your configured AI endpoint** — the extension author does not intercept or store it.
- **Payment data**: Handled exclusively by LemonSqueezy (Merchant of Record), which acts as data controller for payment/transaction data and handles global tax (EU VAT / U.S. sales tax).
- **Local-only DNR permission**: `declarativeNetRequest` is used solely to strip response headers from **local** AI services (e.g., Ollama) so the browser can read local model responses; it does **not** intercept or collect external traffic.
- **Deletion**: Uninstalling the extension clears all local data. Refunds invalidate the License Key and relock Pro features; the free version remains usable.

---

**本隐私政策自 2026-08-05 起生效。**
