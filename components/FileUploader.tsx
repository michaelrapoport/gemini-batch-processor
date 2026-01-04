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
          status: ProcessingStatus.IDLE,
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
        accept=".html,.htm"
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
            ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
            : 'border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer bg-white'
        }`}
      >
        <div className={`p-3 rounded-full ${disabled ? 'bg-slate-100' : 'bg-indigo-100'}`}>
          <Upload className={`w-6 h-6 ${disabled ? 'text-slate-400' : 'text-indigo-600'}`} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">
            Click to upload HTML files
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supports batch upload (.html)
          </p>
        </div>
      </button>
    </div>
  );
};