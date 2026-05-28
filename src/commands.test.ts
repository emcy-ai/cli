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
      "gateway-public",
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

  it("registers Gateway public doctor client readiness command", () => {
    const program = new Command();
    registerCommands(program);

    const gatewayPublic = program.commands.find((command) => command.name() === "gateway-public");
    const doctor = gatewayPublic?.commands.find((command) => command.name() === "doctor");

    expect(doctor).toBeDefined();
    expect(doctor?.options.some((option) => option.long === "--client")).toBe(true);
    expect(doctor?.options.some((option) => option.long === "--url")).toBe(true);
    expect(doctor?.options.some((option) => option.long === "--bearer")).toBe(true);
    expect(doctor?.options.some((option) => option.long === "--json")).toBe(true);
    expect(doctor?.options.some((option) => option.long === "--output")).toBe(true);
  });

  it("registers agent budget commands", () => {
    const program = new Command();
    registerCommands(program);

    const agents = program.commands.find((command) => command.name() === "agents");
    const budget = agents?.commands.find((command) => command.name() === "budget");

    expect(budget).toBeDefined();
    expect(commandNames(budget!)).toEqual(expect.arrayContaining([
      "set",
      "get",
      "delete",
      "defaults",
    ]));

    const setCommand = budget?.commands.find((command) => command.name() === "set");
    expect(setCommand?.options.some((option) => option.long === "--user")).toBe(true);
    expect(setCommand?.options.some((option) => option.long === "--monthly-usd")).toBe(true);

    const defaultsCommand = budget?.commands.find((command) => command.name() === "defaults");
    expect(defaultsCommand?.options.some((option) => option.long === "--default-user-usd")).toBe(true);
  });
});
