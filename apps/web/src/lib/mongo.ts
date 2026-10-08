import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI?.trim() || "";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  if (!uri) {
    return Promise.reject(new Error("[mongo] MONGODB_URI is not set"));
  }
  // Short server selection so a missing/unreachable DB fails fast (e.g. local dev
  // without billing) instead of hanging the request for the 30s default.
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  return client.connect();
}

export async function getDb() {
  let clientPromise = globalThis._mongoClientPromise;
  if (!clientPromise) {
    clientPromise = createClientPromise();
    globalThis._mongoClientPromise = clientPromise;
  }
  // A failed connect must not stay cached — drop it so a later call can retry
  // (e.g. after MONGODB_URI becomes available or the DB comes back up).
  const client = await clientPromise.catch((err) => {
    if (globalThis._mongoClientPromise === clientPromise) {
      globalThis._mongoClientPromise = undefined;
    }
    throw err;
  });
  const dbName = process.env.MONGODB_DB_NAME ?? "skyclip";
  return client.db(dbName);
}
