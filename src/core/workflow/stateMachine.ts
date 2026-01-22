import {
  PrismaClient,
  PermitSubmission,
  SubmissionState,
} from "@prisma/client";

const prisma = new PrismaClient();

// --- 1. DEFINITIONS ---

export enum TransitionFailureReason {
  INVALID_PATH = "INVALID_PATH",
  GUARD_VIOLATION = "GUARD_VIOLATION",
  STATE_IMMUTABLE = "STATE_IMMUTABLE",
}

export interface TransitionResult {
  allowed: boolean;
  reason?: TransitionFailureReason;
  message?: string;
}

const ALLOWED_TRANSITIONS: Record<SubmissionState, SubmissionState[]> = {
  DRAFT: ["VALIDATED"],
  VALIDATED: ["PACKET_READY"],
  PACKET_READY: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "NEEDS_INFO"],
  POLLING: ["APPROVED", "NEEDS_INFO"],
  APPROVED: [],
  NEEDS_INFO: ["DRAFT"],
};

// --- 2. PURE LOGIC (The Rulebook) ---

/**
 * Validates a transition request against the rules.
 * Returns a detailed object, not just a boolean.
 */
export function validateTransition(
  submission: PermitSubmission,
  to: SubmissionState,
): TransitionResult {
  // Rule 1: Existence in Map (Path Validity)
  const allowedNextStates = ALLOWED_TRANSITIONS[submission.state] || [];
  if (!allowedNextStates.includes(to)) {
    return {
      allowed: false,
      reason: TransitionFailureReason.INVALID_PATH,
      message: `Cannot move from ${submission.state} to ${to}`,
    };
  }

  // Rule 2: Completeness Guard
  if (to === "VALIDATED" && submission.completenessScore < 1) {
    return {
      allowed: false,
      reason: TransitionFailureReason.GUARD_VIOLATION,
      message: "Submission is incomplete (Score < 1.0)",
    };
  }

  return { allowed: true };
}

// --- 3. INSTRUMENTED EXECUTION (The Process Twin) ---

/**
 * Attempts to execute a state transition.
 * Handles: Validation -> Logging (Success/Fail) -> DB Update
 * This ensures the "Process Twin" captures every attempt.
 */
export async function attemptTransition(
  submissionId: string,
  targetState: SubmissionState,
  organizationId: string,
  researchContext: Record<string, any> = {},
) {
  // A. Fetch current state (Outside transaction for visibility)
  const submission = await prisma.permitSubmission.findFirstOrThrow({
    where: { id: submissionId, organizationId },
  });

  // B. Validate (Using Pure Logic)
  const validation = validateTransition(submission, targetState);

  // C. Log Failure (If Invalid)
  if (!validation.allowed) {
    await prisma.workflowEvent.create({
      data: {
        submissionId,
        eventType: "TRANSITION_FAILED",
        fromState: submission.state,
        toState: targetState,
        metadata: {
          reason: validation.reason,
          message: validation.message,
          ...researchContext,
        },
      },
    });

    throw new Error(validation.message);
  }

  // D. Execute Success (If Valid)
  return prisma.$transaction(async (tx) => {
    // 1. Log Success
    await tx.workflowEvent.create({
      data: {
        submissionId,
        eventType: "STATE_TRANSITION",
        fromState: submission.state,
        toState: targetState,
        metadata: researchContext,
      },
    });

    // 2. Update State
    return tx.permitSubmission.update({
      where: { id: submissionId },
      data: { state: targetState },
    });
  });
}
