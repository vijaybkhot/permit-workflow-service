import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // The $connect method returns a promise that resolves
    // when a connection to the database is established.
    await prisma.$connect();
    console.log("✅ Database connection successful!");
  } catch (error) {
    console.error("❌ Failed to connect to the database:", error);
  } finally {
    // Always disconnect the client when the script is done.
    await prisma.$disconnect();
  }
}

main();
