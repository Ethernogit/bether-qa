import { FileMetadata } from "../parser/fileParser";

export const ARCHITECTURE_SCHEMA = `{
  "features": [
    {
      "id": "snake_case_id",
      "name": "Nombre legible",
      "files": ["ruta/relativa/archivo.ts"],
      "type": "module | service | middleware | utility | model | route | controller",
      "description": "Qué hace este módulo en 1 frase"
    }
  ],
  "connections": [
    {
      "from": "feature_id_origen",
      "to": "feature_id_destino",
      "type": "depends-on | calls | imports | extends | uses",
      "description": "Por qué existe esta conexión"
    }
  ],
  "architecture": {
    "pattern": "MVC | layered | hexagonal | microservices | monolith | etc",
    "layers": ["controllers", "services", "repositories", "..."]
  }
}`;

function formatFile(f: FileMetadata): string {
  const lines: string[] = [`### ${f.path}`];

  if (f.classes.length > 0) {
    f.classes.forEach((cls) => {
      const dec = cls.decorators.length ? ` [${cls.decorators.join(", ")}]` : "";
      const methods = cls.methods.length ? ` → ${cls.methods.join(", ")}` : "";
      lines.push(`  clase: ${cls.name}${dec}${methods}`);
    });
  }

  if (f.functions.length > 0) {
    lines.push(`  funciones: ${f.functions.join(", ")}`);
  }

  if (f.exports.length > 0) {
    lines.push(`  exports: ${f.exports.join(", ")}`);
  }

  if (f.externalDeps.length > 0) {
    lines.push(`  deps: ${f.externalDeps.join(", ")}`);
  }

  if (f.internalImports.length > 0) {
    lines.push(`  usa: ${f.internalImports.join(", ")}`);
  }

  return lines.join("\n");
}

export function buildAnalysisPrompt(files: FileMetadata[]): string {
  const filesSummary = files.map(formatFile).join("\n\n");

  return `Analiza este proyecto Node.js/TypeScript y agrupa sus archivos en módulos funcionales.

ARCHIVOS:
${filesSummary}

INSTRUCCIONES:
- Agrupa archivos por propósito funcional, no por carpeta
- Cada módulo = 1 feature del sistema (auth, users, products, etc.)
- Identifica qué módulos dependen de otros
- Determina el patrón arquitectural

SCHEMA REQUERIDO (devuelve SOLO este JSON, sin markdown, sin explicación):
${ARCHITECTURE_SCHEMA}`;
}
