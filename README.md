# MCP Stack CLI

`mcpstack` is the command-line interface for MCP Stack organizations, MCP servers, deployments, gateways, agents, members, invitations, and service-account API keys.

## Install

```bash
npm i -g @emcy/cli
```

For local development from this checkout:

```bash
npm install
npm run build
node dist/index.js --help
```

## Human Login

Human operators use OAuth device authorization. The API must expose `/api/v1/cli/config` and the `device_authorization_endpoint`.

```bash
mcpstack auth login --api-url http://localhost:5150
mcpstack auth status
mcpstack auth whoami
mcpstack org list
mcpstack org use <organization-id>
```

## Service-Account Login

Automation and CI should use an MCP Stack service-account API key. The CLI accepts API keys from the environment or a stored profile.

```bash
mcpstack auth service-account login \
  --api-url https://api.mcpstack.com \
  --profile-name ci \
  --key emcy_sk_...

mcpstack --profile ci servers list --org <organization-id>
```

Equivalent environment-only usage:

```bash
MCPSTACK_API_URL=https://api.mcpstack.com \
MCPSTACK_API_KEY=emcy_sk_... \
mcpstack servers list --org <organization-id>
```

## Common Workflows

```bash
mcpstack members invite teammate@example.com --role developer
mcpstack members invitations list

mcpstack api-keys create --name deploy-bot --role developer
mcpstack api-keys list

mcpstack servers create --name demo --openapi-file ./openapi.json --runtime-type hosted
mcpstack deploy <server-id> --environment production --region westus3 --wait
mcpstack logs stream <server-id> --region westus3
mcpstack smoke tools-list <server-id>

mcpstack agents list
mcpstack agents chat <agent-id> --message "Summarize production health"
```

## Configuration

Global flags:

```text
--api-url, --profile, --org, --json, --output table|json|yaml,
--yes, --wait, --timeout, --verbose, --debug-http
```

Environment overrides:

```text
MCPSTACK_API_URL
MCPSTACK_PROFILE
MCPSTACK_ORG_ID
MCPSTACK_ACCESS_TOKEN
MCPSTACK_API_KEY
MCPSTACK_OUTPUT
NO_COLOR
```

Profiles are stored at `~/.config/mcpstack/config.json`. Secrets use the OS keychain when `keytar` is available, with a `0600` local fallback.
