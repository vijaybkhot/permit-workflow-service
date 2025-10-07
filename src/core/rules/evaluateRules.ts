import { ruleRegistry } from "./ruleRegistry";
import { RuleContext, RuleResult } from "./types";

/**
 * Evaluates a submission context against all rules in the registry.
 * @param context The submission data to evaluate.
 * @returns An array of RuleResult objects.
 */
export function evaluateRules(context: RuleContext): RuleResult[] {
  const results: RuleResult[] = [];

  for (const rule of ruleRegistry) {
    const result = rule.evaluate(context);
    results.push(result);
  }

  return results;
}
