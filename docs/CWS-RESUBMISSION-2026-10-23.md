# PageSew · Chrome Web Store 重提清单（2026-10-23）

> 背景：v1.3.0 首次提交被拒，违规参考 ID **Yellow Nickel**，命中「垃圾内容和商店中的排名」整节。
> 已确认：该账号下只有这一个条目，没有做任何评分/安装量推广。
> 因此本次只针对两个可整改项动手：**元数据关键字堆砌** 与 **功能可验收性**。

---

## 1. 本次改了什么

| # | 文件 | 改动 | 对应风险 |
|---|------|------|---------|
| 1 | `docs/CWS-LISTING.md` | 短描述、详细描述（英/中）改成自然段；删除 11 项功能目录、7 个主题名、7 家 AI 厂商品牌名、Roadmap 段 | 关键字堆砌 |
| 2 | `manifest.json` | `description` 换成与新短描述一致的句子（129 字符）；版本 1.3.0 → 1.3.1 | 包内元数据与商店文案各写一套关键词 |
| 3 | `popup/popup.html` | 新增「Try a sample document」按钮；空白态提示改为可操作说明（含本地文件需勾选 file URL 权限） | 审核员看不到可运行功能 |
| 4 | `popup/popup.js` | 绑定示例按钮（打开公开的 `sample.md` 直链）；非 Markdown 页提示改为可操作文案 | 同上 |
| 5 | `scripts/package.sh` | 打包时排除 `preview.html`、`sample.md`、`icons/icon.svg`（manifest 未引用的开发残留） | 包内无关文件 |

**没有改**：权限、host_permissions、页面注入范围、AI 调用链路、隐私政策正文。改动面尽量小。

## 2. 新包

| 项 | 值 |
|---|---|
| 路径 | `dist/pagesew-v1.3.1.zip` |
| 版本 | 1.3.1 |
| 大小 | 463,222 字节解压 / 约 160 KB |
| 文件数 | 32（旧包 36） |
| SHA-256 | `5eb082333606718e76f91b06b76cb165478fc9505063b1160e250d7e3a850ee0` |

已核验：manifest 在 zip 根目录；无 `preview.html` / `sample.md` / `icon.svg` / `tests/` / `node_modules/`。

## 3. 测试

| 套件 | 结果 |
|---|---|
| 真实扩展 E2E（`node tests/e2e-real-extension.test.js`） | 36 / 36 PASS |
| 注入式回归（`cd tests && HEADLESS=true node markdown-reader.test.js`） | 30 / 30 PASS |
| 合计 | **66 / 66 PASS** |

popup 改动另外用真实扩展渲染截图人工确认：版本号、示例按钮、空白态文案均正常。

## 4. 外部链接

| URL | 状态（2026-10-23） |
|---|---|
| `https://raw.githubusercontent.com/yiyan-yixing/markdown-reader/main/sample.md` | 200（示例按钮目标） |
| `https://raw.githubusercontent.com/yiyan-yixing/markdown-reader/main/docs/legal/privacy-policy.md` | 200 |

## 5. 后台操作

1. 打开条目 `niaijlknbanchjboefngjmhamabmlfpa`。
2. 上传 `dist/pagesew-v1.3.1.zip`。
3. 商店文案**整段替换**为 `docs/CWS-LISTING.md` 中的英文 / 中文版本：
   - 短描述：`Opens .md files and direct Markdown links in a three-pane reader with outline, folder view, themes, search, and optional AI help.`
   - 中文短描述：`PageSew 把 Markdown 文件和链接变成三栏阅读界面：大纲、文件夹、主题、搜索，可选 AI 翻译与总结。`
   - 详细描述：不要再粘旧版（含功能计数 / 主题名 / 厂商名）。
4. 截图、Promo tile、Marquee 不变；分类 Productivity 不变。
5. 提交后如需在申诉入口附说明，用下面这段：

> Rewrote the listing to remove excess keywords (feature counts and third-party
> brand names), removed unused development files from the package, and added an
> in-product sample document so the core reading feature can be verified in one
> click. The account has a single listing; no rating, review, or install
> manipulation is involved.

## 6. 不要做

- 不要原样重提旧包或旧文案（重复命中会累积账号风险）。
- 不要删条目重建、不要换账号重提。
- 不要在文案里恢复「7 free themes / 11 toggleable features / OpenAI、DeepSeek、Kimi…」这类计数与品牌罗列。
- 不要做任何求好评、返利下载、互安装。
