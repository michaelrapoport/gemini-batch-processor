
import React, { useState, useMemo } from 'react';
import { BatchItem, ProcessingStatus, Folder, SortField, SortOrder } from '../types';
import { 
  FileText, CheckCircle, AlertCircle, Loader2, Clock, 
  Download, Eye, EyeOff, Trash2, Box, FileCode, Search,
  Folder as FolderIcon, FolderPlus, Inbox, ChevronDown, ChevronUp, ArrowUpDown, Move, Upload
} from 'lucide-react';
import { Canvas } from './Canvas';
import parse, { domToReact, Element } from 'html-react-parser';
import { ChartRenderer } from './ChartRenderer';

interface ResultsLibraryProps {
  items: BatchItem[];
  folders: Folder[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveItem: (itemId: string, folderId: string | undefined) => void;
  onExportLibrary: () => void;
  onImportLibrary: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const PATENT_STYLES = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.8; color: #000; background: #f1f5f9; }
    .patent-wrapper { max-width: 8.5in; margin: 0 auto; padding: 1in; background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .patent-biblio { border-bottom: 2px solid #000; padding-bottom: 1em; margin-bottom: 2em; text-align: center; }
    h1 { font-size: 16pt; font-weight: bold; text-align: center; margin: 1em 0; text-transform: uppercase; text-decoration: underline; }
    h2 { font-size: 14pt; font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; text-transform: uppercase; text-align: center; }
    h3 { font-size: 12pt; font-weight: bold; margin-top: 1em; margin-bottom: 0.5em; }
    p { text-align: justify; text-indent: 0.5in; margin-bottom: 0.5em; }
    .math-block { display: block; text-align: center; margin: 1em 0; padding: 0.5em; font-size: 14pt; font-style: italic; background: #fcfcfc; border-left: 3px solid #000; }
    .math-var { font-style: italic; font-family: 'Times New Roman', serif; }
    .patent-claims { list-style-type: none; counter-reset: claim-counter; margin-left: 0; padding-left: 0; margin-top: 2rem; }
    .patent-claims > li { counter-increment: claim-counter; margin-bottom: 1em; text-align: justify; position: relative; padding-left: 0.5in; }
    .patent-claims > li::before { content: "Claim " counter(claim-counter) ". "; font-weight: bold; position: absolute; left: 0; top: 0; }
    .dependent-claim { margin-left: 0.5in; }
    .independent-claim { margin-left: 0; font-weight: 500; }
    .recharts-wrapper { margin: 0 auto; }
    @media print { body { background: white; } .patent-wrapper { margin: 0; padding: 0; box-shadow: none; width: 100%; max-width: none; } }
`;

export const ResultsLibrary: React.FC<ResultsLibraryProps> = ({ 
  items, folders, onDelete, onClearAll, onCreateFolder, onDeleteFolder, onMoveItem, onExportLibrary, onImportLibrary
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'text' | 'diagram'>('text');
  
  // Organization State
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined); // undefined = All
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // Sorting State
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Filtered & Sorted Items
  const filteredItems = useMemo(() => {
    let result = items;
    
    // 1. Filter by Folder
    if (selectedFolderId === 'TRASH') {
        // Implement trash logic later?
    } else if (selectedFolderId === 'UNSORTED') {
        result = items.filter(i => !i.folderId);
    } else if (selectedFolderId) {
        result = items.filter(i => i.folderId === selectedFolderId);
    }
    
    // Safety check: if selectedFolderId points to a non-existent folder
    if (selectedFolderId && selectedFolderId !== 'UNSORTED' && !folders.find(f => f.id === selectedFolderId)) {
        // Default to All handled in render or next cycle
    }

    // 2. Sort
    return [...result].sort((a, b) => {
        let valA: any, valB: any;
        
        switch(sortField) {
            case 'title':
                valA = a.finalTitle || a.detectedTitle || a.file.name;
                valB = b.finalTitle || b.detectedTitle || b.file.name;
                break;
            case 'status':
                valA = a.status;
                valB = b.status;
                break;
            case 'wordCount':
                valA = a.wordCount || 0;
                valB = b.wordCount || 0;
                break;
            case 'date':
            default:
                valA = a.startTime || 0;
                valB = b.startTime || 0;
                break;
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

  }, [items, folders, selectedFolderId, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
      if (sortField === field) {
          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
          setSortField(field);
          setSortOrder('desc'); // Default new sort to desc
      }
  };

  const handleCreateFolder = (e: React.FormEvent) => {
      e.preventDefault();
      if (newFolderName.trim()) {
          onCreateFolder(newFolderName.trim());
          setNewFolderName('');
          setIsCreatingFolder(false);
      }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
        setExpandedId(null);
    } else {
        setExpandedId(id);
        setActiveTab('text');
    }
  };

  // Download logic (ROBUST VERSION)
  const downloadItem = (item: BatchItem) => {
    try {
        if (!item.response) {
            alert("No processed content available to download.");
            return;
        }

        // Robust Title Resolution with Safeties
        let titleStr = item.finalTitle || item.detectedTitle || item.file?.name || "untitled_document";
        
        // Try to extract from HTML if everything else failed or is generic
        if ((!item.finalTitle && !item.detectedTitle) || titleStr === "untitled_document") {
             const h1Match = item.response.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
             if (h1Match && h1Match[1]) {
                const div = document.createElement('div');
                div.innerHTML = h1Match[1];
                const extracted = div.textContent || div.innerText;
                if (extracted && extracted.trim().length > 0) {
                    titleStr = extracted;
                }
             }
        }

        // Sanitize Filename
        const fileName = titleStr
            .replace(/\.[^/.]+$/, "") // Remove extension if present in name
            .replace(/[^a-z0-9 \(\)\-_]/gi, '') // Remove special chars
            .trim()
            .substring(0, 100) || "document"; // Fallback if sanitization kills the string

        // Construct Content
        let fullHtml = item.response;
        if (!fullHtml.trim().toLowerCase().startsWith('<!doctype html')) {
            let bodyContent = item.response;
            if (!bodyContent.includes('class="patent-wrapper"')) {
                bodyContent = `<div class="patent-wrapper">${bodyContent}</div>`;
            }
            fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titleStr}</title>
    <style>${PATENT_STYLES}</style>
</head>
<body>${bodyContent}</body>
</html>`;
        }

        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Download Failed", e);
        alert("Failed to download file. See console for details.");
    }
  };

  // Move Logic dropdown
  const MoveMenu = ({ itemId }: { itemId: string }) => (
      <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded shadow-lg z-20 w-32 py-1">
          <button 
              onClick={() => onMoveItem(itemId, undefined)} 
              className="w-full text-left px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
              <Inbox className="w-3 h-3 inline mr-2" /> Inbox
          </button>
          {folders.map(f => (
              <button 
                  key={f.id}
                  onClick={() => onMoveItem(itemId, f.id)}
                  className="w-full text-left px-3 py-1 text-xs text-slate-300 hover:bg-slate-700 truncate"
              >
                  <FolderIcon className="w-3 h-3 inline mr-2" /> {f.name}
              </button>
          ))}
      </div>
  );
  const [activeMoveMenu, setActiveMoveMenu] = useState<string | null>(null);


  const parserOptions = {
    replace: (domNode: any) => {
      if (domNode.name === 'head' || domNode.name === 'html' || domNode.name === 'body' || domNode.name === '!doctype') {
          return <>{domToReact(domNode.children, parserOptions)}</>;
      }
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
         // NEW: Intercept TechDraw Visualizations
         if (domNode.attribs.class === 'ai-techdraw-viz' && domNode.attribs['data-tdl']) {
             return (
                 <div className="my-8 w-full border border-slate-200 rounded-lg bg-slate-900 shadow-sm page-break-inside-avoid relative" style={{ height: '500px' }}>
                    <div className="absolute top-2 right-2 z-10 bg-slate-800 px-2 py-1 rounded border border-slate-700 text-[10px] text-slate-400 font-mono">
                        GENERATED DIAGRAM
                    </div>
                    <Canvas tdl={domNode.attribs['data-tdl']} />
                 </div>
             );
         }
      }
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden flex h-full max-h-[800px]">
      <style>{PATENT_STYLES}</style>
      
      {/* SIDEBAR */}
      <div className="w-48 border-r border-slate-800 bg-slate-900 flex flex-col">
          <div className="p-4 border-b border-slate-800 font-semibold text-slate-200 text-sm">Library</div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <button 
                  onClick={() => setSelectedFolderId(undefined)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${selectedFolderId === undefined ? 'bg-indigo-900/40 text-indigo-300' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                  <Inbox className="w-4 h-4" /> All Items
              </button>
              <button 
                  onClick={() => setSelectedFolderId('UNSORTED')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${selectedFolderId === 'UNSORTED' ? 'bg-indigo-900/40 text-indigo-300' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                  <FileText className="w-4 h-4" /> Unsorted
              </button>
              
              <div className="pt-4 pb-2 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Folders</div>
              
              {folders.map(f => (
                  <div key={f.id} className="group relative">
                      <button 
                        onClick={() => setSelectedFolderId(f.id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${selectedFolderId === f.id ? 'bg-indigo-900/40 text-indigo-300' : 'text-slate-400 hover:bg-slate-800'}`}
                      >
                        <FolderIcon className="w-4 h-4" /> 
                        <span className="truncate">{f.name}</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteFolder(f.id); }}
                        className="absolute right-2 top-2 hidden group-hover:block text-slate-500 hover:text-red-400"
                      >
                          <Trash2 className="w-3 h-3" />
                      </button>
                  </div>
              ))}

              {isCreatingFolder ? (
                  <form onSubmit={handleCreateFolder} className="px-1 mt-2">
                      <input 
                        autoFocus
                        type="text" 
                        value={newFolderName} 
                        onChange={e => setNewFolderName(e.target.value)}
                        onBlur={() => setIsCreatingFolder(false)}
                        placeholder="Name..."
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
                      />
                  </form>
              ) : (
                  <button 
                      onClick={() => setIsCreatingFolder(true)}
                      className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 border-t border-transparent hover:border-slate-800 mt-2"
                  >
                      <FolderPlus className="w-4 h-4" /> New Folder
                  </button>
              )}
          </div>
          
          {/* LIBRARY MANAGEMENT FOOTER */}
          <div className="p-3 border-t border-slate-800 bg-slate-900/50 space-y-2">
             <button 
                onClick={onExportLibrary}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-md transition-colors border border-slate-700"
             >
                <Download className="w-3 h-3" /> Backup Library
             </button>
             <label className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-md transition-colors border border-slate-700 cursor-pointer">
                <Upload className="w-3 h-3" /> Restore Library
                <input 
                    type="file" 
                    accept=".json" 
                    onChange={onImportLibrary}
                    className="hidden" 
                />
             </label>
          </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
            <h2 className="font-semibold text-slate-200 flex items-center gap-2">
              {folders.find(f => f.id === selectedFolderId)?.name || (selectedFolderId === 'UNSORTED' ? 'Unsorted' : 'All Items')} 
              <span className="text-slate-500 text-xs font-normal">({filteredItems.length})</span>
            </h2>
            <div className="flex gap-2">
               <button onClick={onClearAll} className="text-xs flex items-center gap-1 px-3 py-1.5 text-red-400 hover:bg-red-900/20 rounded-md">
                <Trash2 className="w-3 h-3" /> Clear List
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-0">
            {filteredItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <Inbox className="w-12 h-12 mb-2 opacity-20" />
                    <p>No items in this view</p>
                </div>
            ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950 text-slate-400 font-medium border-b border-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 cursor-pointer hover:text-slate-200" onClick={() => handleSort('title')}>
                          <div className="flex items-center gap-1">File / Title <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-4 py-3 cursor-pointer hover:text-slate-200" onClick={() => handleSort('wordCount')}>
                          <div className="flex items-center gap-1">Words <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-4 py-3 cursor-pointer hover:text-slate-200" onClick={() => handleSort('status')}>
                          <div className="flex items-center gap-1">Status <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredItems.map((item) => (
                      <React.Fragment key={item.id}>
                        <tr className={`hover:bg-slate-800 transition-colors ${expandedId === item.id ? 'bg-slate-800' : ''}`}>
                          <td className="px-4 py-3 font-medium text-slate-300 max-w-[200px] truncate" title={item.file.name}>
                            <div className="flex flex-col">
                                <span>{item.finalTitle || item.detectedTitle || item.file?.name || "Untitled"}</span>
                                <span className="text-[10px] text-slate-500">{new Date(item.startTime || Date.now()).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                            {item.wordCount ? item.wordCount.toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={item.status} error={item.error} hasTdl={!!item.tdl} />
                          </td>
                          <td className="px-4 py-3 text-right relative">
                            <div className="flex justify-end gap-2">
                                {item.status === ProcessingStatus.COMPLETED && (
                                  <>
                                    <button onClick={() => toggleExpand(item.id)} className={`p-1.5 rounded transition-colors ${expandedId === item.id ? 'text-indigo-400 bg-indigo-900/30' : 'text-slate-500 hover:text-indigo-400 hover:bg-indigo-900/20'}`}>
                                        {expandedId === item.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button onClick={() => downloadItem(item)} className="p-1.5 text-slate-500 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors" title="Download HTML">
                                        <Download className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                
                                {/* Move Dropdown Trigger */}
                                <div className="relative">
                                    <button 
                                        onClick={() => setActiveMoveMenu(activeMoveMenu === item.id ? null : item.id)}
                                        className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded"
                                    >
                                        <Move className="w-4 h-4" />
                                    </button>
                                    {activeMoveMenu === item.id && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setActiveMoveMenu(null)}></div>
                                            <MoveMenu itemId={item.id} />
                                        </>
                                    )}
                                </div>

                                <button onClick={() => onDelete(item.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === item.id && item.status === ProcessingStatus.COMPLETED && (
                           <tr>
                             <td colSpan={4} className="px-4 py-4 bg-slate-950 border-b border-slate-800">
                                <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[700px]">
                                   <div className="flex border-b border-slate-700 bg-slate-800">
                                     <button onClick={() => setActiveTab('text')} className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'text' ? 'border-indigo-500 text-indigo-400 bg-indigo-900/20' : 'border-transparent text-slate-400 hover:bg-slate-700'}`}>
                                        <FileCode className="w-4 h-4" /> Patent Specification
                                     </button>
                                     {item.tdl && (
                                        <button onClick={() => setActiveTab('diagram')} className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'diagram' ? 'border-indigo-500 text-indigo-400 bg-indigo-900/20' : 'border-transparent text-slate-400 hover:bg-slate-700'}`}>
                                            <Box className="w-4 h-4" /> Patent Drawings
                                        </button>
                                     )}
                                   </div>
                                   <div className="flex-1 overflow-hidden relative bg-slate-950">
                                      {activeTab === 'text' && (
                                        <div className="absolute inset-0 p-8 overflow-y-auto">
                                            <div className="patent-wrapper mx-auto">
                                                {item.response && !item.response.includes('class="patent-wrapper"') 
                                                    ? <div className="patent-wrapper">{parse(item.response, parserOptions)}</div>
                                                    : parse(item.response || '', parserOptions)
                                                }
                                            </div>
                                        </div>
                                      )}
                                      {activeTab === 'diagram' && item.tdl && (
                                          <div className="absolute inset-0 p-8 overflow-y-auto flex justify-center">
                                              <div className="bg-slate-900 shadow-xl border border-slate-700 w-[210mm] h-[297mm] relative flex flex-col">
                                                  <div className="absolute top-4 right-4 text-xs font-mono text-slate-500 border border-slate-700 px-2 py-1">FIG. 1</div>
                                                  <div className="flex-1 w-full h-full p-8"><Canvas tdl={item.tdl} /></div>
                                              </div>
                                          </div>
                                      )}
                                   </div>
                                </div>
                             </td>
                           </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
            )}
          </div>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: ProcessingStatus, error?: string, hasTdl?: boolean }> = ({ status, error, hasTdl }) => {
  switch (status) {
    case ProcessingStatus.ANALYZING:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-900/30 text-indigo-400 border border-indigo-900"><Search className="w-3 h-3 animate-pulse" /> Analyzing</span>;
    case ProcessingStatus.IDLE:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700"><Clock className="w-3 h-3" /> Ready</span>;
    case ProcessingStatus.QUEUED:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-900/30 text-amber-500 border border-amber-900"><Clock className="w-3 h-3" /> Queued</span>;
    case ProcessingStatus.PROCESSING:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400 border border-blue-900"><Loader2 className="w-3 h-3 animate-spin" /> Processing</span>;
    case ProcessingStatus.COMPLETED:
      return <div className="flex items-center gap-1"><span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-900"><CheckCircle className="w-3 h-3" /> Done</span>{hasTdl && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-900/30 text-indigo-400 border border-indigo-700">TDL</span>}</div>;
    case ProcessingStatus.FAILED:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-900" title={error}><AlertCircle className="w-3 h-3" /> Failed</span>;
    default:
      return null;
  }
};
