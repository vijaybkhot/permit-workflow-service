import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// --- 1. TYPES ---
interface RunMetrics {
  runId: string;
  actorType: string;
  caseType: string;
  success: boolean;
  totalSteps: number;
  failedSteps: number;
  didRecover: boolean;
}

interface CohortStats {
  case: string;
  actor: string;
  n: number;
  successRate: string;
  avgSteps: number;
  avgFailures: number;
  fidelity: number;
  recoveryRate: string;
  recoveryCost: number;
}

// --- 2. HELPER: PARSE RUN ID ---
function parseRunId(runId: string) {
  const parts = runId.split("-");
  return {
    // FIX: Add fallback to satisfy TypeScript
    caseType: parts[0] || "Unknown",
    actorType: parts[1] || "Unknown",
  };
}

async function analyze() {
  console.log("📊 STARTING PADT METRICS EXTRACTION...\n");

  // 1. FETCH RAW TELEMETRY
  const rawEvents = await prisma.workflowEvent.findMany({
    orderBy: { createdAt: "asc" },
  });
  console.log(`   Loaded ${rawEvents.length} raw telemetry events.`);

  // 2. RECONSTRUCT TRAJECTORIES
  const runs = new Map<string, typeof rawEvents>();

  for (const event of rawEvents) {
    const meta = event.metadata as any;
    if (!meta || !meta.run_id) continue;

    const runId = meta.run_id;
    if (!runs.has(runId)) runs.set(runId, []);
    runs.get(runId)!.push(event);
  }
  console.log(`   Reconstructed ${runs.size} unique decision trajectories.\n`);

  // 3. COMPUTE PER-RUN METRICS
  const dataset: RunMetrics[] = [];

  for (const [runId, events] of runs) {
    const { actorType, caseType } = parseRunId(runId);

    let failedSteps = 0;
    let success = false;

    for (const e of events) {
      if (e.eventType === "TRANSITION_FAILED") failedSteps++;
      if (e.eventType === "STATE_TRANSITION" && e.toState === "APPROVED")
        success = true;
    }

    // Recovery Definition: Had failures (>0) BUT eventually Succeeded
    const didRecover = failedSteps > 0 && success;

    dataset.push({
      runId,
      actorType,
      caseType,
      success,
      totalSteps: events.length,
      failedSteps,
      didRecover,
    });
  }

  // 4. AGGREGATE BY COHORT
  const cohorts = new Map<string, RunMetrics[]>();
  for (const data of dataset) {
    const key = `${data.caseType}::${data.actorType}`;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key)!.push(data);
  }

  // Calculate Reference Baselines (for Recovery Cost)
  const referenceBaselines = new Map<string, number>();
  ["A", "B", "C"].forEach((c) => {
    const refGroup = cohorts.get(`${c}::Reference`);
    if (refGroup) {
      const avg =
        refGroup.reduce((sum, r) => sum + r.totalSteps, 0) / refGroup.length;
      referenceBaselines.set(c, avg);
    }
  });

  // 5. BUILD THE MANUSCRIPT TABLE
  const tableData: CohortStats[] = [];
  const caseOrder = ["A", "B", "C"];
  const actorOrder = ["Reference", "Exploratory", "Probabilistic"];

  for (const c of caseOrder) {
    for (const a of actorOrder) {
      const key = `${c}::${a}`;
      const group = cohorts.get(key);
      if (!group) continue;

      const totalRuns = group.length;
      const successes = group.filter((r) => r.success).length;
      const totalSteps = group.reduce((sum, r) => sum + r.totalSteps, 0);
      const totalFailures = group.reduce((sum, r) => sum + r.failedSteps, 0);

      const runsWithFailures = group.filter((r) => r.failedSteps > 0).length;
      const recoveredRuns = group.filter((r) => r.didRecover).length;

      // Metric: Fidelity
      const avgFidelity = 1.0 - totalFailures / totalSteps;

      // Metric: Recovery Rate
      let recRate = "N/A";
      if (runsWithFailures > 0) {
        recRate = ((recoveredRuns / runsWithFailures) * 100).toFixed(0) + "%";
      }

      // Metric: Recovery Cost
      const avgStepCount = totalSteps / totalRuns;
      const baseline = referenceBaselines.get(c) || 0;
      const recoveryCost = avgStepCount - baseline;

      tableData.push({
        case: c,
        actor: a,
        n: totalRuns,
        successRate: ((successes / totalRuns) * 100).toFixed(0) + "%",
        avgSteps: Number(avgStepCount.toFixed(1)),
        avgFailures: Number((totalFailures / totalRuns).toFixed(1)),
        fidelity: Number(avgFidelity.toFixed(3)),
        recoveryRate: recRate,
        recoveryCost: Number(recoveryCost.toFixed(1)),
      });
    }
  }

  // 6. OUTPUT
  console.table(tableData);
}

analyze()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
