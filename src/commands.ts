import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { McpstackClient } from "./client.js";
import { login, logout, serviceAccountLogin, serviceAccountLogout, status, whoami } from "./auth.js";
import { gatewayDoctorColumns, runGatewayDoctor, type GatewayDoctorClient } from "./gateway-doctor.js";
import { printData, printInfo, printSuccess, type TableColumn } from "./output.js";
import type { GlobalOptions } from "./types.js";

type CommandAction = (...args: any[]) => Promise<void>;

const orgColumns: TableColumn<any>[] = [
  { header: "ID", value: (item) => item.id },
  { header: "Name", value: (item) => item.name },
  { header: "Slug", value: (item) => item.slug },
  { header: "Role", value: (item) => item.roleKey ?? item.role },
];

const serverColumns: TableColumn<any>[] = [
  { header: "ID", value: (item) => item.id },
  { header: "Name", value: (item) => item.name },
  { header: "Slug", value: (item) => item.slug },
  { header: "Runtime", value: (item) => item.runtimeType },
  { header: "Status", value: (item) => item.status },
];

const memberColumns: TableColumn<any>[] = [
  { header: "Principal", value: (item) => item.principalId ?? item.id },
  { header: "Name", value: (item) => item.displayName ?? item.name },
  { header: "Email", value: (item) => item.email },
  { header: "Role", value: (item) => item.roleKey ?? item.role },
];

const invitationColumns: TableColumn<any>[] = [
  { header: "ID", value: (item) => item.id },
  { header: "Email", value: (item) => item.email ?? item.invitedEmail },
  { header: "Role", value: (item) => item.role },
  { header: "Status", value: (item) => item.status },
  { header: "Expires", value: (item) => item.expiresAt },
];

const gatewayColumns: TableColumn<any>[] = [
  { header: "ID", value: (item) => item.id },
  { header: "Name", value: (item) => item.name },
  { header: "Provider", value: (item) => item.provider },
  { header: "Status", value: (item) => item.status },
];

const agentColumns: TableColumn<any>[] = [
  { header: "ID", value: (item) => item.id },
  { header: "Name", value: (item) => item.name },
  { header: "Model", value: (item) => item.model ?? item.modelId },
  { header: "Status", value: (item) => item.status },
];

export function registerCommands(program: Command): void {
  registerAuthCommands(program);
  registerOrgCommands(program);
  registerMemberCommands(program);
  registerApiKeyCommands(program);
  registerDashboardCommands(program);
  registerHostingCommands(program);
  registerServerCommands(program);
  registerToolCommands(program);
  registerServerDiagnosticsCommands(program);
  registerGatewayCommands(program);
  registerGatewayPublicCommands(program);
  registerAgentCommands(program);
  registerCompletionCommand(program);
}

function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authenticate the MCP Stack CLI");

  auth.command("login")
    .description("Sign in with OAuth device flow")
    .option("--no-browser", "Do not open the system browser (print the URL only)")
    .action(run(async (options) => login(options)));

  auth.command("logout")
    .description("Delete the active local login")
    .action(run(async (options) => logout(options)));

  auth.command("status")
    .description("Show the active login")
    .action(run(async (options) => status(options)));

  auth.command("whoami")
    .description("Show the authenticated user or service account")
    .action(run(async (options) => printData(await whoami(options), options)));

  const serviceAccount = auth.command("service-account").description("Manage service-account auth");
  serviceAccount.command("login")
    .description("Store a service-account API key")
    .requiredOption("--key <key>", "Service-account API key")
    .action(run(async (options) => serviceAccountLogin(options)));

  serviceAccount.command("logout")
    .description("Delete the active service-account login")
    .action(run(async (options) => serviceAccountLogout(options)));
}

function registerOrgCommands(program: Command): void {
  const org = program.command("org").description("Manage organizations");

  org.command("list")
    .description("List organizations (the CLI uses your primary organization automatically, same as the dashboard)")
    .action(runClient(async (client, options) => {
      printData(await client.request("/api/v1/organizations"), options, orgColumns);
    }));

  org.command("get")
    .argument("[organizationId]", "Organization id")
    .description("Show an organization")
    .action(runClient(async (client, options, organizationId?: string) => {
      const orgId = await client.resolveOrgId(organizationId);
      printData(await client.request(`/api/v1/organizations/${orgId}`), options);
    }));

  org.command("create")
    .requiredOption("--name <name>", "Organization name")
    .option("--slug <slug>", "Organization slug")
    .description("Create an organization")
    .action(runClient(async (client, options) => {
      const created = await client.request<any>("/api/v1/organizations", {
        method: "POST",
        body: omitUndefined({ name: options.name, slug: options.slug }),
      });
      await client.syncDefaultOrganization();
      printData(created, options);
    }));

  org.command("update")
    .argument("[organizationId]", "Organization id")
    .requiredOption("--name <name>", "Organization name")
    .description("Update an organization")
    .action(runClient(async (client, options, organizationId?: string) => {
      const orgId = await client.resolveOrgId(organizationId);
      printData(await client.request(`/api/v1/organizations/${orgId}`, {
        method: "PATCH",
        body: { name: options.name },
      }), options);
    }));

  org.command("delete")
    .argument("[organizationId]", "Organization id")
    .option("--yes", "Confirm deletion")
    .description("Delete an organization")
    .action(runClient(async (client, options, organizationId?: string) => {
      const orgId = await client.resolveOrgId(organizationId);
      await requireConfirmation(options, `Delete organization '${orgId}'?`);
      await client.request(`/api/v1/organizations/${orgId}`, { method: "DELETE" });
      printSuccess(`Deleted organization '${orgId}'.`);
    }));
}

function registerMemberCommands(program: Command): void {
  const members = program.command("members").description("Manage organization members and invitations");

  members.command("list")
    .description("List active members")
    .action(runClientWithOrg(async (client, options, orgId) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/members`), options, memberColumns);
    }));

  members.command("invite")
    .argument("<email>", "Email address")
    .requiredOption("--role <role>", "Role: admin, developer, or viewer")
    .description("Send an invitation")
    .action(runClientWithOrg(async (client, options, orgId, email: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/invitations`, {
        method: "POST",
        body: { email, role: options.role },
      }), options);
    }));

  members.command("update-role")
    .argument("<principalId>", "Principal id")
    .requiredOption("--role <role>", "Role: admin, developer, or viewer")
    .description("Update a member role")
    .action(runClientWithOrg(async (client, options, orgId, principalId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/members/${principalId}`, {
        method: "PATCH",
        body: { role: options.role },
      }), options);
    }));

  members.command("remove")
    .argument("<principalId>", "Principal id")
    .option("--yes", "Confirm removal")
    .description("Remove a member")
    .action(runClientWithOrg(async (client, options, orgId, principalId: string) => {
      await requireConfirmation(options, `Remove member '${principalId}'?`);
      await client.request(`/api/v1/organizations/${orgId}/members/${principalId}`, { method: "DELETE" });
      printSuccess(`Removed member '${principalId}'.`);
    }));

  const invitations = members.command("invitations").description("Manage pending invitations");
  invitations.command("list")
    .description("List invitations")
    .action(runClientWithOrg(async (client, options, orgId) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/invitations`), options, invitationColumns);
    }));
  invitations.command("resend")
    .argument("<invitationId>", "Invitation id")
    .description("Resend an invitation")
    .action(runClientWithOrg(async (client, options, orgId, invitationId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/invitations/${invitationId}/resend`, { method: "POST" }), options);
    }));
  invitations.command("revoke")
    .argument("<invitationId>", "Invitation id")
    .option("--reason <reason>", "Revocation reason")
    .description("Revoke an invitation")
    .action(runClientWithOrg(async (client, options, orgId, invitationId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/invitations/${invitationId}/revoke`, {
        method: "POST",
        body: { reason: options.reason },
      }), options);
    }));
}

function registerApiKeyCommands(program: Command): void {
  const keys = program.command("api-keys").description("Manage service-account API keys");
  keys.command("list").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/api-keys`), options);
  }));
  keys.command("roles").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/api-keys/roles`), options);
  }));
  keys.command("create")
    .requiredOption("--name <name>", "Key name")
    .option("--description <description>", "Description")
    .option("--role <role>", "Role key", "viewer")
    .option("--expires-at <iso>", "Expiration timestamp")
    .action(runClientWithOrg(async (client, options, orgId) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/api-keys`, {
        method: "POST",
        body: omitUndefined({
          name: options.name,
          description: options.description,
          roleKey: options.role,
          expiresAt: options.expiresAt,
        }),
      }), options);
    }));
  keys.command("revoke")
    .argument("<keyId>", "API key id")
    .option("--yes", "Confirm revocation")
    .action(runClientWithOrg(async (client, options, orgId, keyId: string) => {
      await requireConfirmation(options, `Revoke API key '${keyId}'?`);
      await client.request(`/api/v1/organizations/${orgId}/api-keys/${keyId}`, { method: "DELETE" });
      printSuccess(`Revoked API key '${keyId}'.`);
    }));
}

function registerDashboardCommands(program: Command): void {
  const dashboard = program.command("dashboard").description("Dashboard summary and analytics");
  dashboard.command("stats").action(runClient(async (client, options) => {
    printData(await client.request("/api/v1/dashboard/stats"), options);
  }));
  dashboard.command("analytics")
    .option("--days <days>", "Days to include", "30")
    .action(runClient(async (client, options) => {
      printData(await client.request("/api/v1/dashboard/analytics", { query: { days: options.days } }), options);
    }));
}

function registerHostingCommands(program: Command): void {
  const hosting = program.command("hosting").description("Hosting usage");
  hosting.command("usage").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/mcp-hosting/usage`), options);
  }));

  const billing = program.command("billing").description("Billing operations");
  billing.command("checkout").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/mcp-hosting/billing/checkout-session`, { method: "POST" }), options);
  }));
  billing.command("sync").argument("<sessionId>").action(runClientWithOrg(async (client, options, orgId, sessionId: string) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/mcp-hosting/billing/checkout-session/${sessionId}/sync`, { method: "POST" }), options);
  }));
}

function registerServerCommands(program: Command): void {
  const servers = program.command("servers").description("Manage MCP servers");
  servers.command("list").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers`), options, serverColumns);
  }));
  servers.command("get").argument("<serverId>").action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}`), options);
  }));
  servers.command("create")
    .requiredOption("--name <name>", "Server name")
    .option("--slug <slug>", "Server slug")
    .option("--openapi-url <url>", "OpenAPI URL")
    .option("--openapi-file <file>", "OpenAPI JSON/YAML file")
    .option("--runtime-type <runtimeType>", "Runtime type")
    .option("--kind <kind>", "Server kind")
    .option("--description <description>", "Description")
    .description("Create a server. Hosted servers publish to the managed edge automatically.")
    .action(runClientWithOrg(async (client, options, orgId) => {
      const spec = options.openapiFile ? await readFile(options.openapiFile, "utf8") : undefined;
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers`, {
        method: "POST",
        body: omitUndefined({
          name: options.name,
          slug: options.slug,
          kind: options.kind,
          description: options.description,
          runtimeType: options.runtimeType,
          openApiSpecUrl: options.openapiUrl,
          openApiSpecJson: spec,
        }),
      }), options);
    }));
  servers.command("update")
    .argument("<serverId>")
    .option("--name <name>")
    .option("--description <description>")
    .option("--status <status>")
    .option("--server-url <url>")
    .option("--runtime-type <runtimeType>")
    .description("Update server settings. Hosted server changes publish automatically.")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}`, {
        method: "PATCH",
        body: omitUndefined({
          name: options.name,
          description: options.description,
          status: options.status,
          serverUrl: options.serverUrl,
          runtimeType: options.runtimeType,
        }),
      }), options);
    }));
  servers.command("delete")
    .argument("<serverId>")
    .option("--environment <environment>")
    .option("--yes")
    .description("Delete a server. Hosted runtime cleanup is handled automatically.")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      await requireConfirmation(options, `Delete MCP server '${serverId}'?`);
      await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}`, {
        method: "DELETE",
        query: { environment: options.environment },
      });
      printSuccess(`Deleted MCP server '${serverId}'.`);
    }));
  servers.command("analytics").argument("<serverId>").option("--days <days>", "Days", "7")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/analytics`, { query: { days: options.days } }), options);
    }));
  servers.command("logs").argument("<serverId>").option("--page <page>", "Page", "1").option("--page-size <pageSize>", "Page size", "50")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/logs`, { query: { page: options.page, pageSize: options.pageSize } }), options);
    }));
  servers.command("config").argument("<serverId>").action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/config`), options);
  }));

  const openapi = servers.command("openapi").description("Manage server OpenAPI config");
  openapi.command("set").argument("<serverId>").option("--url <url>").option("--file <file>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      const spec = options.file ? await readFile(options.file, "utf8") : undefined;
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/openapi`, {
        method: "POST",
        body: omitUndefined({ openApiSpecUrl: options.url, openApiSpecJson: spec }),
      }), options);
    }));
  openapi.command("refresh").argument("<serverId>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/openapi/refresh`, { method: "POST" }), options);
    }));

  servers.command("discover-tools").argument("<serverId>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/discover-tools`, { method: "POST" }), options);
    }));

  addJsonGetSet(servers, "auth-config", "auth-config");
  addJsonGetSet(servers, "endpoints", "endpoints");

  servers.command("auth-discovery").argument("<serverId>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/auth-discovery`), options);
    }));
  servers.command("checks")
    .argument("<serverId>")
    .option("--environment <environment>")
    .description("Run hosted server DNS, TLS, routing, runtime, and tools/list checks")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/hosting-checks`, {
        method: "POST",
        query: { environment: options.environment },
      }), options);
    }));

  const customDomain = servers.command("custom-domain").description("Manage hosted server custom domains");
  customDomain.command("get")
    .argument("<serverId>")
    .option("--environment <environment>")
    .description("Show custom domain status and DNS records")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/custom-domain`, {
        query: { environment: options.environment },
      }), options);
    }));
  customDomain.command("validate")
    .argument("<serverId>")
    .option("--hostname <hostname>", "Customer-owned hostname, for example mcp.example.com")
    .option("--host <hostname>", "Alias for --hostname")
    .option("--environment <environment>")
    .description("Validate a hostname and return the ownership TXT record to create")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      const hostName = options.hostname ?? options.host;
      if (!hostName) {
        throw new Error("Missing required option --hostname <hostname>.");
      }

      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/custom-domain/validate`, {
        method: "POST",
        body: omitUndefined({ hostName, environment: options.environment }),
      }), options);
    }));
  customDomain.command("confirm-ownership")
    .argument("<serverId>")
    .option("--environment <environment>")
    .description("Confirm the ownership TXT record and prepare routing DNS records")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/custom-domain/confirm-ownership`, {
        method: "POST",
        query: { environment: options.environment },
      }), options);
    }));
  customDomain.command("finalize")
    .argument("<serverId>")
    .option("--environment <environment>")
    .description("Finalize routing after CNAME and Azure validation records resolve")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/custom-domain/finalize`, {
        method: "POST",
        query: { environment: options.environment },
      }), options);
    }));
  customDomain.command("set")
    .argument("<serverId>")
    .option("--environment <environment>")
    .description("Compatibility alias for confirm-ownership/finalize")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/custom-domain/set`, {
        method: "POST",
        query: { environment: options.environment },
      }), options);
    }));
  customDomain.command("verify")
    .argument("<serverId>")
    .option("--environment <environment>")
    .description("Recheck DNS and Azure Front Door readiness for a custom domain")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/custom-domain/verify`, {
        method: "POST",
        query: { environment: options.environment },
      }), options);
    }));
  customDomain.command("delete")
    .argument("<serverId>")
    .option("--environment <environment>")
    .option("--yes", "Confirm removal")
    .description("Remove a custom domain from a hosted server")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      await requireConfirmation(options, `Remove custom domain from server '${serverId}'?`);
      await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/custom-domain`, {
        method: "DELETE",
        query: { environment: options.environment },
      });
      printSuccess("Custom domain removed.");
    }));

  const gateway = servers.command("gateway").description("Manage server gateway attachment");
  gateway.command("get").argument("<serverId>").action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/gateway`), options);
  }));
  gateway.command("attach").argument("<serverId>").requiredOption("--gateway <gatewayId>").option("--public-id <publicId>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/gateway`, {
        method: "PUT",
        body: omitUndefined({ gatewayId: options.gateway, publicId: options.publicId }),
      }), options);
    }));
  gateway.command("detach").argument("<serverId>").option("--yes")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      await requireConfirmation(options, `Detach gateway from server '${serverId}'?`);
      await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/gateway`, { method: "DELETE" });
      printSuccess("Gateway detached.");
    }));
}

function registerToolCommands(program: Command): void {
  const tools = program.command("tools").description("Manage MCP tools");
  tools.command("list").argument("<serverId>").action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
    const server = await client.request<any>(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}`);
    printData(server.tools ?? [], options);
  }));
  tools.command("update").argument("<serverId>").argument("<toolId>")
    .option("--enabled <enabled>")
    .option("--display-name <name>")
    .option("--description <description>")
    .option("--instructions <instructions>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string, toolId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/tools/${toolId}`, {
        method: "PATCH",
        body: omitUndefined({
          isEnabled: options.enabled === undefined ? undefined : options.enabled === "true",
          displayName: options.displayName,
          descriptionOverride: options.description,
          instructions: options.instructions,
        }),
      }), options);
    }));
  tools.command("bulk-update").argument("<serverId>").requiredOption("--file <file>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/tools`, {
        method: "PUT",
        body: await readJsonFile(options.file),
      }), options);
    }));
}

function registerServerDiagnosticsCommands(program: Command): void {
  const logs = program.command("logs").description("Inspect server logs");
  logs.command("stream").argument("<serverId>").option("--environment <environment>").option("--tail <tail>", "Tail", "100")
    .description("Print recent managed edge logs for a server")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/deployment/logs`, {
        query: { environment: options.environment, tail: options.tail },
      }), options);
    }));

  const smoke = program.command("smoke").description("Run MCP smoke checks");
  smoke.command("tools-list").argument("<serverId>")
    .option("--environment <environment>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/mcp-smoke/tools-list`, {
        method: "POST",
        query: { environment: options.environment },
      }), options);
    }));
  smoke.command("call").argument("<serverId>").argument("<toolName>").option("--args <json>").option("--file <file>")
    .option("--environment <environment>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string, toolName: string) => {
      const args = options.file ? await readJsonFile(options.file) : options.args ? JSON.parse(options.args) : {};
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/mcp-smoke/tools/${encodeURIComponent(toolName)}/call`, {
        method: "POST",
        query: { environment: options.environment },
        body: { arguments: args },
      }), options);
    }));
}

function registerGatewayCommands(program: Command): void {
  const gateways = program.command("gateways").description("Manage gateways");
  gateways.command("list").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/gateways`), options, gatewayColumns);
  }));
  gateways.command("get").argument("<gatewayId>").action(runClientWithOrg(async (client, options, orgId, gatewayId: string) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/gateways/${gatewayId}`), options);
  }));
  gateways.command("create")
    .requiredOption("--name <name>")
    .requiredOption("--provider <provider>")
    .requiredOption("--auth-server-url <url>")
    .requiredOption("--client-id <clientId>")
    .requiredOption("--resource <resource>")
    .requiredOption("--scopes <scopes>")
    .option("--description <description>")
    .action(runClientWithOrg(async (client, options, orgId) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/gateways`, {
        method: "POST",
        body: omitUndefined({
          name: options.name,
          description: options.description,
          provider: options.provider,
          authorizationServerUrl: options.authServerUrl,
          clientId: options.clientId,
          resource: options.resource,
          scopes: splitList(options.scopes),
        }),
      }), options);
    }));
  gateways.command("update").argument("<gatewayId>").requiredOption("--file <file>")
    .action(runClientWithOrg(async (client, options, orgId, gatewayId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/gateways/${gatewayId}`, {
        method: "PUT",
        body: await readJsonFile(options.file),
      }), options);
    }));
  gateways.command("delete").argument("<gatewayId>").option("--yes")
    .action(runClientWithOrg(async (client, options, orgId, gatewayId: string) => {
      await requireConfirmation(options, `Delete gateway '${gatewayId}'?`);
      await client.request(`/api/v1/organizations/${orgId}/gateways/${gatewayId}`, { method: "DELETE" });
      printSuccess(`Deleted gateway '${gatewayId}'.`);
    }));
  for (const child of ["servers", "grants", "logs"] as const) {
    gateways.command(child).argument("<gatewayId>")
      .action(runClientWithOrg(async (client, options, orgId, gatewayId: string) => {
        printData(await client.request(`/api/v1/organizations/${orgId}/gateways/${gatewayId}/${child}`), options);
      }));
  }
}

function registerGatewayPublicCommands(program: Command): void {
  const gatewayPublic = program.command("gateway-public").description("Inspect hosted MCP gateway public endpoints");
  gatewayPublic.command("metadata").argument("<publicId>").action(runClient(async (client, options, publicId: string) => {
    const base = `/api/v1/gateway/${publicId}`;
    const metadata = {
      protectedResource: await client.request(`${base}/.well-known/oauth-protected-resource`, { noAuth: true }),
      authorizationServer: await client.request(`${base}/.well-known/oauth-authorization-server`, { noAuth: true }),
      openidConfiguration: await client.request(`${base}/.well-known/openid-configuration`, { noAuth: true }),
      jwks: await client.request(`${base}/.well-known/jwks.json`, { noAuth: true }),
    };
    printData(metadata, options);
  }));
  gatewayPublic.command("doctor")
    .argument("[publicId]", "Gateway public id. Omit when using --url.")
    .requiredOption("--client <client>", "Client profile: chatgpt-web or claude-web")
    .option("--url <url>", "Raw public MCP URL to inspect instead of a Gateway public id")
    .option("--bearer <token>", "Bearer token used to validate authenticated tools/list")
    .option("--json", "Print JSON output")
    .option("--output <format>", "Output format: table, json, yaml")
    .description("Validate public MCP Gateway readiness for hosted clients")
    .action(runClient(async (client, options, publicId?: string) => {
      const clientProfile = parseGatewayDoctorClient(options.client);
      const result = await runGatewayDoctor({
        apiBaseUrl: client.apiUrl,
        publicId,
        url: options.url,
        client: clientProfile,
        bearer: options.bearer,
      });

      if (options.json || options.output === "json" || options.output === "yaml") {
        printData(result, options);
      } else {
        printData(result.checks, options, gatewayDoctorColumns);
      }

      if (!result.ok) {
        throw new Error(`Gateway public doctor failed for ${clientProfile}.`);
      }
    }));
  gatewayPublic.command("mcp-tools").argument("<publicId>").action(runClient(async (client, options, publicId: string) => {
    printData(await client.request(`/api/v1/gateway/${publicId}/mcp`, {
      method: "POST",
      body: { jsonrpc: "2.0", id: "cli-tools-list", method: "tools/list" },
      noAuth: true,
    }), options);
  }));
  gatewayPublic.command("mcp-call").argument("<publicId>").argument("<toolName>").option("--args <json>").option("--file <file>")
    .action(runClient(async (client, options, publicId: string, toolName: string) => {
      const args = options.file ? await readJsonFile(options.file) : options.args ? JSON.parse(options.args) : {};
      printData(await client.request(`/api/v1/gateway/${publicId}/mcp`, {
        method: "POST",
        body: { jsonrpc: "2.0", id: "cli-tool-call", method: "tools/call", params: { name: toolName, arguments: args } },
        noAuth: true,
      }), options);
    }));
}

function parseGatewayDoctorClient(value: string): GatewayDoctorClient {
  if (value === "chatgpt-web" || value === "claude-web") {
    return value;
  }

  throw new Error("Unsupported doctor client. Use --client chatgpt-web or --client claude-web.");
}

function registerAgentCommands(program: Command): void {
  const agents = program.command("agents").description("Manage agents");
  agents.command("model-options").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/agent-model-options`), options);
  }));
  agents.command("list").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/agents`), options, agentColumns);
  }));
  agents.command("get").argument("<agentId>").action(runClientWithOrg(async (client, options, orgId, agentId: string) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/agents/${agentId}`), options);
  }));
  agents.command("create").requiredOption("--file <file>")
    .action(runClientWithOrg(async (client, options, orgId) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/agents`, {
        method: "POST",
        body: await readJsonFile(options.file),
      }), options);
    }));
  agents.command("update").argument("<agentId>").requiredOption("--file <file>")
    .action(runClientWithOrg(async (client, options, orgId, agentId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/agents/${agentId}`, {
        method: "PATCH",
        body: await readJsonFile(options.file),
      }), options);
    }));
  agents.command("delete").argument("<agentId>").option("--yes")
    .action(runClientWithOrg(async (client, options, orgId, agentId: string) => {
      await requireConfirmation(options, `Delete agent '${agentId}'?`);
      await client.request(`/api/v1/organizations/${orgId}/agents/${agentId}`, { method: "DELETE" });
      printSuccess(`Deleted agent '${agentId}'.`);
    }));
  agents.command("usage").argument("<agentId>").action(runClientWithOrg(async (client, options, orgId, agentId: string) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/agents/${agentId}/usage`), options);
  }));
  agents.command("embed-usage").action(runClientWithOrg(async (client, options, orgId) => {
    printData(await client.request(`/api/v1/organizations/${orgId}/embed-usage`), options);
  }));
  agents.command("chat").argument("<agentId>").requiredOption("--message <message>")
    .action(runClient(async (client, options, agentId: string) => {
      printData(await client.request("/api/v1/chat", {
        method: "POST",
        body: { agentId, message: options.message },
      }), options);
    }));

  const conversations = agents.command("conversations").description("Inspect agent conversations");
  conversations.command("list").argument("<agentId>").option("--cursor <cursor>").option("--page-size <pageSize>", "Page size")
    .action(runClientWithOrg(async (client, options, orgId, agentId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/agents/${agentId}/conversations`, {
        query: { cursor: options.cursor, pageSize: options.pageSize },
      }), options);
    }));
  conversations.command("get").argument("<agentId>").argument("<conversationId>")
    .action(runClientWithOrg(async (client, options, orgId, agentId: string, conversationId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/agents/${agentId}/conversations/${conversationId}`), options);
    }));
  conversations.command("messages").argument("<agentId>").argument("<conversationId>")
    .action(runClientWithOrg(async (client, options, orgId, agentId: string, conversationId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/agents/${agentId}/conversations/${conversationId}/messages`), options);
    }));
}

function registerCompletionCommand(program: Command): void {
  program.command("completion")
    .argument("<shell>", "zsh, bash, or fish")
    .description("Print shell completion setup guidance")
    .action(run(async (_options, shell: string) => {
      printInfo(`Shell completion for ${shell} will be generated by the npm package release script.`);
    }));
}

function addJsonGetSet(servers: Command, commandName: string, endpoint: string): void {
  const command = servers.command(commandName);
  command.command("get").argument("<serverId>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/${endpoint}`), options);
    }));
  command.command("set").argument("<serverId>").requiredOption("--file <file>")
    .action(runClientWithOrg(async (client, options, orgId, serverId: string) => {
      printData(await client.request(`/api/v1/organizations/${orgId}/mcp-servers/${serverId}/${endpoint}`, {
        method: "PUT",
        body: await readJsonFile(options.file),
      }), options);
    }));
}

function run(action: CommandAction) {
  return async (...args: any[]) => {
    const command = args.at(-1) as Command;
    const options = command.optsWithGlobals() as GlobalOptions & Record<string, any>;
    await action(options, ...args.slice(0, -1));
  };
}

function runClient(action: (client: McpstackClient, options: GlobalOptions & Record<string, any>, ...args: any[]) => Promise<void>) {
  return run(async (options, ...args) => {
    const client = await McpstackClient.create(options);
    await action(client, options, ...args);
  });
}

function runClientWithOrg(action: (client: McpstackClient, options: GlobalOptions & Record<string, any>, orgId: string, ...args: any[]) => Promise<void>) {
  return runClient(async (client, options, ...args) => {
    const orgId = await client.resolveOrgId(options.org);
    await action(client, options, orgId, ...args);
  });
}

async function requireConfirmation(options: GlobalOptions & Record<string, any>, message: string): Promise<void> {
  if (options.yes) {
    return;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${message} Type 'yes' to continue: `);
    if (answer.trim().toLowerCase() !== "yes") {
      throw new Error("Cancelled.");
    }
  } finally {
    rl.close();
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function splitList(value: string): string[] {
  return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}
