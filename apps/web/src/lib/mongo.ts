import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  // Allow build without Atlas; runtime auth routes will fail clearly.
  console.warn("[mongo] MONGODB_URI is not set");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(uri ?? "mongodb://127.0.0.1:27017/skyclip");
  return client.connect();
}

const clientPromise =
  globalThis._mongoClientPromise ?? createClientPromise();

if (process.env.NODE_ENV !== "production") {
  globalThis._mongoClientPromise = clientPromise;
}

export default clientPromise;

export async function getDb() {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB_NAME ?? "skyclip";
  return client.db(dbName);
}
