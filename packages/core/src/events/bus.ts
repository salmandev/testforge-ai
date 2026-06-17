import { EventEmitter } from "node:events";
import type { TestCase, TestRun, TestResult } from "../schemas/index.js";

// ============================================================================
// Event type definitions
// ============================================================================

/**
 * All possible event types in the TestForge system
 */
export type TestForgeEventType =
  | "test:started"
  | "test:passed"
  | "test:failed"
  | "test:healed"
  | "run:started"
  | "run:completed"
  | "ai:generating"
  | "ai:done";

// ============================================================================
// Event payload types
// ============================================================================

/**
 * Payload for test:started event
 */
export interface TestStartedEvent {
  testId: string;
  testName: string;
  testType: TestCase["type"];
  suiteId: string;
  runId: string;
  timestamp: Date;
}

/**
 * Payload for test:passed event
 */
export interface TestPassedEvent {
  testId: string;
  testName: string;
  duration: number;
  result: TestResult;
  timestamp: Date;
}

/**
 * Payload for test:failed event
 */
export interface TestFailedEvent {
  testId: string;
  testName: string;
  duration: number;
  error: string;
  screenshot?: string;
  result: TestResult;
  timestamp: Date;
}

/**
 * Payload for test:healed event
 */
export interface TestHealedEvent {
  testId: string;
  locatorStrategy: string;
  originalLocator: string;
  healedLocator: string;
  confidence: number;
  explanation: string;
  timestamp: Date;
}

/**
 * Payload for run:started event
 */
export interface RunStartedEvent {
  runId: string;
  suiteId: string;
  triggeredBy: TestRun["triggeredBy"];
  environment?: string;
  testCount: number;
  timestamp: Date;
}

/**
 * Payload for run:completed event
 */
export interface RunCompletedEvent {
  runId: string;
  suiteId: string;
  status: TestRun["status"];
  duration: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  aiSummary?: string;
  timestamp: Date;
}

/**
 * Payload for ai:generating event
 */
export interface AiGeneratingEvent {
  operation: string;
  model: string;
  promptLength: number;
  timestamp: Date;
}

/**
 * Payload for ai:done event
 */
export interface AiDoneEvent {
  operation: string;
  model: string;
  duration: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  timestamp: Date;
}

// ============================================================================
// Event type map for type safety
// ============================================================================

/**
 * Maps event types to their payload types for type-safe event handling
 */
export interface TestForgeEventMap {
  "test:started": TestStartedEvent;
  "test:passed": TestPassedEvent;
  "test:failed": TestFailedEvent;
  "test:healed": TestHealedEvent;
  "run:started": RunStartedEvent;
  "run:completed": RunCompletedEvent;
  "ai:generating": AiGeneratingEvent;
  "ai:done": AiDoneEvent;
}

// ============================================================================
// EventBus implementation
// ============================================================================

/**
 * Type-safe event emitter for TestForge platform events
 *
 * Provides strongly-typed event emission and listening across the platform.
 * All AI calls, test executions, and run lifecycle events flow through this bus.
 *
 * @example
 * ```ts
 * const bus = new EventBus();
 *
 * bus.on("test:started", (event) => {
 *   console.log(`Test started: ${event.testName}`);
 * });
 *
 * bus.emit("test:started", {
 *   testId: "test-1",
 *   testName: "Login Test",
 *   testType: "web",
 *   suiteId: "suite-1",
 *   runId: "run-1",
 *   timestamp: new Date(),
 * });
 * ```
 */
export class EventBus extends EventEmitter {
  /**
   * Creates a new EventBus instance
   *
   * @param options - EventEmitter options (e.g., captureRejections)
   */
  constructor(options?: { captureRejections?: boolean }) {
    super(options);
    this.setMaxListeners(100); // Allow many listeners for parallel execution
  }

  /**
   * Emit a typed event with payload validation
   *
   * @param event - The event type
   * @param payload - The event payload
   * @returns true if the event had listeners, false otherwise
   */
  emit<E extends TestForgeEventType>(
    event: E,
    payload: TestForgeEventMap[E]
  ): boolean {
    return super.emit(event, payload);
  }

  /**
   * Register a listener for a specific event type
   *
   * @param event - The event type to listen for
   * @param listener - The callback function
   * @returns this for chaining
   */
  on<E extends TestForgeEventType>(
    event: E,
    listener: (payload: TestForgeEventMap[E]) => void
  ): this {
    return super.on(event, listener);
  }

  /**
   * Register a one-time listener for a specific event type
   *
   * @param event - The event type to listen for
   * @param listener - The callback function
   * @returns this for chaining
   */
  once<E extends TestForgeEventType>(
    event: E,
    listener: (payload: TestForgeEventMap[E]) => void
  ): this {
    return super.once(event, listener);
  }

  /**
   * Remove a listener for a specific event type
   *
   * @param event - The event type
   * @param listener - The callback function to remove
   * @returns this for chaining
   */
  off<E extends TestForgeEventType>(
    event: E,
    listener: (payload: TestForgeEventMap[E]) => void
  ): this {
    return super.off(event, listener);
  }

  /**
   * Remove all listeners for a specific event type, or all events
   *
   * @param event - The event type to clear (omit to clear all)
   * @returns this for chaining
   */
  removeAllListeners(event?: TestForgeEventType): this {
    if (event) {
      return super.removeAllListeners(event);
    }
    return super.removeAllListeners();
  }

  /**
   * Returns the number of listeners for a specific event type
   *
   * @param event - The event type
   * @returns The listener count
   */
  listenerCount<E extends TestForgeEventType>(event: E): number {
    return super.listenerCount(event);
  }

  /**
   * Returns an array of all registered event types
   *
   * @returns Array of event type strings
   */
  eventNames(): TestForgeEventType[] {
    return super.eventNames() as TestForgeEventType[];
  }

  /**
   * Wait for a specific event to be emitted
   *
   * @param event - The event type to wait for
   * @returns Promise that resolves with the event payload
   */
  waitFor<E extends TestForgeEventType>(
    event: E
  ): Promise<TestForgeEventMap[E]> {
    return new Promise((resolve) => {
      this.once(event, resolve);
    });
  }
}
