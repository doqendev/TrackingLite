import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: `${process.env.DATABASE_URL ?? ""}${
          (process.env.DATABASE_URL ?? "").includes("?") ? "&" : "?"
        }connection_limit=${process.env.PRISMA_POOL_SIZE ?? "10"}&pool_timeout=10`,
      },
    },
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["query", "error", "warn"],
  });

globalForPrisma.prisma = db;
