import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BatchItem, ProcessingConfig, ProcessingStatus, ToolType, Stats } from './types';
import { DashboardControls } from './components/DashboardControls';
import { FileUploader } from './components/FileUploader';
import { ResultsLibrary } from './components/ResultsLibrary';
import { generateResponse, extractTitle } from './services/gemini';
import { PatentDB } from './services/db';
import { Play, Pause, RefreshCw, Zap, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [items, setItems] = useState<BatchItem[]>([]);
  const [config, setConfig] = useState<ProcessingConfig>({
    systemPrompt: "You are a helpful AI assistant. Analyze the provided patent or technical document. Summarize the key claims and technical architecture.",
    temperature: 0.7,
    concurrency: 2,
    tool: ToolType.NONE,
    includeCharts: false, // Default: Charts disabled
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const isComponentMounted = useRef(true);
  
  // Track active metadata analysis requests to enforce concurrency limit
  const analyzingIds = useRef<Set<string>>(new Set());

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

  // --- Lifecycle Ref ---
  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
    };
  }, []);

  // --- Handlers ---
  const handleUpload = useCallback((newItems: BatchItem[]) => {
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    // If the item was analyzing, the promise will eventually fail to map it, which is fine.
    // The analyzingIds set will be cleaned up in the finally block.
  }, []);

  const handleClearAll = useCallback(() => {
    if (isProcessing) return; // Prevent clearing while running
    setItems([]);
    analyzingIds.current.clear();
  }, [isProcessing]);

  // --- 1. Metadata Analysis Phase (Sliding Window Batching) ---
  useEffect(() => {
      const analyzeMetadata = async () => {
          // 1. Filter candidates: Items that are ANALYZING and NOT currently being fetched
          const candidates = items.filter(i => 
              i.status === ProcessingStatus.ANALYZING && 
              !analyzingIds.current.has(i.id)
          );
          
          if (candidates.length === 0) return;

          // 2. Check available concurrency slots (Max 5 concurrent metadata fetches)
          const activeCount = analyzingIds.current.size;
          const MAX_CONCURRENCY = 5;
          const availableSlots = MAX_CONCURRENCY - activeCount;

          if (availableSlots <= 0) return;

          // 3. Take a batch that fits in the slots
          const batch = candidates.slice(0, availableSlots);

          // 4. Process batch
          batch.forEach(async (itemToAnalyze) => {
             // Mark as active immediately to prevent double-scheduling
             analyzingIds.current.add(itemToAnalyze.id);

             try {
                // Local calc
                const wordCount = itemToAnalyze.content.trim().split(/\s+/).length;
                // API calc
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
                    // Fallback to filename
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
                // Release slot
                analyzingIds.current.delete(itemToAnalyze.id);
             }
          });
      };

      analyzeMetadata();
  }, [items]); // Re-runs whenever items update (e.g., when a batch finishes and status changes to IDLE)


  // --- 2. Start Processing (Versioning + Generation) ---
  const handleStart = useCallback(async () => {
    // Can only start if no items are analyzing
    if (items.some(i => i.status === ProcessingStatus.ANALYZING)) return;
    
    // Check if there are any workable items
    if (items.some(i => i.status === ProcessingStatus.IDLE || i.status === ProcessingStatus.FAILED)) {
        
        // --- Versioning Logic ---
        // Before starting processing, resolve versions for all IDLE items
        const idleItems = items.filter(i => i.status === ProcessingStatus.IDLE);
        
        // We need to resolve versions asynchronously against DB
        const updatedItems = await Promise.all(idleItems.map(async (item) => {
            if (!item.detectedTitle || !item.wordCount) return item;

            // 1. Get DB records
            const dbRecords = await PatentDB.getByTitle(item.detectedTitle);
            
            // 2. Get other batch items with same title
            const batchSiblings = items.filter(b => 
                b.id !== item.id && // not self
                b.detectedTitle === item.detectedTitle // same title
            ).map(b => ({
                source: 'BATCH',
                id: b.id,
                wordCount: b.wordCount || 0
            }));

            // 3. Combine and Sort (Lowest Word Count -> Highest)
            const allCandidates = [
                ...dbRecords.map(r => ({ source: 'DB', id: r.id, wordCount: r.wordCount })),
                ...batchSiblings,
                { source: 'BATCH', id: item.id, wordCount: item.wordCount }
            ].sort((a, b) => a.wordCount - b.wordCount);

            // 4. Determine Version
            if (allCandidates.length === 1) {
                return { ...item, finalTitle: item.detectedTitle };
            }

            // Find index of current item (1-based version)
            const rank = allCandidates.findIndex(c => c.source === 'BATCH' && c.id === item.id) + 1;
            
            return {
                ...item,
                finalTitle: `${item.detectedTitle} (v${rank})`
            };
        }));

        // Update state with versioned titles
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
          // Keep metadata (title/wordcount) to avoid re-analysis
      })));
  }, []);


  // --- 3. Processing Engine Loop ---
  useEffect(() => {
    if (!isProcessing) return;

    const processNext = async () => {
      // 1. Check current concurrency
      const currentProcessing = items.filter(i => i.status === ProcessingStatus.PROCESSING).length;
      if (currentProcessing >= config.concurrency) return;

      // 2. Find next IDLE item
      const nextItemIndex = items.findIndex(i => i.status === ProcessingStatus.IDLE);
      
      if (nextItemIndex === -1) {
        if (currentProcessing === 0) {
            setIsProcessing(false);
        }
        return;
      }

      // 3. Mark as PROCESSING
      const itemToProcess = items[nextItemIndex];
      setItems(prev => {
        const next = [...prev];
        next[nextItemIndex] = { ...next[nextItemIndex], status: ProcessingStatus.PROCESSING, startTime: Date.now() };
        return next;
      });

      // 4. Perform API Call
      try {
        const result = await generateResponse({
          content: itemToProcess.content,
          systemPrompt: config.systemPrompt,
          temperature: config.temperature,
          tool: config.tool,
          includeCharts: config.includeCharts,
          titleOverride: itemToProcess.finalTitle || itemToProcess.detectedTitle
        });

        if (isComponentMounted.current) {
          // Update State
          setItems(prev => prev.map(i => 
            i.id === itemToProcess.id 
              ? { 
                  ...i, 
                  status: ProcessingStatus.COMPLETED, 
                  response: result.text, 
                  tdl: result.tdl,
                  endTime: Date.now() 
                }
              : i
          ));

          // Save to IndexedDB
          await PatentDB.add({
              title: itemToProcess.detectedTitle || "Unknown",
              wordCount: itemToProcess.wordCount || 0,
              fileName: itemToProcess.file.name,
              timestamp: new Date().toISOString()
          });
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


  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
                <Zap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              Gemini Batch Processor
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
             <div className="hidden sm:flex items-center gap-4 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-400"></div> Total: {stats.total}</span>
                {stats.analyzing > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-600"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing: {stats.analyzing}</span>
                )}
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Processing: {stats.processing}</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div> Done: {stats.completed}</span>
                {(stats.failed > 0) && <span className="flex items-center gap-1.5 text-red-600"><div className="w-2 h-2 rounded-full bg-red-500"></div> Failed: {stats.failed}</span>}
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Controls & Upload */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Action Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-3">
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
                        className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <Pause className="w-4 h-4" /> Pause
                    </button>
                 )}
                 
                 <button
                    onClick={handleReset}
                    disabled={isProcessing || items.length === 0}
                    className="flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Right Column: Results */}
          <div className="lg:col-span-8 h-full">
            <ResultsLibrary 
                items={items} 
                onDelete={handleDelete}
                onClearAll={handleClearAll}
            />
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;