import React, { useState } from 'react';
import { BatchItem, ProcessingStatus } from '../types';
import { 
  FileText, CheckCircle, AlertCircle, Loader2, Clock, 
  Download, Eye, EyeOff, Trash2, Box, FileCode, Search
} from 'lucide-react';
import { Canvas } from './Canvas';
import parse, { domToReact, Element } from 'html-react-parser';
import { ChartRenderer } from './ChartRenderer';

interface ResultsLibraryProps {
  items: BatchItem[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export const ResultsLibrary: React.FC<ResultsLibraryProps> = ({ items, onDelete, onClearAll }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'text' | 'diagram'>('text');

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
        setExpandedId(null);
    } else {
        setExpandedId(id);
        // Default to text view when opening
        setActiveTab('text');
    }
  };

  const downloadItem = (item: BatchItem) => {
    if (!item.response) return;
    
    // Prioritize the calculated finalTitle, fallback to parsing H1
    let fileName = (item.finalTitle || item.detectedTitle || item.file.name).replace(/\.[^/.]+$/, "");
    
    if (!item.finalTitle) {
        const h1Match = item.response.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1Match && h1Match[1]) {
            const div = document.createElement('div');
            div.innerHTML = h1Match[1];
            const titleText = div.textContent || div.innerText || '';
            fileName = titleText;
        }
    }
    
    const sanitized = fileName.replace(/[^a-z0-9 \(\)\-_]/gi, '').trim().substring(0, 100);
    const blob = new Blob([item.response], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitized}.html`;
    
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
        techDrawDSL: item.tdl,
        metadata: {
            detectedTitle: item.detectedTitle,
            finalTitle: item.finalTitle,
            wordCount: item.wordCount
        },
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

  const parserOptions = {
    replace: (domNode: any) => {
      if (domNode instanceof Element && domNode.attribs) {
         if (domNode.attribs.class === 'ai-chart-data') {
             try {
                 const jsonText = domNode.children && domNode.children[0] && (domNode.children[0] as any).data;
                 if (jsonText) {
                     const config = JSON.parse(jsonText);
                     return <ChartRenderer config={config} />;
                 }
             } catch (e) {
                 return <div className="text-red-500 text-xs p-2 border border-red-200 bg-red-50">Error rendering chart</div>;
             }
         }
      }
    }
  };

  if (items.length === 0) {
    return (
      <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No files in library</h3>
        <p className="text-slate-500 mt-1">Upload patent or technical files to start processing</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full max-h-[800px]">
      <style>{`
        /* --- USPTO PATENT APPLICATION STYLING --- */
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400&display=swap');
        :root {
            --patent-font: "Times New Roman", "Noto Serif", Times, serif;
            --math-font: "Cambria Math", "Latin Modern Math", "Computer Modern Serif", serif;
        }
        .patent-wrapper {
          font-family: var(--patent-font); font-size: 12pt; line-height: 2.0; color: #000;
          max-width: 8.5in; margin: 2rem auto; padding: 1in;
          background: white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          text-align: justify; hyphens: auto;
        }
        .patent-biblio { text-align: center; border-bottom: 2px solid #000; padding-bottom: 1.5rem; margin-bottom: 2rem; }
        .patent-wrapper h1 { font-size: 16pt; font-weight: 700; text-transform: uppercase; text-align: center; margin-bottom: 1.5rem; text-decoration: underline; }
        .patent-wrapper h2 { font-size: 13pt; font-weight: 700; text-transform: uppercase; text-align: center; margin-top: 2.5rem; margin-bottom: 1rem; }
        .patent-wrapper p { margin-bottom: 1.5em; text-indent: 1.5in; }
        .patent-wrapper p:first-of-type { text-indent: 0; }
        .math-block { font-family: var(--math-font); background-color: #fcfcfc; border-left: 3px solid #000; padding: 1rem 2rem; margin: 1.5rem 0; text-align: center; font-size: 1.25em; }
        .math-var, i { font-family: var(--math-font); font-style: italic; padding: 0 1px; }
        .patent-claims { counter-reset: claim-counter; list-style-type: none; padding-left: 0; margin-top: 2rem; }
        .patent-claims li { position: relative; margin-bottom: 1.5em; padding-left: 2.5em; text-indent: 0; text-align: justify; }
        .patent-claims li::before { content: counter(claim-counter) ". "; counter-increment: claim-counter; position: absolute; left: 0; top: 0; font-weight: bold; width: 2em; }
        .patent-wrapper img, .patent-wrapper svg { display: block; margin: 2rem auto; max-width: 90%; border: 1px solid #ccc; padding: 5px; }
        .recharts-wrapper { margin: 0 auto; }
      `}</style>
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600" />
          Library ({items.length})
        </h2>
        <div className="flex gap-2">
           {completedCount > 0 && (
             <button onClick={downloadAllJson} className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md font-medium">
              <Download className="w-3 h-3" /> Export JSON
            </button>
           )}
           <button onClick={onClearAll} className="text-xs flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-md">
            <Trash2 className="w-3 h-3" /> Clear All
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3">File / Detected Title</th>
              <th className="px-4 py-3">Word Count</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <React.Fragment key={item.id}>
                <tr className={`hover:bg-slate-50 transition-colors ${expandedId === item.id ? 'bg-slate-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-700 max-w-[200px] truncate" title={item.file.name}>
                    <div className="flex flex-col">
                        <span>{item.finalTitle || item.detectedTitle || item.file.name}</span>
                        {(item.finalTitle || item.detectedTitle) && item.file.name !== item.finalTitle && (
                            <span className="text-[10px] text-slate-400">{item.file.name}</span>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                    {item.wordCount ? item.wordCount.toLocaleString() : '-'} words
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} error={item.error} hasTdl={!!item.tdl} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {item.status === ProcessingStatus.COMPLETED && (
                      <>
                        <button onClick={() => toggleExpand(item.id)} className={`p-1.5 rounded transition-colors ${expandedId === item.id ? 'text-indigo-600 bg-indigo-50' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                            {expandedId === item.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button onClick={() => downloadItem(item)} className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors">
                            <Download className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button onClick={() => onDelete(item.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                {expandedId === item.id && item.status === ProcessingStatus.COMPLETED && (
                   <tr>
                     <td colSpan={4} className="px-4 py-4 bg-slate-50 border-b border-slate-100">
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col h-[700px]">
                           <div className="flex border-b border-slate-200">
                             <button onClick={() => setActiveTab('text')} className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'text' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                                <FileCode className="w-4 h-4" /> Patent Specification
                             </button>
                             {item.tdl && (
                                <button onClick={() => setActiveTab('diagram')} className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'diagram' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                                    <Box className="w-4 h-4" /> Patent Drawings
                                </button>
                             )}
                           </div>
                           <div className="flex-1 overflow-hidden relative bg-slate-100">
                              {activeTab === 'text' && (
                                <div className="absolute inset-0 p-8 overflow-y-auto">
                                    <div className="patent-wrapper mx-auto">
                                       {parse(item.response || '', parserOptions)}
                                    </div>
                                </div>
                              )}
                              {activeTab === 'diagram' && item.tdl && (
                                  <div className="absolute inset-0 p-8 overflow-y-auto flex justify-center">
                                      <div className="bg-white shadow-xl border border-slate-300 w-[210mm] h-[297mm] relative flex flex-col">
                                          <div className="absolute top-4 right-4 text-xs font-mono text-slate-400 border border-slate-200 px-2 py-1">FIG. 1</div>
                                          <div className="flex-1 w-full h-full p-8"><Canvas tdl={item.tdl} /></div>
                                      </div>
                                  </div>
                              )}
                           </div>
                        </div>
                     </td>
                   </tr>
                )}
                {expandedId === item.id && item.error && (
                   <tr><td colSpan={4} className="px-4 py-4 bg-red-50 border-b border-red-100"><div className="text-red-600 text-xs font-mono p-2">Error: {item.error}</div></td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: ProcessingStatus, error?: string, hasTdl?: boolean }> = ({ status, error, hasTdl }) => {
  switch (status) {
    case ProcessingStatus.ANALYZING:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600"><Search className="w-3 h-3 animate-pulse" /> Analyzing</span>;
    case ProcessingStatus.IDLE:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600"><Clock className="w-3 h-3" /> Ready</span>;
    case ProcessingStatus.QUEUED:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><Clock className="w-3 h-3" /> Queued</span>;
    case ProcessingStatus.PROCESSING:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"><Loader2 className="w-3 h-3 animate-spin" /> Processing</span>;
    case ProcessingStatus.COMPLETED:
      return <div className="flex items-center gap-1"><span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle className="w-3 h-3" /> Done</span>{hasTdl && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">TDL</span>}</div>;
    case ProcessingStatus.FAILED:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title={error}><AlertCircle className="w-3 h-3" /> Failed</span>;
    default:
      return null;
  }
};