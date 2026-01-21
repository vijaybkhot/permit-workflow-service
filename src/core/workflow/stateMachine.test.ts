import { SubmissionState } from "@prisma/client";
import { validateTransition, TransitionFailureReason } from "./stateMachine";

describe("State Machine (PADT Instrument)", () => {
  // Helper to create a mock submission
  const mockSubmission = (state: SubmissionState, score = 1.0) => ({
    id: "sub_123",
    state,
    completenessScore: score,
    organizationId: "org_1",
    jurisdictionId: "jur_1",
    projectName: "Test",
    createdAt: new Date(),
    updatedAt: new Date(),
    submissionDetails: {},
  });

  it("allows valid DRAFT -> VALIDATED transition", () => {
    const sub = mockSubmission("DRAFT", 1.0);
    const result = validateTransition(sub, "VALIDATED");

    expect(result.allowed).toBe(true);
  });

  it("detects INVALID_PATH (DRAFT -> APPROVED)", () => {
    const sub = mockSubmission("DRAFT", 1.0);
    const result = validateTransition(sub, "APPROVED");

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(TransitionFailureReason.INVALID_PATH);
  });

  it("detects GUARD_VIOLATION (DRAFT -> VALIDATED w/ low score)", () => {
    const sub = mockSubmission("DRAFT", 0.5); // Score < 1.0
    const result = validateTransition(sub, "VALIDATED");

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(TransitionFailureReason.GUARD_VIOLATION);
  });

  it("allows transition from VALIDATED to PACKET_READY", () => {
    const sub = mockSubmission("VALIDATED");
    const result = validateTransition(sub, "PACKET_READY");

    expect(result.allowed).toBe(true);
  });
});
