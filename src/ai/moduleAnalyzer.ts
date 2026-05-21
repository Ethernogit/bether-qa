import Anthropic from "@anthropic-ai/sdk";
import { FileMetadata } from "../parser/fileParser";
import { buildAnalysisPrompt, buildMergePrompt } from "./prompts";

export interface HttpRoute {
  method: string;
  path: string;
}

export interface FileConnection {
  from: string;
  to: string;
  via: string;
}

export interface Feature {
  id: string;
  name: string;
  files: string[];
  type: "module" | "service" | "middleware" | "utility" | "model" | "route" | "controller";
  description: string;
  /** Endpoints HTTP que expone este feature */
  routes?: HttpRoute[];
  /** Conexiones entre archivos dentro y entre features (nivel fino) */
  fileConnections?: FileConnection[];
}

export interface Connection {
  from: string;
  to: string;
  type: "depends-on" | "calls" | "imports" | "extends" | "uses";
  description: string;
  /** sync = llamada directa, async = worker/queue/event */
  dataFlow?: "sync" | "async";
}

export interface ArchitectureResult {
  features: Feature[];
  connections: Connection[];
  architecture: {
    pattern: string;
    layers: string[];
    /** Flujos transversales end-to-end relevantes */
    flows?: { name: string; steps: string[] }[];
  };
}

// ~4 chars por token (estimación conservadora)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

// Divide archivos en lotes que no superen maxTokens por prompt
function splitIntoBatches(files: FileMetadata[], maxTokens: number): FileMetadata[][] {
  const batches: FileMetadata[][] = [];
  let current: FileMetadata[] = [];
  let currentTokens = 0;

  for (const file of files) {
    const fileText = formatFileForEstimate(file);
    const fileTokens = estimateTokens(fileText);

    if (current.length > 0 && currentTokens + fileTokens > maxTokens) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(file);
    currentTokens += fileTokens;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

function formatFileForEstimate(f: FileMetadata): string {
  return [
    f.path,
    ...f.classes.map((c) => `${c.name} ${c.methods.join(" ")}`),
    f.functions.join(" "),
    f.exports.join(" "),
    f.externalDeps.join(" "),
    f.internalImports.join(" "),
  ].join(" ");
}

async function callClaude(
  client: Anthropic,
  prompt: string,
  label: string
): Promise<ArchitectureResult> {
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system:
      "Eres un experto en arquitectura de software. Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones adicionales.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`${label}: Claude no devolvió texto`);
  }

  const rawJson = extractJson(textBlock.text);

  try {
    const result = JSON.parse(rawJson) as ArchitectureResult;
    if (!Array.isArray(result.features) || !Array.isArray(result.connections)) {
      throw new Error("JSON sin estructura esperada (features, connections, architecture)");
    }
    console.log(
      `    tokens: ${response.usage.input_tokens} entrada / ${response.usage.output_tokens} salida`
    );
    return result;
  } catch (err) {
    throw new Error(
      `${label}: no se pudo parsear la respuesta — ${err instanceof Error ? err.message : err}\n\n${rawJson.slice(0, 300)}`
    );
  }
}

// Límite de tokens por lote (deja margen para el prompt base)
const BATCH_TOKEN_LIMIT = 15000;

export async function analyzeModules(files: FileMetadata[]): Promise<ArchitectureResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY no está configurada.\n  Crea un archivo .env con: ANTHROPIC_API_KEY=sk-..."
    );
  }

  const client = new Anthropic();
  const batches = splitIntoBatches(files, BATCH_TOKEN_LIMIT);

  console.log(`  Archivos a analizar: ${files.length}`);
  console.log(`  Lotes generados: ${batches.length} (límite ~${BATCH_TOKEN_LIMIT} tokens/lote)\n`);

  const batchResults: ArchitectureResult[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const prompt = buildAnalysisPrompt(batch);
    const estimatedTokens = estimateTokens(prompt);

    console.log(`  Lote ${i + 1}/${batches.length}: ${batch.length} archivos (~${estimatedTokens} tokens)`);

    const result = await callClaude(client, prompt, `Lote ${i + 1}`);
    batchResults.push(result);
  }

  // Si solo hay un lote no hace falta consolidar
  if (batchResults.length === 1) {
    return batchResults[0];
  }

  console.log(`\n  Consolidando ${batchResults.length} resultados parciales...`);
  const mergePrompt = buildMergePrompt(batchResults);
  const mergeTokens = estimateTokens(mergePrompt);
  console.log(`  Consolidación (~${mergeTokens} tokens)`);

  return await callClaude(client, mergePrompt, "Consolidación");
}
