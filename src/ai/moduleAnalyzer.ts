import Anthropic from "@anthropic-ai/sdk";
import { FileMetadata } from "../parser/fileParser";
import { buildAnalysisPrompt } from "./prompts";

export interface Feature {
  id: string;
  name: string;
  files: string[];
  type: "module" | "service" | "middleware" | "utility" | "model" | "route" | "controller";
  description: string;
}

export interface Connection {
  from: string;
  to: string;
  type: "depends-on" | "calls" | "imports" | "extends" | "uses";
  description: string;
}

export interface ArchitectureResult {
  features: Feature[];
  connections: Connection[];
  architecture: {
    pattern: string;
    layers: string[];
  };
}

// ~4 chars por token (estimación conservadora)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractJson(text: string): string {
  // Intenta extraer JSON de bloques markdown si Claude los incluye
  const match = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

export async function analyzeModules(files: FileMetadata[]): Promise<ArchitectureResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY no está configurada.\n  Crea un archivo .env con: ANTHROPIC_API_KEY=sk-..."
    );
  }

  const client = new Anthropic();
  const prompt = buildAnalysisPrompt(files);
  const estimatedTokens = estimateTokens(prompt);

  console.log(`  Archivos a analizar: ${files.length}`);
  console.log(`  Tokens estimados entrada: ~${estimatedTokens.toLocaleString()}`);

  if (estimatedTokens > 20000) {
    console.warn(
      `\n  ⚠️  Prompt grande (~${estimatedTokens} tokens). Próxima mejora: análisis en lotes.\n`
    );
  }

  console.log("  Enviando a Claude...");

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system:
      "Eres un experto en arquitectura de software. Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones adicionales.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude no devolvió texto en la respuesta");
  }

  const rawJson = extractJson(textBlock.text);

  try {
    const result = JSON.parse(rawJson) as ArchitectureResult;

    // Validación básica del schema
    if (!Array.isArray(result.features) || !Array.isArray(result.connections)) {
      throw new Error("El JSON no tiene la estructura esperada (features, connections, architecture)");
    }

    console.log(
      `  Tokens usados: ${response.usage.input_tokens} entrada / ${response.usage.output_tokens} salida`
    );

    return result;
  } catch (err) {
    throw new Error(
      `No se pudo parsear la respuesta de Claude: ${err instanceof Error ? err.message : err}\n\nRespuesta recibida:\n${rawJson.slice(0, 500)}`
    );
  }
}
