// src/components/editors/ImageEditor.tsx
import { useState, useEffect, useRef } from 'react';
import { DocumentFile, useDocumentStore } from '../../store';
import EditorNavigation from '../EditorNavigation';


interface ImageEditorProps {
  file: DocumentFile;
}

export default function ImageEditor({ file }: ImageEditorProps) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const imageRef = useRef<HTMLImageElement>(null);
  const zoom = useDocumentStore((state) => state.zoom);
  const setEditorHtml = useDocumentStore((state) => state.setEditorHtml);

  // Load image from file content
  useEffect(() => {
    if (file.content) {
      const blob = new Blob([file.content], { type: getMimeType(file.name) });
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      
      // Store image info in editor state
      setEditorHtml(`<div class="image-container">
        <img src="${url}" alt="${file.name}" style="max-width: 100%; height: auto;" />
      </div>`);
      
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [file, setEditorHtml]);

  const getMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml'
    };
    return mimeTypes[ext || ''] || 'image/png';
  };

  // Get image info for status bar
  const getImageInfo = () => {
    const img = imageRef.current;
    if (img && img.naturalWidth) {
      return {
        width: img.naturalWidth,
        height: img.naturalHeight
      };
    }
    return null;
  };

  // Update status bar with image dimensions
  useEffect(() => {
    const img = imageRef.current;
    if (img && img.complete) {
      const info = getImageInfo();
      if (info) {
        useDocumentStore.getState().setWordCount(info.width);
        useDocumentStore.getState().setCharCount(info.height);
      }
    }
  }, [imageUrl]);

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Image viewer */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="min-w-full min-h-full flex items-center justify-center"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'center',
            transition: 'transform 0.2s ease'
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt={file.name}
            className="max-w-full max-h-full object-contain shadow-lg"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
            onLoad={() => {
              const info = getImageInfo();
              if (info) {
                useDocumentStore.getState().setWordCount(info.width);
                useDocumentStore.getState().setCharCount(info.height);
              }
            }}
          />
        </div>
      </div>
      <EditorNavigation
        current={1}
        total={1}
        onPrevious={() => undefined}
        onNext={() => undefined}
        accentColor="#0891b2"
        className="shrink-0 border-t border-gray-200 bg-gray-100"
      />
    </div>
  );
}
