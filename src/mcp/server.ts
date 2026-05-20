import dotenv from "dotenv";
import path from "path";
import { glob } from "glob";
import { parseProject } from "../parser/fileParser";
import { analyzeModules } from "../ai/moduleAnalyzer";
import { writeArchitecture } from "../output/architectureWriter";

dotenv.config();

// El exports map del SDK solo expone "./server". Usamos require.resolve para
// localizar el CJS real y acceder a stdio y types desde el mismo directorio.
/* eslint-disable @typescript-eslint/no-require-imports */
const serverIndexPath = require.resolve("@modelcontextprotocol/sdk/server");
const serverDir = path.dirname(serverIndexPath);           // .../dist/cjs/server
const sdkCjsDir = path.dirname(serverDir);                 // .../dist/cjs

const { Server } = require(serverIndexPath) as {
  Server: new (info: object, options: object) => {
    setRequestHandler: (schema: object, handler: (req: { params: { name?: string; arguments?: Record<string, unknown> } }) => Promise<unknown>) => void;
    connect: (transport: unknown) => Promise<void>;
  };
};
const { StdioServerTransport } = require(path.join(serverDir, "stdio")) as {
  StdioServerTransport: new () => unknown;
};
const { ListToolsRequestSchema, CallToolRequestSchema } = require(path.join(sdkCjsDir, "types")) as {
  ListToolsRequestSchema: object;
  CallToolRequestSchema: object;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const server = new Server(
  { name: "bether-qa", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scan_project",
      description:
        "Escanea un proyecto y lista todos los archivos .ts y .js encontrados. No usa IA.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Ruta absoluta al proyecto (por defecto: directorio actual)",
          },
        },
      },
    },
    {
      name: "analyze_architecture",
      description:
        "Analiza la arquitectura de un proyecto Node.js con IA. Identifica módulos funcionales, conexiones entre ellos y el patrón arquitectural. Genera architecture.json en el proyecto.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Ruta absoluta al proyecto (por defecto: directorio actual)",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const targetPath = (args?.path as string) || process.cwd();
  const root = path.resolve(targetPath);

  if (name === "scan_project") {
    const files = await glob("**/*.{ts,js}", {
      cwd: root,
      ignore: ["node_modules/**", "dist/**", "**/*.d.ts"],
      absolute: true,
    });

    const relativeFiles = files.sort().map((f) => path.relative(root, f));

    return {
      content: [
        {
          type: "text",
          text: [
            `Proyecto: ${root}`,
            `Archivos encontrados: ${files.length}`,
            "",
            ...relativeFiles.map((f) => `  - ${f}`),
          ].join("\n"),
        },
      ],
    };
  }

  if (name === "analyze_architecture") {
    const files = await glob("**/*.{ts,js}", {
      cwd: root,
      ignore: ["node_modules/**", "dist/**", "**/*.d.ts"],
      absolute: true,
    });

    if (files.length === 0) {
      return {
        content: [
          { type: "text", text: "No se encontraron archivos .ts o .js en el proyecto." },
        ],
      };
    }

    const metadata = parseProject(files, root);
    const result = await analyzeModules(metadata);
    const projectName = path.basename(root);
    const outputPath = writeArchitecture(result, projectName, root);

    const lines = [
      `✓ architecture.json generado: ${outputPath}`,
      "",
      `## Módulos (${result.features.length})`,
      ...result.features.map((f) => `- **${f.name}** [${f.type}]: ${f.description}`),
      "",
      `## Conexiones (${result.connections.length})`,
      ...result.connections.map((c) => `- ${c.from} → ${c.to} (${c.type}): ${c.description}`),
      "",
      `## Arquitectura`,
      `- Patrón: ${result.architecture.pattern}`,
      `- Capas: ${result.architecture.layers.join(" → ")}`,
      "",
      "## architecture.json",
      "```json",
      JSON.stringify(result, null, 2),
      "```",
    ];

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  return {
    content: [{ type: "text", text: `Tool desconocido: ${name}` }],
    isError: true,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
