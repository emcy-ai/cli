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

    const names = commandNames(program);
    expect(names).toEqual(expect.arrayContaining([
      "auth",
      "org",
      "members",
      "api-keys",
      "servers",
      "tools",
      "logs",
      "smoke",
      "gateways",
      "agents",
    ]));
    expect(names).not.toEqual(expect.arrayContaining([
      "deploy",
      "undeploy",
      "deployments",
      "deployment-config",
      "runtime",
      "routing",
      "host",
      "doctor",
    ]));
    expect(names).not.toContain("profiles");
  });

  it("keeps destructive commands behind confirmation flags", () => {
    const program = new Command();
    registerCommands(program);

    const servers = program.commands.find((command) => command.name() === "servers");
    const deleteCommand = servers?.commands.find((command) => command.name() === "delete");

    expect(deleteCommand?.options.some((option) => option.long === "--yes")).toBe(true);
  });
});
