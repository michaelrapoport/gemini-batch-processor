
import { ConnectionOptions, PinPosition, TechDrawTheme } from '../../types';
import { createEl, drawText, NS } from './svgUtils';

interface Point { x: number; y: number; }
interface GridNode extends Point { 
  g: number; 
  f: number; 
  parent: GridNode | null;
  direction: 'H' | 'V' | null; 
}

const GRID_SIZE = 10;
const BRIDGE_RADIUS = 6;

// Costs
const COST_MOVE = 1;
const COST_TURN = 5; // Prefer straight lines
const COST_OBSTACLE = 1000; // Soft obstacle avoidance if needed, currently hard blocked

const heuristic = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Enhanced A* Router
 * 1. Snaps to grid
 * 2. Penalizes turns to create professional orthogonal routes
 * 3. Avoids component bounding boxes
 */
const findSmartPath = (
  start: Point, 
  end: Point, 
  obstacles: {x:number, y:number, w:number, h:number}[]
): Point[] => {
  const s = { x: Math.round(start.x/GRID_SIZE), y: Math.round(start.y/GRID_SIZE) };
  const e = { x: Math.round(end.x/GRID_SIZE), y: Math.round(end.y/GRID_SIZE) };

  const openSet: GridNode[] = [];
  const closedSet = new Set<string>();
  
  openSet.push({ x: s.x, y: s.y, g: 0, f: heuristic(s, e), parent: null, direction: null });
  
  let iterations = 0;
  const MAX_ITERATIONS = 3000;

  while (openSet.length > 0) {
    if (iterations++ > MAX_ITERATIONS) break;

    // Get lowest f
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    const k = `${current.x},${current.y}`;

    if (current.x === e.x && current.y === e.y) {
      // Reconstruct
      const path: Point[] = [];
      let temp: GridNode | null = current;
      while (temp) {
        path.unshift({ x: temp.x * GRID_SIZE, y: temp.y * GRID_SIZE });
        temp = temp.parent;
      }
      return simplifyPath(path);
    }

    closedSet.add(k);

    const neighbors = [
      { x: current.x+1, y: current.y, dir: 'H' }, 
      { x: current.x-1, y: current.y, dir: 'H' },
      { x: current.x, y: current.y+1, dir: 'V' }, 
      { x: current.x, y: current.y-1, dir: 'V' }
    ];

    for (const n of neighbors) {
      const nk = `${n.x},${n.y}`;
      if (closedSet.has(nk)) continue;

      // Obstacle Check
      if (!isWalkable(n, s, e, obstacles)) continue;

      // Cost Calculation
      const turnCost = (current.direction && current.direction !== n.dir) ? COST_TURN : 0;
      const g = current.g + COST_MOVE + turnCost;
      const f = g + heuristic(n, e);

      const existing = openSet.find(o => o.x === n.x && o.y === n.y);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = f;
          existing.parent = current;
          existing.direction = n.dir as 'H' | 'V';
        }
      } else {
        openSet.push({ x: n.x, y: n.y, g, f, parent: current, direction: n.dir as 'H' | 'V' });
      }
    }
  }

  // Fallback
  return [
    start,
    { x: (start.x + end.x)/2, y: start.y },
    { x: (start.x + end.x)/2, y: end.y },
    end
  ];
};

const isWalkable = (n: {x:number, y:number}, start: Point, end: Point, obstacles: any[]) => {
  // Allow Start/End nodes to be inside obstacles (connecting pins)
  if ((n.x === start.x && n.y === start.y) || (n.x === end.x && n.y === end.y)) return true;

  const rx = n.x * GRID_SIZE;
  const ry = n.y * GRID_SIZE;

  for (const o of obstacles) {
     // Pad obstacles slightly
     const pad = 10;
     if (rx > o.x - o.w/2 - pad && rx < o.x + o.w/2 + pad &&
         ry > o.y - o.h/2 - pad && ry < o.y + o.h/2 + pad) {
       return false;
     }
  }
  return true;
};

const simplifyPath = (points: Point[]): Point[] => {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i-1];
    const curr = points[i];
    const next = points[i+1];
    // Keep point only if direction changes
    if (!((prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y))) {
      result.push(curr);
    }
  }
  result.push(points[points.length-1]);
  return result;
};

/**
 * Line Jumper System
 * Detects intersections between the NEW path (segments) and EXISTING paths.
 * Returns an SVG 'd' string with Arcs injected at intersection points.
 */
const processCrossovers = (
  newPath: Point[], 
  existingSegments: {p1: Point, p2: Point}[], 
  jumpSize: number = BRIDGE_RADIUS
): string => {
    if (newPath.length < 2) return '';
    
    let d = `M ${newPath[0].x} ${newPath[0].y}`;

    for (let i = 0; i < newPath.length - 1; i++) {
        const p1 = newPath[i];
        const p2 = newPath[i+1];
        
        // Determine segment orientation
        const isHoriz = Math.abs(p1.y - p2.y) < 0.01;
        const isVert = Math.abs(p1.x - p2.x) < 0.01;
        
        // Collect intersections on this segment
        const jumps: { t: number, pt: Point }[] = [];

        for (const seg of existingSegments) {
            // Check intersection
            // We only care if we are crossing a perpendicular line for style
            const otherHoriz = Math.abs(seg.p1.y - seg.p2.y) < 0.01;
            const otherVert = Math.abs(seg.p1.x - seg.p2.x) < 0.01;

            // Only jump if we are Horiz crossing Vert OR Vert crossing Horiz
            if ((isHoriz && otherVert) || (isVert && otherHoriz)) {
                const ix = getIntersection(p1, p2, seg.p1, seg.p2);
                if (ix) {
                    // Distance ratio 't' along the segment [0..1]
                    const dist = isHoriz ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y);
                    const distToIx = isHoriz ? Math.abs(ix.x - p1.x) : Math.abs(ix.y - p1.y);
                    const t = distToIx / dist;
                    // Avoid jumps too close to endpoints
                    if (t > 0.05 && t < 0.95) {
                        jumps.push({ t, pt: ix });
                    }
                }
            }
        }

        // Sort jumps by distance from p1
        jumps.sort((a, b) => a.t - b.t);

        // Build path for this segment
        if (jumps.length === 0) {
            d += ` L ${p2.x} ${p2.y}`;
        } else {
            let curr = p1;
            jumps.forEach(jump => {
                // Draw line to just before jump
                // Calculate gap point
                const gap = jumpSize; 
                // Direction vector
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                const nx = dx/len;
                const ny = dy/len;
                
                const startJumpX = jump.pt.x - nx * gap;
                const startJumpY = jump.pt.y - ny * gap;
                const endJumpX = jump.pt.x + nx * gap;
                const endJumpY = jump.pt.y + ny * gap;
                
                d += ` L ${startJumpX} ${startJumpY}`;
                // Arc command: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
                // Standard semi-circle
                d += ` A ${gap} ${gap} 0 0 1 ${endJumpX} ${endJumpY}`;
            });
            d += ` L ${p2.x} ${p2.y}`;
        }
    }
    return d;
};

const getIntersection = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
    // Standard line segment intersection
    const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
    if (det === 0) return null;
    const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
    const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
    if ((0 < lambda && lambda < 1) && (0 < gamma && gamma < 1)) {
        return {
            x: p1.x + lambda * (p2.x - p1.x),
            y: p1.y + lambda * (p2.y - p1.y)
        };
    }
    return null;
};

// --- GLOBAL STATE FOR SEGMENTS ---
// In a real stateless engine this should be passed in, but for this specific architecture
// we need to accumulate segments during the render pass.
// We will export a reset function.
let GLOBAL_SEGMENTS: {p1: Point, p2: Point}[] = [];
export const resetRouter = () => { GLOBAL_SEGMENTS = []; };

export const drawConnection = (
  layer: SVGGElement, 
  p1: PinPosition, 
  p2: PinPosition, 
  options: ConnectionOptions = {},
  obstacles: {x:number, y:number, w:number, h:number}[] = [],
  theme: TechDrawTheme = 'USPTO'
): { labelBox?: { x: number, y: number, w: number, h: number } } => {
    
    let d = '';
    let pathPoints: Point[] = [];
    
    let txtX = (p1.x + p2.x) / 2;
    let txtY = (p1.y + p2.y) / 2;
    let color = options.color || (theme === 'DARK' ? '#e2e8f0' : '#0f172a');
    let strokeWidth = options.style === 'thick' ? 3 : 2;

    if (options.curve === 'bezier') {
         const deltaX = Math.abs(p2.x - p1.x);
         const dist = Math.max(deltaX * 0.5, 50);
         d = `M ${p1.x} ${p1.y} C ${p1.x + dist} ${p1.y}, ${p2.x - dist} ${p2.y}, ${p2.x} ${p2.y}`;
    } 
    else if (options.curve === 'straight') {
         d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
         pathPoints = [p1, p2];
    } 
    else {
        // Step / Jump (Orthogonal)
        // 1. Calculate Path
        pathPoints = findSmartPath(p1, p2, obstacles);
        
        // 2. Process Crossovers
        if (options.curve === 'jump') {
             d = processCrossovers(pathPoints, GLOBAL_SEGMENTS, options.jumpSize);
        } else {
             // Simple orthogonal
             d = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
             for(let i=1; i<pathPoints.length; i++) {
                 d += ` L ${pathPoints[i].x} ${pathPoints[i].y}`;
             }
        }
        
        // 3. Register segments for future lines
        for(let i=0; i<pathPoints.length-1; i++) {
            GLOBAL_SEGMENTS.push({ p1: pathPoints[i], p2: pathPoints[i+1] });
        }

        // Label placement (Midpoint of longest segment)
        let maxLen = 0;
        for (let i=0; i<pathPoints.length-1; i++) {
             const dist = Math.abs(pathPoints[i].x - pathPoints[i+1].x) + Math.abs(pathPoints[i].y - pathPoints[i+1].y);
             if (dist > maxLen) {
                 maxLen = dist;
                 txtX = (pathPoints[i].x + pathPoints[i+1].x)/2;
                 txtY = (pathPoints[i].y + pathPoints[i+1].y)/2;
             }
        }
    }

    const path = createEl('path', { 
      d, 
      class: 'fill-none',
      stroke: color,
      'stroke-width': strokeWidth,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round'
    });
    
    if (options.style === 'dashed') path.setAttribute('stroke-dasharray', '5,5');
    if (options.arrow === 'end' || options.arrow === 'both') path.setAttribute('marker-end', `url(#arrow-end-${theme})`);
    if (options.arrow === 'start' || options.arrow === 'both') path.setAttribute('marker-start', `url(#arrow-start-${theme})`); 
    
    layer.insertBefore(path, layer.firstChild);

    // Render Label
    let labelBox;
    if (options.label) {
       const estW = options.label.length * 6 + 10;
       const bgRect = createEl('rect', {
          x: txtX - estW/2, y: txtY - 7, width: estW, height: 14,
          fill: theme === 'DARK' ? '#1e293b' : 'white',
          opacity: 0.95
       });
       layer.appendChild(bgRect);

       drawText(layer, txtX, txtY, options.label, { 
         class: `font-mono text-[10px] font-bold ${theme === 'DARK' ? 'fill-slate-200' : 'fill-slate-800'}`,
         'text-anchor': 'middle',
         'dominant-baseline': 'middle'
       });
       
       labelBox = { x: txtX, y: txtY, w: estW, h: 14 };
    }

    return { labelBox };
}
