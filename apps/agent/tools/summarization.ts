import { invokeLLM } from "./llmFactory.js";

export interface DocumentSummary {
  mainTopic: string;
  sections: Array<{
    title: string;
    description: string;
  }>;
  keyEntities: Array<{
    type: "person" | "organization" | "date" | "location" | "concept";
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

  const messages = [
    {
      role: "system" as const,
      content: `You are a document summarization expert. Your task is to analyze documents and create structured, comprehensive summaries.

The summary must be:
- Dense and information-rich
- Well-structured with clear sections
- Identify key entities (people, organizations, dates, locations, concepts)
- Extract main conclusions or findings
- Written in the same language as the document

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
      "type": "person|organization|date|location|concept",
      "value": "Entity value"
    }
  ],
  "conclusions": ["Key takeaway 1", "Key takeaway 2"]
}`,
    },
    {
      role: "user" as const,
      content: prompt,
    },
  ];

  const response = await invokeLLM(messages);

  try {
    // Parse the JSON response
    const summary = JSON.parse(response.content);

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
      mainTopic: `Document: ${filename}`,
      sections: [
        {
          title: "Content",
          description: "Unable to generate detailed summary. Please try re-ingesting.",
        },
      ],
      keyEntities: [],
      conclusions: ["Summary generation failed. Document text may be too complex or malformed."],
    };
  }
}

function buildSummarizationPrompt(documentText: string, filename: string): string {
  // Truncate if too long (keep first ~20k chars for context)
  const truncatedText =
    documentText.length > 20000
      ? documentText.substring(0, 20000) + "\n\n[Document truncated for summarization...]"
      : documentText;

  return `Analyze and summarize this document:

Filename: ${filename}

Document Content:
${truncatedText}

Generate a comprehensive structured summary in JSON format with:
1. mainTopic: A clear, concise description of what this document is about
2. sections: Break down the document into logical sections with titles and descriptions
3. keyEntities: Extract important entities (people, organizations, dates, locations, key concepts)
4. conclusions: List the main takeaways, findings, or conclusions

Focus on information that will help answer:
- General questions about the document's content
- Specific questions about data, facts, and details mentioned
- Questions about the document's structure and organization

Respond with ONLY the JSON object, no additional text.`;
}
