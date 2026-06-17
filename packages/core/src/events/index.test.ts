import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "./index.js";
import type {
  TestStartedEvent,
  TestHealedEvent,
  RunCompletedEvent,
} from "./index.js";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    bus.removeAllListeners();
  });

  describe("emit and on", () => {
    it("should emit and receive typed events", () => {
      const listener = vi.fn();
      bus.on("test:started", listener);

      const payload: TestStartedEvent = {
        testId: "test-001",
        testName: "Login Test",
        testType: "web",
        suiteId: "suite-1",
        runId: "run-1",
        timestamp: new Date(),
      };

      const emitted = bus.emit("test:started", payload);

      expect(emitted).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it("should return false when no listeners", () => {
      const emitted = bus.emit("test:passed", {
        testId: "test-001",
        testName: "Test",
        duration: 100,
        result: {
          testId: "test-001",
          status: "passed",
          duration: 100,
          stepResults: [],
        },
        timestamp: new Date(),
      });

      expect(emitted).toBe(false);
    });
  });

  describe("once", () => {
    it("should fire only once for once listeners", () => {
      const listener = vi.fn();
      bus.once("test:healed", listener);

      const payload: TestHealedEvent = {
        testId: "test-001",
        locatorStrategy: "css",
        originalLocator: "#old",
        healedLocator: "#new",
        confidence: 90,
        explanation: "Element moved",
        timestamp: new Date(),
      };

      bus.emit("test:healed", payload);
      bus.emit("test:healed", payload);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("off", () => {
    it("should remove a specific listener", () => {
      const listener = vi.fn();
      bus.on("ai:done", listener);

      bus.off("ai:done", listener);

      bus.emit("ai:done", {
        operation: "generate",
        model: "claude-sonnet-4-20250514",
        duration: 2500,
        tokenUsage: { input: 100, output: 500 },
        timestamp: new Date(),
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("removeAllListeners", () => {
    it("should remove all listeners for a specific event", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      bus.on("test:started", listener1);
      bus.on("test:passed", listener2);

      bus.removeAllListeners("test:started");

      expect(bus.listenerCount("test:started")).toBe(0);
      expect(bus.listenerCount("test:passed")).toBe(1);
    });

    it("should remove all listeners when no event specified", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      bus.on("test:started", listener1);
      bus.on("test:passed", listener2);

      bus.removeAllListeners();

      expect(bus.listenerCount("test:started")).toBe(0);
      expect(bus.listenerCount("test:passed")).toBe(0);
    });
  });

  describe("waitFor", () => {
    it("should resolve when the event is emitted", async () => {
      const waitPromise = bus.waitFor("run:completed");

      const payload: RunCompletedEvent = {
        runId: "run-001",
        suiteId: "suite-1",
        status: "passed",
        duration: 30000,
        passedCount: 10,
        failedCount: 0,
        skippedCount: 0,
        timestamp: new Date(),
      };

      bus.emit("run:completed", payload);

      const result = await waitPromise;
      expect(result).toEqual(payload);
    });
  });

  describe("listenerCount", () => {
    it("should return correct listener count", () => {
      bus.on("test:started", vi.fn());
      bus.on("test:started", vi.fn());
      bus.on("test:passed", vi.fn());

      expect(bus.listenerCount("test:started")).toBe(2);
      expect(bus.listenerCount("test:passed")).toBe(1);
      expect(bus.listenerCount("test:failed")).toBe(0);
    });
  });

  describe("eventNames", () => {
    it("should return registered event types", () => {
      bus.on("test:started", vi.fn());
      bus.on("ai:generating", vi.fn());

      const names = bus.eventNames();

      expect(names).toContain("test:started");
      expect(names).toContain("ai:generating");
    });
  });

  describe("multiple listeners", () => {
    it("should call all registered listeners in order", () => {
      const callOrder: string[] = [];

      bus.on("test:started", () => callOrder.push("first"));
      bus.on("test:started", () => callOrder.push("second"));

      bus.emit("test:started", {
        testId: "test-001",
        testName: "Test",
        testType: "web",
        suiteId: "suite-1",
        runId: "run-1",
        timestamp: new Date(),
      });

      expect(callOrder).toEqual(["first", "second"]);
    });
  });
});
