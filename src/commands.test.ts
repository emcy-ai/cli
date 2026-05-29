import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { inferOpenApiServerName, registerCommands, slugifyServerName } from "./commands.js";

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

  it("keeps the advertised OpenAPI file create path available", () => {
    const program = new Command();
    registerCommands(program);

    const servers = program.commands.find((command) => command.name() === "servers");
    const createCommand = servers?.commands.find((command) => command.name() === "create");
    const nameOption = createCommand?.options.find((option) => option.long === "--name");
    const openApiFileOption = createCommand?.options.find((option) => option.long === "--openapi-file");
    const runtimeTypeOption = createCommand?.options.find((option) => option.long === "--runtime-type");

    expect(openApiFileOption).toBeDefined();
    expect(runtimeTypeOption).toBeDefined();
    expect(nameOption?.mandatory).toBe(false);
  });

  it("exposes basic MCP server lifecycle commands", () => {
    const program = new Command();
    registerCommands(program);

    const servers = program.commands.find((command) => command.name() === "servers");
    expect(commandNames(servers!)).toEqual(expect.arrayContaining([
      "create",
      "get",
      "update",
      "delete",
      "logs",
    ]));

    const updateCommand = servers?.commands.find((command) => command.name() === "update");
    expect(updateCommand?.options.some((option) => option.long === "--openapi-file")).toBe(true);
    expect(updateCommand?.options.some((option) => option.long === "--openapi-url")).toBe(true);
  });

  it("does not expose legacy OpenAPI subcommands", () => {
    const program = new Command();
    registerCommands(program);

    const servers = program.commands.find((command) => command.name() === "servers");
    expect(servers?.commands.some((command) => command.name() === "openapi")).toBe(false);
  });

  it("derives server identity from an OpenAPI file", () => {
    const spec = `
openapi: 3.0.3
info:
  title: Private Billing API
  version: 2026.05.29
paths: {}
`;

    expect(inferOpenApiServerName(spec, "./openapi.yaml")).toBe("Private Billing API");
    expect(inferOpenApiServerName("not: an openapi document", "./private-orders-api.yaml")).toBe("Private Orders API");
    expect(slugifyServerName("Private Billing API")).toBe("private-billing-api");
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
