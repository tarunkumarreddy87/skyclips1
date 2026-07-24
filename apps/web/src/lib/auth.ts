import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB_NAME ?? "skyclip";

const client = new MongoClient(uri);
const db = client.db(dbName);

const baseURL =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

export const auth = betterAuth({
  appName: "SkyClip",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-change-me-in-production-32chars",
  database: mongodbAdapter(db, {
    // Enables transactions when Atlas replica set is available.
    client,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: [
    baseURL,
    process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3000",
  ].filter(Boolean) as string[],
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
