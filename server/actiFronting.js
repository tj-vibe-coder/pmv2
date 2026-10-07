// Decides whether a Won Calcsheet project is ACTI-fronted. Mirrors the client
// matcher in src/utils/commercialTrail.ts (isActiInvolved).
const ACTI_NAME_RE = /advance controle|\bacti\b/i;

function isActiClient(client) {
  return !!client && ACTI_NAME_RE.test(String(client.name || ''));
}

// An ACTI-fronted project is one that carries a partner link, has an ACTI-kind
// quotation, or has ACTI itself as the customer. In the customer case the
// project has no partnerId, so the customer client doc stands in as the partner.
// A project that already has a partner link keeps it untouched.
function resolveActiFronting({ project, client, partner, quotations }) {
  const hasPartnerLink = !!project.partnerId;
  const actiCustomer = !hasPartnerLink && isActiClient(client);
  return {
    withActi: hasPartnerLink || (quotations || []).some((q) => q.kind === 'ACTI') || actiCustomer,
    partner: actiCustomer && !partner ? { id: client.id, name: client.name } : partner,
  };
}

module.exports = { ACTI_NAME_RE, isActiClient, resolveActiFronting };
