# Markdown Reader — Chrome Extension

> Beautiful Markdown reader with outline, file tree, themes and more.
> Inspired by [md-reader](https://github.com/md-reader/md-reader).

A Chrome extension that renders `.md` files in a beautiful three-panel reading interface — file tree on the left, rendered content in the center, and outline (TOC) on the right.

**Smart mode — knows when to auto-activate:**

| URL type | Behavior | Why |
|----------|----------|-----|
| `file:///*.md` | ✅ **Auto-intercept** | Raw text, hard to read |
| `raw.githubusercontent.com/*.md` | ✅ **Auto-intercept** | Raw text, hard to read |
| `github.com/.../blob/*.md` | 🔘 **Floating button** "📖 Read in Reader" | GitHub already renders well |
| `gitlab.com/.../blob/*.md` | 🔘 **Floating button** | GitLab already renders well |
| `bitbucket.org/.../src/*.md` | 🔘 **Floating button** | Bitbucket already renders well |

**Also works via extension popup** — click the extension icon on any rendered page to get an "Open in Markdown Reader" button.

## ✨ Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **All Built-in Markdown Plugins** | GFM tables, task lists, strikethrough, autolinks |
| 2 | **Auto-generate Outline** | TOC extracted from h1-h6 with scroll tracking |
| 3 | **Auto-refresh Document** | Watches file changes and reloads (local files) |
| 4 | **Center Document Content** | Horizontally centers the rendered content |
| 5 | **Custom Content Width** | Adjustable max-width (400–2000px) |
| 6 | **Custom CSS** | Add your own CSS styles to the reader |
| 7 | **Adjust Font** | Font size controls (12–28px) |
| 8 | **Folder Directory** | File tree sidebar for browsing related files |
| 9 | **Markdown plugin options** | Configure individual markdown extensions |
| 10 | **More Features in Development** | KaTeX math, Mermaid diagrams, PDF export… |

### Core Features

- 🌙 **Dark / Light / Auto theme** — cycle with toolbar button, or pick in popup. Auto follows `prefers-color-scheme`
- 🔍 **Search within document** with match navigation
- 📋 **Copy code** button on all code blocks
- ⌨️ **Keyboard shortcuts**: `Ctrl/Cmd+F` to search, `Escape` to dismiss sidebars
- 🔗 **TOC scroll tracking** — current heading highlighted in outline
- 📐 **Collapsible sidebars** — toggle individually or hide ALL at once
- 🔗 **External link** icon to view original page
- ⏳ **Loading overlay** for GitHub/GitLab pages while fetching raw markdown

### md-reader Inspired Features

- 🏷️ **Heading anchor links** — `#` appears on hover, click to copy permalink
- ⬆️ **Go-to-top button** — floating button appears after scrolling 640px
- 🔀 **Hide all sidebars** — one-click distraction-free reading (toolbar + floating button)
- 📱 **Responsive sidebars** — on screens ≤960px, sidebars become overlays (dismiss with click/ESC)
- 🎨 **Refined color palette** — blue-purple primary (`#607cd2`), clean sidebar (`#f9fafb`)
- 📝 **2-line heading clamp** — long headings in TOC truncate to 2 lines
- 📐 **Golden ratio indent** — heading indentation uses 0.618em factor per level
- 🔄 **Auto theme** — follows system `prefers-color-scheme` preference

## 🚀 Install

### Chrome Web Store（推荐）

> 🚧 即将上架，敬请期待

### Edge Add-ons

> 🚧 即将上架，敬请期待

### Developer Mode（本地安装）

1. Clone 或下载本项目
   ```bash
   git clone https://github.com/yiyan-yixing/markdown-reader.git
   ```
2. 打开 Chrome → 地址栏输入 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择 `markdown-reader/` 目录
6. 完成！打开任意 `.md` 文件即可使用

### Edge 本地安装

1. Clone 或下载本项目
2. 打开 Edge → 地址栏输入 `edge://extensions`
3. 左下角开启 **开发人员模式**
4. 点击 **加载解压缩的扩展**
5. 选择 `markdown-reader/` 目录
6. 完成！

### 验证安装

1. **本地文件**：将 `.md` 文件拖入浏览器，或地址栏输入 `file:///path/to/file.md`
2. **GitHub**：访问任意 GitHub `.md` 页面，如 `https://github.com/yiyan-yixing/onecode/blob/main/README.md`，点击浮动的「📖 Read in Reader」按钮
3. **快速预览（无需浏览器）**：
   ```bash
   cd markdown-reader
   python3 -m http.server 7790
   # 打开 http://localhost:7790/preview.html
   ```

## 🏗 Architecture

```
markdown-reader/
├── manifest.json            # Manifest V3 config
│                            #   - content_scripts: matches *.md URLs + file://
│                            #   - host_permissions: raw.githubusercontent.com etc.
│                            #   - sidePanel: file browser
│                            #   - action: popup with feature toggles
├── icons/                   # Extension icons (16/48/128px)
├── content/
│   ├── content.js           # Main content script
│   │     - detectPageType(): local / github-blob / gitlab-blob / raw-url
│   │     - getRawMarkdownFromPage(): extract from <pre> or <body>
│   │     - looksLikeMarkdown(): heuristic scoring
│   │     - githubBlobToRaw(): URL conversion
│   │     - fetchRawMarkdown(): via background SW (CORS bypass)
│   │     - buildReaderUI(): three-panel layout
│   │     - buildOutline(): TOC from headings + heading anchors
│   │     - performSearch(): full-text search with highlights
│   │     - buildSettingsPanel(): 10 feature toggles
│   │     - toggleAllSidebars(): hide/show both sidebars
│   │     - setupGoTopButton(): floating go-top (scroll > 640px)
│   │     - setupResponsiveSidebars(): overlay mode on ≤960px
│   └── content.css          # Minimal overrides
├── sidebar/
│   ├── sidebar.html         # Side panel (file browser)
│   ├── sidebar.js           # Tree logic + search
│   └── sidebar.css          # Sidebar styles
├── popup/
│   ├── popup.html           # Feature settings panel (matches screenshot)
│   ├── popup.js             # Settings logic + storage sync
│   └── popup.css            # Popup styles
├── background/
│   └── service-worker.js    # fetchRaw (CORS bypass), message routing
├── lib/
│   ├── marked.min.js        # Markdown parser
│   ├── highlight.min.js     # Syntax highlighting
│   ├── hljs-dark.css        # Dark code theme
│   └── hljs-light.css       # Light code theme
├── styles/
│   ├── reader.css           # Main reader styles + layout + dual-theme vars
│   └── themes/
│       ├── light.css        # Light theme overrides
│       └── dark.css         # Dark theme overrides
├── preview.html             # Standalone test page (no Chrome needed)
├── sample.md                # Demo markdown file
└── README.md                # This file
```

### URL Processing Flow (Smart Mode)

```
User opens URL
    │
    ├─ file:///*.md ────────► Auto-intercept → getRawMarkdownFromPage()
    │                          replacePageWithReader()
    │
    ├─ raw.githubusercontent.com/.../README.md ──► Auto-intercept
    │                                               getRawMarkdownFromPage()
    │                                               replacePageWithReader()
    │
    ├─ github.com/.../blob/main/README.md ──► NO auto-intercept
    │                                         injectFloatingButton()
    │                                         User clicks "📖 Read in Reader"
    │                                         → fetchRawMarkdown() via background SW
    │                                         → replacePageWithReader()
    │
    ├─ Popup "Open in Markdown Reader" ──► sendMessage('activateReader')
    │                                       → same as floating button click
    │
    └─ Other URLs ──► do nothing
```

## ⚙️ Settings

All settings are saved to `chrome.storage.sync` and persist across sessions.

| Setting | Default | Description |
|---------|---------|-------------|
| `theme` | `auto` | `light`, `dark`, or `auto` (follows system) |
| `fontSize` | `16` | Content font size in px (12–28) |
| `contentWidth` | `800` | Max content width in px (400–2000) |
| `centerContent` | `true` | Center the rendered content |
| `showOutline` | `true` | Show TOC sidebar |
| `showFileTree` | `true` | Show file tree sidebar |
| `autoRefresh` | `false` | Auto-reload on file change (local only) |
| `customCSS` | `""` | Custom CSS rules |
| `allPlugins` | `true` | Enable all GFM extensions |

## 📋 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + F` | Focus search box |
| `Enter` (in search) | Next match |
| `Shift + Enter` (in search) | Previous match |
| `Escape` (in search) | Clear search |
| `Escape` | Dismiss mobile sidebar overlay |

## 🔧 Tech Stack

- **Manifest V3** — Latest Chrome extension standard
- **marked.js** — Markdown parsing and rendering
- **highlight.js** — Code syntax highlighting
- **CSS Variables** — Triple-theme theming (light / dark / auto)
- **chrome.storage.sync** — Settings persistence
- **IntersectionObserver** — Scroll tracking for TOC
- **Background Service Worker** — CORS-safe fetch for raw markdown URLs
- **prefers-color-scheme** — System theme detection for auto mode

## 🙏 Credits

- Color palette and sidebar patterns inspired by [md-reader](https://github.com/md-reader/md-reader)
- Golden ratio heading indentation from md-reader's Less mixin

## 📜 License

MIT
