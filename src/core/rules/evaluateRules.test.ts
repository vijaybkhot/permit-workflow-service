// src/core/rules/evaluateRules.test.ts

import { evaluateRules } from "./evaluateRules";
import { RuleContext } from "./types";

describe("evaluateRules engine with realistic rules", () => {
  it("should return all passing results for a fully compliant submission", () => {
    // Arrange: A perfect submission
    const context: RuleContext = {
      projectName: "Compliant High-Rise",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 39,
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 3,
    };

    // Act
    const results = evaluateRules(context);

    // Assert: Check that every rule passed
    // .every() is a nice way to check all elements in an array
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it("should return a failing result for a building that is too tall", () => {
    // Arrange: A submission with one flaw
    const context: RuleContext = {
      projectName: "Too Tall Tower",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 45, // This is over the 40-foot limit
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 3,
    };

    // Act
    const results = evaluateRules(context);

    // Assert: Find the specific rule and check its result
    const heightRuleResult = results.find(
      (r) => r.ruleKey === "BUILDING_HEIGHT_LIMIT"
    );
    expect(heightRuleResult?.passed).toBe(false);
    expect(heightRuleResult?.message).toContain("exceeds the 40-foot limit");
  });

  it("should return multiple failing results for a submission with several issues", () => {
    // Arrange: A submission with multiple flaws
    const context: RuleContext = {
      projectName: "Problem Project",
      hasArchitecturalPlans: false, // Fails
      hasStructuralCalcs: true,
      buildingHeight: 35,
      setbackFront: 15, // Fails
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 1, // Fails
    };

    // Act
    const results = evaluateRules(context);

    // Assert: Count the number of failing rules
    const failingRules = results.filter((r) => !r.passed);
    expect(failingRules.length).toBe(3);
    expect(
      results.find((r) => r.ruleKey === "ARCHITECTURAL_PLANS_SUBMITTED")?.passed
    ).toBe(false);
    expect(
      results.find((r) => r.ruleKey === "SETBACK_REQUIREMENT_MET")?.passed
    ).toBe(false);
    expect(
      results.find((r) => r.ruleKey === "FIRE_SAFETY_EGRESS_COMPLIANT")?.passed
    ).toBe(false);
  });
});
