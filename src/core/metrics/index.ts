import { Registry, Counter } from "prom-client";

export const registry = new Registry();

export const submissionsCreatedCounter = new Counter({
  name: "submissions_created_total",
  help: "Total number of submissions created",
  registers: [registry],
});

export const stateTransitionCounter = new Counter({
  name: "submission_state_transition_total",
  help: "Total number of state transitions",
  labelNames: ["from", "to"],
  registers: [registry],
});
