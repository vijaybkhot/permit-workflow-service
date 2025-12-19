import { PermitSubmission, SubmissionState } from "@prisma/client";
import { canTransition } from "./stateMachine";

describe("canTransition function", () => {
  it("should return true for a valid transition (DRAFT -> VALIDATED)", () => {
    const submission = {
      state: "DRAFT" as SubmissionState,
      completenessScore: 1, // ✅ FIXED: Set to 1 (was 0)
    } as PermitSubmission;

    const result = canTransition(submission, "VALIDATED");
    expect(result).toBe(true);
  });

  it("should return true for a valid transition with multiple options (SUBMITTED -> APPROVED)", () => {
    const submission = {
      id: "test-id",
      projectName: "Test",
      state: "SUBMITTED" as SubmissionState,
      completenessScore: 1,
      organizationId: "org-id",
      jurisdictionId: "jur-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      submissionDetails: {},
    } as PermitSubmission;

    const result = canTransition(submission, "APPROVED");
    expect(result).toBe(true);
  });

  it("should return false for an invalid transition (DRAFT -> APPROVED)", () => {
    const submission = {
      state: "DRAFT" as SubmissionState,
      completenessScore: 1,
    } as PermitSubmission;
    // Act: Check if we can move directly from DRAFT to APPROVED
    const result = canTransition(submission, SubmissionState.APPROVED);
    // Assert: The result should be false
    expect(result).toBe(false);
  });

  it("should return false for a state with no possible transitions (APPROVED -> DRAFT)", () => {
    // Act
    const submission = {
      state: "APPROVED" as SubmissionState,
      completenessScore: 1,
    } as PermitSubmission;
    const result = canTransition(submission, SubmissionState.DRAFT);
    // Assert
    expect(result).toBe(false);
  });

  it("should return false when trying to transition to the same state", () => {
    // Act
    const submission = {
      state: "APPROVED" as SubmissionState,
      completenessScore: 1,
    } as PermitSubmission;
    const result = canTransition(submission, SubmissionState.APPROVED);
    // Assert
    expect(result).toBe(false); // Assert
  });
});
