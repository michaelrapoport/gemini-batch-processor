export enum ProcessingStatus {
  ANALYZING = 'ANALYZING',
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
  
  // Metadata
  wordCount?: number;
  detectedTitle?: string; // The raw title detected by Gemini
  finalTitle?: string;    // The versioned title determined by the engine
  
  response?: string;
  tdl?: string; // TechDraw Language code for diagrams
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
  includeCharts: boolean; // Toggle for Chart Agent
}

export interface Stats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
  analyzing: number;
}

// TechDraw Types needed for the engine
export type ComponentType = 
  | 'rect' | 'circle' | 'cloud' | 'database' | 'server' | 'box' | 'block'
  | 'resistor' | 'capacitor' | 'inductor' | 'diode' | 'led'
  | 'source_v' | 'source_i' | 'gnd'
  | 'opamp' | 'transistor_npn' | 'transistor_pnp' | 'mosfet_n' | 'mosfet_p'
  | 'gate_and' | 'gate_nand' | 'gate_or' | 'gate_nor' | 'gate_not' | 'gate_xor'
  | 'flow_start' | 'flow_process' | 'flow_decision' | 'flow_end' | 'diamond'
  | 'wireframe_cube' | 'wireframe_cylinder' | 'wireframe_cone' 
  | 'piston' | 'gear' | 'spring' | 'valve' | 'nozzle' | 'cam' | 'crank' | 'coil'
  | 'chart_line' | 'chart_bar' | 'chart_scatter' | 'chart_radar' | 'chart_pie' | 'chart_box' | 'chart_flow';

export interface ComponentConfig {
  label?: string;
  x?: number; 
  y?: number;
  width?: number;
  height?: number;
  w?: number;
  h?: number;
  rotate?: number;
  depth?: number;
  layer?: string;
  parentId?: string;
  zoomSource?: string;
  imageUrl?: string;
  data?: any[];
  chartOptions?: any;
  [key: string]: any;
}

export interface ComponentInstance {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  pins: Record<string, {x: number, y: number}>;
  config: ComponentConfig;
}

export interface PinPosition {
  x: number; 
  y: number;
}

export interface ConnectionOptions {
    color?: string;
    style?: 'solid' | 'dashed' | 'thick';
    curve?: 'straight' | 'bezier' | 'step' | 'jump';
    arrow?: 'none' | 'end' | 'start' | 'both';
    label?: string;
    jumpSize?: number;
}

export type TechDrawTheme = 'USPTO' | 'BLUEPRINT' | 'DARK';

export interface RegionOptions {
    label?: string;
    padding?: number;
}

export type LayoutStrategy = 'force' | 'tree' | 'circuit' | 'manual';