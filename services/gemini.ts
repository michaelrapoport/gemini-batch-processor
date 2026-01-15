
import { GoogleGenAI, Tool, Type } from "@google/genai";
import { ToolType } from "../types";

const MODEL_NAME = "gemini-3-flash-preview";
const NAMING_MODEL_NAME = "gemini-2.5-flash";

interface GenerateOptions {
  content: string;
  systemPrompt: string;
  temperature: number;
  tool: ToolType;
  includeCharts?: boolean;
  includeTechDraw?: boolean;
  titleOverride?: string;
}

export interface GenerateResult {
    text: string;
    tdl?: string;
}

const ANALYSIS_AGENT_PROMPT = `
ROLE: Professional Patent Attorney & Technical Writer with Research Capabilities

TASK: Transform the provided input into a complete, professionally formatted USPTO Patent Application in HTML5/CSS4, conducting comprehensive research to fill gaps and generate supporting visual materials.

═══════════════════════════════════════════════════════════════════════════

PHASE 1: RESEARCH & ANALYSIS

Before generating the patent document, you MUST:

1. INFORMATION GAP ANALYSIS:
   - Identify missing technical specifications, prior art, scientific principles, or industry standards.

2. AUTOMATED RESEARCH (Use googleSearch tool if available):
   - Search for prior art and existing patents in the same domain.
   - Research technical specifications and industry standards.
   - Gather scientific data to support claims.
   - Verify technical terminology.

3. TECHNICAL DRAWING IDENTIFICATION:
   - Identify minimum 3-7 figures needed.
   - For each figure, create a detailed image generation prompt description in the "BRIEF DESCRIPTION OF THE DRAWINGS" section.
   - FORMAT: Use the exact placeholder format: [IMAGE: FIG. X - Description]

═══════════════════════════════════════════════════════════════════════════

PHASE 2: OUTPUT FORMATTING RULES

1. OUTPUT FORMAT: Complete HTML5 document with embedded CSS4 in <style> tags.
2. HTML STRUCTURE:
   <!DOCTYPE html>
   <html lang="en">
   <head>
       <meta charset="UTF-8">
       <title>Patent Application</title>
       <style>/* CSS4 STYLING HERE */</style>
   </head>
   <body>
       <div class="patent-wrapper">
           <!-- PATENT CONTENT -->
       </div>
   </body>
   </html>

3. LATEX-STYLE MATHEMATICAL NOTATION:
   - Block equations: <div class="math-block">...</div>
   - Inline variables: <span class="math-var">...</span>
   - Superscripts/Subscripts: <sup>, <sub>

4. TYPOGRAPHY & LAYOUT:
   - Outer container: <div class="patent-wrapper">
   - Bibliographic data: <header class="patent-biblio">
   - Title: <h1> (ALL CAPS) - CRITICAL: Use EXACT title provided in instructions.
   - Claims: <ol class="patent-claims"> with <li class="independent-claim"> or <li class="dependent-claim">

═══════════════════════════════════════════════════════════════════════════

PHASE 3: REQUIRED SECTIONS

1. TITLE OF THE INVENTION (ALL CAPS)
2. BIBLIOGRAPHIC DATA (Application Number [TBD], Filing Date, Inventor, Assignee, Classification Codes)
3. CROSS-REFERENCE TO RELATED APPLICATIONS
4. STATEMENT REGARDING FEDERALLY SPONSORED RESEARCH ("Not Applicable" if none)
5. REFERENCE TO SEQUENCE LISTING (if applicable)
6. BACKGROUND OF THE INVENTION (Field, Related Art, Problem Statement)
7. BRIEF SUMMARY OF THE INVENTION
8. BRIEF DESCRIPTION OF THE DRAWINGS
   - FIG. 1 is a...
   - Insert [IMAGE: FIG. X - Description] placeholders
9. DETAILED DESCRIPTION OF THE INVENTION (Use reference numerals 100, 102...)
10. DESCRIPTION OF PREFERRED EMBODIMENTS
11. INDUSTRIAL APPLICABILITY
12. ADVANTAGES OVER PRIOR ART
13. CLAIMS (Minimum 10-20, start with Independent, then Dependent)
14. ABSTRACT (150 words max)
15. CONCLUSION

═══════════════════════════════════════════════════════════════════════════

PHASE 4: CSS4 STYLING TEMPLATE

Include this CSS in the <style> tag:
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.8; color: #000; background: #f1f5f9; }
.patent-wrapper { max-width: 8.5in; margin: 0 auto; padding: 1in; background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.patent-biblio { border-bottom: 2px solid #000; padding-bottom: 1em; margin-bottom: 2em; text-align: center; }
h1 { font-size: 16pt; font-weight: bold; text-align: center; margin: 1em 0; text-transform: uppercase; text-decoration: underline; }
h2 { font-size: 14pt; font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; text-transform: uppercase; text-align: center; }
h3 { font-size: 12pt; font-weight: bold; margin-top: 1em; margin-bottom: 0.5em; }
p { text-align: justify; text-indent: 0.5in; margin-bottom: 0.5em; }
.math-block { display: block; text-align: center; margin: 1em 0; padding: 0.5em; font-size: 14pt; font-style: italic; background: #fcfcfc; border-left: 3px solid #000; }
.math-var { font-style: italic; font-family: 'Times New Roman', serif; }
.patent-claims { list-style-type: none; counter-reset: claim-counter; margin-left: 0; padding-left: 0; margin-top: 2rem; }
.patent-claims > li { counter-increment: claim-counter; margin-bottom: 1em; text-align: justify; position: relative; padding-left: 0.5in; }
.patent-claims > li::before { content: "Claim " counter(claim-counter) ". "; font-weight: bold; position: absolute; left: 0; top: 0; }
.dependent-claim { margin-left: 0.5in; }
.independent-claim { margin-left: 0; font-weight: 500; }
@media print { body { background: white; } .patent-wrapper { margin: 0; padding: 0; box-shadow: none; width: 100%; max-width: none; } }

═══════════════════════════════════════════════════════════════════════════

CHARTING INSTRUCTIONS:
If data visualization is needed, insert <div class="ai-chart-data"> blocks as specified:
<div class="ai-chart-data" style="display:none;">
  { "type": "bar", "title": "Figure X", "data": [...] }
</div>
`;

const TECHDRAW_INJECTION_SYSTEM_PROMPT = `
You are a Technical Drawing Specialist Agent.
Your task is to generate "TechDraw Language" (TDL) DSL code for specific figure descriptions found in a patent application.

TECHDRAW LANGUAGE (TDL) SYNTAX:
- Define Nodes: \`id: type "Label" { properties }\`
- Define Links: \`id1 -> id2 "Label" { properties }\`
- Link Properties: { style: 'dashed'|'thick', arrow: 'end'|'both'|'none', label: 'text' }

AVAILABLE COMPONENT TYPES:
- Generic: rect, circle, cloud, database, server, box, block
- Flowcharts: flow_start, flow_process, flow_decision, flow_end (Use these for method/process figures)
- Logic/Circuits: resistor, capacitor, inductor, diode, led, opamp, transistor_npn, gate_and, gate_or, gate_not, gate_nand, gate_nor, gate_xor
- 3D/Mech: wireframe_cube, gear, piston, valve, spring, crank, coil, nozzle
- Charts: chart_bar, chart_line

RULES:
1. You will receive a JSON list of figure descriptions.
2. You must return a JSON object where keys are the Figure IDs (e.g., "FIG. 1") and values are the TDL code strings.
3. The TDL code must be valid and represent the system described.
4. For complex systems, simplify into block diagrams.
5. For methods/processes, use flow_* components.
`;

const NAMING_AGENT_SYSTEM_PROMPT = `
You are an expert Patent Archivist and Intelligent File Naming Agent.
Your goal is to read the entire provided document text and generate a precise, professional, and descriptive filename/title.

RULES:
1. ANALYZE the full context of the document. Identifying the specific invention, technology, or subject matter is MANDATORY.
2. FORMAT: "[Type] - [Specific Subject]" (e.g., "Patent - Quantum Encryption Key", "Draft - Hydraulic Valve System", "Memo - Q3 Financials").
3. PROHIBITED: Do NOT use vague terms like "Untitled", "Unknown", "Document", "Draft" (without subject), "Patent Application" (without subject), "Analysis", "File".
4. INFERENCE: If the content is sparse or lacks a clear title, you MUST INFER the subject from keywords, claims, or technical descriptions.
5. LENGTH: Keep it under 60 characters.
6. FILENAME SAFETY: Output a string safe for filesystems (no slashes, colons, backslashes, asterisks, question marks, quotes, angle brackets, pipes).
7. OUTPUT: Return ONLY the title string. No markdown, no explanations, no quotes.
`;

/**
 * Clean raw title strings from LLM artifacts and ensure filename safety
 */
const cleanRawTitle = (raw: string): string => {
    if (!raw) return "";
    // Remove label prefixes
    let clean = raw.replace(/^(Title|Subject|Invention|Filename):\s*/i, '');
    // Remove markdown
    clean = clean.replace(/\*\*|__/g, '').replace(/\*|_/g, '');
    // Remove quotes
    clean = clean.replace(/^["']|["']$/g, '');
    // Replace invalid filename characters with hyphens
    clean = clean.replace(/[<>:"/\\|?*]/g, '-');
    // Compress spaces
    clean = clean.trim().replace(/[\r\n\s]+/g, ' ');

    const lower = clean.toLowerCase();
    // Reject vague titles if the model failed to follow instructions
    if (lower === 'untitled' || lower === 'unknown' || lower === 'document' || lower.length < 3) {
        return "";
    }
    
    return clean;
};

// Helper to get Title Metadata using the Naming Agent
export const extractTitle = async (content: string): Promise<string> => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("Missing API Key");
    const ai = new GoogleGenAI({ apiKey });
    
    try {
        const response = await ai.models.generateContent({
            model: NAMING_MODEL_NAME, // gemini-2.5-flash
            contents: content,
            config: {
                systemInstruction: NAMING_AGENT_SYSTEM_PROMPT,
                temperature: 0.1, // Low temperature for deterministic, professional output
            }
        });
        
        const rawTitle = response.text || "";
        const cleanTitle = cleanRawTitle(rawTitle);
        
        // Fallback if the model returns nothing or a vague title despite instructions
        if (!cleanTitle) {
             const fallback = `Document ${new Date().toISOString().slice(0,10)}`;
             return fallback;
        }

        return cleanTitle;

    } catch (e) {
        console.error("Naming Agent Failed:", e);
        return "Untitled Document";
    }
};

// --- TECH DRAW INJECTION LOGIC ---

const processTechDrawEmbeddings = async (html: string, apiKey: string): Promise<string> => {
    // 1. Find all placeholders
    const regex = /\[IMAGE: (FIG\. \d+) - (.*?)\]/g;
    const matches = [...html.matchAll(regex)];
    
    if (matches.length === 0) return html;

    const figuresToGen = matches.map(m => ({
        id: m[1],
        description: m[2]
    }));

    // 2. Batch Request to Gemini
    const ai = new GoogleGenAI({ apiKey });
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: JSON.stringify(figuresToGen),
            config: {
                systemInstruction: TECHDRAW_INJECTION_SYSTEM_PROMPT,
                temperature: 0.2,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    description: "Map of Figure IDs to TDL Code",
                    properties: {
                         figures: {
                             type: Type.ARRAY,
                             items: {
                                 type: Type.OBJECT,
                                 properties: {
                                     id: { type: Type.STRING },
                                     tdl: { type: Type.STRING }
                                 }
                             }
                         }
                    }
                }
            }
        });

        // 3. Parse and Replace
        const jsonResponse = JSON.parse(response.text || "{}");
        const resultMap = new Map<string, string>();
        
        if (jsonResponse.figures && Array.isArray(jsonResponse.figures)) {
            jsonResponse.figures.forEach((f: any) => {
                resultMap.set(f.id, f.tdl);
            });
        }

        let newHtml = html;
        matches.forEach(match => {
             const fullMatch = match[0];
             const figId = match[1];
             const tdl = resultMap.get(figId);
             
             if (tdl) {
                 // Inject the TDL into a special div that React will parse
                 // We encode TDL slightly to avoid HTML attribute breaking, though data attributes are usually safe with quotes
                 const safeTdl = tdl.replace(/"/g, '&quot;');
                 const replacement = `<div class="ai-techdraw-viz" data-tdl="${safeTdl}"></div>`;
                 newHtml = newHtml.replace(fullMatch, replacement);
             } else {
                 // Fallback if generation failed but tag exists
                 newHtml = newHtml.replace(fullMatch, `<div class="placeholder-error" style="border:1px dashed red; padding:10px; color:red;">[Missing Diagram: ${figId}]</div>`);
             }
        });

        return newHtml;

    } catch (e) {
        console.error("TechDraw Injection Failed:", e);
        return html; // Return original on failure
    }
};

export const generateResponse = async (options: GenerateOptions): Promise<GenerateResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing from environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const analysisTools: Tool[] = [];
  if (options.tool === ToolType.GOOGLE_SEARCH) {
    analysisTools.push({ googleSearch: {} });
  } else if (options.tool === ToolType.CODE_EXECUTION) {
    analysisTools.push({ codeExecution: {} });
  }

  // Inject Title Override if present
  let finalSystemPrompt = options.systemPrompt;
  if (options.titleOverride) {
      finalSystemPrompt += `\n\nIMPORTANT: The title of this patent application MUST be exactly: "${options.titleOverride}". Use this string EXACTLY in the <H1> tag.`;
  }
  
  let finalAnalysisPrompt = `${finalSystemPrompt}\n\n${ANALYSIS_AGENT_PROMPT}`;

  try {
    // 1. Analysis / Formatting Agent (Primary)
    const analysisResponse = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: options.content,
        config: {
            systemInstruction: finalAnalysisPrompt,
            temperature: options.temperature,
            maxOutputTokens: 8192, 
            tools: analysisTools.length > 0 ? analysisTools : undefined,
        },
    });

    // --- Process Analysis Output ---
    let rawAnalysisText = analysisResponse.text || "";
    let htmlText = "";

    const htmlMatch = rawAnalysisText.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
    if (htmlMatch && htmlMatch[1]) {
      htmlText = htmlMatch[1].trim();
    } else {
      htmlText = rawAnalysisText.trim();
    }

    // Handle Grounding (Sources)
    const groundingChunks = analysisResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && groundingChunks.length > 0) {
        let sourcesComment = "\n\n<!--\n--- GENERATED SOURCES ---\n";
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                sourcesComment += `Title: ${chunk.web.title || "Source"}\nURL: ${chunk.web.uri}\n\n`;
            }
        });
        sourcesComment += "-->";
        if (htmlText.includes('</body>')) {
            htmlText = htmlText.replace('</body>', `${sourcesComment}\n</body>`);
        } else {
            htmlText += sourcesComment;
        }
    }

    // --- TechDraw Replacement Agent (Post-Processing) ---
    // Only run if requested and if valid HTML was generated
    if (options.includeTechDraw && htmlText.length > 0) {
        htmlText = await processTechDrawEmbeddings(htmlText, apiKey);
    }
    
    return {
        text: htmlText,
        // Legacy TDL support (optional) - if user runs without replacement agent, 
        // we could still return a single diagram if we wanted, but let's rely on the embedding now.
        tdl: undefined 
    };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Unknown error occurred during generation");
  }
};
