#!/usr/bin/env node
import { Command } from "commander";
import { registerCommands } from "./commands.js";
import { McpstackHttpError } from "./client.js";
import { printError } from "./output.js";

const program = new Command();

program
  .name("mcpstack")
  .description("Manage MCP Stack organizations, MCP servers, gateways, agents, deployments, and service accounts.")
  .version("0.1.0")
  .option("--api-url <url>", "MCP Stack API URL")
  .option("--profile <name>", "Local profile name")
  .option("--org <organizationId>", "Organization id")
  .option("--json", "Print JSON output")
  .option("--output <format>", "Output format: table, json, yaml")
  .option("--yes", "Skip confirmation prompts")
  .option("--wait", "Wait for long-running operations where supported")
  .option("--timeout <seconds>", "Timeout for wait/watch commands")
  .option("--verbose", "Verbose output")
  .option("--debug-http", "Print HTTP requests");

registerCommands(program);

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "commander.helpDisplayed") {
    process.exit(0);
  }

  if (error instanceof McpstackHttpError) {
    printError(error.message);
    if (program.opts().debugHttp && error.body !== undefined) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }

  if (error instanceof Error) {
    printError(error.message);
    process.exit(1);
  }

  printError(String(error));
  process.exit(1);
}
