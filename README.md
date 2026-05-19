# MCP Stack CLI

`mcpstack` is the command-line interface for MCP Stack organizations, MCP servers, deployments, gateways, agents, members, invitations, and service-account API keys.

## Install

```bash
npm i -g @emcy/cli
```

For local development:

```bash
npm install
npm run build
node dist/index.js --help
```

## Preview Package

Pull requests publish preview packages to npm with a stable dist-tag, for example `@emcy/cli@pr-12`. The workflow comments with the exact package ref.

To test a CLI change inside an `emcy-saas` PR preview, add the ref to `emcy/infra/preview-packages.json` in that Emcy PR:

```json
{
  "@emcy/cli": "@emcy/cli@pr-12"
}
```

The Emcy preview deploy installs that package before image builds, runs a CLI smoke check, and includes the resolved npm package link in the Emcy PR preview comment.

## Human Login

Human operators use OAuth device authorization. The API must expose `/api/v1/cli/config` and the `device_authorization_endpoint`.

By default the CLI targets production (`https://api.mcpstack.com`) and opens your browser for device login. Use `--no-browser` to print the URL only.

```bash
mcpstack auth login
mcpstack auth status
mcpstack auth whoami
mcpstack servers list
```

The CLI uses your **primary organization automatically** (the first organization returned by the API), matching the SaaS dashboard. You do not need to select an organization manually.

Local AppHost:

```bash
mcpstack auth login --api-url http://localhost:5150
```

## Service-Account Login

Automation and CI should use an MCP Stack service-account API key. You can either store one active service-account login locally or pass the key through environment variables.

```bash
mcpstack auth service-account login \
  --api-url https://api.mcpstack.com \
  --key emcy_sk_...

mcpstack servers list
```

Equivalent environment-only usage:

```bash
MCPSTACK_API_URL=https://api.mcpstack.com \
MCPSTACK_API_KEY=emcy_sk_... \
mcpstack servers list
```

Use `--org <organization-id>` only when you need to override the default organization for a single command.

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
--api-url, --org (advanced override), --json, --output table|json|yaml,
--yes, --wait, --timeout, --verbose, --debug-http
```

Environment overrides:

```text
MCPSTACK_API_URL
MCPSTACK_ORG_ID
MCPSTACK_ACCESS_TOKEN
MCPSTACK_API_KEY
MCPSTACK_DISABLE_KEYCHAIN
MCPSTACK_OUTPUT
NO_COLOR
```

The active login and selected organization are stored at `~/.config/mcpstack/config.json`. Secrets use the OS keychain when `keytar` is available, with a `0600` local fallback. Set `MCPSTACK_DISABLE_KEYCHAIN=1` for CI or isolated E2E runs that should not touch the desktop keychain.
