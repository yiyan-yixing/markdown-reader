# EU 14 天撤回权 · 放弃同意文案（LemonSqueezy Checkout Checkbox）

> **级联追踪**：cascade-20260805-mdrp-linkvalidation
> **用途**：LemonSqueezy checkout 页配置 checkbox 文案（数字内容立即履行豁免，依据 EU Consumer Rights Directive 2011/83/EU 第 16 条）
> **版本**：v1.0 ｜ **版本日期**：2026-08-05
> **配置时机**：Day 5（LS 产品 / checkout 配置时，由 @dev 落位）
> **适用产品**：Markdown Reader Pro（数字内容 · 一次性买断）
> **发布者**：yiyan-yixing（一言一行）

---

## 1. 法律依据与目的

依据**欧盟消费者权利指令（Directive 2011/83/EU）第 16 条**：对于「供应数字内容且非以有形介质交付」的情形，**若消费者在使用前已明确同意开始履行，并明确确认其知晓一旦开始履行即丧失撤回权**，则消费者不在「数字内容」供应上享有 14 天法定撤回权（right of withdrawal）。

Markdown Reader Pro 为**即时交付的数字内容**（License Key 随支付完成邮件下发，可立即激活使用），故适用上述豁免。在 LemonSqueezy checkout 页放置一项**用户必须主动勾选**的 checkbox，即触发该豁免。

> ⚠️ **与本扩展退款政策的关系**：本 checkbox 仅放弃 **EU 法定 14 天撤回权**。本扩展作者另行提供的「7 天无理由 + 30 天 bug 退款」（见 `refund-policy.md`）是**独立于法定权利的商业自愿承诺，不受本放弃影响，仍然适用**。即：EU 用户勾选放弃法定撤回权后，**依然享受我们 7 天无理由的商业退款保证**。

---

## 2. Checkbox 文案（中文）

### 2.1 勾选框标签（label · 简版，显示在 checkbox 旁）

> 我已知晓：支付完成后将立即向我发送 Markdown Reader Pro 的许可证密钥（License Key）并开始履行，我**明确同意立即开始履行**，并知晓依欧盟消费者权利指令，**在此情形下我将丧失 14 天法定撤回权**。我理解这并不影响我享有的卖家另行承诺的「7 天无理由 + 30 天 bug 退款」商业保证。

### 2.2 展开说明（tooltip / 详情链接 · 用户可点开查看完整文本）

**关于欧盟 14 天撤回权的放弃说明**

根据欧盟消费者权利指令（Directive 2011/83/EU），你通常享有在 14 天内撤回本消费合同的权利。但该指令第 16 条规定：对于经你事先明确同意、并确认知晓放弃撤回权后开始履行的数字内容供应，**该 14 天撤回权不再适用**。

由于 Markdown Reader Pro 是即时交付的数字产品——你完成支付后，许可证密钥（License Key）将立即通过邮件发送给你并可立即激活使用——因此，当你**勾选下方同意框并完成支付**时，即视为你：

1. 明确同意我们**立即开始履行**（向你交付 License Key 并激活 Pro 功能）；
2. 明确知晓并**自愿放弃**上述 14 天法定撤回权。

**你不会因此失去一切保障**：本扩展作者另行提供「**7 天无理由全额退款 + 30 天 bug 退款**」的商业保证（详见退款政策），该保证独立于法定撤回权，不受本放弃影响。如需退款，请按退款政策联系 support@yiyan-yixing.com。

---

## 3. Checkbox Text (English)

### 3.1 Checkbox Label (short, shown beside the checkbox)

> I acknowledge that, upon completed payment, I will immediately receive the Markdown Reader Pro license key and that performance will begin. **I expressly consent to immediate performance** and understand that, under the EU Consumer Rights Directive (Directive 2011/83/EU), **I thereby lose my statutory 14-day right of withdrawal** for this digital content. I understand this does not affect the seller's separate commercial guarantee of "7-day no-reason refund + 30-day bug refund".

### 3.2 Expanded Disclosure (tooltip / details link · full text)

**Regarding the waiver of the EU 14-day right of withdrawal**

Under the EU Consumer Rights Directive (Directive 2011/83/EU), you normally have the right to withdraw from this consumer contract within 14 days. However, Article 16 of that Directive provides that **this right of withdrawal does not apply** to the supply of digital content where you have previously consented to performance beginning and have acknowledged that, once performance begins, you lose your right of withdrawal.

Because Markdown Reader Pro is a digital product delivered instantly — the license key is emailed to you and Pro features can be activated immediately upon payment — by **checking the box below and completing payment**, you are deemed to:

1. expressly consent to our **immediate performance** (delivery of the License Key and activation of Pro features); and
2. acknowledge and **voluntarily waive** the aforementioned 14-day statutory right of withdrawal.

**You are not left without recourse**: the extension author separately offers a commercial guarantee of **"7-day no-reason full refund + 30-day bug refund"** (see the Refund Policy), which is independent of the statutory right and remains available to you. To request a refund under that guarantee, contact support@yiyan-yixing.com as described in the Refund Policy.

---

## 4. LemonSqueezy 配置提示（给 @dev）

- **落位位置**：LemonSqueezy 后台 → 产品（Markdown Reader Pro）→ Checkout 设置 → 自定义字段 / Consent（同意）区块
- **必填**：勾选框须设为**必选**（用户不勾则无法完成 checkout），以满足指令第 16 条「事先明确同意」要件
- **语言**：LemonSqueezy checkout 支持多语言；中英双语以上文为准（LS checkout 国际用户为主，建议英文优先显示，中文作备选）
- **与退款政策的衔接**：文案中已明确指出 7 天无理由退款仍然适用，避免用户误以为「放弃撤回权 = 不能退款」的误解（合规 + 口碑双保险）
- **法务落版**：本文件为 LS 配置时直接复制文案使用；如 LS 后台字符数受限，使用第 2.1 / 3.1 节的 label 简版，完整披露文案放退款政策/隐私政策同站链接

---

**本同意文案版本日期：2026-08-05。**
