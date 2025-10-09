# Architecture

## 1. High-Level Overview

Permit Workflow Service is a monolith with a decoupled worker process. It follows a clean, layered architecture to separate concerns across the API, domain, and data layers. The domain core stays framework-agnostic and easily testable, while adapters (Fastify, Prisma, BullMQ) handle I/O. This approach keeps the system maintainable, testable, and ready for incremental scaling (e.g., extracting workers or services later without rewriting the core).

## 2. Core Components

- API Server (Fastify): The synchronous, client-facing entry point responsible for handling HTTP requests, authentication, and validation.
- Domain Logic (Pure TypeScript): A framework-agnostic core containing the business logic, including the deterministic Rule Engine and the State Machine.
- Data Layer (PostgreSQL & Prisma): The persistence layer managed by Prisma ORM, acting as the single source of truth for all application data.
- Asynchronous Worker (BullMQ & Redis): A separate, decoupled process that handles slow, long-running jobs (like PDF generation) to ensure the API remains responsive.

## 3. Data Flow: Example Request Lifecycle (POST /submissions)

1. An HTTP POST request with a JSON payload hits the Fastify server.
2. A global preValidation hook runs, validating the x-api-key header.
3. Fastify's built-in schema validation ensures the request body is correctly formatted.
4. The API route handler calls the Domain Logic's evaluateRules function.
5. The handler uses Prisma to save the new PermitSubmission and its RuleResult records to the PostgreSQL database within a single transaction.
6. The API responds instantly to the client with a 201 Created status and the new submission's ID.

## 4. Key Design Decisions

- Layered Architecture: Chosen for clear separation of concerns, which makes the core business logic highly testable in isolation from the web framework and database.
- Asynchronous Worker for Slow Jobs: Chosen to protect the user experience. By offloading slow tasks like PDF generation to a background process, the API can respond instantly, preventing request timeouts.
- PostgreSQL as the Database: Chosen for its reliability and strong support for relational data integrity, which is essential for a system with interconnected models like submissions, results, and events.

## 5. Visual Diagram

```
   +--------+      1. HTTP Request      +---------------------+      2. Writes to
   | Client | -------------------------> | API Server (Fastify)| ---------------------> +----------+
   +--------+                            +---------------------+                      |          |
                 | 3. Enqueues Job                  | Database |
                 v                                  | (Postgres)|
               +-----------+                            |          |
               |   Queue   |                            |          |
               |  (Redis)  |   4. Worker pulls job      +----------+
               +-----------+   <--------------------          ^
                 ^                                        |
                 |                                        | 5. Worker
                 |                                        | reads from
               +------------------+                           | & writes to
               | Worker (BullMQ)  | --------------------------+
               +------------------+
```
