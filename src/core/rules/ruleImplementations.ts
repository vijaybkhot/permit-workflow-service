import { RuleContext, RuleLogicFn } from "./types";

// A dictionary mapping DB Keys -> Logic Functions
export const ruleImplementations: Record<string, RuleLogicFn> = {
  // --- GENERIC / LEGACY RULES ---
  ARCHITECTURAL_PLANS_SUBMITTED: (ctx) => ({
    passed: ctx.hasArchitecturalPlans,
    message: ctx.hasArchitecturalPlans
      ? "Plans attached."
      : "Missing architectural plans.",
  }),
  STRUCTURAL_CALCS_INCLUDED: (ctx) => ({
    passed: ctx.hasStructuralCalcs,
    message: ctx.hasStructuralCalcs
      ? "Calcs included."
      : "Missing structural calculations.",
  }),
  // ... (You can keep your other generic rules here if you kept them in the DB) ...

  // --- AUSTIN, TX RULES ---
  ATX_IMPERVIOUS_COVER: (ctx) => {
    // Guard against missing data
    if (!ctx.lotArea || !ctx.imperviousArea)
      return { passed: false, message: "Missing lot/impervious area data." };

    const ratio = ctx.imperviousArea / ctx.lotArea;
    const passed = ratio <= 0.45; // 45% limit
    return {
      passed,
      message: passed
        ? `Impervious cover (${(ratio * 100).toFixed(
            1
          )}%) is within the 45% limit.`
        : `Impervious cover (${(ratio * 100).toFixed(
            1
          )}%) exceeds the 45% limit.`,
    };
  },
  ATX_HERITAGE_TREE: (ctx) => ({
    passed: !ctx.heritageTreesRemoved,
    message: !ctx.heritageTreesRemoved
      ? "No heritage trees affected."
      : "Heritage tree removal requires a separate forestry review.",
  }),
  ATX_HEIGHT_RESIDENTIAL: (ctx) => ({
    passed: ctx.buildingHeight <= 35,
    message:
      ctx.buildingHeight <= 35
        ? "Height is compliant with SF-3 zoning."
        : "Height exceeds 35ft limit for SF-3.",
  }),
  // WARNING Rule
  ATX_VISITABILITY: (ctx) => ({
    passed: true, // Warnings technically "pass" the blocker check, but we flag them via severity in the DB
    message:
      "Note: Ensure compliance with Visitability Ordinance (no-step entrance).",
  }),

  // --- NEW YORK, NY RULES ---
  NYC_FIRE_STANDPIPE: (ctx) => ({
    passed: ctx.buildingHeight <= 75,
    // In reality, if > 75, you MUST have a standpipe. For this demo, we assume "No Standpipe"
    // means it fails if height > 75.
    message:
      ctx.buildingHeight <= 75
        ? "Building under 75ft, standpipe rules ok."
        : "Building exceeds 75ft; standpipe system is required.",
  }),
  // ... Add logic for other NYC keys as needed ...
};
