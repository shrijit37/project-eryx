import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
console.log("Prisma Client:",  process.env.DATABASE_URL);

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "../generated/prisma/client.js";
