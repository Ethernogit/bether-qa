import { FileMetadata } from "../parser/fileParser";
import { ArchitectureResult } from "./moduleAnalyzer";

export const ARCHITECTURE_SCHEMA = `{
  "features": [
    {
      "id": "snake_case_id",
      "name": "Nombre legible",
      "files": ["ruta/relativa/archivo.js"],
      "type": "module | service | middleware | utility | model | route | controller",
      "description": "Qué hace este módulo en 1 frase",
      "routes": [
        { "method": "GET | POST | PUT | PATCH | DELETE", "path": "/ruta/:param" }
      ],
      "fileConnections": [
        { "from": "archivo/origen.js", "to": "archivo/destino.js", "via": "nombre de función o import" }
      ]
    }
  ],
  "connections": [
    {
      "from": "feature_id_origen",
      "to": "feature_id_destino",
      "type": "depends-on | calls | imports | extends | uses",
      "description": "Por qué existe esta conexión",
      "dataFlow": "sync | async"
    }
  ],
  "architecture": {
    "pattern": "MVC | layered | hexagonal | microservices | monolith | etc",
    "layers": ["capa1", "capa2", "..."],
    "flows": [
      {
        "name": "Nombre del flujo end-to-end",
        "steps": ["feature_id_1", "feature_id_2", "feature_id_3"]
      }
    ]
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
    lines.push(`  deps externas: ${f.externalDeps.join(", ")}`);
  }

  if (f.internalImports.length > 0) {
    lines.push(`  importa (rutas desde raíz): ${f.internalImports.join(", ")}`);
  }

  if (f.httpRoutes.length > 0) {
    const routeStr = f.httpRoutes.map((r) => `${r.method} ${r.path}`).join(", ");
    lines.push(`  rutas HTTP: ${routeStr}`);
  }

  if (f.modelAssociations.length > 0) {
    const assocStr = f.modelAssociations.map((a) => `${a.type}(${a.target})`).join(", ");
    lines.push(`  asociaciones Sequelize: ${assocStr}`);
  }

  return lines.join("\n");
}

export function buildMergePrompt(partials: ArchitectureResult[]): string {
  const partialsJson = JSON.stringify(partials, null, 2);

  return `Tienes ${partials.length} análisis parciales de distintas partes de un proyecto Node.js.
Consolida todos en un único resultado final.

ANÁLISIS PARCIALES:
${partialsJson}

INSTRUCCIONES:
- Fusiona los features: si dos lotes identificaron el mismo módulo (mismo nombre o propósito), únelos en uno solo combinando sus archivos y rutas
- Elimina duplicados de features y de conexiones
- Recalcula conexiones entre todos los features del resultado final; indica dataFlow: "async" cuando la comunicación sea via workers, queues o eventos
- Combina todos los fileConnections de los lotes parciales sin duplicar
- Identifica flujos end-to-end importantes (ej: orden entra por webhook → se normaliza → se crea BusinessOrder → se notifica ERP) y agrégalos en architecture.flows
- Determina el patrón arquitectural global
- Mantén IDs en snake_case únicos

SCHEMA REQUERIDO (devuelve SOLO este JSON, sin markdown, sin explicación):
${ARCHITECTURE_SCHEMA}`;
}

export function buildAnalysisPrompt(files: FileMetadata[]): string {
  const filesSummary = files.map(formatFile).join("\n\n");

  return `Analiza este proyecto Node.js y agrupa sus archivos en módulos funcionales.

ARCHIVOS (con rutas de imports ya resueltas desde la raíz del proyecto):
${filesSummary}

INSTRUCCIONES:
1. Agrupa archivos por propósito funcional, NO por carpeta
2. Cada módulo = 1 feature del sistema (auth, orders, products, etc.)
3. En "routes": incluye los endpoints HTTP detectados en archivos de rutas (aparecen como "rutas HTTP: GET /path")
4. En "fileConnections": traza conexiones archivo→archivo usando los imports resueltos. El campo "via" debe indicar qué función/servicio conecta ambos archivos. Incluye conexiones tanto intra-feature (dentro del mismo módulo) como inter-feature (entre módulos distintos)
5. En "connections": conexiones feature→feature. Usa dataFlow:"async" cuando la comunicación sea via workers, queues o webhooks
6. En "architecture.flows": identifica 3-5 flujos end-to-end críticos del sistema (ej: creación de orden, sincronización con plataforma externa, etc.) listando los feature IDs que participan en orden
7. Las asociaciones Sequelize (hasMany, belongsTo, etc.) indican relaciones de datos; úsalas para deducir dependencias entre features de modelo/dominio

SCHEMA REQUERIDO (devuelve SOLO este JSON, sin markdown, sin explicación):
${ARCHITECTURE_SCHEMA}`;
}
