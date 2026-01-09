import { ComponentConfig, ComponentType, ComponentInstance, PinPosition } from '../types';

/**
 * TechDrawEngine
 * Handles imperative SVG manipulation for high-performance schematic rendering.
 * Uses a Manhattan routing algorithm for wires.
 */
export class TechDrawEngine {
  private svg: SVGSVGElement;
  private rootGroup: SVGGElement;
  private activeLayer: SVGGElement;
  private components: Map<string, ComponentInstance> = new Map();
  
  // Namespace for SVG creation
  private ns = 'http://www.w3.org/2000/svg';

  constructor(svgElement: SVGSVGElement, rootGroup: SVGGElement) {
    this.svg = svgElement;
    this.rootGroup = rootGroup;
    this.activeLayer = rootGroup; // Drawing directly into the transform group
  }

  public reset() {
    // Keep the grid/defs, clear the content
    while (this.activeLayer.firstChild) {
      this.activeLayer.removeChild(this.activeLayer.firstChild);
    }
    this.components.clear();
  }

  private createEl(tag: string, attrs: Record<string, string | number>): SVGElement {
    const el = document.createElementNS(this.ns, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el as SVGElement;
  }

  // --- Symbol Definitions ---
  private drawSymbol(type: ComponentType, g: SVGGElement): Record<string, [number, number]> {
    // Returns relative pin positions [x, y]
    switch (type) {
      // --- PASSIVES ---
      case 'resistor':
        g.appendChild(this.createEl('path', { 
          d: 'M -30 0 L -20 0 L -15 -10 L -5 10 L 5 -10 L 15 10 L 20 0 L 30 0', 
          class: 'stroke-slate-800 stroke-[2] fill-none stroke-linecap-round stroke-linejoin-round' 
        }));
        return { left: [-30, 0], right: [30, 0] };

      case 'capacitor':
        g.appendChild(this.createEl('line', { x1: -5, y1: -15, x2: -5, y2: 15, class: 'stroke-slate-800 stroke-[3]' }));
        g.appendChild(this.createEl('line', { x1: 5, y1: -15, x2: 5, y2: 15, class: 'stroke-slate-800 stroke-[3]' }));
        g.appendChild(this.createEl('line', { x1: -30, y1: 0, x2: -5, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: 5, y1: 0, x2: 30, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
        return { left: [-30, 0], right: [30, 0] };

      case 'inductor':
         g.appendChild(this.createEl('path', {
             d: 'M -30 0 L -20 0 Q -15 -10 -10 0 Q -5 -10 0 0 Q 5 -10 10 0 Q 15 -10 20 0 L 30 0',
             class: 'stroke-slate-800 stroke-[2] fill-none'
         }));
         return { left: [-30, 0], right: [30, 0] };

      case 'diode':
          g.appendChild(this.createEl('path', { d: 'M -10 -10 L -10 10 L 10 0 Z', class: 'fill-slate-800 stroke-none' }));
          g.appendChild(this.createEl('line', { x1: 10, y1: -10, x2: 10, y2: 10, class: 'stroke-slate-800 stroke-[3]' }));
          g.appendChild(this.createEl('line', { x1: -30, y1: 0, x2: -10, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
          g.appendChild(this.createEl('line', { x1: 10, y1: 0, x2: 30, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
          return { anode: [-30, 0], cathode: [30, 0] };
          
      case 'led':
          g.appendChild(this.createEl('path', { d: 'M -10 -10 L -10 10 L 10 0 Z', class: 'fill-slate-800 stroke-none' }));
          g.appendChild(this.createEl('line', { x1: 10, y1: -10, x2: 10, y2: 10, class: 'stroke-slate-800 stroke-[3]' }));
          g.appendChild(this.createEl('line', { x1: -30, y1: 0, x2: -10, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
          g.appendChild(this.createEl('line', { x1: 10, y1: 0, x2: 30, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
          // Arrows
          g.appendChild(this.createEl('path', { d: 'M -5 -15 L 5 -25 M 5 -15 L 15 -25', class: 'stroke-slate-800 stroke-[1.5] fill-none' }));
          g.appendChild(this.createEl('path', { d: 'M 2 -25 L 5 -25 L 5 -22 M 12 -25 L 15 -25 L 15 -22', class: 'stroke-slate-800 stroke-[1.5] fill-none' }));
          return { anode: [-30, 0], cathode: [30, 0] };

      // --- SOURCES ---
      case 'source_v':
        g.appendChild(this.createEl('circle', { cx: 0, cy: 0, r: 20, class: 'stroke-slate-800 stroke-[2] fill-none' }));
        const plus = this.createEl('text', { x: -5, y: -5, style: 'font-size: 16px; font-family: sans-serif;' });
        plus.textContent = '+';
        g.appendChild(plus);
        const minus = this.createEl('text', { x: -3, y: 15, style: 'font-size: 16px; font-family: sans-serif;' });
        minus.textContent = '-';
        g.appendChild(minus);
        g.appendChild(this.createEl('line', { x1: 0, y1: -30, x2: 0, y2: -20, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: 0, y1: 20, x2: 0, y2: 30, class: 'stroke-slate-800 stroke-[2]' }));
        return { top: [0, -30], bottom: [0, 30] };

      case 'source_i':
        g.appendChild(this.createEl('circle', { cx: 0, cy: 0, r: 20, class: 'stroke-slate-800 stroke-[2] fill-none' }));
        g.appendChild(this.createEl('path', { d: 'M 0 -10 L 0 10 L 5 5 M 0 10 L -5 5', class: 'stroke-slate-800 stroke-[2] fill-none' }));
        g.appendChild(this.createEl('line', { x1: 0, y1: -30, x2: 0, y2: -20, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: 0, y1: 20, x2: 0, y2: 30, class: 'stroke-slate-800 stroke-[2]' }));
        return { top: [0, -30], bottom: [0, 30] };

      case 'gnd':
        g.appendChild(this.createEl('path', { d: 'M 0 -10 L 0 0 M -15 0 L 15 0 M -10 5 L 10 5 M -5 10 L 5 10', class: 'stroke-slate-800 stroke-[2] fill-none' }));
        return { top: [0, -10] };

      // --- ACTIVES ---
      case 'opamp':
        g.appendChild(this.createEl('path', { d: 'M -30 -35 L -30 35 L 35 0 Z', class: 'stroke-slate-800 stroke-[2] fill-white' }));
        const inv = this.createEl('text', { x: -25, y: -10, style: 'font-size: 14px; font-family: sans-serif;' });
        inv.textContent = '-';
        g.appendChild(inv);
        const non = this.createEl('text', { x: -25, y: 20, style: 'font-size: 14px; font-family: sans-serif;' });
        non.textContent = '+';
        g.appendChild(non);
        g.appendChild(this.createEl('line', { x1: -50, y1: -15, x2: -30, y2: -15, class: 'stroke-slate-800 stroke-[2]' })); // In -
        g.appendChild(this.createEl('line', { x1: -50, y1: 15, x2: -30, y2: 15, class: 'stroke-slate-800 stroke-[2]' })); // In +
        g.appendChild(this.createEl('line', { x1: 35, y1: 0, x2: 55, y2: 0, class: 'stroke-slate-800 stroke-[2]' })); // Out
        return { in_inv: [-50, -15], in_non: [-50, 15], out: [55, 0] };

      case 'transistor_npn':
        g.appendChild(this.createEl('circle', { cx: 0, cy: 0, r: 25, class: 'stroke-slate-800 stroke-[1.5] fill-none' }));
        g.appendChild(this.createEl('line', { x1: -15, y1: -15, x2: -15, y2: 15, class: 'stroke-slate-800 stroke-[3]' })); // Base bar
        g.appendChild(this.createEl('line', { x1: -30, y1: 0, x2: -15, y2: 0, class: 'stroke-slate-800 stroke-[2]' })); // Base wire
        g.appendChild(this.createEl('line', { x1: -15, y1: -10, x2: 15, y2: -25, class: 'stroke-slate-800 stroke-[2]' })); // Collector internal
        g.appendChild(this.createEl('line', { x1: 15, y1: -25, x2: 15, y2: -40, class: 'stroke-slate-800 stroke-[2]' })); // Collector wire
        g.appendChild(this.createEl('line', { x1: -15, y1: 10, x2: 15, y2: 25, class: 'stroke-slate-800 stroke-[2]' })); // Emitter internal
        g.appendChild(this.createEl('line', { x1: 15, y1: 25, x2: 15, y2: 40, class: 'stroke-slate-800 stroke-[2]' })); // Emitter wire
        // Arrow Out
        g.appendChild(this.createEl('path', { d: 'M 10 28 L 16 26 L 14 20', class: 'stroke-slate-800 stroke-[2] fill-slate-800' }));
        return { base: [-30, 0], collector: [15, -40], emitter: [15, 40] };

      case 'transistor_pnp':
        g.appendChild(this.createEl('circle', { cx: 0, cy: 0, r: 25, class: 'stroke-slate-800 stroke-[1.5] fill-none' }));
        g.appendChild(this.createEl('line', { x1: -15, y1: -15, x2: -15, y2: 15, class: 'stroke-slate-800 stroke-[3]' })); // Base bar
        g.appendChild(this.createEl('line', { x1: -30, y1: 0, x2: -15, y2: 0, class: 'stroke-slate-800 stroke-[2]' })); // Base wire
        g.appendChild(this.createEl('line', { x1: -15, y1: -10, x2: 15, y2: -25, class: 'stroke-slate-800 stroke-[2]' })); // Collector internal
        g.appendChild(this.createEl('line', { x1: 15, y1: -25, x2: 15, y2: -40, class: 'stroke-slate-800 stroke-[2]' })); // Collector wire
        g.appendChild(this.createEl('line', { x1: -15, y1: 10, x2: 15, y2: 25, class: 'stroke-slate-800 stroke-[2]' })); // Emitter internal
        g.appendChild(this.createEl('line', { x1: 15, y1: 25, x2: 15, y2: 40, class: 'stroke-slate-800 stroke-[2]' })); // Emitter wire
        // Arrow In
        g.appendChild(this.createEl('path', { d: 'M -5 10 L -2 16 L -10 16', class: 'stroke-slate-800 stroke-[2] fill-slate-800' }));
        return { base: [-30, 0], collector: [15, -40], emitter: [15, 40] };

      case 'mosfet_n':
        g.appendChild(this.createEl('circle', { cx: 0, cy: 0, r: 25, class: 'stroke-slate-800 stroke-[1.5] fill-none' }));
        g.appendChild(this.createEl('line', { x1: -15, y1: -15, x2: -15, y2: 15, class: 'stroke-slate-800 stroke-[2]' })); // Gate
        g.appendChild(this.createEl('line', { x1: -5, y1: -15, x2: -5, y2: -5, class: 'stroke-slate-800 stroke-[2]' })); // Drain chunk
        g.appendChild(this.createEl('line', { x1: -5, y1: -2, x2: -5, y2: 2, class: 'stroke-slate-800 stroke-[2]' })); // Body chunk
        g.appendChild(this.createEl('line', { x1: -5, y1: 5, x2: -5, y2: 15, class: 'stroke-slate-800 stroke-[2]' })); // Source chunk
        g.appendChild(this.createEl('line', { x1: -30, y1: 0, x2: -15, y2: 0, class: 'stroke-slate-800 stroke-[2]' })); // Gate Wire
        g.appendChild(this.createEl('line', { x1: -5, y1: -10, x2: 15, y2: -10, class: 'stroke-slate-800 stroke-[2]' })); // Drain horiz
        g.appendChild(this.createEl('line', { x1: 15, y1: -10, x2: 15, y2: -40, class: 'stroke-slate-800 stroke-[2]' })); // Drain Vert
        g.appendChild(this.createEl('line', { x1: -5, y1: 10, x2: 15, y2: 10, class: 'stroke-slate-800 stroke-[2]' })); // Source horiz
        g.appendChild(this.createEl('line', { x1: 15, y1: 10, x2: 15, y2: 40, class: 'stroke-slate-800 stroke-[2]' })); // Source Vert
        g.appendChild(this.createEl('path', { d: 'M -5 0 L 0 -3 L 0 3 Z', class: 'fill-slate-800' })); // Arrow on body
        return { gate: [-30, 0], drain: [15, -40], source: [15, 40] };

      case 'mosfet_p':
        g.appendChild(this.createEl('circle', { cx: 0, cy: 0, r: 25, class: 'stroke-slate-800 stroke-[1.5] fill-none' }));
        g.appendChild(this.createEl('line', { x1: -15, y1: -15, x2: -15, y2: 15, class: 'stroke-slate-800 stroke-[2]' })); // Gate
        g.appendChild(this.createEl('line', { x1: -5, y1: -15, x2: -5, y2: -5, class: 'stroke-slate-800 stroke-[2]' })); // Drain chunk
        g.appendChild(this.createEl('line', { x1: -5, y1: -2, x2: -5, y2: 2, class: 'stroke-slate-800 stroke-[2]' })); // Body chunk
        g.appendChild(this.createEl('line', { x1: -5, y1: 5, x2: -5, y2: 15, class: 'stroke-slate-800 stroke-[2]' })); // Source chunk
        g.appendChild(this.createEl('line', { x1: -30, y1: 0, x2: -15, y2: 0, class: 'stroke-slate-800 stroke-[2]' })); // Gate Wire
        g.appendChild(this.createEl('line', { x1: -5, y1: -10, x2: 15, y2: -10, class: 'stroke-slate-800 stroke-[2]' })); // Drain horiz
        g.appendChild(this.createEl('line', { x1: 15, y1: -10, x2: 15, y2: -40, class: 'stroke-slate-800 stroke-[2]' })); // Drain Vert
        g.appendChild(this.createEl('line', { x1: -5, y1: 10, x2: 15, y2: 10, class: 'stroke-slate-800 stroke-[2]' })); // Source horiz
        g.appendChild(this.createEl('line', { x1: 15, y1: 10, x2: 15, y2: 40, class: 'stroke-slate-800 stroke-[2]' })); // Source Vert
        g.appendChild(this.createEl('path', { d: 'M 0 0 L -5 -3 L -5 3 Z', class: 'fill-slate-800' })); // Arrow on body out
        return { gate: [-30, 0], drain: [15, -40], source: [15, 40] };

      // --- LOGIC ---
      case 'gate_and':
        g.appendChild(this.createEl('path', { d: 'M -30 -25 L -10 -25 A 25 25 0 0 1 -10 25 L -30 25 Z', class: 'stroke-slate-800 stroke-[2] fill-white' }));
        g.appendChild(this.createEl('line', { x1: -45, y1: -10, x2: -30, y2: -10, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: -45, y1: 10, x2: -30, y2: 10, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: 15, y1: 0, x2: 30, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
        return { in1: [-45, -10], in2: [-45, 10], out: [30, 0] };

      case 'gate_nand':
        g.appendChild(this.createEl('path', { d: 'M -30 -25 L -10 -25 A 25 25 0 0 1 -10 25 L -30 25 Z', class: 'stroke-slate-800 stroke-[2] fill-white' }));
        g.appendChild(this.createEl('circle', { cx: 20, cy: 0, r: 5, class: 'stroke-slate-800 stroke-[2] fill-white' }));
        g.appendChild(this.createEl('line', { x1: -45, y1: -10, x2: -30, y2: -10, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: -45, y1: 10, x2: -30, y2: 10, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: 25, y1: 0, x2: 35, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
        return { in1: [-45, -10], in2: [-45, 10], out: [35, 0] };

      case 'gate_or':
        g.appendChild(this.createEl('path', { d: 'M -30 -25 Q -10 -25 5 0 Q -10 25 -30 25 Q -20 0 -30 -25', class: 'stroke-slate-800 stroke-[2] fill-white' }));
        g.appendChild(this.createEl('line', { x1: -45, y1: -10, x2: -25, y2: -10, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: -45, y1: 10, x2: -25, y2: 10, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: 5, y1: 0, x2: 25, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
        return { in1: [-45, -10], in2: [-45, 10], out: [25, 0] };
      
      case 'gate_nor':
          g.appendChild(this.createEl('path', { d: 'M -30 -25 Q -10 -25 5 0 Q -10 25 -30 25 Q -20 0 -30 -25', class: 'stroke-slate-800 stroke-[2] fill-white' }));
          g.appendChild(this.createEl('circle', { cx: 10, cy: 0, r: 5, class: 'stroke-slate-800 stroke-[2] fill-white' }));
          g.appendChild(this.createEl('line', { x1: -45, y1: -10, x2: -25, y2: -10, class: 'stroke-slate-800 stroke-[2]' }));
          g.appendChild(this.createEl('line', { x1: -45, y1: 10, x2: -25, y2: 10, class: 'stroke-slate-800 stroke-[2]' }));
          g.appendChild(this.createEl('line', { x1: 15, y1: 0, x2: 30, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
          return { in1: [-45, -10], in2: [-45, 10], out: [30, 0] };

      case 'gate_not':
        g.appendChild(this.createEl('path', { d: 'M -20 -15 L -20 15 L 10 0 Z', class: 'stroke-slate-800 stroke-[2] fill-white' }));
        g.appendChild(this.createEl('circle', { cx: 15, cy: 0, r: 5, class: 'stroke-slate-800 stroke-[2] fill-white' }));
        g.appendChild(this.createEl('line', { x1: -35, y1: 0, x2: -20, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
        g.appendChild(this.createEl('line', { x1: 20, y1: 0, x2: 35, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
        return { in: [-35, 0], out: [35, 0] };
        
      case 'gate_xor':
          g.appendChild(this.createEl('path', { d: 'M -25 -25 Q -5 -25 10 0 Q -5 25 -25 25 Q -15 0 -25 -25', class: 'stroke-slate-800 stroke-[2] fill-white' }));
          g.appendChild(this.createEl('path', { d: 'M -32 -25 Q -22 0 -32 25', class: 'stroke-slate-800 stroke-[2] fill-none' }));
          g.appendChild(this.createEl('line', { x1: -45, y1: -10, x2: -28, y2: -10, class: 'stroke-slate-800 stroke-[2]' }));
          g.appendChild(this.createEl('line', { x1: -45, y1: 10, x2: -28, y2: 10, class: 'stroke-slate-800 stroke-[2]' }));
          g.appendChild(this.createEl('line', { x1: 10, y1: 0, x2: 25, y2: 0, class: 'stroke-slate-800 stroke-[2]' }));
          return { in1: [-45, -10], in2: [-45, 10], out: [25, 0] };

      default:
        return {};
    }
  }

  public add(type: ComponentType, id: string, config: ComponentConfig) {
    const { x, y, rotate = 0, label = '' } = config;

    const g = this.createEl('g', { 
      class: 'symbol cursor-pointer hover:opacity-80 transition-opacity', 
      transform: `translate(${x},${y}) rotate(${rotate})`,
      'data-id': id
    }) as SVGGElement;

    const pins = this.drawSymbol(type, g);

    if (label) {
      const txt = this.createEl('text', { x: 0, y: -45, class: 'fill-slate-600 font-sans text-xs font-bold text-anchor-middle text-center' });
      txt.textContent = label;
      // Counter-rotate text so it stays upright
      txt.setAttribute('transform', `rotate(${-rotate})`);
      // Center text manually since dominant-baseline isn't consistent in all SVGs
      txt.setAttribute('text-anchor', 'middle');
      g.appendChild(txt);
    }

    this.activeLayer.appendChild(g);

    // Calculate absolute pin positions for wiring
    const absPins: Record<string, PinPosition> = {};
    const rad = (rotate * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    for (const [key, [px, py]] of Object.entries(pins)) {
      // Rotation matrix
      const rx = px * cos - py * sin;
      const ry = px * sin + py * cos;
      absPins[key] = { x: x + rx, y: y + ry };
    }

    // Fixed: Added missing width, height, and config properties
    this.components.set(id, { 
      id, 
      type, 
      x, 
      y, 
      rotation: rotate, 
      pins: absPins,
      width: config.width || config.w || 100, // Default width
      height: config.height || config.h || 60, // Default height
      config: config
    });
  }

  public connect(fromId: string, fromPin: string, toId: string, toPin: string) {
    const c1 = this.components.get(fromId);
    const c2 = this.components.get(toId);

    if (!c1 || !c2) {
      console.warn(`Connection failed: invalid IDs ${fromId} -> ${toId}`);
      return;
    }

    const p1 = c1.pins[fromPin];
    const p2 = c2.pins[toPin];

    if (!p1 || !p2) {
        console.warn(`Connection failed: invalid pins ${fromPin} -> ${toPin}`);
        return;
    }

    // Manhattan Routing Algorithm
    let d = `M ${p1.x} ${p1.y} `;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    const deltaX = Math.abs(p1.x - p2.x);
    const deltaY = Math.abs(p1.y - p2.y);

    // Heuristic: if components are aligned or mostly aligned, prioritize one axis
    if (deltaX > deltaY) {
        // Horizontal priority
        d += `L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
    } else {
        // Vertical priority
        d += `L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
    }

    const path = this.createEl('path', { d, class: 'stroke-slate-700 stroke-[2] fill-none' });
    
    // Draw connections behind components
    if (this.activeLayer.firstChild) {
        this.activeLayer.insertBefore(path, this.activeLayer.firstChild);
    } else {
        this.activeLayer.appendChild(path);
    }

    // Add solder dots
    this.activeLayer.appendChild(this.createEl('circle', { cx: p1.x, cy: p1.y, r: 3, class: 'fill-slate-800' }));
    this.activeLayer.appendChild(this.createEl('circle', { cx: p2.x, cy: p2.y, r: 3, class: 'fill-slate-800' }));
  }

  public getExportSVG(): string {
      return this.svg.outerHTML;
  }
}