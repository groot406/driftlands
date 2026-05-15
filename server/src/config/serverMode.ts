export function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return defaultValue;
  }
}

export const serverDebugModeEnabled = parseBooleanEnv(process.env.SERVER_DEBUG_MODE, true);

export type SettlementStartMode = 'candidates' | 'free';

function parseSettlementStartMode(value: string | undefined): SettlementStartMode {
  switch (value?.trim().toLowerCase()) {
    case 'free':
    case 'any':
    case 'open':
      return 'free';
    case 'candidates':
    case 'candidate':
    default:
      return 'candidates';
  }
}

export const settlementStartMode = parseSettlementStartMode(process.env.SERVER_SETTLEMENT_START_MODE);
export const spawnSafetyEnabled = parseBooleanEnv(process.env.SERVER_SPAWN_SAFETY, false);
