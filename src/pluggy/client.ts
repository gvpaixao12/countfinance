import { PluggyClient } from "pluggy-sdk";

let pluggyInstance: PluggyClient | null = null;

export function getPluggyClient(): PluggyClient {
  if (!pluggyInstance) {
    pluggyInstance = new PluggyClient({
      clientId: process.env.PLUGGY_CLIENT_ID!,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
    });
  }
  return pluggyInstance;
}
