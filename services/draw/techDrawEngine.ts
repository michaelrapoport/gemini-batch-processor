import * as d3 from 'd3';
import { ComponentConfig, ComponentType, ComponentInstance, ConnectionOptions, RegionOptions, TechDrawTheme, LayoutStrategy } from '../../types';
import { createEl, drawText, NS } from './svgUtils';
import { drawSymbol } from './shapes';
import { drawConnection, resetRouter } from './router';
import { parseTDL, generateTDL } from '../techDrawDSL';

interface NodeItem extends d3.SimulationNodeDatum {
  id: string;
  type: ComponentType;
  config: ComponentConfig;
  w: number;
  h: number;
  fx?: number | null;
  fy?: number | null;
  groupId?: string;
  x?: number;
  y?: number;
  // Circuit Layout
  rank?: number;
}

interface LinkItem extends d3.SimulationLinkDatum<NodeItem> {
  source: string | NodeItem;
  target: string | NodeItem;
  sourcePin?: string;
  targetPin?: string;
  options?: ConnectionOptions;
}

interface GroupItem {
  id: string;
  label: string;
  children: string[];
}

interface BoundingBox { x: number; y: number; w: number; h: number; id: string; }

export class TechDrawEngine {
  private svg: SVGSVGElement;
  private rootGroup: SVGGElement;
  private currentTheme: TechDrawTheme = 'DARK'; // Default to DARK mode
  private layoutStrategy: LayoutStrategy = 'force';
  
  // Graph State
  private nodes: Map<string, NodeItem> = new Map();
  private links: LinkItem[] = [];
  private groups: GroupItem[] = [];
  private labelRegions: BoundingBox[] = [];
  private legendItems: any[] = [];
  private generatedComponents: Map<string, ComponentInstance> = new Map();

  // Layers
  private layers: Map<string, SVGGElement> = new Map();

  constructor(svgElement: SVGSVGElement, rootGroup: SVGGElement) {
    this.svg = svgElement;
    this.rootGroup = rootGroup;
    this.setupLayers();
  }

  // --- API ---

  public setTheme(theme: TechDrawTheme) {
    this.currentTheme = theme;
    this.updateDefs();
  }

  public setLayout(strategy: LayoutStrategy) {
    this.layoutStrategy = strategy;
  }

  public add(type: ComponentType, id: string, config: ComponentConfig) {
    const estW = config.width || config.w || 100;
    const estH = config.height || config.h || 60;
    
    const fx = config.x !== undefined ? config.x : null;
    const fy = config.y !== undefined ? config.y : null;

    this.nodes.set(id, {
      id, type, config, w: estW, h: estH, fx, fy,
      groupId: config.parentId
    });
  }

  public connect(fromId: string, fromPin: string, toId: string, toPin: string, options: ConnectionOptions = {}) {
    this.links.push({
      source: fromId,
      target: toId,
      sourcePin: fromPin,
      targetPin: toPin,
      options
    });
  }

  public group(id: string, children: string[], label: string) {
    this.groups.push({ id, children, label });
    children.forEach(childId => {
       const node = this.nodes.get(childId);
       if(node) node.groupId = id;
    });
  }
  
  // --- DSL SUPPORT ---
  
  public loadDSL(tdl: string) {
      // Clear existing
      this.nodes.clear();
      this.links = [];
      this.groups = [];
      
      const { nodes, links } = parseTDL(tdl);
      
      nodes.forEach(n => {
          this.add(n.type as ComponentType, n.id, { label: n.label, ...n.props });
      });
      
      links.forEach(l => {
          this.connect(l.source, l.sourcePin || '', l.target, l.targetPin || '', { label: l.label, ...l.props });
      });
  }
  
  public exportDSL(): string {
      return generateTDL(this.nodes, this.links);
  }

  public addLegend(items: any[]) { this.legendItems = items; }
  
  // --- RENDERING PIPELINE ---

  public render() {
    try {
        this.clear();
        this.updateDefs();
        resetRouter(); // Crucial for clean line crossovers

        const nodeList = Array.from(this.nodes.values());
        // Copy links to prevent mutation of source structure if repeated
        const linkList = this.links.map(l => ({ ...l }));

        this.executeLayout(nodeList, linkList);

        // 2. Draw Groups (Backgrounds)
        this.groups.forEach(group => {
           this.drawGroupContainer(group, nodeList);
        });

        // 3. Draw Nodes (Collect Obstacles)
        const obstacles: BoundingBox[] = [];
        
        // Sort or separate nodes by layer config
        nodeList.forEach(node => {
            const x = node.x || 0;
            const y = node.y || 0;
            const finalConfig = { ...node.config, x, y };
            const layerName = finalConfig.layer || 'middle';
            
            const g = createEl('g', { 
               class: 'component', 
               transform: `translate(${x},${y}) rotate(${finalConfig.rotate || 0})`,
               'data-id': node.id
            }) as SVGGElement;
            
            // Draw Symbol with Fallback safety
            let { pins, w, h } = { pins: {}, w: 100, h: 60 };
            try {
                const res = drawSymbol(node.type, g, finalConfig, this.currentTheme);
                pins = res.pins; w = res.w; h = res.h;
            } catch (err) {
                console.warn(`Failed to render symbol ${node.type}`, err);
                drawText(g, 0, 0, node.type, { fill: 'red' });
            }
            
            if (finalConfig.label) {
                this.drawSmartLabel(g, finalConfig.label, w, h, node.id);
            }

            // Append to correct visual layer
            const targetLayer = this.layers.get(layerName) || this.getLayer('middle');
            targetLayer.appendChild(g);
            
            // Calculate absolute pins for routing
            const absPins: Record<string, {x:number, y:number}> = {};
            const rad = ((finalConfig.rotate||0) * Math.PI) / 180;
            const cos = Math.cos(rad); const sin = Math.sin(rad);
            
            Object.keys(pins).forEach(k => {
                const [px, py] = (pins as any)[k];
                absPins[k] = { x: x + px*cos - py*sin, y: y + px*sin + py*cos };
            });

            this.generatedComponents.set(node.id, { 
               id: node.id, type: node.type, x, y, width: w, height: h, rotation: finalConfig.rotate||0, pins: absPins, config: finalConfig
            });
            
            obstacles.push({ x, y, w, h, id: node.id });
        });
        
        // 3.5 Draw Breakout Visuals (Zoom Lines)
        // Must happen after all components are placed and dimensions known
        nodeList.forEach(node => {
            if (node.config.zoomSource) {
                this.drawBreakoutLines(node.config.zoomSource, node.id);
            }
        });

        // 4. Route Connections
        const connLayer = this.getLayer('middle');
        
        linkList.forEach(link => {
           // Handle both string IDs and object references (post-D3 simulation)
           const srcId = typeof link.source === 'object' ? (link.source as NodeItem).id : link.source;
           const tgtId = typeof link.target === 'object' ? (link.target as NodeItem).id : link.target;
           
           const srcComp = this.generatedComponents.get(srcId as string);
           const tgtComp = this.generatedComponents.get(tgtId as string);
           
           if (srcComp && tgtComp) {
               const p1 = this.resolvePin(srcComp, link.sourcePin, tgtComp);
               const p2 = this.resolvePin(tgtComp, link.targetPin, srcComp);
               
               const result = drawConnection(connLayer, p1, p2, link.options, obstacles, this.currentTheme);
               if (result.labelBox) this.labelRegions.push({ ...result.labelBox, id: 'conn_lbl' });
           }
        });

        if (this.legendItems.length > 0) this.drawLegend();
        this.fitViewBox();

    } catch (e) {
        console.error("TechDraw Engine Render Crash:", e);
        const t = createEl('text', { x: 50, y: 50, fill: 'red', 'font-size': 20 });
        t.textContent = "Rendering Error. Check console.";
        this.svg.appendChild(t);
    }
  }

  private executeLayout(nodes: NodeItem[], links: LinkItem[]) {
      // CRITICAL FIX: Filter out links referencing missing nodes to prevent D3 crash
      // LLMs hallucinate edges to non-existent nodes frequently.
      const validLinks = links.filter(l => {
          const sId = typeof l.source === 'object' ? (l.source as NodeItem).id : l.source;
          const tId = typeof l.target === 'object' ? (l.target as NodeItem).id : l.target;
          return this.nodes.has(sId as string) && this.nodes.has(tId as string);
      });

      if (this.layoutStrategy === 'circuit') {
          // Rank-Based Layout (Topological Sort approximation)
          const rankMap = new Map<string, number>();
          nodes.forEach(n => rankMap.set(n.id, 0));

          // Simple relaxation to determine ranks
          for(let i=0; i<nodes.length; i++) {
              validLinks.forEach(l => {
                  const s = typeof l.source === 'object' ? (l.source as NodeItem).id : l.source;
                  const t = typeof l.target === 'object' ? (l.target as NodeItem).id : l.target;
                  if (rankMap.has(s as string) && rankMap.has(t as string)) {
                      rankMap.set(t as string, Math.max(rankMap.get(t as string)!, rankMap.get(s as string)! + 1));
                  }
              });
          }

          // Group by Rank
          const ranks: NodeItem[][] = [];
          nodes.forEach(n => {
              const r = rankMap.get(n.id) || 0;
              if (!ranks[r]) ranks[r] = [];
              ranks[r].push(n);
          });

          // Position
          const LAYER_H = 120;
          const COMP_W = 150;
          
          ranks.forEach((layer, rIdx) => {
              const startX = -(layer.length * COMP_W) / 2;
              layer.forEach((node, cIdx) => {
                   // If fixed, ignore
                   if (node.fx != null) { node.x = node.fx; node.y = node.fy!; return; }
                   
                   node.x = startX + cIdx * COMP_W;
                   node.y = rIdx * LAYER_H;
              });
          });

      } else if (this.layoutStrategy === 'tree') {
          const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(validLinks).id((d: any) => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("y", d3.forceY((d: any) => (d.index || 0) * 50).strength(0.5))
            .stop();
          simulation.tick(300);
      } else {
          // Force / Default
          const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(validLinks).id((d: any) => d.id).distance(150))
            .force("charge", d3.forceManyBody().strength(-500))
            .force("collide", d3.forceCollide((d: any) => Math.max(d.w, d.h)/1.5 + 20))
            .force("center", d3.forceCenter(0, 0))
            .force("y", d3.forceY(0).strength(0.05))
            .stop();
          simulation.tick(300);
      }
  }
  
  // --- VISUAL FEATURES ---
  
  private drawBreakoutLines(sourceId: string, detailId: string) {
      const src = this.generatedComponents.get(sourceId);
      const dst = this.generatedComponents.get(detailId);
      if (!src || !dst) return;
      
      const layer = this.getLayer('background');
      const strokeColor = this.currentTheme === 'DARK' ? '#64748b' : '#94a3b8';
      
      // Calculate Bounds
      const srcBox = {
          x1: src.x - src.width/2, y1: src.y - src.height/2,
          x2: src.x + src.width/2, y2: src.y + src.height/2
      };
      
      const dstBox = {
          x1: dst.x - dst.width/2, y1: dst.y - dst.height/2,
          x2: dst.x + dst.width/2, y2: dst.y + dst.height/2
      };
      
      // Draw ROI Box on Source
      const padding = 10;
      layer.appendChild(createEl('rect', {
          x: srcBox.x1 - padding, y: srcBox.y1 - padding, 
          width: src.width + padding*2, height: src.height + padding*2,
          fill: 'none', stroke: strokeColor, 'stroke-dasharray': '4,4', 'stroke-width': 1
      }));
      
      // Draw Lines connecting the two boxes
      const pathStr = `M ${srcBox.x2 + padding} ${srcBox.y1 - padding} L ${dstBox.x1} ${dstBox.y1} ` + 
                      `M ${srcBox.x2 + padding} ${srcBox.y2 + padding} L ${dstBox.x1} ${dstBox.y2}`;
                      
      layer.appendChild(createEl('path', {
          d: pathStr,
          stroke: strokeColor, 'stroke-width': 1, 'stroke-dasharray': '2,2', fill: 'none'
      }));
  }

  // --- INTERNAL UTILS ---

  private setupLayers() {
     // Order matters for SVG Z-index
     this.createLayer('background'); // Background elements, breakout lines
     this.createLayer('middle');     // Standard Components (was 'active')
     this.createLayer('foreground'); // Detail views, overlays
     this.createLayer('overlay');    // Tooltips, Legends
  }

  private createLayer(name: string) {
      const g = createEl('g', { id: `layer-${name}` }) as SVGGElement;
      this.rootGroup.appendChild(g);
      this.layers.set(name, g);
  }

  private getLayer(name: string) { return this.layers.get(name)!; }

  private clear() {
      this.layers.forEach(l => { while(l.firstChild) l.removeChild(l.firstChild); });
      this.generatedComponents.clear();
      this.labelRegions = [];
  }

  private updateDefs() {
      let defs = this.svg.querySelector('defs');
      if (!defs) {
          defs = document.createElementNS(NS, 'defs') as unknown as SVGDefsElement;
          this.svg.prepend(defs);
      }
      
      const arrowColor = this.currentTheme === 'DARK' ? '#e2e8f0' : '#1e293b';
      
      const id = `arrow-end-${this.currentTheme}`;
      if (!defs.querySelector(`#${id}`)) {
          const m = createEl('marker', { 
             id, viewBox: '0 0 10 10', refX: 10, refY: 5, 
             markerWidth: 6, markerHeight: 6, orient: 'auto' 
          });
          m.appendChild(createEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: arrowColor }));
          defs.appendChild(m);
      }

      if (!defs.querySelector('#hatch')) {
        const p = createEl('pattern', { id: 'hatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
        p.appendChild(createEl('rect', { width: 2, height: 4, transform: 'translate(0,0)', fill: 'black', opacity: 0.1 })); 
        defs.appendChild(p);
      }
  }

  private drawGroupContainer(group: GroupItem, nodes: NodeItem[]) {
     const children = nodes.filter(n => n.groupId === group.id);
     if (children.length === 0) return;

     let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
     children.forEach(c => {
         const cx = c.x || 0;
         const cy = c.y || 0;
         if ((cx - c.w/2) < minX) minX = cx - c.w/2;
         if ((cx + c.w/2) > maxX) maxX = cx + c.w/2;
         if ((cy - c.h/2) < minY) minY = cy - c.h/2;
         if ((cy + c.h/2) > maxY) maxY = cy + c.h/2;
     });

     const pad = 30;
     const rect = createEl('rect', {
         x: minX - pad, y: minY - pad, 
         width: (maxX-minX) + pad*2, height: (maxY-minY) + pad*2,
         rx: 8,
         fill: this.currentTheme === 'DARK' ? 'rgba(255,255,255,0.05)' : 'none',
         stroke: this.currentTheme === 'DARK' ? '#475569' : '#94a3b8',
         'stroke-dasharray': '8,4',
         'stroke-width': 1.5
     });

     this.getLayer('background').appendChild(rect);

     drawText(this.getLayer('background'), minX - pad + 10, minY - pad - 10, group.label, {
         class: `font-sans text-xs font-bold uppercase tracking-wider ${this.currentTheme === 'DARK' ? 'fill-slate-400' : 'fill-slate-500'}`
     });
  }

  private drawSmartLabel(g: SVGGElement, text: string, w: number, h: number, id: string) {
     const candidates = [
         { x: 0, y: h/2 + 15, anchor: 'middle' },
         { x: 0, y: -h/2 - 10, anchor: 'middle' },
         { x: w/2 + 10, y: 0, anchor: 'start' },
         { x: -w/2 - 10, y: 0, anchor: 'end' }
     ];
     
     const pos = candidates[0]; 
     
     drawText(g, pos.x, pos.y, text, {
         class: `font-sans text-[11px] font-medium ${this.currentTheme === 'DARK' ? 'fill-slate-300' : 'fill-slate-800'}`,
         'text-anchor': pos.anchor,
         'dominant-baseline': 'middle',
         style: this.currentTheme === 'USPTO' ? 'paint-order: stroke; stroke: white; stroke-width: 3px;' : ''
     });
  }

  private resolvePin(comp: ComponentInstance, pinName: string | undefined, otherComp: ComponentInstance): {x: number, y: number} {
     if (pinName && comp.pins[pinName]) return comp.pins[pinName];
     
     const dx = otherComp.x - comp.x;
     const dy = otherComp.y - comp.y;
     
     if (Math.abs(dx) > Math.abs(dy)) {
         return dx > 0 ? (comp.pins.right || {x: comp.x + comp.width/2, y: comp.y}) : (comp.pins.left || {x: comp.x - comp.width/2, y: comp.y});
     } else {
         return dy > 0 ? (comp.pins.bottom || {x: comp.x, y: comp.y + comp.height/2}) : (comp.pins.top || {x: comp.x, y: comp.y - comp.height/2});
     }
  }

  private drawLegend() {
      const g = createEl('g', { transform: 'translate(20, 20)' });
      this.getLayer('overlay').appendChild(g);
  }

  public fitViewBox() {
    const bbox = this.rootGroup.getBBox();
    const pad = 50;
    if (bbox.width === 0) {
        this.svg.setAttribute('viewBox', '0 0 800 600');
        return;
    }
    this.svg.setAttribute('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad*2} ${bbox.height + pad*2}`);
  }

  public getExportSVG(): string {
     return this.svg.outerHTML;
  }
}