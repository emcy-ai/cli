export type OrganizationSummary = {
  id: string;
  name?: string;
  slug?: string;
};

export function getOrganizationId(org: Record<string, unknown>): string | undefined {
  const id = org.id ?? org.organizationId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** Matches the SaaS dashboard: use the first organization returned by the API. */
export function pickDefaultOrganization(orgs: unknown[]): OrganizationSummary | undefined {
  if (!Array.isArray(orgs) || orgs.length === 0) {
    return undefined;
  }

  const first = orgs[0] as Record<string, unknown>;
  const id = getOrganizationId(first);
  if (!id) {
    return undefined;
  }

  return {
    id,
    name: typeof first.name === "string" ? first.name : undefined,
    slug: typeof first.slug === "string" ? first.slug : undefined,
  };
}

export function formatOrganizationLabel(org: OrganizationSummary): string {
  if (org.name) {
    return `${org.name} (${org.id})`;
  }

  return org.id;
}
