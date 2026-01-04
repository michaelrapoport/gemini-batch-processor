import { GoogleGenAI, Tool } from "@google/genai";
import { ToolType } from "../types";

const MODEL_NAME = "gemini-3-flash-preview";

interface GenerateOptions {
  content: string;
  systemPrompt: string;
  temperature: number;
  tool: ToolType;
}

export const generateResponse = async (options: GenerateOptions): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing from environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const tools: Tool[] = [];
  
  // Configure tools based on selection
  if (options.tool === ToolType.GOOGLE_SEARCH) {
    tools.push({ googleSearch: {} });
  } else if (options.tool === ToolType.CODE_EXECUTION) {
    tools.push({ codeExecution: {} });
  }

  // Enforce HTML codeblock output in the system prompt to ensure parsability
  const strictSystemPrompt = `${options.systemPrompt}\n\nIMPORTANT: You must output your final response strictly wrapped in an HTML code block (e.g., \`\`\`html\n<your code here>\n\`\`\`). Do not include conversational text outside the code block.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: options.content,
      config: {
        systemInstruction: strictSystemPrompt,
        temperature: options.temperature,
        tools: tools.length > 0 ? tools : undefined,
      },
    });

    let text = response.text || "";

    // 1. Extract HTML Code Block
    // We look for ```html ... ``` or just ``` ... ``` to capture the code
    const codeBlockMatch = text.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
    
    if (codeBlockMatch && codeBlockMatch[1]) {
      text = codeBlockMatch[1].trim();
    } else {
      // If no code block found, we keep the original text but trim it.
      // This acts as a fallback if the model ignores the formatting instruction.
      text = text.trim();
    }

    // 2. Handle Grounding (Sources) as HTML Comments
    // We append sources as comments to keep the file valid HTML but still attribute data.
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && groundingChunks.length > 0) {
        let sourcesComment = "\n\n<!--\n--- GENERATED SOURCES ---\n";
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                sourcesComment += `Title: ${chunk.web.title || "Source"}\nURL: ${chunk.web.uri}\n\n`;
            }
        });
        sourcesComment += "-->";
        text += sourcesComment;
    }
    
    return text;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Unknown error occurred during generation");
  }
};