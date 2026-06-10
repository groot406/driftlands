const packagedAppOriginPatterns = [
  /^file:\/\/$/i,
  /^null$/i,
  /^capacitor:\/\/localhost$/i,
  /^ionic:\/\/localhost$/i,
];

const defaultWebOriginPatterns = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/10(?:\.\d{1,3}){3}(?::\d+)?$/i,
  /^https?:\/\/192\.168(?:\.\d{1,3}){2}(?::\d+)?$/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}(?::\d+)?$/i,
  /^https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.local(?::\d+)?$/i,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/i,
];

export function parseConfiguredFrontendOrigins(value = process.env.FRONTEND_ORIGIN ?? ''): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedFrontendOrigin(
  origin?: string,
  configuredFrontendOrigins = parseConfiguredFrontendOrigins(),
): boolean {
  if (!origin) {
    return true;
  }

  if (configuredFrontendOrigins.includes('*')) {
    return true;
  }

  if (packagedAppOriginPatterns.some((pattern) => pattern.test(origin))) {
    return true;
  }

  if (configuredFrontendOrigins.length > 0) {
    return configuredFrontendOrigins.includes(origin);
  }

  return defaultWebOriginPatterns.some((pattern) => pattern.test(origin));
}
