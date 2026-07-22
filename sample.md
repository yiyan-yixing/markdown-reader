# Markdown Reader — Sample Document

This is a **sample Markdown file** to demonstrate the Markdown Reader Chrome extension.

## Features

- ✅ Three-panel layout: File Tree + Content + Outline
- ✅ Syntax highlighting for code blocks
- ✅ Dark / Light theme toggle
- ✅ Search within document
- ✅ Font size adjustment
- ✅ Auto-generate outline (TOC)
- ✅ Auto-refresh on file change
- ✅ Custom content width
- ✅ Custom CSS support

## Code Examples

### JavaScript

```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
  return { message: `Welcome to Markdown Reader` };
}

const reader = greet('World');
```

### Python

```python
from dataclasses import dataclass

@dataclass
class MarkdownReader:
    name: str = "Markdown Reader"
    version: str = "1.0.0"
    features: list = None

    def __post_init__(self):
        self.features = self.features or [
            "File tree", "TOC", "Themes", "Search"
        ]
```

## Table Example

| Feature | Status | Description |
|---------|--------|-------------|
| Markdown Plugins | ✅ | GFM tables, task lists, strikethrough |
| Auto Outline | ✅ | Generate TOC from headings |
| Auto Refresh | ✅ | Reload when file changes |
| Center Content | ✅ | Horizontal centering |
| Custom Width | ✅ | Adjustable max-width |
| Custom CSS | ✅ | User-provided styles |
| Font Adjustment | ✅ | Size controls |
| Folder Directory | ✅ | File tree sidebar |

## Task List

- [x] Content script injection
- [x] Marked.js rendering
- [x] Highlight.js integration
- [x] Three-panel layout
- [x] Settings panel with feature toggles
- [ ] Math formula support (KaTeX)
- [ ] Mermaid diagram support
- [ ] Export to PDF

## Quote

> "The best way to predict the future is to invent it."
> — Alan Kay

## Links

- [Markdown Guide](https://www.markdownguide.org/)
- [Marked.js](https://marked.js.org/)
- [Highlight.js](https://highlightjs.org/)

---

*This file is part of the Markdown Reader Chrome extension.*
