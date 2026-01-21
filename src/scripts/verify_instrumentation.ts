import "dotenv/config";
import { PrismaClient, SubmissionState } from "@prisma/client";
import {
  attemptTransition,
  TransitionFailureReason,
} from "../core/workflow/stateMachine";

const prisma = new PrismaClient();

async function runSanityCheck() {
  console.log("🧪 Starting PADT Phase 1 Sanity Check...\n");

  // 1. Setup: Create a fresh DRAFT submission
  const org = await prisma.organization.create({
    data: { name: "Research Org" },
  });
  const user = await prisma.user.create({
    data: {
      email: `researcher_${Date.now()}@example.com`,
      password: "hash",
      organizationId: org.id,
    },
  });
  const jurisdiction = await prisma.jurisdiction.create({
    data: { name: "Test City", code: `TC_${Date.now()}` },
  });

  const submission = await prisma.permitSubmission.create({
    data: {
      projectName: "Sanity Check Run",
      organizationId: org.id,
      jurisdictionId: jurisdiction.id,
      state: "DRAFT",
      completenessScore: 0.0, // Start incomplete
    },
  });

  console.log(`✅ Setup Complete. Submission ID: ${submission.id}`);

  // --- TEST 1: INVALID PATH (Draft -> Approved) ---
  console.log("\n[Test 1] Attempting INVALID_PATH (DRAFT -> APPROVED)...");
  try {
    await attemptTransition(submission.id, "APPROVED", org.id, {
      test: "run_1",
    });
    console.error("❌ FAILED: Should have thrown error.");
  } catch (e: any) {
    console.log("✅ Caught Expected Error:", e.message);
  }

  // --- TEST 2: GUARD VIOLATION (Draft -> Validated, but score < 1) ---
  console.log(
    "\n[Test 2] Attempting GUARD_VIOLATION (DRAFT -> VALIDATED w/ low score)...",
  );
  try {
    await attemptTransition(submission.id, "VALIDATED", org.id, {
      test: "run_1",
    });
    console.error("❌ FAILED: Should have thrown error.");
  } catch (e: any) {
    console.log("✅ Caught Expected Error:", e.message);
  }

  // --- TEST 3: VALID TRANSITION (Draft -> Validated, after fixing score) ---
  console.log("\n[Test 3] Attempting VALID TRANSITION (DRAFT -> VALIDATED)...");
  // Fix score first
  await prisma.permitSubmission.update({
    where: { id: submission.id },
    data: { completenessScore: 1.0 },
  });

  await attemptTransition(submission.id, "VALIDATED", org.id, {
    test: "run_1",
  });
  console.log("✅ Transition Succeeded.");

  // --- VERIFY LOGS ---
  console.log("\n[Verification] Inspecting WorkflowEvent Table...");
  const logs = await prisma.workflowEvent.findMany({
    where: { submissionId: submission.id },
    orderBy: { createdAt: "asc" },
  });

  // Check 1: INVALID_PATH
  const invalidLog = logs.find(
    (l) =>
      l.eventType === "TRANSITION_FAILED" &&
      (l.metadata as any)?.reason === TransitionFailureReason.INVALID_PATH,
  );
  if (invalidLog) console.log("✅ Logged INVALID_PATH");
  else console.error("❌ Missing INVALID_PATH log");

  // Check 2: GUARD_VIOLATION
  const guardLog = logs.find(
    (l) =>
      l.eventType === "TRANSITION_FAILED" &&
      (l.metadata as any)?.reason === TransitionFailureReason.GUARD_VIOLATION,
  );
  if (guardLog) console.log("✅ Logged GUARD_VIOLATION");
  else console.error("❌ Missing GUARD_VIOLATION log");

  // Check 3: STATE_TRANSITION
  const successLog = logs.find((l) => l.eventType === "STATE_TRANSITION");
  if (successLog) console.log("✅ Logged STATE_TRANSITION");
  else console.error("❌ Missing STATE_TRANSITION log");

  if (invalidLog && guardLog && successLog) {
    console.log("\n🎉 PHASE 1 COMPLETE: Instrument is valid.");
  } else {
    console.error("\n⛔ PHASE 1 FAILED: Telemetry is missing.");
  }

  await prisma.$disconnect();
}

runSanityCheck().catch(console.error);
