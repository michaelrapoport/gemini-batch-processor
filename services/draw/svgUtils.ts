
export const NS = 'http://www.w3.org/2000/svg';

export const createEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el as SVGElement;
};

const wrapText = (text: string, maxChars: number = 20): string[] => {
  // Defensive check for bad inputs
  if (!text || typeof text !== 'string') return [""];
  
  const result: string[] = [];
  const rawLines = text.split('\n');
  
  for (const line of rawLines) {
    if (line.length <= maxChars) {
      result.push(line);
      continue;
    }
    const words = line.split(' ');
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      if ((current?.length || 0) + 1 + words[i].length <= maxChars) {
        current += ' ' + words[i];
      } else {
        result.push(current);
        current = words[i];
      }
    }
    if (current) result.push(current);
  }
  return result;
};

export const drawText = (g: SVGElement, x: number, y: number, text: string, options: any = {}) => {
  // If dominant-baseline is 'middle' (common for center labels), we use a tighter wrap
  // Increased to 30 chars to support longer scientific formulas/labels
  const maxChars = options['dominant-baseline'] === 'middle' ? 30 : 35;
  
  const lines = wrapText(text, maxChars);
  const lineHeight = 1.1; 
  
  const textEl = createEl('text', { x, y, ...options });
  
  // Center the block vertically if middle baseline
  if (options['dominant-baseline'] === 'middle' && lines.length > 1) {
      const shift = -((lines.length - 1) * lineHeight) / 2;
      textEl.setAttribute('dy', `${shift}em`);
      // Remove the style attribute for baseline so tspan dy takes over correctly relative to start
      delete options['dominant-baseline']; 
  }

  lines.forEach((line, i) => {
      const tspan = document.createElementNS(NS, 'tspan');
      tspan.textContent = line;
      tspan.setAttribute('x', String(x));
      // First line gets 0 dy change if we already shifted the whole block, 
      // otherwise it continues naturally
      tspan.setAttribute('dy', i === 0 ? '0em' : `${lineHeight}em`);
      textEl.appendChild(tspan);
  });
  
  g.appendChild(textEl);
};
