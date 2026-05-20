import { glob } from "glob";
import path from "path";
import { parseProject } from "../parser/fileParser";
import { analyzeModules } from "../ai/moduleAnalyzer";
import { writeArchitecture } from "../output/architectureWriter";

export async function scanCommand(
  targetPath: string,
  options: { analyze?: boolean }
): Promise<void> {
  const root = path.resolve(targetPath);

  console.log(`\nEscaneando: ${root}\n`);

  const files = await glob("**/*.{ts,js}", {
    cwd: root,
    ignore: ["node_modules/**", "dist/**", "**/*.d.ts"],
    absolute: true,
  });

  if (files.length === 0) {
    console.log("No se encontraron archivos .ts o .js.");
    return;
  }

  console.log(`Archivos encontrados (${files.length}):\n`);
  files.sort().forEach((file) => {
    console.log(`  ${path.relative(root, file)}`);
  });

  if (!options.analyze) {
    console.log("\nUsa --analyze para generar architecture.json con IA.");
    return;
  }

  console.log("\n--- Analizando módulos con IA ---\n");

  try {
    const metadata = parseProject(files, root);
    const result = await analyzeModules(metadata);

    const projectName = path.basename(root);
    const outputPath = writeArchitecture(result, projectName, root);

    console.log(`\n✓ architecture.json generado: ${outputPath}\n`);

    console.log(`Módulos (${result.features.length}):`);
    result.features.forEach((f) => {
      console.log(`  [${f.type}] ${f.name} — ${f.description}`);
    });

    if (result.connections.length > 0) {
      console.log(`\nConexiones (${result.connections.length}):`);
      result.connections.forEach((c) => {
        console.log(`  ${c.from} → ${c.to} (${c.type})`);
      });
    }

    console.log(`\nArquitectura: ${result.architecture.pattern}`);
    console.log(`Capas: ${result.architecture.layers.join(" → ")}`);
  } catch (err) {
    console.error(
      "\n✗ Error:",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }
}
