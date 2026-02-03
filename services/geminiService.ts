
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const troubleshootDeployment = async (files: string[], errorDescription: string) => {
  const prompt = `
    The user is deploying a web project to GitHub Pages and experiencing issues (e.g., a blank screen or 404).
    Project file list: ${files.join(', ')}
    Observed symptoms: ${errorDescription}
    
    Common issues for GitHub Pages:
    1. Base paths (missing ./ in assets)
    2. Missing index.html
    3. Case sensitivity in file names
    4. React/Vercel style routing issues
    
    Provide a concise technical solution and specifically suggest what code changes are needed in a JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING, description: "Analysis of the issue" },
            solution: { type: Type.STRING, description: "Steps to fix" },
            codeFix: { type: Type.STRING, description: "The actual code snippet or file modification" },
          },
          required: ["analysis", "solution", "codeFix"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini troubleshooting failed", error);
    return {
      analysis: "לא ניתן היה לנתח את השגיאה כרגע.",
      solution: "ודא שקיים קובץ index.html בתיקיית השורש ושכל הנתיבים הם יחסיים (./).",
      codeFix: ""
    };
  }
};
