# Office Editor - Web Application

A full-stack web application that replicates a Microsoft Office-style file editor. Supports uploading, viewing, and editing PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) files.

## Features

### UI Design
- **Title bar** — app icon, file name, save/minimize/maximize/close buttons
- **Ribbon tabs** — Home, Insert, Layout, Review, View
- **Ribbon toolbar** — contextual buttons (font controls, alignment, formatting)
- **Document canvas** — white page(s) centered on a gray background
- **Status bar** — page count, word count, zoom slider
- **Slide panel** (for PPTX) — left sidebar showing slide thumbnails

### Theme System
Each file type has a distinct color theme applied to the ribbon and UI:
- `.docx` → Microsoft Word Blue (#2b579a)
- `.xlsx` → Microsoft Excel Green (#217346)
- `.pptx` → Microsoft PowerPoint Red (#b7472a)
- `.pdf` → Adobe Red (#e02b20)

Includes a Theme Picker panel with 6+ selectable color themes (blue, green, red, dark, teal, purple, amber).

### File Upload
- Drag-and-drop upload zone
- Click-to-browse file input (accept: .pdf, .docx, .pptx, .xlsx)
- Auto-detect file type and switch theme + editor mode
- Recent files list stored in localStorage

### Editor Modes

#### Word (.docx)
- Uses mammoth.js to convert .docx to HTML
- Paginated A4 white canvas
- ContentEditable area for text editing
- Toolbar: font family, font size, bold, italic, underline, text color, alignment, bullet list

#### PowerPoint (.pptx)
- Left slide thumbnail panel
- Render slides as 16:9 canvas
- Click through slides, edit slide content
- Navigation buttons

#### PDF
- Uses PDF.js to render pages on canvas
- Page navigation (prev/next)
- Zoom in/out controls

#### Excel (.xlsx)
- Uses SheetJS (xlsx) to parse spreadsheet
- Interactive HTML table with editable cells
- Formula bar at top
- Multi-sheet support

### Extra Features
- Dark mode toggle
- Keyboard shortcuts:
  - `Ctrl+S` to save
  - `Ctrl+O` to open
  - `Ctrl+P` to print
- Export edited document
- Print support
- Live word count and character count in status bar
- Smooth page transition animations

## Tech Stack

- **Frontend**: React + Tailwind CSS
- **Build Tool**: Vite
- **State Management**: Zustand
- **Libraries**:
  - `mammoth.js` — DOCX rendering
  - `pdf.js` — PDF rendering
  - `xlsx` (SheetJS) — Excel parsing
  - `jszip` — PPTX parsing
  - `lucide-react` — Icons
- **Storage**: localStorage for recent files and preferences

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The application will open at `http://localhost:5173`

## Build

```bash
npm run build
```

## Project Structure

```
src/
├── components/
│   ├── HomeScreen.tsx       # Home page with file upload
│   ├── EditorView.tsx       # Main editor container
│   ├── Ribbon.tsx           # Office-style ribbon UI
│   ├── StatusBar.tsx        # Status bar with stats
│   ├── ThemePicker.tsx      # Theme selector
│   └── editors/
│       ├── WordEditor.tsx   # DOCX editor
│       ├── PDFEditor.tsx    # PDF viewer
│       ├── ExcelEditor.tsx  # Excel viewer/editor
│       └── PowerPointEditor.tsx # PPTX editor
├── store.ts                 # Zustand state management
├── utils.ts                 # Utility functions
├── App.tsx                  # Main app component
├── index.css                # Global styles
└── main.tsx                 # React entry point
```

## Keyboard Shortcuts

- `Ctrl/Cmd + S` — Save document
- `Ctrl/Cmd + O` — Go back to home
- `Ctrl/Cmd + P` — Print document
- Page Up/Down — Navigate through pages (PDF)
- Arrow Keys — Navigate through slides (PPTX)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Notes

- All file processing happens client-side (no backend required)
- Recent files are stored in browser's localStorage
- Theme preferences are saved in localStorage
- PDF.js worker uses CDN for rendering

## Future Enhancements

- Export functionality with format conversion
- Undo/Redo history
- Collaborative editing features
- Search and replace
- Advanced formula support for Excel
- Drawing tools for presentations
- Comments and annotations
