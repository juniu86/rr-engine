export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // P2.2: observabilidade externa via Langfuse. Default OFF — sem chaves
  // configuradas, o tracing é no-op e o pipeline roda intacto.
  langfuseEnabled: process.env.LANGFUSE_ENABLED === "true",
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY ?? "",
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY ?? "",
  langfuseHost: process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com",
};
