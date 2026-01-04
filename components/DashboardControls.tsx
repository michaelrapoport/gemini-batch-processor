import React from 'react';
import { ProcessingConfig, ToolType } from '../types';
import { Settings, Thermometer, Cpu, Search, Code, Activity } from 'lucide-react';

interface DashboardControlsProps {
  config: ProcessingConfig;
  setConfig: React.Dispatch<React.SetStateAction<ProcessingConfig>>;
  disabled: boolean;
}

export const DashboardControls: React.FC<DashboardControlsProps> = ({ config, setConfig, disabled }) => {
  const handleToolChange = (tool: ToolType) => {
    setConfig(prev => ({ ...prev, tool: prev.tool === tool ? ToolType.NONE : tool }));
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
        <Settings className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-semibold text-slate-800">Configuration</h2>
      </div>

      {/* System Prompt */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          System Prompt
        </label>
        <textarea
          className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-500"
          placeholder="Enter instructions for the model (e.g., 'Summarize this HTML document in markdown format...')"
          value={config.systemPrompt}
          onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Temperature */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Thermometer className="w-4 h-4" /> Temperature
            </label>
            <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
              {config.temperature.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={config.temperature}
            onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
            disabled={disabled}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-slate-400 px-1">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>

        {/* Concurrency */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
             <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Activity className="w-4 h-4" /> Concurrency
            </label>
            <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
              {config.concurrency} threads
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={config.concurrency}
            onChange={(e) => setConfig({ ...config, concurrency: parseInt(e.target.value) })}
            disabled={disabled}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-slate-400 px-1">
            <span>Sequential</span>
            <span>Parallel (Max 5)</span>
          </div>
        </div>
      </div>

      {/* Tools */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
          <Cpu className="w-4 h-4" /> Tools (Mutually Exclusive)
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => handleToolChange(ToolType.GOOGLE_SEARCH)}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
              config.tool === ToolType.GOOGLE_SEARCH
                ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-500'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Search className="w-4 h-4" />
            <span className="text-sm font-medium">Google Search</span>
          </button>

          <button
            onClick={() => handleToolChange(ToolType.CODE_EXECUTION)}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
              config.tool === ToolType.CODE_EXECUTION
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 ring-1 ring-emerald-500'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Code className="w-4 h-4" />
            <span className="text-sm font-medium">Code Execution</span>
          </button>
        </div>
        <p className="text-xs text-slate-500">
          * Google Search cannot be combined with other tools.
        </p>
      </div>
    </div>
  );
};