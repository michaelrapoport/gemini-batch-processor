import { ComponentConfig, ComponentType } from '../types';

/**
 * TechDraw Language (TDL) Specification
 * 
 * Format:
 * COMPONENT:  id: type "label" { key: value }
 * CONNECTION: id1.pin -> id2.pin "label" { style: 'dashed' }
 */

// Inline Sanitizer to avoid external dependency issues
const Sanitizer = {
    cleanTDL: (input: string): string => {
        // Remove markdown code blocks if present
        return input.replace(/```(?:tdl|techdraw)?/gi, '').replace(/```/g, '').trim();
    },
    cleanJSON: (jsonStr: string, fallback: any): any => {
        try {
            // Relaxed JSON parsing: quote unquoted keys
            const fixed = jsonStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":').replace(/'/g, '"');
            return JSON.parse(fixed);
        } catch (e) {
            return fallback;
        }
    }
};

interface TDLNode {
    id: string;
    type: string;
    label?: string;
    props?: Record<string, any>;
}

interface TDLConnection {
    source: string;
    sourcePin?: string;
    target: string;
    targetPin?: string;
    label?: string;
    props?: Record<string, any>;
}

export const parseTDL = (input: string) => {
    const nodes: TDLNode[] = [];
    const links: TDLConnection[] = [];
    
    // Use Sanitizer to pre-clean the input block
    const cleanedInput = Sanitizer.cleanTDL(input);
    const lines = cleanedInput.split('\n');

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) return;

        // Parse Connection: id.pin -> id.pin "label" { props }
        if (line.includes('->')) {
            const arrowRegex = /([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?\s*->\s*([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?(?:\s+"([^"]+)")?(?:\s*(\{.*\}))?/;
            const match = line.match(arrowRegex);
            if (match) {
                const [_, sId, sPin, tId, tPin, lbl, json] = match;
                let props = {};
                if (json) props = Sanitizer.cleanJSON(json, {});
                
                links.push({
                    source: sId,
                    sourcePin: sPin,
                    target: tId,
                    targetPin: tPin,
                    label: lbl,
                    props
                });
            }
            return;
        }

        // Parse Component: id: type "label" { props }
        const nodeRegex = /^([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)(?:\s+"([^"]+)")?(?:\s*(\{.*\}))?/;
        const nodeMatch = line.match(nodeRegex);
        
        if (nodeMatch) {
            const [_, id, type, lbl, json] = nodeMatch;
            let props = {};
            if (json) props = Sanitizer.cleanJSON(json, {});
            
            nodes.push({
                id,
                type,
                label: lbl,
                props
            });
        }
    });

    return { nodes, links };
};

export const generateTDL = (
    nodes: Map<string, {type: string, config: ComponentConfig}>, 
    links: {source: string|any, target: string|any, sourcePin?: string, targetPin?: string, options?: any}[]
): string => {
    let output = ['# TechDraw Shorthand (TDL) v1.0'];

    // Nodes
    nodes.forEach((node, id) => {
        const type = node.type;
        const lbl = node.config.label ? ` "${node.config.label}"` : '';
        
        const props = { ...node.config };
        delete props.label;
        delete props.x; delete props.y; 
        
        const json = Object.keys(props).length > 0 ? ` ${JSON.stringify(props)}` : '';
        output.push(`${id}: ${type}${lbl}${json}`);
    });

    output.push('');

    // Links
    links.forEach(l => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        
        const sPin = l.sourcePin ? `.${l.sourcePin}` : '';
        const tPin = l.targetPin ? `.${l.targetPin}` : '';
        
        const lbl = l.options?.label ? ` "${l.options.label}"` : '';
        const props = l.options ? { ...l.options } : {};
        delete props.label;
        
        const json = Object.keys(props).length > 0 ? ` ${JSON.stringify(props)}` : '';
        
        output.push(`${sId}${sPin} -> ${tId}${tPin}${lbl}${json}`);
    });

    return output.join('\n');
};