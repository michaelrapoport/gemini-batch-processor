export enum ProcessingStatus {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface BatchItem {
  id: string;
  file: File;
  content: string; // The text content of the HTML file
  status: ProcessingStatus;
  response?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export enum ToolType {
  NONE = 'NONE',
  GOOGLE_SEARCH = 'GOOGLE_SEARCH',
  CODE_EXECUTION = 'CODE_EXECUTION',
}

export interface ProcessingConfig {
  systemPrompt: string;
  temperature: number;
  concurrency: number;
  tool: ToolType;
}

export interface Stats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
}