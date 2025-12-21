import { buildApp } from "./app";

async function start() {
  try {
    const server = await buildApp();

    await server.listen({ port: 3000, host: "0.0.0.0" });
    console.log("Server listening on http://localhost:3000");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
