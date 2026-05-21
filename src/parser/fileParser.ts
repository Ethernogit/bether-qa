import { Project, SourceFile, SyntaxKind } from "ts-morph";
import path from "path";

export interface HttpRoute {
  method: string;
  path: string;
}

export interface ModelAssociation {
  type: string;
  target: string;
}

export interface FileMetadata {
  path: string;
  classes: { name: string; decorators: string[]; methods: string[] }[];
  functions: string[];
  exports: string[];
  /** Imports internos resueltos como rutas relativas desde la raíz del proyecto */
  internalImports: string[];
  externalDeps: string[];
  httpRoutes: HttpRoute[];
  modelAssociations: ModelAssociation[];
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "use"]);
const SEQUELIZE_ASSOCS = new Set(["hasMany", "belongsTo", "hasOne", "belongsToMany"]);

function resolveImport(fromAbsolute: string, importSpecifier: string): string {
  const dir = path.dirname(fromAbsolute);
  const resolved = path.resolve(dir, importSpecifier);
  // Normaliza separadores a forward slash para consistencia
  return resolved.replace(/\\/g, "/");
}

function parseSourceFile(sourceFile: SourceFile, root: string, absolutePath: string): FileMetadata {
  const relativePath = path.relative(root, sourceFile.getFilePath()).replace(/\\/g, "/");

  const classes = sourceFile.getClasses().map((cls) => ({
    name: cls.getName() ?? "anonymous",
    decorators: cls.getDecorators().map((d) => d.getName()),
    methods: cls.getMethods().slice(0, 10).map((m) => m.getName()),
  }));

  const functions = sourceFile
    .getFunctions()
    .filter((f) => f.isExported())
    .map((f) => f.getName() ?? "anonymous");

  const exports = [...sourceFile.getExportedDeclarations().keys()].slice(0, 15);

  const allImports = sourceFile.getImportDeclarations().map((i) => i.getModuleSpecifierValue());
  const rootNorm = root.replace(/\\/g, "/");

  // Resolvemos imports internos a rutas desde la raíz (sin extensión para consistencia)
  const internalImports = [
    ...new Set(
      allImports
        .filter((i) => i.startsWith("."))
        .map((i) => {
          const resolved = resolveImport(absolutePath, i);
          return resolved.startsWith(rootNorm)
            ? resolved.slice(rootNorm.length + 1)
            : resolved;
        })
    ),
  ];

  const externalDeps = [...new Set(allImports.filter((i) => !i.startsWith(".")))];

  // --- Detectar rutas HTTP (Express router.get/post/etc.) ---
  const httpRoutes: HttpRoute[] = [];
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const methodName = propAccess.getName().toLowerCase();
    if (!HTTP_METHODS.has(methodName) || methodName === "use") continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    const firstArg = args[0];
    // El primer argumento debe ser un string literal que representa el path
    if (firstArg.getKind() === SyntaxKind.StringLiteral) {
      const routePath = firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
      if (routePath.startsWith("/") || routePath.startsWith(":")) {
        httpRoutes.push({ method: methodName.toUpperCase(), path: routePath });
      }
    }
  }

  // --- Detectar asociaciones Sequelize (hasMany, belongsTo, etc.) ---
  const modelAssociations: ModelAssociation[] = [];

  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const methodName = propAccess.getName();
    if (!SEQUELIZE_ASSOCS.has(methodName)) continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    // El primer argumento es el modelo destino (Identifier o PropertyAccess)
    const targetArg = args[0];
    let targetName = "";

    if (targetArg.getKind() === SyntaxKind.Identifier) {
      targetName = targetArg.asKindOrThrow(SyntaxKind.Identifier).getText();
    } else if (targetArg.getKind() === SyntaxKind.PropertyAccessExpression) {
      targetName = targetArg.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName();
    }

    if (targetName) {
      modelAssociations.push({ type: methodName, target: targetName });
    }
  }

  return {
    path: relativePath,
    classes,
    functions,
    exports,
    internalImports,
    externalDeps,
    httpRoutes,
    modelAssociations,
  };
}

export function parseProject(files: string[], root: string): FileMetadata[] {
  const project = new Project({
    compilerOptions: { allowJs: true },
    skipFileDependencyResolution: true,
  });

  const results: FileMetadata[] = [];

  for (const file of files) {
    try {
      const sf = project.addSourceFileAtPath(file);
      results.push(parseSourceFile(sf, root, file.replace(/\\/g, "/")));
    } catch {
      results.push({
        path: path.relative(root, file).replace(/\\/g, "/"),
        classes: [],
        functions: [],
        exports: [],
        internalImports: [],
        externalDeps: [],
        httpRoutes: [],
        modelAssociations: [],
      });
    }
  }

  return results;
}
