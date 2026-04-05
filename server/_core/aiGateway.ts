import { ENV } from "./env";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function assertAiGatewayConfigured(): void {
  if (!ENV.aiBaseUrl || !ENV.aiApiKey) {
    throw new Error("AI_BASE_URL and AI_API_KEY must be configured");
  }
}

export function buildAiGatewayUrl(path: string): string {
  assertAiGatewayConfigured();

  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizeBaseUrl(ENV.aiBaseUrl)}/${normalizedPath}`;
}

export function getAiGatewayHeaders(
  extra: HeadersInit = {}
): Record<string, string> {
  assertAiGatewayConfigured();

  return {
    authorization: `Bearer ${ENV.aiApiKey}`,
    ...Object.fromEntries(new Headers(extra).entries()),
  };
}
