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
    const customDomain = servers?.commands.find((command) => command.name() === "custom-domain");
    const customDomainDelete = customDomain?.commands.find((command) => command.name() === "delete");

    expect(deleteCommand?.options.some((option) => option.long === "--yes")).toBe(true);
    expect(customDomainDelete?.options.some((option) => option.long === "--yes")).toBe(true);
  });

  it("registers hosted server custom domain commands", () => {
    const program = new Command();
    registerCommands(program);

    const servers = program.commands.find((command) => command.name() === "servers");
    const customDomain = servers?.commands.find((command) => command.name() === "custom-domain");
    const setCommand = customDomain?.commands.find((command) => command.name() === "set");

    expect(customDomain).toBeDefined();
    expect(commandNames(customDomain!)).toEqual(expect.arrayContaining([
      "get",
      "set",
      "verify",
      "delete",
    ]));
    expect(setCommand?.options.some((option) => option.long === "--hostname")).toBe(true);
    expect(setCommand?.options.some((option) => option.long === "--host")).toBe(true);
    for (const commandName of ["get", "set", "verify", "delete"]) {
      const command = customDomain?.commands.find((candidate) => candidate.name() === commandName);
      expect(command?.options.some((option) => option.long === "--environment")).toBe(true);
    }
  });

  it("allows smoke checks to target a hosted environment", () => {
    const program = new Command();
    registerCommands(program);

    const smoke = program.commands.find((command) => command.name() === "smoke");
    const toolsList = smoke?.commands.find((command) => command.name() === "tools-list");
    const call = smoke?.commands.find((command) => command.name() === "call");

    expect(toolsList?.options.some((option) => option.long === "--environment")).toBe(true);
    expect(call?.options.some((option) => option.long === "--environment")).toBe(true);
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
});
