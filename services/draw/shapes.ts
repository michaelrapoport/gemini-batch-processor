import { ComponentType, ComponentConfig, TechDrawTheme } from '../../types';
import { createEl, drawText } from './svgUtils';
import { renderChart } from './charts';
import { renderFlowchart } from './flowchart';
import { renderCAD } from './cad3d';

export const drawSymbol = (
    type: ComponentType, 
    g: SVGGElement, 
    config: ComponentConfig,
    theme: TechDrawTheme = 'USPTO'
): { pins: Record<string, [number, number]>, w: number, h: number } => {
    
    // --- MODE G: INFOGRAPHIC FLOWCHART ---
    if (type === 'chart_flow') {
        return renderFlowchart(g, config);
    }

    // --- MODE F: D3 CHARTS ---
    if (type.startsWith('chart_')) {
        return renderChart(type, g, config);
    }
    
    // --- MODE C: 3D CAD ENGINE ---
    if (type.startsWith('wireframe_') || 
        ['piston', 'crank', 'valve', 'gear', 'spring', 'nozzle', 'cam'].includes(type)) {
        
        // Convert CAD engine pins object to Tuple format expected by TechDraw
        const res = renderCAD(type, g, config, theme);
        const pins: Record<string, [number, number]> = {};
        
        // Adapt Point2D to Tuple
        if(res.pins.center) pins.center = [res.pins.center.x, res.pins.center.y];
        if(res.pins.top) pins.top = [res.pins.top.x, res.pins.top.y];
        if(res.pins.bottom) pins.bottom = [res.pins.bottom.x, res.pins.bottom.y];
        
        return { pins, w: res.w, h: res.h };
    }

    let w = config.width || config.w || 100;
    let h = config.height || config.h || 60;
    
    // THEME STYLES
    const isDark = theme === 'DARK';
    const strokeColor = isDark ? '#e2e8f0' : '#1e293b'; 
    const fillColor = isDark ? '#0f172a' : 'white'; 
    
    const sty = (extra: string = '') => `stroke:${strokeColor}; fill:${fillColor}; ${extra}`;
    const wire = (extra: string = '') => `stroke:${strokeColor}; fill:none; ${extra}`;
    const fillOnly = (extra: string = '') => `stroke:none; fill:${strokeColor}; ${extra}`; // For arrows/dots

    // --- CUSTOM IMAGE SUPPORT ---
    if (config.imageUrl) {
        const img = createEl('image', {
            x: -w/2, y: -h/2, width: w, height: h,
            href: config.imageUrl,
            preserveAspectRatio: 'xMidYMid meet'
        });
        const border = createEl('rect', {
             x: -w/2, y: -h/2, width: w, height: h,
             fill: 'none', stroke: strokeColor, 'stroke-width': 1, rx: 4
        });
        g.appendChild(img);
        g.appendChild(border);
        
        return { 
            pins: { top: [0, -h/2], bottom: [0, h/2], left: [-w/2, 0], right: [w/2, 0] }, 
            w, h 
        };
    }

    try {
        switch (type) {
          // --- SHAPES ---
          case 'rect': 
          case 'box':
          case 'block':
             g.appendChild(createEl('rect', { 
                x: -w/2, y: -h/2, width: w, height: h, rx: 4, 
                style: sty('stroke-width:2;')
             }));
             return { 
                 pins: { top: [0, -h/2], bottom: [0, h/2], left: [-w/2, 0], right: [w/2, 0] }, 
                 w, h 
             };
          
          case 'circle': 
             g.appendChild(createEl('circle', { cx:0, cy:0, r: w/2, style: sty('stroke-width:2;') }));
             return { pins: { center: [0, 0] }, w, h };

          case 'database':
            g.appendChild(createEl('path', { d: 'M -20 -20 Q 0 -30 20 -20 Q 0 -10 -20 -20 Z', style: sty('stroke-width:2;') })); 
            g.appendChild(createEl('path', { d: 'M -20 -20 L -20 20 Q 0 30 20 20 L 20 -20', style: sty('stroke-width:2;') })); 
            g.appendChild(createEl('path', { d: 'M -20 20 Q 0 10 20 20', style: wire('stroke-width:2;') })); 
            return { pins: { top: [0, -25], bottom: [0, 25], left: [-20, 0], right: [20, 0] }, w: 40, h: 60 };

          case 'cloud':
            g.appendChild(createEl('path', { 
               d: 'M -25 5 Q -30 20 -10 20 L 10 20 Q 30 20 25 5 Q 40 -10 20 -15 Q 10 -30 -10 -15 Q -35 -10 -25 5',
               style: sty('stroke-width:2;')
            }));
            return { pins: { top: [0, -25], bottom: [0, 20], left: [-25, 0], right: [25, 0] }, w: 60, h: 40 };

          case 'server':
            g.appendChild(createEl('rect', { x: -30, y: -15, width: 60, height: 30, rx: 2, style: sty('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: -25, y1: 0, x2: 25, y2: 0, style: wire('stroke-width:1;') })); 
            g.appendChild(createEl('circle', { cx: 20, cy: -8, r: 2, fill: strokeColor })); 
            g.appendChild(createEl('circle', { cx: 15, cy: -8, r: 2, fill: strokeColor })); 
            return { pins: { top: [0, -15], bottom: [0, 15], left: [-30, 0], right: [30, 0] }, w: 60, h: 30 };
          
          case 'flow_decision':
          case 'diamond':
              g.appendChild(createEl('path', { d: `M 0 ${-h/2} L ${w/2} 0 L 0 ${h/2} L ${-w/2} 0 Z`, style: sty('stroke-width:2;') }));
              return { pins: { top: [0, -h/2], bottom: [0, h/2], left: [-w/2, 0], right: [w/2, 0] }, w, h };

          // --- PASSIVES ---
          case 'resistor':
            g.appendChild(createEl('path', { d: 'M -30 0 L -20 0 L -15 -10 L -5 10 L 5 -10 L 15 10 L 20 0 L 30 0', style: wire('stroke-width:2; stroke-linecap:round; stroke-linejoin:round;') }));
            return { pins: { left: [-30, 0], right: [30, 0] }, w: 60, h: 20 };

          case 'capacitor':
            g.appendChild(createEl('line', { x1: -5, y1: -15, x2: -5, y2: 15, style: wire('stroke-width:3;') }));
            g.appendChild(createEl('line', { x1: 5, y1: -15, x2: 5, y2: 15, style: wire('stroke-width:3;') }));
            g.appendChild(createEl('line', { x1: -30, y1: 0, x2: -5, y2: 0, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: 5, y1: 0, x2: 30, y2: 0, style: wire('stroke-width:2;') }));
            return { pins: { left: [-30, 0], right: [30, 0] }, w: 60, h: 30 };

          case 'inductor':
             g.appendChild(createEl('path', {
                 d: 'M -30 0 L -20 0 Q -15 -10 -10 0 Q -5 -10 0 0 Q 5 -10 10 0 Q 15 -10 20 0 L 30 0',
                 style: wire('stroke-width:2;')
             }));
             return { pins: { left: [-30, 0], right: [30, 0] }, w: 60, h: 20 };

          case 'diode':
              g.appendChild(createEl('path', { d: 'M -10 -10 L -10 10 L 10 0 Z', style: fillOnly() }));
              g.appendChild(createEl('line', { x1: 10, y1: -10, x2: 10, y2: 10, style: wire('stroke-width:3;') }));
              g.appendChild(createEl('line', { x1: -30, y1: 0, x2: -10, y2: 0, style: wire('stroke-width:2;') }));
              g.appendChild(createEl('line', { x1: 10, y1: 0, x2: 30, y2: 0, style: wire('stroke-width:2;') }));
              return { pins: { anode: [-30, 0], cathode: [30, 0] }, w: 60, h: 20 };
              
          case 'led':
              g.appendChild(createEl('path', { d: 'M -10 -10 L -10 10 L 10 0 Z', style: fillOnly() }));
              g.appendChild(createEl('line', { x1: 10, y1: -10, x2: 10, y2: 10, style: wire('stroke-width:3;') }));
              g.appendChild(createEl('line', { x1: -30, y1: 0, x2: -10, y2: 0, style: wire('stroke-width:2;') }));
              g.appendChild(createEl('line', { x1: 10, y1: 0, x2: 30, y2: 0, style: wire('stroke-width:2;') }));
              // Arrows
              g.appendChild(createEl('path', { d: 'M -5 -15 L 5 -25 M 5 -15 L 15 -25', style: wire('stroke-width:1.5;') }));
              g.appendChild(createEl('path', { d: 'M 2 -25 L 5 -25 L 5 -22 M 12 -25 L 15 -25 L 15 -22', style: wire('stroke-width:1.5;') }));
              return { pins: { anode: [-30, 0], cathode: [30, 0] }, w: 60, h: 40 };

          // --- SOURCES ---
          case 'source_v':
            g.appendChild(createEl('circle', { cx: 0, cy: 0, r: 20, style: wire('stroke-width:2;') }));
            drawText(g, -5, -5, '+', { 'font-size': '16px', fill: strokeColor });
            drawText(g, -3, 15, '-', { 'font-size': '16px', fill: strokeColor });
            g.appendChild(createEl('line', { x1: 0, y1: -30, x2: 0, y2: -20, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: 0, y1: 20, x2: 0, y2: 30, style: wire('stroke-width:2;') }));
            return { pins: { top: [0, -30], bottom: [0, 30] }, w: 40, h: 60 };

          case 'source_i':
            g.appendChild(createEl('circle', { cx: 0, cy: 0, r: 20, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('path', { d: 'M 0 -10 L 0 10 L 5 5 M 0 10 L -5 5', style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: 0, y1: -30, x2: 0, y2: -20, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: 0, y1: 20, x2: 0, y2: 30, style: wire('stroke-width:2;') }));
            return { pins: { top: [0, -30], bottom: [0, 30] }, w: 40, h: 60 };

          case 'gnd':
            g.appendChild(createEl('path', { d: 'M 0 -10 L 0 0 M -15 0 L 15 0 M -10 5 L 10 5 M -5 10 L 5 10', style: wire('stroke-width:2;') }));
            return { pins: { top: [0, -10] }, w: 30, h: 20 };

          // --- ACTIVES ---
          case 'opamp':
            g.appendChild(createEl('path', { d: 'M -30 -35 L -30 35 L 35 0 Z', style: sty('stroke-width:2;') }));
            drawText(g, -25, -5, '-', { 'font-size': '14px', fill: strokeColor });
            drawText(g, -25, 20, '+', { 'font-size': '14px', fill: strokeColor });
            g.appendChild(createEl('line', { x1: -50, y1: -15, x2: -30, y2: -15, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -50, y1: 15, x2: -30, y2: 15, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 35, y1: 0, x2: 55, y2: 0, style: wire('stroke-width:2;') })); 
            return { pins: { in_inv: [-50, -15], in_non: [-50, 15], out: [55, 0] }, w: 105, h: 70 };

          case 'transistor_npn':
            g.appendChild(createEl('circle', { cx: 0, cy: 0, r: 25, style: wire('stroke-width:1.5;') }));
            g.appendChild(createEl('line', { x1: -15, y1: -15, x2: -15, y2: 15, style: wire('stroke-width:3;') })); 
            g.appendChild(createEl('line', { x1: -30, y1: 0, x2: -15, y2: 0, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -15, y1: -10, x2: 15, y2: -25, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 15, y1: -25, x2: 15, y2: -40, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -15, y1: 10, x2: 15, y2: 25, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 15, y1: 25, x2: 15, y2: 40, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('path', { d: 'M 10 28 L 16 26 L 14 20', style: fillOnly() }));
            return { pins: { base: [-30, 0], collector: [15, -40], emitter: [15, 40] }, w: 60, h: 80 };

          case 'transistor_pnp':
            g.appendChild(createEl('circle', { cx: 0, cy: 0, r: 25, style: wire('stroke-width:1.5;') }));
            g.appendChild(createEl('line', { x1: -15, y1: -15, x2: -15, y2: 15, style: wire('stroke-width:3;') })); 
            g.appendChild(createEl('line', { x1: -30, y1: 0, x2: -15, y2: 0, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -15, y1: -10, x2: 15, y2: -25, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 15, y1: -25, x2: 15, y2: -40, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -15, y1: 10, x2: 15, y2: 25, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 15, y1: 25, x2: 15, y2: 40, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('path', { d: 'M -5 10 L -2 16 L -10 16', style: fillOnly() }));
            return { pins: { base: [-30, 0], collector: [15, -40], emitter: [15, 40] }, w: 60, h: 80 };

          case 'mosfet_n':
            g.appendChild(createEl('circle', { cx: 0, cy: 0, r: 25, style: wire('stroke-width:1.5;') }));
            g.appendChild(createEl('line', { x1: -15, y1: -15, x2: -15, y2: 15, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: -15, x2: -5, y2: -5, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: -2, x2: -5, y2: 2, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: 5, x2: -5, y2: 15, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -30, y1: 0, x2: -15, y2: 0, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: -10, x2: 15, y2: -10, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 15, y1: -10, x2: 15, y2: -40, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: 10, x2: 15, y2: 10, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 15, y1: 10, x2: 15, y2: 40, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('path', { d: 'M -5 0 L 0 -3 L 0 3 Z', style: fillOnly() })); 
            return { pins: { gate: [-30, 0], drain: [15, -40], source: [15, 40] }, w: 60, h: 80 };

          case 'mosfet_p':
            g.appendChild(createEl('circle', { cx: 0, cy: 0, r: 25, style: wire('stroke-width:1.5;') }));
            g.appendChild(createEl('line', { x1: -15, y1: -15, x2: -15, y2: 15, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: -15, x2: -5, y2: -5, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: -2, x2: -5, y2: 2, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: 5, x2: -5, y2: 15, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -30, y1: 0, x2: -15, y2: 0, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: -10, x2: 15, y2: -10, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 15, y1: -10, x2: 15, y2: -40, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: -5, y1: 10, x2: 15, y2: 10, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('line', { x1: 15, y1: 10, x2: 15, y2: 40, style: wire('stroke-width:2;') })); 
            g.appendChild(createEl('path', { d: 'M 0 0 L -5 -3 L -5 3 Z', style: fillOnly() })); 
            return { pins: { gate: [-30, 0], drain: [15, -40], source: [15, 40] }, w: 60, h: 80 };

          // --- LOGIC GATES ---
          case 'gate_and':
            g.appendChild(createEl('path', { d: 'M -30 -25 L -10 -25 A 25 25 0 0 1 -10 25 L -30 25 Z', style: sty('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: -45, y1: -10, x2: -30, y2: -10, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: -45, y1: 10, x2: -30, y2: 10, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: 15, y1: 0, x2: 30, y2: 0, style: wire('stroke-width:2;') }));
            return { pins: { in1: [-45, -10], in2: [-45, 10], out: [30, 0] }, w: 75, h: 50 };

          case 'gate_nand':
            g.appendChild(createEl('path', { d: 'M -30 -25 L -10 -25 A 25 25 0 0 1 -10 25 L -30 25 Z', style: sty('stroke-width:2;') }));
            g.appendChild(createEl('circle', { cx: 20, cy: 0, r: 5, style: sty('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: -45, y1: -10, x2: -30, y2: -10, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: -45, y1: 10, x2: -30, y2: 10, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: 25, y1: 0, x2: 35, y2: 0, style: wire('stroke-width:2;') }));
            return { pins: { in1: [-45, -10], in2: [-45, 10], out: [35, 0] }, w: 80, h: 50 };

          case 'gate_or':
            g.appendChild(createEl('path', { d: 'M -30 -25 Q -10 -25 5 0 Q -10 25 -30 25 Q -20 0 -30 -25', style: sty('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: -45, y1: -10, x2: -25, y2: -10, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: -45, y1: 10, x2: -25, y2: 10, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: 5, y1: 0, x2: 25, y2: 0, style: wire('stroke-width:2;') }));
            return { pins: { in1: [-45, -10], in2: [-45, 10], out: [25, 0] }, w: 70, h: 50 };
          
          case 'gate_nor':
              g.appendChild(createEl('path', { d: 'M -30 -25 Q -10 -25 5 0 Q -10 25 -30 25 Q -20 0 -30 -25', style: sty('stroke-width:2;') }));
              g.appendChild(createEl('circle', { cx: 10, cy: 0, r: 5, style: sty('stroke-width:2;') }));
              g.appendChild(createEl('line', { x1: -45, y1: -10, x2: -25, y2: -10, style: wire('stroke-width:2;') }));
              g.appendChild(createEl('line', { x1: -45, y1: 10, x2: -25, y2: 10, style: wire('stroke-width:2;') }));
              g.appendChild(createEl('line', { x1: 15, y1: 0, x2: 30, y2: 0, style: wire('stroke-width:2;') }));
              return { pins: { in1: [-45, -10], in2: [-45, 10], out: [30, 0] }, w: 75, h: 50 };

          case 'gate_not':
            g.appendChild(createEl('path', { d: 'M -20 -15 L -20 15 L 10 0 Z', style: sty('stroke-width:2;') }));
            g.appendChild(createEl('circle', { cx: 15, cy: 0, r: 5, style: sty('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: -35, y1: 0, x2: -20, y2: 0, style: wire('stroke-width:2;') }));
            g.appendChild(createEl('line', { x1: 20, y1: 0, x2: 35, y2: 0, style: wire('stroke-width:2;') }));
            return { pins: { in: [-35, 0], out: [35, 0] }, w: 70, h: 30 };
            
          case 'gate_xor':
              g.appendChild(createEl('path', { d: 'M -25 -25 Q -5 -25 10 0 Q -5 25 -25 25 Q -15 0 -25 -25', style: sty('stroke-width:2;') }));
              g.appendChild(createEl('path', { d: 'M -32 -25 Q -22 0 -32 25', style: wire('stroke-width:2;') }));
              g.appendChild(createEl('line', { x1: -45, y1: -10, x2: -28, y2: -10, style: wire('stroke-width:2;') }));
              g.appendChild(createEl('line', { x1: -45, y1: 10, x2: -28, y2: 10, style: wire('stroke-width:2;') }));
              g.appendChild(createEl('line', { x1: 10, y1: 0, x2: 25, y2: 0, style: wire('stroke-width:2;') }));
              return { pins: { in1: [-45, -10], in2: [-45, 10], out: [25, 0] }, w: 70, h: 50 };

          default:
            g.classList.add('needs-icon-generation');
            g.setAttribute('data-generation-prompt', type.replace(/_/g, ' '));
            
            const rect = createEl('rect', { 
                x: -w/2, y: -h/2, width: w, height: h, rx: 4,
                fill: isDark ? '#1e293b' : '#f8fafc',
                stroke: isDark ? '#475569' : '#cbd5e1',
                'stroke-width': 1,
                'stroke-dasharray': '4 2'
            });
            
            const spinner = createEl('circle', {
                cx: 0, cy: 0, r: 10, fill: 'none', stroke: isDark ? '#94a3b8' : '#64748b', 'stroke-width': 2,
                'stroke-dasharray': '15 40'
            });
            spinner.innerHTML = `<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="1s" repeatCount="indefinite" />`;
            
            const text = createEl('text', {
                x: 0, y: h/2 + 12, 'text-anchor': 'middle', 'font-size': 9, fill: isDark ? '#94a3b8' : '#64748b'
            });
            text.textContent = "Generating...";

            g.appendChild(rect);
            g.appendChild(spinner);
            g.appendChild(text);

            return { 
                pins: { top: [0, -h/2], bottom: [0, h/2], left: [-w/2, 0], right: [w/2, 0] }, 
                w, h 
            };
        }
    } catch (e) {
        console.warn('Shape Render Error, using fallback:', e);
        g.appendChild(createEl('rect', { x: -w/2, y: -h/2, width: w, height: h, fill: 'red', opacity: 0.3 }));
        return { pins: {}, w, h };
    }
};