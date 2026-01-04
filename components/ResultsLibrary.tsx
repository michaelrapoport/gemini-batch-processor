import React, { useState } from 'react';
import { BatchItem, ProcessingStatus } from '../types';
import { 
  FileText, CheckCircle, AlertCircle, Loader2, Clock, 
  Download, Eye, EyeOff, Trash2 
} from 'lucide-react';

interface ResultsLibraryProps {
  items: BatchItem[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export const ResultsLibrary: React.FC<ResultsLibraryProps> = ({ items, onDelete, onClearAll }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const downloadItem = (item: BatchItem) => {
    if (!item.response) return;
    const blob = new Blob([item.response], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.file.name}_gemini.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllJson = () => {
    const data = items.filter(i => i.status === ProcessingStatus.COMPLETED).map(item => ({
        fileName: item.file.name,
        originalContent: item.content,
        generatedResponse: item.response,
        generatedAt: new Date().toISOString()
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_export_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const completedCount = items.filter(i => i.status === ProcessingStatus.COMPLETED).length;

  if (items.length === 0) {
    return (
      <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No files in library</h3>
        <p className="text-slate-500 mt-1">Upload HTML files to start processing</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full max-h-[800px]">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600" />
          Library ({items.length})
        </h2>
        <div className="flex gap-2">
           {completedCount > 0 && (
             <button
              onClick={downloadAllJson}
              className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors font-medium"
            >
              <Download className="w-3 h-3" /> Export JSON
            </button>
           )}
           <button
            onClick={onClearAll}
            className="text-xs flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Clear All
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3">File Name</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <React.Fragment key={item.id}>
                <tr className={`hover:bg-slate-50 transition-colors ${expandedId === item.id ? 'bg-slate-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-700 max-w-[200px] truncate" title={item.file.name}>
                    {item.file.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {(item.file.size / 1024).toFixed(1)} KB
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} error={item.error} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {item.status === ProcessingStatus.COMPLETED && (
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title={expandedId === item.id ? "Hide Response" : "View Response"}
                      >
                        {expandedId === item.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                    {item.status === ProcessingStatus.COMPLETED && (
                      <button
                        onClick={() => downloadItem(item)}
                        className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="Download Response"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                {expandedId === item.id && item.response && (
                   <tr>
                     <td colSpan={4} className="px-4 py-4 bg-slate-50 border-b border-slate-100">
                        <div className="bg-white border border-slate-200 rounded-lg p-4 font-mono text-xs text-slate-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
                          {item.response}
                        </div>
                     </td>
                   </tr>
                )}
                {expandedId === item.id && item.error && (
                   <tr>
                     <td colSpan={4} className="px-4 py-4 bg-red-50 border-b border-red-100">
                        <div className="text-red-600 text-xs font-mono p-2">
                          Error: {item.error}
                        </div>
                     </td>
                   </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: ProcessingStatus, error?: string }> = ({ status, error }) => {
  switch (status) {
    case ProcessingStatus.IDLE:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
          <Clock className="w-3 h-3" /> Idle
        </span>
      );
    case ProcessingStatus.QUEUED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" /> Queued
        </span>
      );
    case ProcessingStatus.PROCESSING:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <Loader2 className="w-3 h-3 animate-spin" /> Processing
        </span>
      );
    case ProcessingStatus.COMPLETED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3" /> Done
        </span>
      );
    case ProcessingStatus.FAILED:
      return (
         <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title={error}>
          <AlertCircle className="w-3 h-3" /> Failed
        </span>
      );
    default:
      return null;
  }
};