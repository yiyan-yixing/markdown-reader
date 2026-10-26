# Chrome Web Store — PageSew Listing Copy (v1.3.1, resubmission)

> The store copy below is paste-ready. Sections marked **INTERNAL** or
> **dashboard inputs** are operator notes — do not paste them into the listing.
>
> **2026-10-23 — rewritten after the Yellow Nickel (Spam) rejection.** The
> previous copy was a keyword catalogue: feature counts, seven theme names, and
> seven AI vendor brand names. Google's remediation guidance for this policy is
> to remove excess keywords from the listing. This version is plain prose: what
> the extension does, how to try it, what is optional, and the privacy position.
> Do not reintroduce feature-count lists or third-party brand names.
>
> Last verified: 2026-10-23 against `manifest.json` v1.3.1 and the current
> working tree.

## Short description (129 / 132 chars)

Opens .md files and direct Markdown links in a three-pane reader with outline, folder view, themes, search, and optional AI help.

## Detailed description

PageSew turns raw Markdown files into a readable page.

Open a .md file from your computer, or a direct .md link such as a raw file on
GitHub, GitLab, or Bitbucket, and PageSew replaces the plain text with a
three-pane reading view: the folder on the left, the document in the middle, and
its outline on the right. Click a neighboring file to switch documents without
losing your place. On GitHub, GitLab, and Bitbucket Markdown pages it adds a
"Read in Reader" button.

While reading you get an outline that follows your scroll position, in-page
search with match counts, copy buttons on code blocks, adjustable text size and
content width, and a choice of color themes including light, dark, and
follow-system.

Translation and summarizing are optional and use your own model. Any
OpenAI-compatible endpoint, Anthropic, or a local Ollama server will work. Select
text to translate or summarize it, or summarize the whole document in one click.
Your API key is stored only in this browser and is sent only to the service you
choose. Without a model connected, the reader works exactly the same.

PageSew is free. There is no account, no analytics, no advertising, and no
tracking. Nothing is sent to the developer.

Privacy policy:
https://github.com/yiyan-yixing/markdown-reader/blob/main/docs/legal/privacy-policy.md

Support:
https://github.com/yiyan-yixing/markdown-reader/issues

Support email: yiyanyixing880@gmail.com

---

## Screenshots (dashboard inputs — not listing copy)

Five screenshots, each **1280×800 PNG**, present in `store-assets/screenshots/`:

- `store-assets/screenshots/01-three-pane.png`
- `store-assets/screenshots/02-gfm-code.png`
- `store-assets/screenshots/03-search-toc.png`
- `store-assets/screenshots/04-dark-theme.png`
- `store-assets/screenshots/05-ai-panel.png`

---

## Store metadata (dashboard inputs — not listing copy)

- **Category:** Productivity (single selection — do not also select Developer
  Tools; CWS allows one category)
- **Primary listing language:** English (single store field). The UI supports both
  English and Simplified Chinese; describe it as bilingual in the description,
  but select English as the store language.
- **Support email:** yiyanyixing880@gmail.com
- **Homepage / issues:** https://github.com/yiyan-yixing/markdown-reader

---

## INTERNAL — Toggle audit (do not paste)

Source of truth: `TOGGLE_FEATURES` in `popup/popup.js:44-56` (11 entries). The
popup renders 9 toggle rows before an AI model is configured and 11 after
(`popup/popup.html:179-190`, `content/content.js:1259-1277`). The in-page
settings panel additionally renders a target-language select and two info rows
(`content/content.js:1271-1283`), so it has 12 setting rows, not 11. The "11" is
exact at code level, not a rounded marketing number. English labels for toggles
10-11 are translations of the popup's Chinese labels.

| # | Toggle (`data-key`) | Popup label | Default | Actual effect | Evidence |
|---|---|---|---|---|---|
| 1 | `allPlugins` | All Built-in Markdown Plugins | `true` | Off → `marked` runs with `gfm:false` (plain Markdown) | `popup/popup.html:23-28`; `popup/popup.js:250`; `content/content.js:574,584` |
| 2 | `showOutline` | Auto-generate Outline | `true` | Off → outline sidebar gets `md-collapsed`; scroll-tracking TOC hidden | `popup/popup.html:30-35`; `content/content.js:492,764,1516` |
| 3 | `autoRefresh` | Auto-refresh Document | `false` | On → polls only for `file://` docs; non-file URLs show no indicator and do not poll | `popup/popup.html:37-42`; `content/content.js:1521-1525` |
| 4 | `centerContent` | Center Document Content | `true` | Off → removes `md-centered` from `.md-content-inner` | `popup/popup.html:44-49`; `content/content.js:486,1502` |
| 5 | `customWidth` | Custom Content Width | `true` | Off → clears inline `max-width`; the popup width input is disabled (the in-page number input stays editable but has no visual effect) | `popup/popup.html:51-57`; `content/content.js:1503-1506`; `popup/popup.js:267-275` |
| 6 | `customCSS` | Custom CSS | `true` (`customCSSEnabled`) | Off → injected `<style>` is emptied; the CSS text itself is preserved | `popup/popup.html:59-65`; `content/content.js:1539-1547` |
| 7 | `adjustFont` | Adjust Font | `true` | Off → font forced to 16px; A-/A+ disabled; Ctrl +/- ignored | `popup/popup.html:67-77`; `content/content.js:1498,1704,1712`; `popup/popup.js:270-274` |
| 8 | `showFileTree` | Folder Directory | `true` | Off → file-tree sidebar gets `md-collapsed` | `popup/popup.html:79-84`; `content/content.js:475,763,1513` |
| 9 | `pluginOptions` | Markdown plugin options | all four `true` | Master toggles all four GFM sub-options at once; sub-checkboxes individually disable tables / task lists / strikethrough / autolinks | `popup/popup.html:86-97`; `popup/popup.js:319-324`; `content/content.js:592-616` |
| 10 | `aiTranslate` | 启用划词翻译 | `true` | Off → hides the 翻译 action in the selection popover; hidden entirely if both AI actions are off | `popup/popup.html:179-184`; `content/content.js:2095-2105` |
| 11 | `aiSummary` | 启用总结（段落 / 全篇） | `true` | Off → hides 总结 action; toolbar ✨ replies "AI 总结已关闭" | `popup/popup.html:185-190`; `content/content.js:1732,2096` |

Not counted as toggles:
- `aiTargetLang` — a `<select>` preference, not a switch (`popup/popup.html:191-205`; `popup/popup.js:305-306` explicitly skips it).
- Theme picker — 8 buttons (7 themes + Auto), a radio-style selection, not on/off switches.
- `allSidebarsHidden` — runtime-only toolbar state, not exposed as a persisted setting toggle (`content/content.js:745-758`).

## INTERNAL — Claim audit

- Removed "collapsible sections" from the store copy: no heading/section
  collapsing is implemented. Only the left/right sidebars collapse
  (`content/content.js:755-764`). Replaced with verified features (search match
  count, code-copy buttons, custom CSS, font controls).
- No Pro / paid / subscription / license-key claims remain in the listing;
  `docs/legal/privacy-policy.md` states all features are free.
- Three-pane layout, interception, 7 themes, streaming AI translate/summarize,
  and the `declarativeNetRequest` loopback-only rule were checked against code.
- `manifest.json` contains no `homepage_url`; the listing supplies the repo URL.
- **Known blocker (out of scope for this doc-only task):** the privacy URL above
  currently serves the 2026-08-05 v1.0 policy, which still names "Markdown
  Reader Pro" and LemonSqueezy/licence-key billing. The updated v1.3.0 policy
  exists only as an uncommitted working-tree change
  (`docs/legal/privacy-policy.md`), so the URL must be updated and re-checked in
  a browser before submission. The local policy header also still says
  `v1.3.0-draft（本地稿）` and needs a final version/effective date.
- `store-assets/screenshots/` exists locally with all five 1280×800 PNGs; these
  files are not part of the extension ZIP.


---

## Chinese listing copy (Simplified)

> Store language: English (primary) + Chinese (Simplified) localization.
> The extension UI remains English; do not claim that the UI itself is localized.

**Short description (58 chars, limit 132):**

> PageSew 把 Markdown 文件和链接变成三栏阅读界面：大纲、文件夹、主题、搜索，可选 AI 翻译与总结。

**Detailed description:**

> PageSew 把原始的 Markdown 文件变成可阅读的页面。
>
> 打开电脑上的 .md 文件，或 GitHub、GitLab、Bitbucket 上的 .md 直链，PageSew
> 会把纯文本换成三栏阅读界面：左侧文件夹、中间正文、右侧大纲。点击相邻文件即可
> 切换文档，阅读位置不丢失。在 GitHub、GitLab、Bitbucket 的 Markdown 页面上，
> 它会加一个「Read in Reader」按钮。
>
> 阅读时可使用跟随滚动的大纲、带命中计数的文内搜索、代码块复制按钮、字号与内容
> 宽度调节，以及浅色、深色和跟随系统等配色主题。
>
> 翻译和总结是可选的，使用你自己的模型：任何 OpenAI 兼容接口、Anthropic 或本地
> Ollama 都可以。划词即可翻译或总结，也可以一键总结全文。API Key 只保存在本浏览
> 器，只会发送到你自己选择的服务。没有配置模型时，阅读功能完全不受影响。
>
> PageSew 完全免费：没有账号、没有数据分析、没有广告、没有追踪，也不会把任何内容
> 发送给开发者。
