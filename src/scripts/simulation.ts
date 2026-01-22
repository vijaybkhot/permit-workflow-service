import "dotenv/config";
import { PrismaClient, SubmissionState } from "@prisma/client";
import { execSync } from "child_process";
import { submissionService } from "../services/submissionService";

// --- CONFIGURATION ---
const BATCH_SIZE = 5; // 45 Total Runs
const MAX_STEPS = 20;

const prisma = new PrismaClient();

// --- TYPES ---
type CaseType = "A" | "B" | "C";
type ActorType = "Reference" | "Exploratory" | "Probabilistic";

interface SimulationContext {
  submissionId: string;
  userId: string;
  orgId: string;
  token: string;
  caseType: CaseType;
  runId: string;
}

// --- THE ACTOR CLASSES ---

abstract class SyntheticActor {
  protected context: SimulationContext;
  protected stepCount = 0;

  constructor(context: SimulationContext) {
    this.context = context;
  }

  abstract run(): Promise<void>;

  protected async transition(targetState: SubmissionState): Promise<boolean> {
    this.stepCount++;
    try {
      console.log(
        `      [Step ${this.stepCount}] Attempting -> ${targetState}`,
      );

      await submissionService.transitionState(
        this.context.submissionId,
        targetState,
        {
          id: this.context.userId,
          organizationId: this.context.orgId,
          role: "MEMBER",
        },
        {
          actor_type: this.constructor.name,
          run_id: this.context.runId,
        },
      );

      console.log(`      ✅ Success: Moved to ${targetState}`);
      return true;
    } catch (error: any) {
      throw error;
    }
  }

  protected async updateData(payload: any) {
    console.log(`      [Action] Updating Submission Data...`);
    await submissionService.updateSubmission(
      this.context.submissionId,
      payload,
      {
        id: this.context.userId,
        organizationId: this.context.orgId,
        role: "MEMBER",
      },
    );
  }

  protected async logTermination(reason: string) {
    console.log(`      🛑 Run Terminated: ${reason}`);
    await prisma.workflowEvent.create({
      data: {
        submissionId: this.context.submissionId,
        eventType: "RUN_TERMINATED",
        fromState: "UNKNOWN",
        toState: "UNKNOWN",
        metadata: {
          reason: reason,
          run_id: this.context.runId,
          actor_type: this.constructor.name,
        },
      },
    });
  }
}

// 1. REFERENCE ACTOR (The Expert)
class ReferenceActor extends SyntheticActor {
  async run() {
    if (this.context.caseType === "B")
      await this.updateData({ hasArchitecturalPlans: true });
    if (this.context.caseType === "C")
      await this.updateData({ imperviousArea: 4000 });

    const path: SubmissionState[] = [
      "VALIDATED",
      "PACKET_READY",
      "SUBMITTED",
      "APPROVED",
    ];

    for (const state of path) {
      try {
        await this.transition(state);
      } catch (e: any) {
        console.log(`      🚨 Unexpected Reference Failure: ${e.message}`);
        await this.logTermination("REFERENCE_FAILURE");
        return;
      }
    }
  }
}

// 2. EXPLORATORY ACTOR (The Learner)
class ExploratoryActor extends SyntheticActor {
  async run() {
    const path: SubmissionState[] = [
      "VALIDATED",
      "PACKET_READY",
      "SUBMITTED",
      "APPROVED",
    ];

    for (let i = 0; i < path.length; i++) {
      const target = path[i]!;

      if (this.stepCount >= MAX_STEPS) {
        await this.logTermination("MAX_STEPS_EXCEEDED");
        return;
      }

      try {
        await this.transition(target);
      } catch (error: any) {
        const msg = error.message || "";
        console.log(`      ⚠️  Blocked by: "${msg}"`);

        if (msg.includes("Score") || msg.includes("incomplete")) {
          console.log(
            "      💡 Strategy: Generic Score Error -> Trying ALL fixes",
          );
          // Try fixing plans (Case B)
          await this.updateData({ hasArchitecturalPlans: true });
          // Try fixing impervious (Case C)
          await this.updateData({ imperviousArea: 4000 });
          i--;
          continue;
        }

        if (msg.includes("plans")) {
          console.log("      💡 Strategy: Uploading Missing Plans");
          await this.updateData({ hasArchitecturalPlans: true });
          i--;
          continue;
        }

        if (msg.includes("Impervious") || msg.includes("limit")) {
          console.log("      💡 Strategy: Reducing Impervious Area");
          await this.updateData({ imperviousArea: 4000 });
          i--;
          continue;
        }

        console.log("      🚨 Unknown constraint. Giving up.");
        await this.logTermination("UNRECOVERABLE_ERROR");
        return;
      }
    }
  }
}

// 3. PROBABILISTIC ACTOR (The Random Guesser)
class ProbabilisticActor extends SyntheticActor {
  async run() {
    const vocabulary: SubmissionState[] = [
      "DRAFT",
      "VALIDATED",
      "PACKET_READY",
      "SUBMITTED",
      "APPROVED",
    ];

    while (this.stepCount < MAX_STEPS) {
      const current = await prisma.permitSubmission.findUnique({
        where: { id: this.context.submissionId },
        select: { state: true },
      });
      if (current?.state === "APPROVED") return;

      const randomState =
        vocabulary[Math.floor(Math.random() * vocabulary.length)]!;

      try {
        await this.transition(randomState);
      } catch (e) {
        console.log(`      ❌ (Ignored)`);
      }
    }

    await this.logTermination("MAX_STEPS_EXCEEDED");
  }
}

// --- ORCHESTRATION ---

async function runBatch() {
  console.log("🚀 STARTING AIED 2026 SIMULATION LOOP");
  console.log(
    `   Config: ${BATCH_SIZE} runs per combo. Max Steps: ${MAX_STEPS}.\n`,
  );

  const cases: CaseType[] = ["A", "B", "C"];
  const actors: ActorType[] = ["Reference", "Exploratory", "Probabilistic"];

  for (const caseType of cases) {
    for (const actorType of actors) {
      console.log(`\n📦 BATCH: Case [${caseType}] x Actor [${actorType}]`);

      for (let i = 1; i <= BATCH_SIZE; i++) {
        process.stdout.write(`   Run ${i}/${BATCH_SIZE}: `);

        const seedOutput = String(
          execSync(`npx ts-node src/scripts/seed_exam.ts ${caseType}`, {
            stdio: "pipe",
          }),
        );
        const jsonStr = seedOutput
          .split("--- JSON OUTPUT START ---")[1]
          ?.split("--- JSON OUTPUT END ---")[0];

        if (!jsonStr) throw new Error("Failed to parse seed output");

        const seedData = JSON.parse(jsonStr);
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: seedData.userId },
        });
        const runId = `${caseType}-${actorType}-${i}-${Date.now()}`;

        const context: SimulationContext = {
          submissionId: seedData.submissionId,
          userId: seedData.userId,
          token: seedData.token,
          orgId: user.organizationId,
          caseType: caseType,
          runId: runId,
        };

        let actor: SyntheticActor;
        if (actorType === "Reference") actor = new ReferenceActor(context);
        else if (actorType === "Exploratory")
          actor = new ExploratoryActor(context);
        else actor = new ProbabilisticActor(context);

        await actor.run();
      }
    }
  }

  console.log("\n✅ SIMULATION COMPLETE.");
}

runBatch()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
