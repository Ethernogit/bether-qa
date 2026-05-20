import { Project, SourceFile } from "ts-morph";
import path from "path";

export interface FileMetadata {
  path: string;
  classes: { name: string; decorators: string[]; methods: string[] }[];
  functions: string[];
  exports: string[];
  internalImports: string[];
  externalDeps: string[];
}

function parseSourceFile(sourceFile: SourceFile, root: string): FileMetadata {
  const relativePath = path.relative(root, sourceFile.getFilePath());

  const classes = sourceFile.getClasses().map((cls) => ({
    name: cls.getName() ?? "anonymous",
    decorators: cls.getDecorators().map((d) => d.getName()),
    methods: cls.getMethods().slice(0, 6).map((m) => m.getName()),
  }));

  const functions = sourceFile
    .getFunctions()
    .filter((f) => f.isExported())
    .map((f) => f.getName() ?? "anonymous");

  const exports = [...sourceFile.getExportedDeclarations().keys()].slice(0, 10);

  const allImports = sourceFile.getImportDeclarations().map((i) => i.getModuleSpecifierValue());
  const internalImports = [...new Set(allImports.filter((i) => i.startsWith(".")))].slice(0, 8);
  const externalDeps = [...new Set(allImports.filter((i) => !i.startsWith(".")))];

  return { path: relativePath, classes, functions, exports, internalImports, externalDeps };
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
      results.push(parseSourceFile(sf, root));
    } catch {
      results.push({
        path: path.relative(root, file),
        classes: [],
        functions: [],
        exports: [],
        internalImports: [],
        externalDeps: [],
      });
    }
  }

  return results;
}
