
import * as d3 from 'd3';
import { ComponentConfig } from '../../types';

/**
 * D3 Infographic Flowchart Renderer
 * 
 * Uses d3.tree (tidy tree) to automatically layout process steps in a robust,
 * hierarchical manner without overlapping. It applies an "Infographic" visual style
 * with rounded cards, gradients, and smooth bezier connections.
 */

interface FlowNode {
    id: string;
    label: string;
    description?: string;
    type: 'start' | 'process' | 'decision' | 'end';
    parentId: string | null;
    children?: FlowNode[];
}

export const renderFlowchart = (g: SVGGElement, config: ComponentConfig): { w: number, h: number, pins: any } => {
    const w = config.width || 600;
    const h = config.height || 500;
    const orientation = config.chartOptions?.orientation || 'vertical';
    const isVertical = orientation === 'vertical';

    const svg = d3.select(g);
    svg.selectAll('*').remove(); // Clear

    // 1. Setup Definitions (Gradients, Shadows)
    const defs = svg.append('defs');
    
    // Drop Shadow
    const filter = defs.append('filter')
        .attr('id', 'flow-shadow')
        .attr('x', '-20%').attr('y', '-20%')
        .attr('width', '140%').attr('height', '140%');
    filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2);
    filter.append('feOffset').attr('dx', 1).attr('dy', 2).attr('result', 'offsetblur');
    filter.append('feComponentTransfer')
        .append('feFuncA').attr('type', 'linear').attr('slope', 0.2);
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'offsetblur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Gradient (Blue/Slate)
    const grad = defs.append('linearGradient')
        .attr('id', 'flow-grad-process')
        .attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#f8fafc');
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#e2e8f0');
    
    // Gradient (Accent)
    const gradAccent = defs.append('linearGradient')
        .attr('id', 'flow-grad-accent')
        .attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '100%');
    gradAccent.append('stop').attr('offset', '0%').attr('stop-color', '#6366f1'); // Indigo 500
    gradAccent.append('stop').attr('offset', '100%').attr('stop-color', '#8b5cf6'); // Violet 500

    // 2. Parse Data
    const rawData = config.data || [];
    if (rawData.length === 0) return { w, h, pins: {} };

    // Convert flat list to hierarchy
    let root: d3.HierarchyNode<FlowNode>;
    try {
        const stratify = d3.stratify<any>()
            .id(d => d.id)
            .parentId(d => d.parentId);
        root = stratify(rawData);
    } catch (e) {
        // Fallback: If stratify fails (e.g. cycles or bad IDs), render error text
        svg.append('text').text('Flowchart Data Error: Invalid Hierarchy').attr('fill', 'red');
        return { w, h, pins: {} };
    }

    // 3. Layout (Tree)
    // Adjust size based on node count to prevent cramping
    const nodeWidth = 140;
    const nodeHeight = 60;
    const levelSpacing = isVertical ? 100 : 180;
    
    // Create Layout
    const treeLayout = d3.tree<FlowNode>()
        .nodeSize(isVertical ? [nodeWidth + 20, levelSpacing] : [levelSpacing, nodeHeight + 20]);
        
    treeLayout(root);

    // Center the tree in the container
    const nodes = root.descendants();
    const links = root.links();

    // Calculate bounds to center
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach((d: any) => {
        if (d.x < minX) minX = d.x;
        if (d.x > maxX) maxX = d.x;
        if (d.y < minY) minY = d.y;
        if (d.y > maxY) maxY = d.y;
    });

    const chartW = maxX - minX;
    const chartH = maxY - minY;
    
    // Group that holds the tree, centered
    const treeG = svg.append('g')
        .attr('transform', isVertical 
            ? `translate(0, ${-chartH/2 + nodeHeight/2})` // Center Y, X is handled by tree logic usually centered at 0
            : `translate(${-chartW/2 + nodeWidth/2}, 0)` 
        );

    // 4. Render Links (Curved Bezier)
    treeG.selectAll('.link')
        .data(links)
        .enter().append('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 2)
        .attr('d', d3.linkVertical()
            .x((d: any) => isVertical ? d.x : d.y)
            .y((d: any) => isVertical ? d.y : d.x) as any
        );

    // 5. Render Nodes (Cards)
    const node = treeG.selectAll('.node')
        .data(nodes)
        .enter().append('g')
        .attr('class', 'node')
        .attr('transform', (d: any) => `translate(${isVertical ? d.x : d.y},${isVertical ? d.y : d.x})`);

    // Drop Shadow Group
    node.attr('filter', 'url(#flow-shadow)');

    // Card Background
    node.append('rect')
        .attr('x', -nodeWidth / 2)
        .attr('y', -nodeHeight / 2)
        .attr('width', nodeWidth)
        .attr('height', nodeHeight)
        .attr('rx', 6)
        .attr('fill', (d: any) => {
             if (d.data.type === 'start' || d.data.type === 'end') return '#334155'; // Dark Slate
             if (d.data.type === 'decision') return '#fff'; 
             return 'url(#flow-grad-process)';
        })
        .attr('stroke', (d: any) => d.data.type === 'decision' ? '#6366f1' : '#cbd5e1')
        .attr('stroke-width', (d: any) => d.data.type === 'decision' ? 2 : 1);

    // Accent Stripe (Left)
    node.append('rect')
        .attr('x', -nodeWidth / 2)
        .attr('y', -nodeHeight / 2)
        .attr('width', 4)
        .attr('height', nodeHeight)
        .attr('rx', 1) // slight round
        // Clip right side to make it straight? Or just overlay.
        .attr('fill', 'url(#flow-grad-accent)')
        .attr('display', (d: any) => (d.data.type === 'process' || d.data.type === 'decision') ? 'block' : 'none');

    // Label
    node.append('text')
        .attr('dy', (d: any) => d.data.description ? '-0.3em' : '0.3em')
        .attr('x', 0)
        .attr('text-anchor', 'middle')
        .style('font-family', 'sans-serif')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', (d: any) => (d.data.type === 'start' || d.data.type === 'end') ? '#f8fafc' : '#1e293b')
        .text((d: any) => d.data.label.toUpperCase());

    // Description (Subtitle)
    node.append('text')
        .attr('dy', '1.2em')
        .attr('x', 0)
        .attr('text-anchor', 'middle')
        .style('font-family', 'sans-serif')
        .style('font-size', '8px')
        .style('fill', (d: any) => (d.data.type === 'start' || d.data.type === 'end') ? '#94a3b8' : '#64748b')
        .text((d: any) => d.data.description || '');

    // 6. Decision Diamond Overlay (Optional visual cue)
    // If it's a decision, we draw a small diamond icon on top border
    const decisions = node.filter((d: any) => d.data.type === 'decision');
    decisions.append('path')
        .attr('d', 'M 0 -8 L 8 0 L 0 8 L -8 0 Z')
        .attr('transform', `translate(0, ${-nodeHeight/2})`)
        .attr('fill', '#6366f1')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);

    return { w, h, pins: { center: [0,0] } };
};
