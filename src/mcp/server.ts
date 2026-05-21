import path from "path";
import { glob } from "glob";
import { parseProject } from "../parser/fileParser";
import { writeArchitecture } from "../output/architectureWriter";
import { ArchitectureResult } from "../ai/moduleAnalyzer";

// El exports map del SDK solo expone "./server". Usamos require.resolve para
// localizar el CJS real y acceder a stdio y types desde el mismo directorio.
/* eslint-disable @typescript-eslint/no-require-imports */
const serverIndexPath = require.resolve("@modelcontextprotocol/sdk/server");
const serverDir = path.dirname(serverIndexPath);
const sdkCjsDir = path.dirname(serverDir);

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
  { name: "bether-qa", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scan_project",
      description: "Lista todos los archivos .ts y .js de un proyecto (excluye node_modules, dist).",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta absoluta al proyecto" },
        },
        required: ["path"],
      },
    },
    {
      name: "get_file_metadata",
      description:
        "Parsea el proyecto con AST (ts-morph) y devuelve la metadata estructurada de cada archivo: clases, funciones, exports, dependencias externas e imports internos. Usa esto para analizar la arquitectura sin llamar a ninguna API externa.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta absoluta al proyecto" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_architecture",
      description:
        "Escribe el archivo architecture.json en la raíz del proyecto con el resultado del análisis arquitectural.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta absoluta al proyecto" },
          architecture: {
            type: "object",
            description: "Objeto con features, connections y architecture según el schema de bether-qa",
          },
        },
        required: ["path", "architecture"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "scan_project") {
    const root = path.resolve(args?.path as string);
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

  if (name === "get_file_metadata") {
    const root = path.resolve(args?.path as string);
    const files = await glob("**/*.{ts,js}", {
      cwd: root,
      ignore: ["node_modules/**", "dist/**", "**/*.d.ts"],
      absolute: true,
    });

    if (files.length === 0) {
      return {
        content: [{ type: "text", text: "No se encontraron archivos .ts o .js." }],
      };
    }

    const metadata = parseProject(files, root);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ project: path.basename(root), totalFiles: files.length, files: metadata }, null, 2),
        },
      ],
    };
  }

  if (name === "write_architecture") {
    const root = path.resolve(args?.path as string);
    const architectureData = args?.architecture as ArchitectureResult;

    if (!architectureData || !Array.isArray(architectureData.features)) {
      return {
        content: [{ type: "text", text: "Error: el campo 'architecture' no tiene la estructura esperada (features, connections, architecture)." }],
        isError: true,
      };
    }

    const projectName = path.basename(root);
    const outputPath = writeArchitecture(architectureData, projectName, root);

    return {
      content: [
        {
          type: "text",
          text: `✓ architecture.json generado: ${outputPath}\n\nMódulos: ${architectureData.features.length}\nConexiones: ${architectureData.connections.length}\nPatrón: ${architectureData.architecture.pattern}`,
        },
      ],
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
