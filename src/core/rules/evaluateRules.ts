import { PrismaClient, Rule as DbRule } from "@prisma/client";
import { RuleContext, RuleResult } from "./types";
import { ruleImplementations } from "./ruleImplementations";

const prisma = new PrismaClient();

/**
 * Async Rule Engine
 * 1. Fetches the active RuleSet for the Jurisdiction.
 * 2. Iterates through the rules in that RuleSet.
 * 3. Finds the matching code logic in ruleImplementations.
 * 4. Executes and returns results.
 */
export async function evaluateRules(
  context: RuleContext,
  jurisdictionId: string
): Promise<RuleResult[]> {
  // 1. Fetch the latest RuleSet for this jurisdiction
  // We sort by effectiveDate desc to get the most recent one
  const ruleSet = await prisma.ruleSet.findFirst({
    where: {
      jurisdictionId: jurisdictionId,
      effectiveDate: { lte: new Date() }, // Only rules effective as of today
    },
    orderBy: { effectiveDate: "desc" },
    include: { rules: true },
  });

  if (!ruleSet) {
    throw new Error(
      `No active RuleSet found for jurisdiction: ${jurisdictionId}`
    );
  }

  const results: RuleResult[] = [];

  // 2. Iterate through the DB rules
  for (const dbRule of ruleSet.rules) {
    // 3. Find the logic
    const logicFn = ruleImplementations[dbRule.key];

    if (!logicFn) {
      // Graceful fallback if we seeded a rule but forgot the code
      console.warn(`No implementation found for rule key: ${dbRule.key}`);
      continue;
    }

    // 4. Execute
    const logicResult = logicFn(context);

    results.push({
      ruleKey: dbRule.key,
      severity: dbRule.severity,
      passed: logicResult.passed,
      message: logicResult.message,
    });
  }

  return results;
}
