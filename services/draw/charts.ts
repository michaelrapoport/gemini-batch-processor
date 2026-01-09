
import * as d3 from 'd3';
import { ComponentConfig } from '../../types';

/**
 * D3.js Renderer for TechDraw
 * Renders SVG charts into the provided Group element.
 */
export const renderChart = (type: string, g: SVGGElement, config: ComponentConfig): { w: number, h: number, pins: any } => {
    const w = config.width || 300;
    const h = config.height || 250;
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    const svg = d3.select(g);
    // Clear previous contents if re-rendering (though usually new 'g' passed)
    svg.selectAll('*').remove();

    // Border
    svg.append('rect')
        .attr('x', -w/2)
        .attr('y', -h/2)
        .attr('width', w)
        .attr('height', h)
        .attr('class', 'stroke-slate-300 stroke-[1] fill-none');

    // Chart Group centered
    // NOTE: 'g' is usually already translated to the component center by TechDraw engine.
    // However, D3 standard axes prefer top-left origin. 
    // We offset to align D3's (0,0) with our -w/2 + margin
    const chartG = svg.append('g')
       .attr('transform', `translate(${-w/2 + margin.left}, ${-h/2 + margin.top})`);

    // --- CHART TYPE DISPATCH ---

    if (type === 'chart_radar') {
        return renderRadar(chartG, config, w, h);
    } 
    else if (type === 'chart_pie') {
        // Pie charts center themselves usually
        const pieG = svg.append('g'); // Already at center (0,0)
        return renderPie(pieG, config, w, h);
    }
    else if (type === 'chart_box') {
        return renderBoxPlot(chartG, config, innerW, innerH, w, h);
    }

    // --- STANDARD XY CHARTS (Line, Bar, Scatter) ---
    
    // Data Normalization
    const rawData = config.data || [];
    let series: any[] = [];
    
    // Check for Multi-Series Structure (Array of Objects where values is an array)
    const isMultiSeries = rawData.length > 0 && typeof rawData[0] === 'object' && 'values' in rawData[0] && Array.isArray((rawData[0] as any).values);

    if (isMultiSeries) {
        series = rawData as any[];
    } else {
        let flatData = [];
        if (rawData.length > 0 && typeof rawData[0] === 'number') {
            flatData = rawData.map((d: any, i) => ({ x: i, y: d }));
        } else if (rawData.length > 0 && 'value' in rawData[0]) {
             flatData = rawData.map((d: any) => ({ x: d.label || d.name, y: d.value }));
        } else {
             flatData = rawData; 
        }
        
        series = [{
            label: config.label || 'Data',
            values: flatData,
            color: config.chartOptions?.color || '#334155'
        }];
    }

    // Determine Global Domains
    const allPoints = series.flatMap(s => s.values);
    
    let xScale: any;
    if (allPoints.length > 0 && typeof allPoints[0].x === 'string') {
        // Categorical
        const categories = Array.from(new Set(allPoints.map((d: any) => d.x)));
        xScale = d3.scaleBand()
            .domain(categories as string[])
            .range([0, innerW])
            .padding(0.2);
    } else {
        // Linear
        const xMin = config.chartOptions?.domainX?.[0] ?? d3.min(allPoints, (d: any) => d.x as number) ?? 0;
        const xMax = config.chartOptions?.domainX?.[1] ?? d3.max(allPoints, (d: any) => d.x as number) ?? 10;
        xScale = d3.scaleLinear()
            .domain([xMin, xMax])
            .range([0, innerW]);
    }

    const yMin = config.chartOptions?.domainY?.[0] ?? 0;
    const yMax = config.chartOptions?.domainY?.[1] ?? d3.max(allPoints, (d: any) => d.y as number) ?? 100;

    const yScale = d3.scaleLinear()
        .domain([yMin, yMax])
        .range([innerH, 0]);

    // Axes
    const xAxis = d3.axisBottom(xScale).ticks(5).tickSizeOuter(0);
    const yAxis = d3.axisLeft(yScale).ticks(5).tickSizeOuter(0);

    chartG.append('g')
        .attr('transform', `translate(0, ${innerH})`)
        .call(xAxis)
        .attr('class', 'font-mono text-[8px] stroke-slate-500')
        .selectAll('text').style('text-anchor', 'end').attr('dx', '-.8em').attr('dy', '.15em').attr('transform', 'rotate(-45)');

    chartG.append('g')
        .call(yAxis)
        .attr('class', 'font-mono text-[8px] stroke-slate-500');

    // Grid
    if (config.chartOptions?.showGrid) {
        chartG.append('g')
            .attr('class', 'grid stroke-slate-200 stroke-[0.5]')
            .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerW).tickFormat(() => ''));
    }

    // Render Series
    series.forEach((s, idx) => {
        const color = s.color || d3.schemeCategory10[idx % 10];
        const data = s.values;

        if (type === 'chart_line') {
            const line = d3.line()
                .x((d: any) => xScale(d.x) + (xScale.bandwidth ? xScale.bandwidth()/2 : 0))
                .y((d: any) => yScale(d.y))
                .curve(d3.curveMonotoneX);
            
            chartG.append('path')
                .datum(data)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('d', line as any);
                
            chartG.selectAll(`.dot-${idx}`)
                .data(data)
                .enter().append('circle')
                .attr('cx', (d: any) => xScale(d.x) + (xScale.bandwidth ? xScale.bandwidth()/2 : 0))
                .attr('cy', (d: any) => yScale(d.y))
                .attr('r', 2)
                .attr('fill', 'white')
                .attr('stroke', color);
        } 
        else if (type === 'chart_bar') {
            const barWidth = xScale.bandwidth ? xScale.bandwidth() : (innerW/allPoints.length)-2;
            const widthPerSeries = barWidth / series.length;

            chartG.selectAll(`.bar-${idx}`)
                .data(data)
                .enter().append('rect')
                .attr('x', (d: any) => xScale(d.x) + (idx * widthPerSeries))
                .attr('y', (d: any) => yScale(d.y))
                .attr('width', widthPerSeries)
                .attr('height', (d: any) => innerH - yScale(d.y))
                .attr('fill', color);
        }
        else if (type === 'chart_scatter') {
            chartG.selectAll(`.dot-${idx}`)
                .data(data)
                .enter().append('circle')
                .attr('cx', (d: any) => xScale(d.x))
                .attr('cy', (d: any) => yScale(d.y))
                .attr('r', 3)
                .attr('fill', color)
                .attr('opacity', 0.7);
        }
    });

    const pins = {
        top: [0, -h/2],
        bottom: [0, h/2],
        left: [-w/2, 0],
        right: [w/2, 0]
    };

    return { w, h, pins };
}

/**
 * Radar Chart Renderer
 * Multi-variable comparison.
 */
function renderRadar(g: d3.Selection<SVGGElement, unknown, null, undefined>, config: ComponentConfig, w: number, h: number) {
    // Center the radar
    const radius = Math.min(w, h) / 2 - 40;
    const centerG = g.append('g').attr('transform', `translate(${w/2 - 40}, ${h/2 - 40})`); // Offset by margins implicitly

    const rawData = (config.data || []) as any[];
    // Data Structure: 
    // [ { label: 'Series A', values: [{x: 'Speed', y: 100}, {x: 'Cost', y: 50}] } ]
    
    if (rawData.length === 0) return { w, h, pins: {} };

    // Normalize Data (Assume all series have same axes)
    const axes = rawData[0].values.map((d: any) => d.x); // Axis labels
    const angleSlice = (Math.PI * 2) / axes.length;
    
    const rScale = d3.scaleLinear()
        .range([0, radius])
        .domain([0, 100]); // Assume 0-100 normalized for now, or find max

    // Draw Grid (Web)
    const levels = 5;
    for (let i = 0; i < levels; i++) {
        const levelFactor = radius * ((i + 1) / levels);
        centerG.selectAll('.levels')
           .data(axes)
           .enter()
           .append('line')
           .attr('x1', (d, i) => levelFactor * (1 - Math.sin(i * angleSlice)))
           .attr('y1', (d, i) => levelFactor * (1 - Math.cos(i * angleSlice)))
           .attr('x2', (d, i) => levelFactor * (1 - Math.sin((i+1) * angleSlice)))
           .attr('y2', (d, i) => levelFactor * (1 - Math.cos((i+1) * angleSlice)))
           .attr('class', 'stroke-slate-200 stroke-[1]');
    }

    // Draw Axes
    const axis = centerG.selectAll('.axis')
        .data(axes)
        .enter().append('g')
        .attr('class', 'axis');

    axis.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', (d, i) => rScale(100) * Math.cos(angleSlice * i - Math.PI/2))
        .attr('y2', (d, i) => rScale(100) * Math.sin(angleSlice * i - Math.PI/2))
        .attr('class', 'stroke-slate-300 stroke-[1]');

    axis.append('text')
        .attr('class', 'font-sans text-[10px] fill-slate-600 font-bold')
        .attr('text-anchor', 'middle')
        .attr('x', (d, i) => rScale(115) * Math.cos(angleSlice * i - Math.PI/2))
        .attr('y', (d, i) => rScale(115) * Math.sin(angleSlice * i - Math.PI/2))
        .text(d => d as string);

    // Draw Areas
    const radarLine = d3.lineRadial()
        .curve(d3.curveLinearClosed)
        .radius((d: any) => rScale(d.y))
        .angle((d, i) => i * angleSlice);

    rawData.forEach((series: any, idx) => {
        const color = series.color || d3.schemeCategory10[idx % 10];
        
        centerG.append('path')
            .datum(series.values)
            .attr('d', radarLine as any)
            .style('stroke-width', 2)
            .style('stroke', color)
            .style('fill', color)
            .style('fill-opacity', 0.1);
            
        // Points
        centerG.selectAll(`.nodes-${idx}`)
            .data(series.values)
            .enter().append('circle')
            .attr('cx', (d: any, i) => rScale(d.y) * Math.cos(angleSlice * i - Math.PI/2))
            .attr('cy', (d: any, i) => rScale(d.y) * Math.sin(angleSlice * i - Math.PI/2))
            .attr('r', 3)
            .style('fill', color)
            .style('stroke', 'white');
    });

    return { w, h, pins: { center: [0, 0] } };
}

/**
 * Pie Chart Renderer
 * Composition analysis.
 */
function renderPie(g: d3.Selection<SVGGElement, unknown, null, undefined>, config: ComponentConfig, w: number, h: number) {
    const radius = Math.min(w, h) / 2 - 20;
    
    // Normalize Data: [{label: 'A', value: 10}, ...]
    let data = config.data || [];
    // Handle simplified {x,y} from common config
    if (data.length > 0 && typeof data[0].y !== 'undefined') {
        data = data.map((d:any) => ({ label: d.x || d.label, value: d.y }));
    }

    const pie = d3.pie().value((d: any) => d.value).sort(null);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const labelArc = d3.arc().innerRadius(radius * 0.6).outerRadius(radius * 0.6);

    const arcs = g.selectAll('arc')
        .data(pie(data as any))
        .enter().append('g');

    arcs.append('path')
        .attr('d', arc as any)
        .attr('fill', (d, i) => d3.schemeCategory10[i % 10])
        .attr('stroke', 'white')
        .style('stroke-width', '2px');

    arcs.append('text')
        .attr('transform', (d) => `translate(${labelArc.centroid(d as any)})`)
        .attr('text-anchor', 'middle')
        .attr('class', 'font-sans text-[9px] fill-white font-bold')
        .text((d: any) => d.data.label);

    return { w, h, pins: { center: [0, 0] } };
}

/**
 * Box Plot Renderer
 * Statistical Distribution.
 */
function renderBoxPlot(g: d3.Selection<SVGGElement, unknown, null, undefined>, config: ComponentConfig, innerW: number, innerH: number, w: number, h: number) {
    // Data: [{ label: 'A', min: 10, q1: 20, median: 25, q3: 30, max: 40 }]
    const data = config.data || [];
    
    // Scales
    const xScale = d3.scaleBand()
        .domain(data.map((d:any) => d.label))
        .range([0, innerW])
        .padding(0.4);

    const yMin = d3.min(data, (d:any) => d.min) || 0;
    const yMax = d3.max(data, (d:any) => d.max) || 100;
    
    const yScale = d3.scaleLinear()
        .domain([yMin * 0.9, yMax * 1.1])
        .range([innerH, 0]);

    // Axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);

    g.append('g').attr('transform', `translate(0, ${innerH})`).call(xAxis).attr('class', 'font-sans text-xs');
    g.append('g').call(yAxis).attr('class', 'font-sans text-xs');
    
    // Draw Boxes
    const boxGroup = g.selectAll('.box').data(data).enter().append('g');
    const barWidth = xScale.bandwidth();

    // Vertical Lines (Whiskers)
    boxGroup.append('line')
        .attr('x1', (d: any) => (xScale(d.label) || 0) + barWidth/2)
        .attr('x2', (d: any) => (xScale(d.label) || 0) + barWidth/2)
        .attr('y1', (d: any) => yScale(d.min))
        .attr('y2', (d: any) => yScale(d.max))
        .attr('stroke', 'black');

    // Box (Q1 to Q3)
    boxGroup.append('rect')
        .attr('x', (d: any) => xScale(d.label))
        .attr('y', (d: any) => yScale(d.q3))
        .attr('height', (d: any) => yScale(d.q1) - yScale(d.q3))
        .attr('width', barWidth)
        .attr('stroke', 'black')
        .attr('fill', '#e2e8f0');

    // Median Line
    boxGroup.append('line')
        .attr('x1', (d: any) => xScale(d.label))
        .attr('x2', (d: any) => (xScale(d.label) || 0) + barWidth)
        .attr('y1', (d: any) => yScale(d.median))
        .attr('y2', (d: any) => yScale(d.median))
        .attr('stroke', 'black')
        .attr('stroke-width', 2);

    // Whisker Caps
    boxGroup.append('line')
        .attr('x1', (d: any) => (xScale(d.label)||0) + barWidth*0.2)
        .attr('x2', (d: any) => (xScale(d.label)||0) + barWidth*0.8)
        .attr('y1', (d: any) => yScale(d.min))
        .attr('y2', (d: any) => yScale(d.min))
        .attr('stroke', 'black');
        
    boxGroup.append('line')
        .attr('x1', (d: any) => (xScale(d.label)||0) + barWidth*0.2)
        .attr('x2', (d: any) => (xScale(d.label)||0) + barWidth*0.8)
        .attr('y1', (d: any) => yScale(d.max))
        .attr('y2', (d: any) => yScale(d.max))
        .attr('stroke', 'black');

    return { w, h, pins: { center: [0, 0] } };
}
