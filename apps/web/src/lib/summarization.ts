import { getLLMConfig } from "./llm-config";
import { OpenAI } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface DocumentSummary {
  mainTopic: string;
  sections: Array<{
    title: string;
    description: string;
  }>;
  keyEntities: Array<{
    // Expanded types to capture specific data (Phase 1 improvement)
    type: "person" | "organization" | "date" | "location" | "concept" | 
          "credential" | "key_fact" | "code" | "instruction";
    value: string;
  }>;
  conclusions: string[];
}

/**
 * Generate a structured summary of a document using LLM
 */
export async function generateDocumentSummary(
  documentText: string,
  filename: string
): Promise<DocumentSummary> {
  const prompt = buildSummarizationPrompt(documentText, filename);
  const config = getLLMConfig();

  const systemContent = `You are a document summarization expert. Your task is to analyze documents and create structured, comprehensive summaries.

The summary must be:
- Dense and information-rich
- Well-structured with clear sections
- Identify key entities with SPECIFIC VALUES when present
- Extract main conclusions or findings
- Written in the same language as the document

**CRITICAL REQUIREMENT**: For documents containing:
- Passwords, credentials, access codes → Include EXACT VALUE in keyEntities as type "credential"
  Example: { "type": "credential", "value": "Password: aADKasd" }
- Important numbers, IDs, references → Include EXACT VALUE as type "key_fact"
  Example: { "type": "key_fact", "value": "Account Number: 12345" }
- Step-by-step instructions → Include summary as type "instruction"
- Specific dates/deadlines → Include EXACT VALUE as type "date"
  Example: { "type": "date", "value": "Deadline: March 15, 2024" }

Return ONLY valid JSON matching this structure:
{
  "mainTopic": "Brief description of the document's main subject",
  "sections": [
    {
      "title": "Section name",
      "description": "Brief summary of this section"
    }
  ],
  "keyEntities": [
    {
      "type": "person|organization|date|location|concept|credential|key_fact|code|instruction",
      "value": "Entity value (EXACT VALUE for credentials/numbers)"
    }
  ],
  "conclusions": ["Key takeaway 1", "Key takeaway 2"]
}

Example for document "La contraseña de acceso es: aADKasd":
{
  "mainTopic": "Credenciales de acceso",
  "sections": [],
  "keyEntities": [
    { "type": "credential", "value": "Contraseña de acceso: aADKasd" }
  ],
  "conclusions": []
}`;

  let responseContent: string;

  if (config.provider === "openai") {
    const openai = new OpenAI({ apiKey: config.apiKey });
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: prompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent structured output
    });
    responseContent = response.choices[0]?.message?.content || "";
  } else if (config.provider === "gemini") {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.model,
      generationConfig: { temperature: 0.3 },
      systemInstruction: systemContent,
    });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    responseContent = response.text();
  } else {
    throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }

  try {
    // Parse the JSON response
    const summary = JSON.parse(responseContent);

    // Validate the structure
    if (
      !summary.mainTopic ||
      !Array.isArray(summary.sections) ||
      !Array.isArray(summary.keyEntities) ||
      !Array.isArray(summary.conclusions)
    ) {
      throw new Error("Invalid summary structure");
    }

    return summary as DocumentSummary;
  } catch (error: any) {
    console.error("Failed to parse summary:", error);
    // Return a minimal valid summary on parse error
    return {
      mainTopic: `Analysis of ${filename}`,
      sections: [
        {
          title: "Document Content",
          description: documentText.substring(0, 200) + "...",
        },
      ],
      keyEntities: [],
      conclusions: ["Summary generation failed - manual review recommended"],
    };
  }
}

/**
 * Build the summarization prompt from document text
 */
function buildSummarizationPrompt(documentText: string, filename: string): string {
  // Limit text length for LLM context (roughly 8000 tokens * 4 chars)
  const maxChars = 32000;
  const truncatedText = documentText.length > maxChars 
    ? documentText.substring(0, maxChars) + "\n\n[Document truncated for analysis]"
    : documentText;

  return `Analyze the following document and create a structured summary.

Filename: ${filename}

Document Content:
${truncatedText}

Create a comprehensive JSON summary following the specified structure.`;
}
