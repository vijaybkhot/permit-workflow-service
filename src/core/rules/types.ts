import { RuleSeverity } from "@prisma/client";

/**
 * The context object passed to each rule's evaluate method.
 * It contains all the relevant data for the permit submission being evaluated.
 */
export interface RuleContext {
  projectName: string;
  hasArchitecturalPlans: boolean;
  hasStructuralCalcs: boolean;
  buildingHeight: number; // in feet
  setbackFront: number; // in feet
  setbackSide: number; // in feet
  setbackRear: number; // in feet
  fireEgressCount: number;
}

/**
 * The result of a single rule evaluation.
 */
export interface RuleResult {
  ruleKey: string;
  passed: boolean;
  message: string;
  severity: RuleSeverity;
}

/**
 * The interface that every rule object must implement.
 */
export interface Rule {
  key: string;
  severity: RuleSeverity;
  description: string;
  evaluate(context: RuleContext): RuleResult;
}
