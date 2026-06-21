import type { TestCase, TestStep, TestResult, StepResult } from "@testforge/core";
import type { EventBus } from "@testforge/core";
import type { FailureAnalyzer } from "@testforge/ai-engine";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import debug from "debug";

const log = debug("testforge:api-runner:grpc");

/**
 * gRPC step data
 */
export interface GrpcStepData {
  /** gRPC server address */
  address: string;
  /** Proto service and method (e.g., "UserService.GetUser") */
  method: string;
  /** Request message as JSON */
  request: Record<string, unknown>;
  /** Expected response shape */
  expectedResponse?: Record<string, unknown>;
  /** Path to .proto file */
  protoPath?: string;
  /** Metadata headers */
  metadata?: Record<string, string>;
}

/**
 * gRPC runner configuration
 */
export interface GrpcRunnerConfig {
  /** Default server address */
  address: string;
  /** Default proto file path */
  protoPath?: string;
  /** Default timeout in ms */
  defaultTimeout: number;
  /** Whether to use TLS */
  useTls: boolean;
}

export const DEFAULT_GRPC_CONFIG: GrpcRunnerConfig = {
  address: "localhost:50051",
  defaultTimeout: 30000,
  useTls: false,
};

/**
 * Cache of loaded proto package definitions
 */
const protoCache = new Map<string, grpc.GrpcObject>();

/**
 * GrpcRunner executes gRPC service methods using @grpc/grpc-js
 *
 * Features:
 * - Loads .proto files dynamically via @grpc/proto-loader
 * - Executes unary calls with metadata support
 * - Validates response structure against expected schema
 * - Caches loaded proto definitions for performance
 */
export class GrpcRunner {
  private readonly _eventBus: EventBus;
  private readonly _config: GrpcRunnerConfig;

  constructor(eventBus: EventBus, config?: Partial<GrpcRunnerConfig>) {
    this._eventBus = eventBus;
    this._config = { ...DEFAULT_GRPC_CONFIG, ...config };
  }

  /**
   * Run a gRPC test case
   */
  async runTest(
    testCase: TestCase,
    options?: { failureAnalyzer?: FailureAnalyzer }
  ): Promise<TestResult> {
    log("Running gRPC test: %s", testCase.name);

    this._eventBus.emit("test:started", {
      testId: testCase.id,
      testName: testCase.name,
      testType: "api",
      suiteId: "unknown",
      runId: "unknown",
      timestamp: new Date(),
    });

    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let testStatus: "passed" | "failed" | "skipped" = "passed";
    let testError: Error | undefined;

    for (const step of testCase.steps) {
      const stepResult = await this._executeStep(step);
      stepResults.push(stepResult);

      if (stepResult.status === "failed") {
        testStatus = "failed";
        testError = new Error(stepResult.error);
        if (options?.failureAnalyzer) {
          const analysis = await options.failureAnalyzer.analyze({
            error: testError,
            screenshot: Buffer.from(""),
            networkLog: [],
            domSnapshot: "",
            testCode: this._stepToCode(step),
          });
          log("gRPC failure: %s", analysis.diagnosis);
        }
        break;
      }
    }

    const duration = Date.now() - startTime;
    const result: TestResult = {
      testId: testCase.id,
      status: testStatus,
      duration,
      stepResults,
      error: testError?.message,
    };

    if (testStatus === "passed") {
      this._eventBus.emit("test:passed", { testId: testCase.id, testName: testCase.name, duration, result, timestamp: new Date() });
    } else {
      this._eventBus.emit("test:failed", { testId: testCase.id, testName: testCase.name, duration, error: testError?.message ?? "Unknown", result, timestamp: new Date() });
    }

    return result;
  }

  private async _executeStep(step: TestStep): Promise<StepResult> {
    const stepStartTime = Date.now();
    const data = step.data as GrpcStepData | undefined;

    if (!data?.method || !data.request) {
      return { stepId: step.id, status: "failed", duration: Date.now() - stepStartTime, error: "Missing method or request", consoleLogs: [], networkRequests: [] };
    }

    try {
      const address = data.address ?? this._config.address;
      const [serviceName, methodName] = data.method.split(".");

      if (!serviceName || !methodName) {
        throw new Error(`Invalid method format: ${data.method}. Expected "ServiceName.MethodName"`);
      }

      // Load proto definition
      const protoPath = data.protoPath ?? this._config.protoPath;
      if (!protoPath) {
        throw new Error("No proto file path specified. Set protoPath in config or step data.");
      }

      const packageDef = await this._loadProto(protoPath);
      const serviceDef = this._findService(packageDef, serviceName);

      if (!serviceDef) {
        throw new Error(`Service "${serviceName}" not found in proto file`);
      }

      // Create gRPC client
      const credentials = this._config.useTls
        ? grpc.credentials.createSsl()
        : grpc.credentials.createInsecure();

      const client = new grpc.Client(address, credentials);

      // Build method descriptor for unary call
      const methodDefinition: grpc.MethodDefinition<Record<string, unknown>, Record<string, unknown>> = {
        path: `/${serviceName}/${methodName}`,
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()) as Record<string, unknown>,
        responseSerialize: (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()) as Record<string, unknown>,
      };

      // Build metadata
      const metadata = new grpc.Metadata();
      if (data.metadata) {
        for (const [key, value] of Object.entries(data.metadata)) {
          metadata.set(key, value);
        }
      }

      // Execute unary call
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          client.close();
          reject(new Error(`gRPC call timed out after ${step.timeout ?? this._config.defaultTimeout}ms`));
        }, step.timeout ?? this._config.defaultTimeout);

        client.makeUnaryRequest(
          methodDefinition.path,
          methodDefinition.requestSerialize,
          methodDefinition.responseDeserialize,
          data.request,
          metadata,
          (error: grpc.ServiceError | null, response?: Record<string, unknown>) => {
            clearTimeout(timer);
            if (error) {
              reject(new Error(`gRPC error ${error.code}: ${error.message}`));
            } else {
              resolve(response ?? {});
            }
          }
        );
      });

      client.close();

      log("gRPC call %s at %s: success", data.method, address);

      // Validate response shape if expected
      if (data.expectedResponse) {
        const match = this._deepMatch(response, data.expectedResponse);
        if (!match) {
          throw new Error("Response does not match expected shape");
        }
      }

      return { stepId: step.id, status: "passed", duration: Date.now() - stepStartTime, consoleLogs: [], networkRequests: [] };
    } catch (error) {
      return {
        stepId: step.id,
        status: "failed",
        duration: Date.now() - stepStartTime,
        error: error instanceof Error ? error.message : String(error),
        consoleLogs: [],
        networkRequests: [],
      };
    }
  }

  /**
   * Load a .proto file and return the package definition (cached)
   */
  async loadProto(protoPath: string): Promise<grpc.GrpcObject> {
    return this._loadProto(protoPath);
  }

  private async _loadProto(protoPath: string): Promise<grpc.GrpcObject> {
    if (protoCache.has(protoPath)) {
      return protoCache.get(protoPath)!;
    }

    const packageDefinition = await protoLoader.load(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const grpcObject = grpc.loadPackageDefinition(packageDefinition);
    protoCache.set(protoPath, grpcObject);
    return grpcObject;
  }

  private _findService(grpcObj: grpc.GrpcObject, serviceName: string): grpc.ServiceClientConstructor | null {
    // Search recursively through namespaces
    for (const [, value] of Object.entries(grpcObj)) {
      if (typeof value === "function") return value as grpc.ServiceClientConstructor;
      if (typeof value === "object" && value !== null) {
        const found = (value as Record<string, unknown>)[serviceName];
        if (typeof found === "function") return found as grpc.ServiceClientConstructor;
      }
    }
    return null;
  }

  private _deepMatch(actual: unknown, expected: unknown): boolean {
    if (typeof expected === "object" && expected !== null && typeof actual === "object" && actual !== null) {
      for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
        if (!(key in (actual as Record<string, unknown>))) return false;
        if (typeof value === "object" && value !== null) {
          if (!this._deepMatch((actual as Record<string, unknown>)[key], value)) return false;
        } else if ((actual as Record<string, unknown>)[key] !== value) {
          return false;
        }
      }
      return true;
    }
    return actual === expected;
  }

  private _stepToCode(step: TestStep): string {
    const data = step.data as GrpcStepData | undefined;
    if (!data) return `// Unknown step`;
    return `const response = await client.${data.method}(${JSON.stringify(data.request)});`;
  }
}
