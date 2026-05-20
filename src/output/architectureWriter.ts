import fs from "fs";
import path from "path";
import { ArchitectureResult } from "../ai/moduleAnalyzer";

export interface ArchitectureJson extends ArchitectureResult {
  version: string;
  project: string;
  scannedAt: string;
}

export function writeArchitecture(
  result: ArchitectureResult,
  projectName: string,
  outputDir: string
): string {
  const output: ArchitectureJson = {
    version: "1.0",
    project: projectName,
    scannedAt: new Date().toISOString(),
    ...result,
  };

  const outputPath = path.join(outputDir, "architecture.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  return outputPath;
}
