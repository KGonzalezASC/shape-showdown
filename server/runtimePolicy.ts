export type ServerMode = 'development' | 'production';

export type RuntimePolicy = {
  requirePostgres: boolean;
  requireMatchTickets: boolean;
  allowLegacySocketBootstrap: boolean;
};

export type RuntimePolicyEnvironment = {
  ALLOW_IN_MEMORY_DATABASE?: string;
  ALLOW_LEGACY_SOCKET_BOOTSTRAP?: string;
  REQUIRE_MATCH_TICKETS?: string;
};

export type RuntimePolicyInput = {
  mode: ServerMode;
  hasDatabase: boolean;
  env: RuntimePolicyEnvironment;
};

export function resolveRuntimePolicy(input: RuntimePolicyInput): RuntimePolicy {
  const allowInMemoryDatabase = input.env.ALLOW_IN_MEMORY_DATABASE === 'true';
  const allowLegacySocketBootstrap = input.env.ALLOW_LEGACY_SOCKET_BOOTSTRAP === 'true';
  const requireMatchTickets = input.env.REQUIRE_MATCH_TICKETS === 'true';

  if (input.mode === 'production') {
    if (allowInMemoryDatabase) {
      throw new Error('ALLOW_IN_MEMORY_DATABASE=true is forbidden in production');
    }
    if (allowLegacySocketBootstrap) {
      throw new Error('ALLOW_LEGACY_SOCKET_BOOTSTRAP=true is forbidden in production');
    }

    return {
      requirePostgres: true,
      requireMatchTickets: true,
      allowLegacySocketBootstrap: false,
    };
  }

  const canUseLegacySocketBootstrap =
    !requireMatchTickets && (!input.hasDatabase || allowLegacySocketBootstrap);

  return {
    requirePostgres: false,
    requireMatchTickets: !canUseLegacySocketBootstrap,
    allowLegacySocketBootstrap: canUseLegacySocketBootstrap,
  };
}
