import { PermitSubmission, SubmissionState } from "@prisma/client";

// This is our "Rulebook". It defines all legal moves.
const ALLOWED_TRANSITIONS: Record<SubmissionState, SubmissionState[]> = {
  DRAFT: ["VALIDATED"],
  VALIDATED: ["PACKET_READY"],
  PACKET_READY: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "NEEDS_INFO"],
  POLLING: ["APPROVED", "NEEDS_INFO"],
  APPROVED: [],
  NEEDS_INFO: ["DRAFT"],
  // add guards/checks later for completenessScore, etc.
};

/**
 * The "Referee". Checks if a transition from one state to another is legal.
 * @param from The current state.
 * @param to The desired next state.
 * @returns True if the transition is allowed, false otherwise.
 */
export function canTransition(
  submission: PermitSubmission,
  to: SubmissionState
): boolean {
  // GUARD: Cannot transition to same validated if completenessScore < 1
  if (to === "VALIDATED" && submission.completenessScore < 1) {
    return false;
  }

  // GUARD: Basic Path Check
  // Check if the map allows moving from A to B
  return ALLOWED_TRANSITIONS[submission.state]?.includes(to) ?? false;
}
