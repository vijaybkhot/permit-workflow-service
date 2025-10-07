import { Rule } from "./types";
import { RuleSeverity } from "@prisma/client";

// An array of all rule objects, now matching the seed script.
export const ruleRegistry: Rule[] = [
  {
    key: "ARCHITECTURAL_PLANS_SUBMITTED",
    severity: RuleSeverity.REQUIRED,
    description:
      "A full set of architectural plans must be attached to the submission.",
    evaluate: (context) => {
      const passed = context.hasArchitecturalPlans;
      return {
        ruleKey: "ARCHITECTURAL_PLANS_SUBMITTED",
        passed,
        severity: RuleSeverity.REQUIRED,
        message: passed
          ? "Architectural plans are attached."
          : "Missing required architectural plans.",
      };
    },
  },
  {
    key: "STRUCTURAL_CALCS_INCLUDED",
    severity: RuleSeverity.REQUIRED,
    description:
      "Structural engineering calculations must be provided for all load-bearing elements.",
    evaluate: (context) => {
      const passed = context.hasStructuralCalcs;
      return {
        ruleKey: "STRUCTURAL_CALCS_INCLUDED",
        passed,
        severity: RuleSeverity.REQUIRED,
        message: passed
          ? "Structural calculations are included."
          : "Missing required structural calculations.",
      };
    },
  },
  {
    key: "SETBACK_REQUIREMENT_MET",
    severity: RuleSeverity.REQUIRED,
    description:
      "Building must respect the front, side, and rear setback distances.",
    evaluate: (context) => {
      // Example values for Jersey City residential zone
      const passed =
        context.setbackFront >= 20 &&
        context.setbackSide >= 5 &&
        context.setbackRear >= 25;
      return {
        ruleKey: "SETBACK_REQUIREMENT_MET",
        passed,
        severity: RuleSeverity.REQUIRED,
        message: passed
          ? "Setback requirements are met."
          : "One or more setbacks do not meet the minimum distance.",
      };
    },
  },
  {
    key: "BUILDING_HEIGHT_LIMIT",
    severity: RuleSeverity.REQUIRED,
    description:
      "Proposed building height must not exceed the maximum limit for the designated zone.",
    evaluate: (context) => {
      // Example limit of 40 feet
      const passed = context.buildingHeight <= 40;
      return {
        ruleKey: "BUILDING_HEIGHT_LIMIT",
        passed,
        severity: RuleSeverity.REQUIRED,
        message: passed
          ? "Building height is within the legal limit."
          : "Proposed height exceeds the 40-foot limit.",
      };
    },
  },
  {
    key: "FIRE_SAFETY_EGRESS_COMPLIANT",
    severity: RuleSeverity.REQUIRED,
    description: "The design must include at least two means of egress.",
    evaluate: (context) => {
      const passed = context.fireEgressCount >= 2;
      return {
        ruleKey: "FIRE_SAFETY_EGRESS_COMPLIANT",
        passed,
        severity: RuleSeverity.REQUIRED,
        message: passed
          ? "Fire egress requirements are met."
          : "Design includes fewer than the required two means of egress.",
      };
    },
  },
  // intentionally omitting the WARNING rule from the seed script for now to keep the MVD focused.
];
