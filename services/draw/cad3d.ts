
import { createEl } from './svgUtils';
import { ComponentConfig, TechDrawTheme } from '../../types';
import { Vec3, projectPoint } from './math3d';

// --- CAD TYPES ---

interface Vertex {
  pos: Vec3;
  id: number;
}

interface Edge {
  v1: number;
  v2: number;
  type: 'line' | 'spline';
  controlPoints?: [Vec3, Vec3]; // For cubic bezier
  hidden?: boolean; // For silhouette logic (todo)
}

interface Face {
  vertices: number[]; // indices
  color?: string;
  fill?: boolean;
}

interface Mesh {
  vertices: Vertex[];
  edges: Edge[];
  faces: Face[];
}

// --- GENERATORS ---

const createCube = (w: number, h: number, d: number): Mesh => {
  const hw = w/2, hh = h/2, hd = d/2;
  const v = [
    new Vec3(-hw, -hh, -hd), new Vec3(hw, -hh, -hd), new Vec3(hw, hh, -hd), new Vec3(-hw, hh, -hd), // Front (relative to Z)
    new Vec3(-hw, -hh, hd), new Vec3(hw, -hh, hd), new Vec3(hw, hh, hd), new Vec3(-hw, hh, hd)      // Back
  ];
  
  return {
    vertices: v.map((pos, i) => ({ pos, id: i })),
    edges: [
      { v1: 0, v2: 1, type: 'line' }, { v1: 1, v2: 2, type: 'line' }, { v1: 2, v2: 3, type: 'line' }, { v1: 3, v2: 0, type: 'line' },
      { v1: 4, v2: 5, type: 'line' }, { v1: 5, v2: 6, type: 'line' }, { v1: 6, v2: 7, type: 'line' }, { v1: 7, v2: 4, type: 'line' },
      { v1: 0, v2: 4, type: 'line' }, { v1: 1, v2: 5, type: 'line' }, { v1: 2, v2: 6, type: 'line' }, { v1: 3, v2: 7, type: 'line' }
    ],
    faces: [
      { vertices: [0, 1, 2, 3] }, // Front
      { vertices: [5, 4, 7, 6] }, // Back
      { vertices: [4, 0, 3, 7] }, // Left
      { vertices: [1, 5, 6, 2] }, // Right
      { vertices: [4, 5, 1, 0] }, // Top
      { vertices: [3, 2, 6, 7] }  // Bottom
    ]
  };
};

const createCylinder = (r: number, h: number, segments: number = 16): Mesh => {
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  const faces: Face[] = [];
  
  const hh = h/2;
  
  // Top Cap Center (0)
  vertices.push({ pos: new Vec3(0, -hh, 0), id: 0 });
  // Bottom Cap Center (1)
  vertices.push({ pos: new Vec3(0, hh, 0), id: 1 });
  
  const topStartIdx = 2;
  const botStartIdx = 2 + segments;
  
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    
    // Top Ring
    vertices.push({ pos: new Vec3(x, -hh, z), id: topStartIdx + i });
    // Bottom Ring
    vertices.push({ pos: new Vec3(x, hh, z), id: botStartIdx + i });
    
    // Edges
    const next = (i + 1) % segments;
    
    // Ring Edges (Spline Approximation or Lines)
    edges.push({ v1: topStartIdx + i, v2: topStartIdx + next, type: 'line' });
    edges.push({ v1: botStartIdx + i, v2: botStartIdx + next, type: 'line' });
    
    // Vertical Edges
    edges.push({ v1: topStartIdx + i, v2: botStartIdx + i, type: 'line' });
    
    // Side Faces
    faces.push({ vertices: [topStartIdx + i, botStartIdx + i, botStartIdx + next, topStartIdx + next] });
    
    // Cap Faces (Triangles)
    faces.push({ vertices: [0, topStartIdx + next, topStartIdx + i] }); // Top
    faces.push({ vertices: [1, botStartIdx + i, botStartIdx + next] }); // Bottom
  }
  
  return { vertices, edges, faces };
};

const createGear = (r: number, teeth: number, h: number): Mesh => {
   // Simplified Gear: Cylinder with extrusions
   // For wireframe mode, we'll model the silhouette
   const vertices: Vertex[] = [];
   const edges: Edge[] = [];
   const faces: Face[] = [];
   
   const hh = h/2;
   const innerR = r * 0.8;
   const outerR = r;
   
   const steps = teeth * 2; // tooth and gap
   
   for(let i=0; i<steps; i++) {
       const theta = (i / steps) * Math.PI * 2;
       const nextTheta = ((i+1) / steps) * Math.PI * 2;
       
       const curR = i % 2 === 0 ? outerR : innerR;
       const nextR = (i+1) % 2 === 0 ? outerR : innerR;
       
       const x1 = Math.cos(theta) * curR;
       const z1 = Math.sin(theta) * curR;
       const x2 = Math.cos(nextTheta) * nextR;
       const z2 = Math.sin(nextTheta) * nextR;
       
       // Add 4 verts per segment (Top/Bottom start, Top/Bottom end)
       const base = vertices.length;
       vertices.push({ pos: new Vec3(x1, -hh, z1), id: base });
       vertices.push({ pos: new Vec3(x1, hh, z1), id: base+1 });
       vertices.push({ pos: new Vec3(x2, -hh, z2), id: base+2 });
       vertices.push({ pos: new Vec3(x2, hh, z2), id: base+3 });
       
       // Vertical Lines
       edges.push({ v1: base, v2: base+1, type: 'line' });
       
       // Horizontal Connections
       edges.push({ v1: base, v2: base+2, type: 'line' }); // Top rim
       edges.push({ v1: base+1, v2: base+3, type: 'line' }); // Bottom rim
       
       // Side Face
       faces.push({ vertices: [base, base+1, base+3, base+2] });
       
       // Top/Bottom cap approximation (Triangle fan to center would be better, but omitting for wireframe clarity)
   }
   
   return { vertices, edges, faces };
};

const createSpring = (r: number, h: number, coils: number): Mesh => {
    const vertices: Vertex[] = [];
    const edges: Edge[] = [];
    
    const res = 32 * coils;
    for(let i=0; i<=res; i++) {
        const t = i/res; // 0 to 1
        const theta = t * coils * Math.PI * 2;
        const y = (t - 0.5) * h;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        
        vertices.push({ pos: new Vec3(x, y, z), id: i });
        if(i > 0) {
            // Use spline edges for smooth spring
            // Calculate control points for smooth helix? 
            // For now, linear segments with high resolution look like a spline
            edges.push({ v1: i-1, v2: i, type: 'line' });
        }
    }
    return { vertices, edges, faces: [] };
};

// --- RENDERER ---

export const renderCAD = (
    type: string, 
    g: SVGGElement, 
    config: ComponentConfig,
    theme: TechDrawTheme
): { w: number, h: number, pins: any } => {
    
    const w = config.width || 100;
    const h = config.height || 100;
    const depth = config.depth || 100;
    
    // 1. SELECT MESH GENERATOR
    let mesh: Mesh;
    switch(type) {
        case 'wireframe_cube':
        case 'box':
            mesh = createCube(w, h, depth);
            break;
        case 'wireframe_cylinder':
        case 'piston': // Simple piston representation
            mesh = createCylinder(w/2, h, 24);
            break;
        case 'wireframe_cone':
        case 'nozzle':
            // Cone is cylinder with top radius 0
            mesh = createCylinder(w/2, h, 16);
            // Manually collapse top vertices to 0 (Hack for demo)
            mesh.vertices.forEach(v => {
                if(v.pos.y < 0 && v.id > 1) { v.pos.x = 0; v.pos.z = 0; }
            });
            break;
        case 'gear':
            mesh = createGear(w/2, 8, h/2); // 8 teeth
            break;
        case 'spring':
        case 'coil':
            mesh = createSpring(w/2, h, 6);
            break;
        case 'valve':
             // Two cones
             mesh = createCylinder(w/2, h, 12); // Placeholder
             break;
        default:
             mesh = createCube(w, h, depth); // Fallback
    }
    
    // 2. TRANSFORM MESH (World Space)
    // Support X, Y, Z rotation from config
    const rotX = 0; // Fixed view usually, or from config
    const rotY = (config.rotate || 0) * (Math.PI / 180);
    const rotZ = 0;
    
    mesh.vertices.forEach(v => {
        v.pos = v.pos.rotateY(rotY);
        // Additional tilts can be added here
    });

    // 3. SHADING & SORTING
    // Light Source Direction (Top Left Front)
    const lightDir = new Vec3(-1, -1, 1).normalize();
    
    // Calculate Face Normals & Centroids
    const faceData = mesh.faces.map(f => {
        const p0 = mesh.vertices[f.vertices[0]].pos;
        const p1 = mesh.vertices[f.vertices[1]].pos;
        const p2 = mesh.vertices[f.vertices[2]].pos;
        
        // Normal = (p1-p0) x (p2-p0)
        const v1 = p1.sub(p0);
        const v2 = p2.sub(p0);
        const normal = v1.cross(v2).normalize();
        
        // Centroid for Z-sort
        let cz = 0;
        f.vertices.forEach(idx => cz += mesh.vertices[idx].pos.z);
        cz /= f.vertices.length;
        
        // Shading intensity (Dot product)
        // Range -1 to 1. Map to brightness.
        const dot = normal.dot(lightDir); 
        const intensity = Math.max(0, dot); // Simple diffuse
        
        // Backface Culling check
        // View vector is roughly (0,0,-1) in ISO? No, depends on projection.
        // In simple painter's algo, we just sort by Z.
        
        return { face: f, z: cz, normal, intensity };
    });
    
    // Sort faces (Painter's Algorithm: Furthest Z drawn first)
    // Note: In our ISO projection, +Z is "back-left". +X is "back-right". 
    // We need 'depth' relative to camera.
    // For ISO: Camera looks from (-1, 1, -1). 
    // Simple Z-sort of projected centroid usually works for convex shapes.
    faceData.sort((a, b) => b.z - a.z);

    // 4. RENDER
    
    // Styles
    const isDark = theme === 'DARK';
    const strokeColor = isDark ? '#94a3b8' : '#1e293b';
    const fillColor = isDark ? '#0f172a' : '#ffffff';
    
    // Draw Faces (Shaded)
    faceData.forEach(fd => {
        // Construct Path
        const pts = fd.face.vertices.map(idx => projectPoint(mesh.vertices[idx].pos, 0, 0));
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for(let i=1; i<pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
        d += ' Z';
        
        // Determine Shading
        let fill = fillColor;
        let opacity = 1;
        
        if (theme === 'USPTO') {
             // Hatching based on intensity
             // This logic needs <pattern> defs. For now, simple white fill to block lines behind.
             fill = 'white';
             if (fd.intensity > 0.8) fill = 'white'; // Highlight
             else if (fd.intensity < 0.3) fill = 'url(#hatch)'; // Shadow
        } else {
             // Modern shading
             const baseLum = isDark ? 20 : 100;
             const shadowStr = isDark ? 20 : 50;
             const lum = baseLum - (1 - fd.intensity) * shadowStr;
             fill = isDark ? `hsl(215, 20%, ${lum}%)` : `hsl(215, 10%, ${lum}%)`;
        }
        
        const path = createEl('path', {
            d,
            fill: fill,
            stroke: 'none' // Faces don't have outlines in wireframe, edges do
        });
        g.appendChild(path);
    });
    
    // Draw Edges (Wireframe)
    // We draw ALL edges for true wireframe look, or filter by 'hard' edges?
    // Drawing all edges on top of faces creates the "Hidden Line Removed" look if faces are white.
    mesh.edges.forEach(e => {
        const p1 = projectPoint(mesh.vertices[e.v1].pos, 0, 0);
        const p2 = projectPoint(mesh.vertices[e.v2].pos, 0, 0);
        
        let d = '';
        if (e.type === 'spline' && e.controlPoints) {
            // Cubic Bezier Projection
            // We need to project the control points too!
            const cp1 = projectPoint(e.controlPoints[0], 0, 0);
            const cp2 = projectPoint(e.controlPoints[1], 0, 0);
            d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
        } else {
            d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
        }
        
        const path = createEl('path', {
            d,
            fill: 'none',
            stroke: strokeColor,
            'stroke-width': 1,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
        });
        g.appendChild(path);
    });

    // Define pins based on bounding box of projection
    return { 
        w, h, 
        pins: { 
            center: {x:0, y:0},
            top: {x:0, y:-h/2}, // approx
            bottom: {x:0, y:h/2}
        } 
    };
};
