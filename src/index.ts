import { Command } from "commander";
import dotenv from "dotenv";
import { scanCommand } from "./commands/scan";

dotenv.config();

const program = new Command();

program
  .name("bether-qa")
  .description("CLI que escanea proyectos Node.js y genera architecture.json")
  .version("0.1.0");

program
  .command("scan [path]")
  .description("Escanea archivos .ts y .js en el proyecto")
  .option("--analyze", "Analiza con IA y genera architecture.json")
  .action(async (targetPath: string = ".", options) => {
    await scanCommand(targetPath, options);
  });

program.parse(process.argv);
