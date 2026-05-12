import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerCommands } from "./commands.js";

function commandNames(command: Command): string[] {
  return command.commands.map((child) => child.name());
}

describe("mcpstack command surface", () => {
  it("registers the primary command groups", () => {
    const program = new Command();
    registerCommands(program);

    expect(commandNames(program)).toEqual(expect.arrayContaining([
      "auth",
      "profiles",
      "org",
      "members",
      "api-keys",
      "servers",
      "tools",
      "deploy",
      "deployments",
      "runtime",
      "gateways",
      "agents",
    ]));
  });

  it("keeps destructive commands behind confirmation flags", () => {
    const program = new Command();
    registerCommands(program);

    const servers = program.commands.find((command) => command.name() === "servers");
    const deleteCommand = servers?.commands.find((command) => command.name() === "delete");

    expect(deleteCommand?.options.some((option) => option.long === "--yes")).toBe(true);
  });
});
