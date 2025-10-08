import { SubmissionState } from "@prisma/client";
import { canTransition } from "./stateMachine";

describe("canTransition function", () => {
  it("should return true for a valid transition (DRAFT -> VALIDATED)", () => {
    // Act: Check if we can move from DRAFT to VALIDATED
    const result = canTransition(
      SubmissionState.DRAFT,
      SubmissionState.VALIDATED
    );
    // Assert: The result should be true
    expect(result).toBe(true);
  });

  it("should return true for a valid transition with multiple options (SUBMITTED -> APPROVED)", () => {
    // Act
    const result = canTransition(
      SubmissionState.SUBMITTED,
      SubmissionState.APPROVED
    );
    // Assert
    expect(result).toBe(true);
  });

  it("should return false for an invalid transition (DRAFT -> APPROVED)", () => {
    // Act: Check if we can move directly from DRAFT to APPROVED
    const result = canTransition(
      SubmissionState.DRAFT,
      SubmissionState.APPROVED
    );
    // Assert: The result should be false
    expect(result).toBe(false);
  });

  it("should return false for a state with no possible transitions (APPROVED -> DRAFT)", () => {
    // Act
    const result = canTransition(
      SubmissionState.APPROVED,
      SubmissionState.DRAFT
    );
    // Assert
    expect(result).toBe(false);
  });

  it("should return false when trying to transition to the same state", () => {
    // Act
    const result = canTransition(SubmissionState.DRAFT, SubmissionState.DRAFT);
    // Assert
    expect(result).toBe(false);
  });
});
