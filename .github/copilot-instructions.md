# Office Editor - Development Instructions

## Project Overview
A full-stack Office-style file editor web application supporting PDF, Word, PowerPoint, and Excel files.

## Development Rules
- Use React + Tailwind CSS for UI development
- Store application state using Zustand
- All file processing is client-side only
- Keep components modular and focused
- Use TypeScript for type safety

## Common Development Tasks

### Adding a New Editor Mode
1. Create a new component in `src/components/editors/`
2. Add the file type to the `FileType` union in `src/store.ts`
3. Update `EditorView.tsx` to render the new editor
4. Add theme color mapping in `src/utils.ts`
5. Handle file parsing in the new editor component

### Adding Ribbon Features
- Edit `src/components/Ribbon.tsx` tabs and buttons
- Add new toolbar buttons in the appropriate tab section
- Update ribbon button handlers in editor components

### Modifying Theme System
- Update theme colors in `tailwind.config.js`
- Add new themes in `ThemePicker.tsx`
- Update `getThemeForFileType()` in `src/utils.ts`

## Running the Project

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Debugging Tips
- Use React DevTools browser extension for component debugging
- Check browser console for file parsing errors
- Use Zustand DevTools to inspect application state
- Test with different file sizes and formats

## Dependencies
- React 18+ with TypeScript
- Tailwind CSS for styling
- Vite as build tool
- Zustand for state management
- mammoth.js for DOCX support
- pdfjs-dist for PDF rendering
- xlsx for Excel support
- jszip for PPTX parsing
- lucide-react for icons
