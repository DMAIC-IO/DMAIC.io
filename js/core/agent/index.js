/**
 * D.Mike — Agentenschicht, Barrel (index.js)
 *
 * Der einzige Einstieg für alles außerhalb von `core/agent/`. Wer hier
 * importiert, bekommt die Laufzeit und die Einwilligungs-Helfer für die
 * Einstellungen — nicht die Innereien.
 */
export { createAgentRuntime } from './agent-runtime.js';
export { CONTRACT_VERSION, ERRORS } from './agent-contract.js';
export { createConsentGate, readConsent, revokeConsent, grantConsent, CONSENT_PATH } from './agent-consent.js';
export { AGENT_REGISTRY, AGENT_COVERAGE } from './agent-registry.generated.js';
