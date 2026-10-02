# Block Editor

English | [简体中文](README.md)

A Notion-style block editor plugin for Obsidian: block handles, drag-and-drop reordering, multi-select, block type conversion, columns, and block colors. Desktop only.

![alt text](l.png)
![alt text](a.png) 

## Features

- **Block handle**: A six-dot drag handle (Notion style) appears to the left of the hovered block or the block under the cursor, with a light highlight on the corresponding block.

- **Drag-and-drop reordering**: Dragging a block shows a floating preview and an insertion indicator (as wide as the editor line). Dragging to the top/bottom edge of the editor auto-scrolls. Dragging to the right of a list / quote / Callout body makes the block its child (indented 4 characters; adjustable via "Indent step"); dragging back out to the left reduces the indent level. Dragging to the right of a **regular paragraph / heading** automatically turns the target into a list item (`- ` prefix) and nests the dragged block as its child (in Markdown, only list items have parent/child structure). Dragging to the left/right edge of a target block quickly combines the two into a two-column layout. **Hold Alt while dragging = copy to the drop point.** Supports **dragging across panes into another document** (move = insert at target + delete from source; Alt also copies; a split of the same file is treated as an in-document move).

- **Drag action hint**: While dragging, the floating preview shows in real time what will happen on release — Move / Nest as child / Copy (Alt) / Move to another document / Copy to another document (Alt) / Column · left / Column · right. No hint is shown when there is no valid drop target (e.g. dragging back onto itself).

- **Multi-select**: Shift+click a handle to add/remove blocks from the selection; the group can be dragged, deleted, copied, and **batch-converted**; press Esc to exit multi-select.

- **Block menu**: Click a handle to open the menu — convert between 18 types (code blocks have a 30-language submenu, Callouts have a 26-type submenu), toggle a foldable block between expanded/collapsed, insert a block above/below, copy block content / generate block ID / reference another block…, create a duplicate (the duplicate has no block ID), move up/down, block color (set/clear), columns (combine into columns / add columns / add a column / append a row / unwrap columns), block length in characters, and delete (headings show "Delete whole section").

- **Slash commands**: Type `/` in the body to fuzzy-search (subsequence matching with relevance ranking; both Chinese and English queries work) and quickly convert the current block's type, or insert a media embed (image / audio / video / PDF, choosing an attachment from the vault; automatically disabled inside code blocks).

- **Block IDs**: Generate easy-to-spell `^block-id` values (correctly handling the rules for structural blocks like code blocks and lists where the ID must be on its own line), copy a block link, graphically **reference another block…** (choose a note → choose a block → insert a `[[note#^id]]` link), and clear all block IDs in the file with one click (with a confirmation dialog to prevent accidents).

- **Columns**: Shift-select adjacent blocks, then use "Combine into columns" in the menu (segments are split by blank lines, one column each). Reading view shows them side by side; Live Preview renders them as side-by-side columns — **click to expand into source editing, click outside to collapse automatically**. Supports multi-row layouts ("Append a row", widths distributed as `60-40` / `60-40/50-50`) and in-column editing (split a column / merge with the right column / insert a column / move row up / move row down). The shell accepts `gap=` `radius=` `valign=` `border` to override the default appearance, and each column accepts `bg=` `bg-dark=` to set a background color. The columns menu also supports "Add a column" and "Unwrap columns"; the whole block can be dragged / deleted / moved across documents.

- **Block colors**: Any block can be given a background color (preset swatches / native color picker / custom hex). A light hex color automatically derives a matching dark-theme color and a contrasting text color; light and dark themes are followed automatically.

- **Link open location**: Internal links `[[...]]` can be configured to open in the current tab / new tab / split / new window; modifier-click behaviors such as Ctrl/Cmd+click are unaffected.

- **Command palette**: `Alt+↑/↓` to move blocks, indent / outdent, open the block menu, generate block ID, reference another block…, duplicate the current block, set/clear block color, clear block IDs, plus a dedicated "Turn into" command for each type.

## Settings

Settings → Block Editor:

| Setting | Default | Description |
| ------------ | ------ | --------------------------------------------- |
| Show block handle | On | When off, only commands and the slash entry remain |
| Handle follows cursor | On | When off, the handle only shows on hover |
| Block hover highlight | On | Adds a light highlight background to the block matching the handle on hover |
| Highlight color | Follow theme | Custom hover highlight background color; empty follows the current theme's hover color |
| Highlight opacity | 0.55 | Opacity of the hover highlight background (0\~1) |
| Experimental: render columns in Live Preview | On | When on, columns in Live Preview are rendered by the plugin (double-click to edit); when off, native nested callouts are shown |
| Enable slash commands | On | Turns the `/` suggestions on/off |
| Auto-scroll while dragging | On | Auto-scrolls when dragging to the edge |
| Indent step | Auto | A fixed number of spaces, or auto-detect the smallest indent in the file; also controls the indent used when nesting via drag (4 when Auto) |
| Link open location | Current tab | Where internal links `[[...]]` open when clicked; modifier-click behaviors are unaffected |
| Default column gap | 10 px | Column gap when the columns shell has no `gap=` parameter |
| Default corner radius | 8 px | Column corner radius when the columns shell has no `radius=` parameter |
| Default vertical align | Stretch (equal height) | Vertical alignment of columns when the shell has no `valign=` parameter |
| Default border | Off | Whether to show column borders when the shell has no `border` parameter |
| Handle size | 20 px | Size of the block handle on the left of the editor |
| Drag threshold | 4 px | Drag distance required when holding a handle; anything smaller is treated as a click that opens the block menu |

<br />

## Development

```bash
npm install        # install dependencies
npm run dev        # watch build (for development)
npm run build      # type-check + production build → main.js
npm test           # parity test (unregistered cases are compared against scripts/legacy-main.cjs)
npm run test:update # regenerate the expected-diff baseline scripts/parity-baseline.json after intentional behavior changes
```

## License

This project is open source under the **MIT License**. You are free to use, modify, and distribute it, as long as you retain the original copyright and license notice.

Copyright (c) 2026 MarcBolo

See the [MIT License](https://opensource.org/licenses/MIT) for the full text.
