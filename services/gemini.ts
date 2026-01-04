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

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: options.content,
      config: {
        systemInstruction: options.systemPrompt,
        temperature: options.temperature,
        tools: tools.length > 0 ? tools : undefined,
      },
    });

    // Handle Google Search Grounding metadata if present
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    let text = response.text || "";

    if (groundingChunks && groundingChunks.length > 0) {
        text += "\n\n--- Sources ---\n";
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                text += `- [${chunk.web.title || "Source"}](${chunk.web.uri})\n`;
            }
        });
    }
    
    return text;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Unknown error occurred during generation");
  }
};