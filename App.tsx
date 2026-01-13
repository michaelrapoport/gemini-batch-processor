
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BatchItem, ProcessingConfig, ProcessingStatus, ToolType, Stats, Folder } from './types';
import { DashboardControls } from './components/DashboardControls';
import { FileUploader } from './components/FileUploader';
import { ResultsLibrary } from './components/ResultsLibrary';
import { generateResponse, extractTitle } from './services/gemini';
import { LibraryDB } from './services/db'; 
import { Play, Pause, RefreshCw, Zap, Loader2, Save } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [items, setItems] = useState<BatchItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [config, setConfig] = useState<ProcessingConfig>({
    systemPrompt: "You are a Professional Patent Attorney & Technical Writer. Research gaps, identify prior art, and generate a complete USPTO Patent Application in HTML5 as per the detailed workflow instructions.",
    temperature: 0.7,
    concurrency: 2,
    tool: ToolType.NONE,
    includeCharts: false,
    includeTechDraw: false, 
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const isComponentMounted = useRef(true);
  
  const analyzingIds = useRef<Set<string>>(new Set());

  // --- Persistence Logic ---
  // Load on mount
  useEffect(() => {
      const loadData = async () => {
          try {
              const data = await LibraryDB.loadState();
              setItems(data.items);
              setFolders(data.folders);
          } catch (e) {
              console.error("Failed to load library:", e);
          } finally {
              setIsLoaded(true);
          }
      };
      loadData();
      return () => { isComponentMounted.current = false; };
  }, []);

  // Auto-save when items or folders change (debounced could be better but sticking to direct for reliability in this demo)
  useEffect(() => {
      if (!isLoaded) return;
      const save = async () => {
          try {
              await LibraryDB.saveState(items, folders);
          } catch (e) {
              console.error("Failed to auto-save:", e);
          }
      };
      const timer = setTimeout(save, 1000); // 1s Debounce
      return () => clearTimeout(timer);
  }, [items, folders, isLoaded]);

  // --- Import / Export Handlers ---
  const handleExportLibrary = useCallback(() => {
    const state = {
      version: 1,
      timestamp: Date.now(),
      folders,
      items
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini_library_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [folders, items]);

  const handleImportLibrary = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) {
        alert("Cannot import while processing is active.");
        return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Basic validation
      if (Array.isArray(data.items) && Array.isArray(data.folders)) {
        setItems(data.items);
        setFolders(data.folders);
        // Persist immediately
        await LibraryDB.saveState(data.items, data.folders);
        alert(`Library loaded: ${data.items.length} items, ${data.folders.length} folders.`);
      } else {
        alert("Invalid library file format. Expected JSON with 'items' and 'folders' arrays.");
      }
    } catch (err) {
      console.error("Import failed", err);
      alert("Failed to import library. Check console for details.");
    }
    // Reset input
    e.target.value = '';
  }, [isProcessing]);


  // --- Computed Stats ---
  const stats: Stats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total++;
        if (item.status === ProcessingStatus.COMPLETED) acc.completed++;
        if (item.status === ProcessingStatus.FAILED) acc.failed++;
        if (item.status === ProcessingStatus.PROCESSING) acc.processing++;
        if (item.status === ProcessingStatus.QUEUED) acc.queued++;
        if (item.status === ProcessingStatus.ANALYZING) acc.analyzing++;
        return acc;
      },
      { total: 0, completed: 0, failed: 0, processing: 0, queued: 0, analyzing: 0 }
    );
  }, [items]);

  // --- Handlers ---
  const handleUpload = useCallback((newItems: BatchItem[]) => {
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    if (isProcessing) return;
    setItems([]);
    analyzingIds.current.clear();
  }, [isProcessing]);

  // Folder Logic
  const handleCreateFolder = (name: string) => {
      const newFolder: Folder = {
          id: Math.random().toString(36).substring(2),
          name,
          createdAt: Date.now()
      };
      setFolders(prev => [...prev, newFolder]);
  };

  const handleDeleteFolder = (id: string) => {
      setFolders(prev => prev.filter(f => f.id !== id));
      // Move items in deleted folder to Unsorted (remove folderId)
      setItems(prev => prev.map(i => i.folderId === id ? { ...i, folderId: undefined } : i));
  };

  const handleMoveItem = (itemId: string, folderId: string | undefined) => {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, folderId } : i));
  };


  // --- 1. Metadata Analysis Phase ---
  useEffect(() => {
      const analyzeMetadata = async () => {
          const candidates = items.filter(i => 
              i.status === ProcessingStatus.ANALYZING && 
              !analyzingIds.current.has(i.id)
          );
          
          if (candidates.length === 0) return;

          const activeCount = analyzingIds.current.size;
          const MAX_CONCURRENCY = 5;
          const availableSlots = MAX_CONCURRENCY - activeCount;

          if (availableSlots <= 0) return;

          const batch = candidates.slice(0, availableSlots);

          batch.forEach(async (itemToAnalyze) => {
             analyzingIds.current.add(itemToAnalyze.id);

             try {
                const wordCount = itemToAnalyze.content.trim().split(/\s+/).length;
                const detectedTitle = await extractTitle(itemToAnalyze.content);

                if (isComponentMounted.current) {
                    setItems(prev => prev.map(i => 
                        i.id === itemToAnalyze.id 
                        ? { ...i, status: ProcessingStatus.IDLE, wordCount, detectedTitle }
                        : i
                    ));
                }
             } catch (error) {
                console.error("Metadata extraction failed", error);
                if (isComponentMounted.current) {
                    setItems(prev => prev.map(i => 
                        i.id === itemToAnalyze.id 
                        ? { 
                            ...i, 
                            status: ProcessingStatus.IDLE, 
                            wordCount: itemToAnalyze.content.length / 5, 
                            detectedTitle: i.file.name.replace(/\.[^/.]+$/, "") 
                          }
                        : i
                    ));
                }
             } finally {
                analyzingIds.current.delete(itemToAnalyze.id);
             }
          });
      };

      analyzeMetadata();
  }, [items]); 


  // --- 2. Start Processing (Versioning) ---
  const handleStart = useCallback(async () => {
    if (items.some(i => i.status === ProcessingStatus.ANALYZING)) return;
    
    if (items.some(i => i.status === ProcessingStatus.IDLE || i.status === ProcessingStatus.FAILED)) {
        
        const idleItems = items.filter(i => i.status === ProcessingStatus.IDLE);
        
        const updatedItems = idleItems.map((item) => {
            if (!item.detectedTitle || !item.wordCount) return item;

            const siblings = items.filter(b => 
                b.id !== item.id && 
                b.detectedTitle === item.detectedTitle 
            );
            
            if (siblings.length === 0) {
                 return { ...item, finalTitle: item.detectedTitle };
            }
            
            const allCandidates = [...siblings, item].sort((a, b) => (a.wordCount||0) - (b.wordCount||0));
            const rank = allCandidates.findIndex(c => c.id === item.id) + 1;

            return {
                ...item,
                finalTitle: `${item.detectedTitle} (v${rank})`
            };
        });

        setItems(prev => prev.map(p => {
            const updated = updatedItems.find(u => u.id === p.id);
            return updated ? updated : p;
        }));

        setIsProcessing(true);
    }
  }, [items]);

  const handleStop = useCallback(() => {
    setIsProcessing(false);
  }, []);

  const handleReset = useCallback(() => {
      setIsProcessing(false);
      setItems(prev => prev.map(item => ({
          ...item,
          status: ProcessingStatus.IDLE,
          response: undefined,
          tdl: undefined,
          error: undefined,
      })));
  }, []);


  // --- 3. Processing Engine Loop ---
  useEffect(() => {
    if (!isProcessing) return;

    const processNext = async () => {
      const currentProcessing = items.filter(i => i.status === ProcessingStatus.PROCESSING).length;
      if (currentProcessing >= config.concurrency) return;

      const nextItemIndex = items.findIndex(i => i.status === ProcessingStatus.IDLE);
      
      if (nextItemIndex === -1) {
        if (currentProcessing === 0) {
            setIsProcessing(false);
        }
        return;
      }

      const itemToProcess = items[nextItemIndex];
      setItems(prev => {
        const next = [...prev];
        next[nextItemIndex] = { ...next[nextItemIndex], status: ProcessingStatus.PROCESSING, startTime: Date.now() };
        return next;
      });

      try {
        const result = await generateResponse({
          content: itemToProcess.content,
          systemPrompt: config.systemPrompt,
          temperature: config.temperature,
          tool: config.tool,
          includeCharts: config.includeCharts,
          includeTechDraw: config.includeTechDraw,
          titleOverride: itemToProcess.finalTitle || itemToProcess.detectedTitle
        });

        if (isComponentMounted.current) {
          let safeResponseText = result.text;
          const targetTitle = itemToProcess.finalTitle || itemToProcess.detectedTitle;
          
          if (targetTitle) {
              if (safeResponseText.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)) {
                  safeResponseText = safeResponseText.replace(
                      /<h1[^>]*>[\s\S]*?<\/h1>/i, 
                      `<h1>${targetTitle}</h1>`
                  );
              } else if (safeResponseText.match(/<title>[\s\S]*?<\/title>/i)) {
                   safeResponseText = safeResponseText.replace(
                      /<title>[\s\S]*?<\/title>/i, 
                      `<title>${targetTitle}</title>`
                  );
                  const wrapperMatch = safeResponseText.match(/<div class="patent-wrapper">/i);
                  if (wrapperMatch) {
                      safeResponseText = safeResponseText.replace(
                          /<div class="patent-wrapper">/i,
                          `<div class="patent-wrapper"><header class="patent-biblio"><h1>${targetTitle}</h1></header>`
                      );
                  }
              }
          }

          setItems(prev => prev.map(i => 
            i.id === itemToProcess.id 
              ? { 
                  ...i, 
                  status: ProcessingStatus.COMPLETED, 
                  response: safeResponseText, 
                  tdl: result.tdl,
                  endTime: Date.now() 
                }
              : i
          ));
        }
      } catch (error: any) {
        if (isComponentMounted.current) {
          setItems(prev => prev.map(i => 
            i.id === itemToProcess.id 
              ? { ...i, status: ProcessingStatus.FAILED, error: error.message, endTime: Date.now() }
              : i
          ));
        }
      }
    };

    processNext();

  }, [isProcessing, items, config]); 


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
                <Zap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">
              Gemini Batch Processor
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-400">
             <div className="hidden sm:flex items-center gap-4 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-500"></div> Total: {stats.total}</span>
                {stats.analyzing > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-500"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing: {stats.analyzing}</span>
                )}
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Processing: {stats.processing}</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div> Done: {stats.completed}</span>
                {(stats.failed > 0) && <span className="flex items-center gap-1.5 text-red-500"><div className="w-2 h-2 rounded-full bg-red-500"></div> Failed: {stats.failed}</span>}
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-800 flex flex-col gap-3">
               <div className="grid grid-cols-2 gap-3">
                 {!isProcessing ? (
                    <button
                        onClick={handleStart}
                        disabled={items.length === 0 || stats.analyzing > 0 || stats.processing > 0}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                    >
                        {stats.analyzing > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {stats.analyzing > 0 ? 'Analyzing...' : 'Start Batch'}
                    </button>
                 ) : (
                    <button
                        onClick={handleStop}
                        className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <Pause className="w-4 h-4" /> Pause
                    </button>
                 )}
                 
                 <button
                    onClick={handleReset}
                    disabled={isProcessing || items.length === 0}
                    className="flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className="w-4 h-4" /> Reset Status
                </button>
               </div>
            </div>

            <DashboardControls 
              config={config} 
              setConfig={setConfig} 
              disabled={isProcessing} 
            />
            
            <FileUploader 
              onUpload={handleUpload} 
              disabled={isProcessing} 
            />
          </div>

          <div className="lg:col-span-8 h-full">
            <ResultsLibrary 
                items={items} 
                folders={folders}
                onDelete={handleDelete}
                onClearAll={handleClearAll}
                onCreateFolder={handleCreateFolder}
                onDeleteFolder={handleDeleteFolder}
                onMoveItem={handleMoveItem}
                onExportLibrary={handleExportLibrary}
                onImportLibrary={handleImportLibrary}
            />
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
