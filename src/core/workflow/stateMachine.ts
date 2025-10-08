import { SubmissionState } from "@prisma/client";

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
  from: SubmissionState,
  to: SubmissionState
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
