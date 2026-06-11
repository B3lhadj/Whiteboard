# Project Changes

## Ribbon

- Fixed ribbon visibility so it does not appear on the home screen before a file is opened.
- Ensured the ribbon appears after files open successfully in the editor.
- Added uppercase (`AA`) and lowercase (`aa`) controls to the Font section.
- Connected uppercase/lowercase actions across editable document areas, PDF annotations, PowerPoint overlays, and Excel selected cells.

## Shapes and Forms

- Added an Office-style shapes/forms gallery to the Ribbon.
- Added shape categories similar to the reference image:
  - Recently used forms
  - Lines and connectors
- Added shared shape rendering in `src/shapes.ts`.
- Added support for inserting shapes/forms in:
  - Word
  - Whiteboard
  - PDF
  - PowerPoint
- Kept shapes disabled for Excel.
- Fixed shape insertion so clicking an existing shape does not create another shape.
- Added selection outline for shapes/forms.
- Added shape color changes through the ribbon color picker.
- Added shape movement, resizing, and rotation:
  - Drag shape body to move.
  - Drag bottom-right handle to resize.
  - Drag top circular handle to rotate.

## Word

- Fixed merge-conflict damage in `WordEditor.tsx`.
- Fixed Word ribbon timing so it appears when the file is ready in the editor.
- Added shape/form insertion and editing behavior.
- Added selected-shape recoloring.
- Added resize and rotation handles for shapes/forms.

## Whiteboard

- Restored the missing Whiteboard opening flow.
- Added blank whiteboard creation from the home screen.
- Added shape/form insertion.
- Added shape/form movement, resize, rotation, selection, and recoloring.

## PDF

- Added shape annotations on PDF pages.
- Added export support so inserted PDF shapes are written into the edited PDF.
- Added uppercase/lowercase support for selected PDF text annotations.

## PowerPoint

- Added shape overlays on slides.
- Added movement and color controls for shape/text overlays.
- Added uppercase/lowercase support for selected text overlays.

## Excel

- Kept shapes/forms disabled for Excel.
- Added uppercase/lowercase support for the selected cell.
- Added controls to insert rows and columns around the selected cell:
  - Insert row above
  - Insert row below
  - Insert column before
  - Insert column after
- Changed Excel cells and formula bar to multiline textareas.
- Fixed Enter inside a cell so it creates a new line in the same cell.

## Conflict and Build Fixes

- Removed unresolved merge conflict markers from:
  - `EditorNavigation.tsx`
  - `WordEditor.tsx`
  - `ExcelEditor.tsx`
- Fixed the missing `handleNewWhiteboard` function.
- Fixed TypeScript issues caused by unused variables and broken conflict resolution.
- Fixed a color picker HSL saturation issue.

## Verification

The project was checked with:

```bash
npx tsc --noEmit
npm run build
```

Both commands passed after the changes.
