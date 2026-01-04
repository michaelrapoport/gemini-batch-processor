import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BatchItem, ProcessingConfig, ProcessingStatus, ToolType, Stats } from './types';
import { DashboardControls } from './components/DashboardControls';
import { FileUploader } from './components/FileUploader';
import { ResultsLibrary } from './components/ResultsLibrary';
import { generateResponse } from './services/gemini';
import { Play, Pause, RefreshCw, Zap } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [items, setItems] = useState<BatchItem[]>([]);
  const [config, setConfig] = useState<ProcessingConfig>({
    systemPrompt: "You are a helpful AI assistant. Analyze the provided HTML content and provide a summary.",
    temperature: 0.7,
    concurrency: 2,
    tool: ToolType.NONE,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Computed Stats ---
  const stats: Stats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total++;
        if (item.status === ProcessingStatus.COMPLETED) acc.completed++;
        if (item.status === ProcessingStatus.FAILED) acc.failed++;
        if (item.status === ProcessingStatus.PROCESSING) acc.processing++;
        if (item.status === ProcessingStatus.QUEUED) acc.queued++;
        return acc;
      },
      { total: 0, completed: 0, failed: 0, processing: 0, queued: 0 }
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
    if (isProcessing) return; // Prevent clearing while running
    setItems([]);
  }, [isProcessing]);

  const handleStart = useCallback(() => {
    if (items.some(i => i.status === ProcessingStatus.IDLE || i.status === ProcessingStatus.FAILED)) {
        // Reset failed items to IDLE so they can be retried if user wants, 
        // or just pick up IDLE ones.
        // Here we just toggle the flag to start the effect loop.
        setIsProcessing(true);
    }
  }, [items]);

  const handleStop = useCallback(() => {
    setIsProcessing(false);
    // Note: In-flight requests will complete, but new ones won't start.
  }, []);

  const handleReset = useCallback(() => {
      setIsProcessing(false);
      setItems(prev => prev.map(item => ({
          ...item,
          status: ProcessingStatus.IDLE,
          response: undefined,
          error: undefined
      })));
  }, []);


  // --- Processing Engine Effect ---
  useEffect(() => {
    if (!isProcessing) return;

    let mounted = true;

    const processNext = async () => {
      // 1. Check current concurrency
      const currentProcessing = items.filter(i => i.status === ProcessingStatus.PROCESSING).length;
      if (currentProcessing >= config.concurrency) return;

      // 2. Find next IDLE item
      // We prioritize IDLE items.
      const nextItemIndex = items.findIndex(i => i.status === ProcessingStatus.IDLE);
      
      if (nextItemIndex === -1) {
        // No more idle items. 
        // If nothing is processing, we are done.
        if (currentProcessing === 0) {
            setIsProcessing(false);
        }
        return;
      }

      // 3. Mark as PROCESSING immediately to reserve slot
      const itemToProcess = items[nextItemIndex];
      
      setItems(prev => {
        const next = [...prev];
        next[nextItemIndex] = { ...next[nextItemIndex], status: ProcessingStatus.PROCESSING, startTime: Date.now() };
        return next;
      });

      // 4. Perform API Call
      try {
        const responseText = await generateResponse({
          content: itemToProcess.content,
          systemPrompt: config.systemPrompt,
          temperature: config.temperature,
          tool: config.tool
        });

        if (mounted) {
          setItems(prev => prev.map(i => 
            i.id === itemToProcess.id 
              ? { ...i, status: ProcessingStatus.COMPLETED, response: responseText, endTime: Date.now() }
              : i
          ));
        }
      } catch (error: any) {
        if (mounted) {
          setItems(prev => prev.map(i => 
            i.id === itemToProcess.id 
              ? { ...i, status: ProcessingStatus.FAILED, error: error.message, endTime: Date.now() }
              : i
          ));
        }
      }
    };

    // Run the processor loop
    // We use a simplified polling/trigger mechanism here. 
    // Whenever `items` changes (due to a completion), this effect re-runs.
    // If we have capacity, we start the next one.
    
    // However, if we just rely on `items` dependency, it might trigger too often or create loops.
    // A robust way in a simple effect is to set a small timeout loop or strictly check capacity.
    
    // Let's use an interval to constantly check queue while `isProcessing` is true.
    // This avoids complex dependency chain issues for this scale.
    const intervalId = setInterval(() => {
        if (mounted && isProcessing) {
             processNext();
        }
    }, 500); // Check every 500ms

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [isProcessing, items, config]); // Dependencies: if config changes (e.g. concurrency), loop adapts.


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
                        disabled={items.length === 0 || stats.processing > 0}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                    >
                        <Play className="w-4 h-4" /> Start Batch
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