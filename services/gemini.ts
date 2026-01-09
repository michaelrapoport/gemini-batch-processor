import { GoogleGenAI, Tool } from "@google/genai";
import { ToolType } from "../types";

const MODEL_NAME = "gemini-3-flash-preview";

interface GenerateOptions {
  content: string;
  systemPrompt: string;
  temperature: number;
  tool: ToolType;
  includeCharts?: boolean;
  titleOverride?: string; // New field to force a specific title version
}

export interface GenerateResult {
    text: string;
    tdl?: string;
}

const ANALYSIS_AGENT_PROMPT = `
ROLE: Professional Patent Attorney & Technical Writer.
TASK: Transform the provided input into a formal USPTO Patent Application in HTML5.

STRICT OUTPUT FORMATTING RULES:
1. OUTPUT FORMAT: Pure, semantic HTML5 inside a single div.
2. TONE: Highly formal, legal, and technical.
3. TYPOGRAPHY & LAYOUT:
   - Use <div class="patent-wrapper"> as the outer container.
   - Use <header class="patent-biblio"> for the data sheet (Title, Date, Inventors).
   - Use <h1> for the Title of the Invention (All Caps).
     * CRITICAL TITLE RULE: If the user or system provides a specific TITLE in the instructions, you MUST use that exact title (including version numbers like "V2"). Do not invent a new one if provided.
   - Use <h2> for Section Headers (e.g., BACKGROUND, SUMMARY).
   - Use <p> for standard paragraphs.
   - Use <ol class="patent-claims"> for the Claims section.

4. MATH & FORMULAS (LaTeX Style):
   - You MUST identify all mathematical formulas.
   - Render them as semantic HTML, but style them to look like LaTeX.
   - Wrap block-level formulas in <div class="math-block">.
   - Wrap inline variables in <span class="math-var"> (e.g., <i>x</i>, <i>&theta;</i>).
   - Use proper HTML entities for symbols: &Sigma; (sum), &int; (integral), &partial; (partial), &infin; (infinity), &ne; (not equal).
   - Example Output: <div class="math-block"><i>E</i> = <i>mc</i><sup>2</sup></div>

5. REQUIRED SECTIONS:
   - [BIBLIOGRAPHIC DATA] (Title, Inventors, Assignee Draft)
   - CROSS-REFERENCE TO RELATED APPLICATIONS
   - BACKGROUND OF THE INVENTION
   - BRIEF SUMMARY OF THE INVENTION
   - BRIEF DESCRIPTION OF THE DRAWINGS (Refencing FIG. 1, FIG. 2...)
   - DETAILED DESCRIPTION OF THE INVENTION
   - CLAIMS (Must be strictly numbered starting at 1).

6. CHARTING:
   - If data is present, insert <div class="ai-chart-data"> blocks as specified in the Chart Agent instructions.
`;

const CHART_AGENT_INSTRUCTIONS = `
7. CHART AGENT (Data Visualization):
   - If you encounter numerical data, statistical trends, or comparisons:
     a) Determine the best visualization type: 'bar', 'line', 'area', 'pie', 'scatter', or 'radar'.
     b) Extract the data into a clean JSON structure.
     c) INSERT the chart directly into the HTML flow.
   
   - USE THE FOLLOWING TAG STRUCTURE EXACTLY:
     <div class="ai-chart-data" style="display:none;">
       {
         "type": "bar",
         "title": "Figure X: Descriptive Title",
         "xAxisKey": "name", 
         "dataKeys": [{"key": "value", "color": "#8884d8", "name": "Label"}],
         "data": [
           {"name": "A", "value": 10},
           {"name": "B", "value": 20}
         ]
       }
     </div>
`;

const TECHDRAW_AGENT_PROMPT = `
ROLE: Technical Drawing Agent.
TASK: Analyze the provided text content. If it describes a technical system, mechanical structure, software architecture, flowchart, or logical process, generate a TechDraw Language (TDL) diagram visualization.

RULES:
1. Output strictly the TDL code block (e.g., \`\`\`tdl ... \`\`\`).
2. If the content is too abstract, simple, or lacks structural relationships suitable for a diagram, return the string "NO_DIAGRAM" and nothing else.
3. Do not include any conversational text or markdown explanation.

TECHDRAW LANGUAGE (TDL) SYNTAX:
- Define Nodes: \`id: type "Label" { properties }\`
- Define Links: \`id1 -> id2 "Label" { properties }\`
- Properties are JSON-like.

AVAILABLE COMPONENT TYPES:
- Generic: rect, circle, cloud, database, server, box
- Logic/Circuits: flow_start, flow_process, flow_decision, resistor, capacitor, inductor, diode, led, opamp, transistor_npn, gate_and, gate_or, gate_not, gate_nand, gate_nor, gate_xor
- 3D/Mech: wireframe_cube, gear, piston, valve, spring, crank, coil
- Charts: chart_bar, chart_line

EXAMPLE:
\`\`\`tdl
u1: user "User"
s1: server "API Server" { width: 120 }
db: database "Main DB"
u1 -> s1 "Request"
s1 -> db "Query"
\`\`\`
`;

// Helper to get Title Metadata
export const extractTitle = async (content: string): Promise<string> => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("Missing API Key");
    const ai = new GoogleGenAI({ apiKey });
    
    // Using a fast model for metadata extraction
    const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: content,
        config: {
            systemInstruction: "You are a patent librarian. Extract the specific Technical Title of the invention described in the text. Output ONLY the title, no other text. Capitalize it properly.",
            temperature: 0.1,
            maxOutputTokens: 50
        }
    });
    
    return response.text?.trim() || "Untitled Invention";
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
      finalSystemPrompt += `\n\nIMPORTANT: The title of this patent application MUST be exactly: "${options.titleOverride}". Use this in the <H1> tag.`;
  }
  
  let finalAnalysisPrompt = `${finalSystemPrompt}\n\n${ANALYSIS_AGENT_PROMPT}`;
  
  if (options.includeCharts) {
      finalAnalysisPrompt += `\n\n${CHART_AGENT_INSTRUCTIONS}`;
  }

  try {
    // Run agents in parallel
    const [analysisResponse, diagramResponse] = await Promise.all([
        // 1. Analysis / Formatting Agent ( + Chart Agent if enabled)
        ai.models.generateContent({
            model: MODEL_NAME,
            contents: options.content,
            config: {
                systemInstruction: finalAnalysisPrompt,
                temperature: options.temperature,
                maxOutputTokens: 8192, // Ensure full response for large files
                tools: analysisTools.length > 0 ? analysisTools : undefined,
            },
        }),
        // 2. TechDraw Agent
        ai.models.generateContent({
            model: MODEL_NAME,
            contents: options.content,
            config: {
                systemInstruction: TECHDRAW_AGENT_PROMPT,
                temperature: 0.2, // Low temperature for syntax correctness
                maxOutputTokens: 8192, // Ensure complex diagrams aren't cut off
            },
        })
    ]);

    // --- Process Analysis Output ---
    let rawAnalysisText = analysisResponse.text || "";
    let htmlText = "";

    const htmlMatch = rawAnalysisText.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
    if (htmlMatch && htmlMatch[1]) {
      htmlText = htmlMatch[1].trim();
    } else {
      htmlText = rawAnalysisText.trim();
    }

    // Handle Grounding (Sources) from Analysis Agent
    const groundingChunks = analysisResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && groundingChunks.length > 0) {
        let sourcesComment = "\n\n<!--\n--- GENERATED SOURCES ---\n";
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                sourcesComment += `Title: ${chunk.web.title || "Source"}\nURL: ${chunk.web.uri}\n\n`;
            }
        });
        sourcesComment += "-->";
        htmlText += sourcesComment;
    }

    // --- Process Diagram Output ---
    let rawDiagramText = diagramResponse.text || "";
    let tdlText = "";

    if (!rawDiagramText.includes("NO_DIAGRAM")) {
        const tdlMatch = rawDiagramText.match(/```(?:tdl|techdraw)\s*([\s\S]*?)\s*```/i);
        if (tdlMatch && tdlMatch[1]) {
            tdlText = tdlMatch[1].trim();
        } else {
            // Fallback: assume the whole response is TDL if it doesn't have code blocks but looks like it
            // (e.g. strict agent just outputted code)
            if (rawDiagramText.includes("->") || rawDiagramText.includes(":")) {
                tdlText = rawDiagramText.trim();
            }
        }
    }
    
    return {
        text: htmlText,
        tdl: tdlText || undefined
    };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Unknown error occurred during generation");
  }
};