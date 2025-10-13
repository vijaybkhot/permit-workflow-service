# Permit Workflow Service

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)

A focused permitting workflow backend featuring a deterministic rule engine, a state machine with guarded transitions, asynchronous PDF packet generation via a worker, event logging, and Prometheus counters—cleanly layered for future expansion.

## Core Features

- Deterministic Rule Engine: Evaluates submissions against a set of domain-specific, hardcoded business rules.
- State Machine Workflow: Manages the submission lifecycle through a series of guarded states (e.g., DRAFT, VALIDATED, APPROVED).
- Asynchronous Job Processing: Utilizes a Redis-backed queue (BullMQ) to handle slow tasks like PDF generation without blocking the API.
- PDF Packet Generation: A background worker uses Puppeteer to generate a PDF summary of the submission and its rule results.
- Observability: Exposes key application metrics in a Prometheus-compatible format and provides structured JSON logging.
- API Security: Endpoints are protected by a simple, environment-based API Key.
- Fully Tested: Includes a suite of unit and integration tests to ensure reliability.

## Tech Stack

- Backend: Node.js, Fastify, TypeScript
- Database & ORM: PostgreSQL, Prisma
- Job Queue: BullMQ, Redis
- PDF Generation: Puppeteer, Nunjucks
- Testing: Jest, Supertest
- DevOps: Docker

## Architecture Overview

- Layered Architecture: The application is split into three distinct layers: an API Layer (Fastify), a Domain Logic Layer (pure TypeScript for the rule engine and state machine), and a Data Layer (Prisma).
- Asynchronous Workers: Slow operations are decoupled from the main application flow using a queue and a separate worker process. This ensures the API remains fast and responsive.

For a deeper dive into the system design and request flow, see the Architecture document: [Architecture.md](./Architecture.md).

## Getting Started (Local Setup)

### Prerequisites

- Git
- Node.js (v20+)
- Docker Desktop

### Step 1: Clone & Install

```bash
git clone https://github.com/vijaybkhot/permit-workflow-service.git
cd permit-workflow-service
npm install
```

### Step 2: Set up Databases

Start Docker Desktop, then run Postgres and Redis:

```bash
docker run --name permit-db -e POSTGRES_PASSWORD=REDACTED_PASSWORD -p 5433:5432 -d postgres
docker run --name permit-redis -p 6379:6379 -d redis
```

### Step 3: Configure Environment

Create a `.env` file (you can base it on the provided example):

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL="postgresql://postgres:REDACTED_PASSWORD@localhost:5433/postgres?schema=public"
API_KEY="my-super-secret-key-12345"
```

### Step 4: Run Migrations and Seed

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### Step 5: Run the Application

Run the API server:

```bash
npm run dev
```

Run the background worker in a separate terminal:

```bash
npm run start:worker
```

The server will be available at http://localhost:3000.

Note: API endpoints are protected with an API key. Include a header like:

```
x-api-key: my-super-secret-key-12345
```

Swagger UI (OpenAPI) is available at:

- http://localhost:3000/documentation

## API Endpoints

| Method | Path                               | Description                             |
| -----: | ---------------------------------- | --------------------------------------- |
|   POST | `/submissions`                     | Create a new submission.                |
|    GET | `/submissions/:id`                 | Fetch a single submission.              |
|    GET | `/submissions`                     | Fetch a list of submissions.            |
|   POST | `/submissions/:id/transition`      | Transition a submission to a new state. |
|   POST | `/submissions/:id/generate-packet` | Queue a PDF packet generation job.      |
|    GET | `/metrics`                         | Expose Prometheus metrics.              |
|    GET | `/healthz`                         | Liveness probe.                         |

## Running Tests

```bash
npm test
```

## Demonstration

[Watch a quick demo of the MVP project in action.](https://www.loom.com/share/b00db432f22b440086291d0f4854fa77?sid=b8d30dc1-019a-4235-b774-67c488587188)

## Docs

- Architecture: [Architecture.md](./Architecture.md)
- OpenAPI / Swagger UI: http://localhost:3000/documentation

---

## ✍️ Author

- Vijay Khot
- Portfolio: [vijaykhot-dev.vercel.app](https://vijaykhot-dev.vercel.app/)
- LinkedIn: [linkedin.com/in/vijay-khot](https://www.linkedin.com/in/vijay-khot/)
- Medium: [@vijaysinh.khot](https://medium.com/@vijaysinh.khot)
- Email: vijay@vijaykhot.com

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
