import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

import { SubmissionState } from "@prisma/client";

export class MetricsManager {
  private static instance: MetricsManager;
  public registry: Registry;

  // -- Metric Definitions --
  private submissionCounter: Counter;
  private packetGenDuration: Histogram;
  private queueLag: Gauge;
  private jobOutcomes: Counter;
  private stateTransitionCounter: Counter;
  public httpRequestDuration: Histogram;

  private constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({ register: this.registry });

    this.submissionCounter = new Counter({
      name: "submissions_created_total",
      help: "Total number of permit submissions created",
      registers: [this.registry],
    });

    this.packetGenDuration = new Histogram({
      name: "packet_gen_duration_seconds",
      help: "Time spent generating the PDF packet",
      buckets: [0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });

    this.queueLag = new Gauge({
      name: "queue_lag_seconds",
      help: "Time difference between job creation and processing start",
      registers: [this.registry],
    });

    this.jobOutcomes = new Counter({
      name: "job_outcomes_total",
      help: "Count of job execution results",
      labelNames: ["status"],
      registers: [this.registry],
    });

    this.stateTransitionCounter = new Counter({
      name: "submission_state_transition_total",
      help: "Total number of state transitions",
      labelNames: ["from", "to"],
      registers: [this.registry],
    });
    this.httpRequestDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "Duration of HTTP requests in seconds",
      labelNames: ["method", "route", "status_code"], // Labels let us filter by GET vs POST
      buckets: [0.1, 0.3, 0.5, 1, 2, 5], // 100ms, 300ms, 500ms, etc.
      registers: [this.registry],
    });
  }

  public static getInstance(): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager();
    }
    return MetricsManager.instance;
  }

  public incrementSubmissions() {
    this.submissionCounter.inc();
  }

  public recordPacketGenerationDuration(seconds: number) {
    this.packetGenDuration.observe(seconds);
  }

  public setQueueLag(seconds: number) {
    this.queueLag.set(seconds);
  }

  public incrementJobOutcome(status: "completed" | "failed") {
    this.jobOutcomes.inc({ status });
  }

  public recordStateTransition(from: SubmissionState, to: SubmissionState) {
    this.stateTransitionCounter.inc({ from, to });
  }

  public recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number
  ) {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      durationSeconds
    );
  }
}

export const metrics = MetricsManager.getInstance();
