import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { BatchItem, ProcessingStatus } from '../types';

// Simple UUID generator since we want to avoid external dependencies for this demo
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

interface FileUploaderProps {
  onUpload: (items: BatchItem[]) => void;
  disabled: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onUpload, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newItems: BatchItem[] = [];
      // Explicitly cast to File[] to prevent 'unknown' inference
      const files: File[] = Array.from(e.target.files);

      for (const file of files) {
        // Simple text read
        const text = await file.text();
        newItems.push({
          id: generateId(),
          file,
          content: text,
          // Start in ANALYZING to trigger metadata extraction
          status: ProcessingStatus.ANALYZING, 
        });
      }
      onUpload(newItems);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        multiple
        accept=".html,.htm,.txt,.md"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
        disabled={disabled}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className={`w-full h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-colors ${
          disabled
            ? 'border-slate-800 bg-slate-900 cursor-not-allowed opacity-50'
            : 'border-slate-700 bg-slate-900 hover:border-indigo-500 hover:bg-slate-800 cursor-pointer'
        }`}
      >
        <div className={`p-3 rounded-full ${disabled ? 'bg-slate-800' : 'bg-slate-800'}`}>
          <Upload className={`w-6 h-6 ${disabled ? 'text-slate-600' : 'text-indigo-400'}`} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-300">
            Click to upload files
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supports HTML, TXT, Markdown
          </p>
        </div>
      </button>
    </div>
  );
};