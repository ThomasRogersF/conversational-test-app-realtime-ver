/** Worker environment bindings */
export interface Env {
  // Secrets
  OPENAI_API_KEY: string;

  // Vars
  OPENAI_REALTIME_MODEL: string;
  ALLOWED_ORIGINS: string;

  // Durable Object namespace
  REALTIME_SESSION: DurableObjectNamespace;
}
