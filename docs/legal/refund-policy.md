# 退款政策 · Markdown Reader Pro

> **级联追踪**：cascade-20260805-mdrp-linkvalidation
> **用途**：Pro 付费用户的退款规则说明，与隐私政策同站挂载（@dev 负责挂载到 GitHub Pages）
> **版本**：v1.0 ｜ **版本日期 / 生效日期**：2026-08-05
> **适用产品**：Markdown Reader Pro（一次性买断 License，定价 US $2.99）
> **发布者**：yiyan-yixing（一言一行）
> **联系方式**：support@yiyan-yixing.com ｜ https://github.com/yiyan-yixing/markdown-reader
> **政策裁定**：PM 裁定「7 天无理由 + 30 天 bug 退款」（见 `pm-decision-mdrp-linkvalidation-20260805.md`）

---

## 1. 概述

Markdown Reader Pro 为**一次性买断**（one-time purchase）的数字许可证（License），由 LemonSqueezy 作为 Merchant of Record（MoR）处理支付与全球税务。我们对付费用户提供**优于法定最低标准**的自愿退款承诺：

- **7 天无理由全额退款**
- **30 天 bug 退款**

> ⚠️ 本退款政策是**商业自愿承诺**，独立于且不限制你依当地法律（如 EU 消费者法定撤回权）享有的任何强制性权利。详见第 6 节。

---

## 2. 7 天无理由全额退款

**适用条件**：

- 自你在 LemonSqueezy 完成支付之日起 **7 个自然日内**
- **无需任何理由**（no questions asked）
- 全额退款（退至你原支付账户）

**说明**：7 天无理由是本扩展作者主动提供的商业承诺，目的是让你零风险试用 Pro 功能。

---

## 3. 30 天 bug 退款

**适用条件**：

- 自支付之日起 **30 个自然日内**
- 因扩展自身缺陷（bug）导致 Pro 核心功能（Pro 主题包）在常见使用环境下**无法正常使用**
- 经你提交问题描述、且我方确认该缺陷确实存在并影响 Pro 功能

**说明**：

- 若 bug 可在合理期限内修复，我方将优先修复；你也可选择直接退款
- 仅当免费版功能本身正常、仅 Pro 功能受影响时适用本条；若免费版整体不可用，请你直接联系我方，我们会另行处理

---

## 4. 退款流程

```
1. 你通过邮件联系 support@yiyan-yixing.com
   └─ 提供：订单号 / License Key / 简要说明（7 天内无需理由；30 天 bug 需附问题描述与复现）

2. 我方审核（7 天无理由原则上即审即过；30 天 bug 在 1-3 个工作日内确认）

3. 审核通过 → 我方在 LemonSqueezy 后台发起退款

4. LemonSqueezy 处理退款
   └─ 到账时间：通常 5-10 个工作日（依发卡机构而定）
   └─ 退款币种与金额：按原支付金额全额退回

5. License Key 失效
   └─ LemonSqueezy 触发「订单已退款」事件
   └─ 我方 webhook handler 自动 disable 该 License
   └─ 扩展端下次校验（联网时）返回 invalid → Pro 功能重锁

6. 免费版继续可用（不卸载、不报错、不弹骚扰）
```

---

## 5. 退款后的影响

| 项目 | 状态 |
|------|------|
| License Key | 失效（disabled） |
| Pro 主题包 | 重锁（恢复灰锁状态） |
| 免费版全部功能（AI 翻译/摘要、三栏阅读、智能拦截、dark/light/auto 主题等） | **继续可用，不受影响** |
| 扩展本身 | **不会被卸载**，不会报错；仅 Pro 部分回退为锁定状态 |
| 你本地的 AI 配置 / BYOM Key | 不受退款影响，继续保留（除非你自行清除） |

**关于离线期间的退款生效**：若你已断网一段时间，License 校验会延迟到下次联网时完成；联网后扩展即会感知 License 已失效并重锁 Pro。此窗口期内免费版始终正常。

---

## 6. 与法定消费者权利的关系

- **EU 消费者**：你在 LemonSqueezy checkout 时会确认一项「立即开始履行数字内容并放弃 EU 14 天法定撤回权」的同意（详见 `eu-withdrawal-consent.md`）。**本退款政策不影响你依适用法律享有的任何强制性、不可放弃的权利**；本政策提供的 7 天无理由 + 30 天 bug 承诺是**额外**于法定最低标准之上的商业保证。
- **其他司法管辖区**：本政策中的任何条款，均不意在限制或排除当地强制消费者保护法所赋予你的权利；如本政策与当地强制法律冲突，以当地法律为准。

---

## 7. 税务说明

- 本产品通过 **LemonSqueezy 作为 Merchant of Record** 销售，全球税务（包括 EU VAT、美国各州 sales tax 等）**由 LemonSqueezy 代为计算、收取与申报**。
- 本扩展作者**无需**、也**未**在各国注册税务实体。
- 退款发生时，LemonSqueezy 会按其 MoR 流程处理相应的税款冲销；你收到的退款金额为原支付金额（含税）的全额。

---

## 8. 不适用情形

以下情形**不适用**退款：

- 超过 30 天（既不在 7 天无理由窗口、也不在 30 天 bug 窗口）
- 滥用退款（如反复购买-退款以白用 Pro；或以退款作为要挟索取超出 Pro 范围的功能）
- 因你所在网络环境、Chrome 版本过旧、或第三方（如 AI 服务商、LemonSqueezy）原因导致的非扩展自身缺陷问题——但我方会尽力协助你排查

> 即便如此，若你认为情况特殊，仍欢迎联系我方，我们会个案评估。

---

## 9. 联系方式

- 邮箱：support@yiyan-yixing.com
- 仓库 Issues：https://github.com/yiyan-yixing/markdown-reader
- 查询订单（自助）：扩展 popup →「升级」tab →「查询我的订单」外链（LemonSqueezy 客户门户）

---

## 10. Refund Policy (English Summary)

Markdown Reader Pro is a **one-time purchase** digital license (US $2.99), sold via LemonSqueezy as Merchant of Record (MoR), which handles global taxation (EU VAT / U.S. sales tax). We offer a **voluntary refund commitment that exceeds the statutory minimum**:

- **7-day no-reason full refund**: Within 7 calendar days of payment, you may request a full refund for any reason (no questions asked).
- **30-day bug refund**: Within 30 calendar days of payment, if a Pro feature (Pro theme pack) is unusable due to a confirmed defect in the extension itself, you may request a full refund.

**Process**: Email support@yiyan-yixing.com with your order number / License Key and (for 30-day bug refunds) a description of the issue. Once approved, we refund via the LemonSqueezy dashboard; the License Key is disabled, Pro features relock, and the **free version remains fully usable**. Refunds typically arrive within 5–10 business days.

**Relationship to statutory rights**: This policy is a voluntary commercial guarantee and **does not limit any non-waivable statutory consumer rights** you may have under your local law (e.g., EU consumer protection law). Where this policy conflicts with mandatory local consumer law, the local law prevails.

---

**本退款政策自 2026-08-05 起生效。**
