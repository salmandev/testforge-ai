import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompliancePack, FRAMEWORKS } from "./index.js";
import type { AIProvider } from "../providers/types.js";
import type { LicenseManager } from "@testforge/core";

// Mock LicenseManager
function createMockLicenseManager(hasFeature: boolean): LicenseManager {
  return {
    verifyLicenseKey: vi.fn().mockResolvedValue({
      id: "license-ee",
      holder: "Enterprise Corp",
      type: "EE",
      features: hasFeature
        ? ["compliance-nca-ecc", "compliance-pci-dss"]
        : [],
      expiresAt: new Date("2026-12-31"),
      issuedAt: new Date("2025-01-01"),
      status: "valid",
      maxSeats: 50,
      currentSeats: 10,
    }),
    check: vi.fn().mockReturnValue(hasFeature),
    license: {
      id: "license-ee",
      holder: "Enterprise Corp",
      type: "EE" as const,
      features: hasFeature
        ? (["compliance-nca-ecc", "compliance-pci-dss"] as const)
        : ([] as const),
      expiresAt: new Date("2026-12-31"),
      issuedAt: new Date("2025-01-01"),
      status: "valid" as const,
      maxSeats: 50,
      currentSeats: 10,
    },
    isOffline: false,
  } as unknown as LicenseManager;
}

function createMockProvider(): AIProvider {
  return {
    providerId: "mock",
    model: "mock-model",
    generate: vi.fn().mockResolvedValue("Suggested test cases"),
    generateStructured: vi.fn().mockResolvedValue({
      controls: [
        {
          controlId: "ECC-1-1",
          controlName: "Access Control Policy",
          covered: true,
          status: "compliant" as const,
          testIds: ["test-001", "test-002"],
          notes: "Access control tests verify role-based permissions",
        },
        {
          controlId: "ECC-2-1",
          controlName: "Authentication Requirements",
          covered: true,
          status: "partial" as const,
          testIds: ["test-003"],
          notes: "MFA testing is incomplete",
        },
        {
          controlId: "ECC-3-1",
          controlName: "Data Encryption",
          covered: false,
          status: "non-compliant" as const,
          testIds: [],
          notes: "No tests for encryption at rest",
        },
      ],
      aiSummary: "67% of controls have test coverage. Focus on encryption.",
      gaps: ["ECC-3-1: Data Encryption — no test coverage"],
    }),
    generateStream: vi.fn().mockImplementation(async function* () {
      yield "chunk";
    }),
    vision: vi.fn().mockResolvedValue("Vision response"),
    getLastTokenUsage: vi.fn().mockReturnValue(null),
  };
}

describe("CompliancePack", () => {
  let provider: AIProvider;

  beforeEach(() => {
    provider = createMockProvider();
  });

  describe("FRAMEWORKS", () => {
    it("should define all compliance frameworks", () => {
      expect(FRAMEWORKS).toHaveProperty("NCA_ECC");
      expect(FRAMEWORKS).toHaveProperty("SAMA_CSF");
      expect(FRAMEWORKS).toHaveProperty("PCI_DSS");
      expect(FRAMEWORKS).toHaveProperty("GDPR");
      expect(FRAMEWORKS).toHaveProperty("ISO_27001");
      expect(FRAMEWORKS).toHaveProperty("PDPL_SA");
    });

    it("should have metadata for each framework", () => {
      for (const [id, framework] of Object.entries(FRAMEWORKS)) {
        expect(framework.id).toBe(id);
        expect(framework.name.length).toBeGreaterThan(0);
        expect(framework.description.length).toBeGreaterThan(0);
        expect(framework.region.length).toBeGreaterThan(0);
        expect(framework.totalControls).toBeGreaterThan(0);
        expect(framework.requiredFeature.length).toBeGreaterThan(0);
      }
    });

    it("should have Saudi-specific frameworks", () => {
      const saudiFrameworks = Object.values(FRAMEWORKS).filter(
        (f) => f.region === "Saudi Arabia"
      );

      expect(saudiFrameworks.length).toBeGreaterThan(0);
      expect(saudiFrameworks.some((f) => f.id === "NCA_ECC")).toBe(true);
      expect(saudiFrameworks.some((f) => f.id === "SAMA_CSF")).toBe(true);
      expect(saudiFrameworks.some((f) => f.id === "PDPL_SA")).toBe(true);
    });
  });

  describe("getAvailableFrameworks", () => {
    it("should return all frameworks", () => {
      const licenseManager = createMockLicenseManager(true);
      const pack = new CompliancePack(provider, licenseManager);

      const frameworks = pack.getAvailableFrameworks();

      expect(frameworks.length).toBe(6);
    });
  });

  describe("run", () => {
    it("should run compliance audit with valid license", async () => {
      const licenseManager = createMockLicenseManager(true);
      const pack = new CompliancePack(provider, licenseManager);

      const result = await pack.run({
        suiteResults: {
          id: "run-001",
          suiteId: "suite-1",
          status: "passed" as const,
          results: [
            { testId: "test-001", status: "passed" as const, duration: 100, stepResults: [] },
            { testId: "test-002", status: "passed" as const, duration: 200, stepResults: [] },
          ],
          triggeredBy: "manual" as const,
        },
        framework: "NCA_ECC",
      });

      expect(result.framework).toBe("NCA_ECC");
      expect(result.coverage.length).toBeGreaterThan(0);
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it("should throw error without required license", async () => {
      const licenseManager = createMockLicenseManager(false);
      const pack = new CompliancePack(provider, licenseManager);

      await expect(
        pack.run({
          suiteResults: {
            id: "run-001",
            suiteId: "suite-1",
            status: "passed" as const,
            results: [],
            triggeredBy: "manual" as const,
          },
          framework: "NCA_ECC",
        })
      ).rejects.toThrow(/Enterprise Edition license/);
    });

    it("should throw error for unknown framework", async () => {
      const licenseManager = createMockLicenseManager(true);
      const pack = new CompliancePack(provider, licenseManager);

      await expect(
        pack.run({
          suiteResults: {
            id: "run-001",
            suiteId: "suite-1",
            status: "passed" as const,
            results: [],
            triggeredBy: "manual" as const,
          },
          framework: "UNKNOWN_FRAMEWORK" as never,
        })
      ).rejects.toThrow(/Unknown compliance framework/);
    });

    it("should calculate compliance percentage", async () => {
      const licenseManager = createMockLicenseManager(true);
      const pack = new CompliancePack(provider, licenseManager);

      const result = await pack.run({
        suiteResults: {
          id: "run-001",
          suiteId: "suite-1",
          status: "passed" as const,
          results: [],
          triggeredBy: "manual" as const,
        },
        framework: "NCA_ECC",
      });

      expect(result.compliancePercentage).toBeGreaterThanOrEqual(0);
      expect(result.compliancePercentage).toBeLessThanOrEqual(100);
    });
  });

  describe("generateEvidencePackage", () => {
    it("should generate evidence summary", async () => {
      const licenseManager = createMockLicenseManager(true);
      const pack = new CompliancePack(provider, licenseManager);

      const runResult = await pack.run({
        suiteResults: {
          id: "run-001",
          suiteId: "suite-1",
          status: "passed" as const,
          results: [],
          triggeredBy: "manual" as const,
        },
        framework: "NCA_ECC",
      });

      const evidence = await pack.generateEvidencePackage(runResult);

      expect(evidence.summary.length).toBeGreaterThan(0);
      expect(evidence.controlEvidence.length).toBeGreaterThan(0);
      expect(evidence.summary).toContain("NCA Essential Cybersecurity Controls");
    });
  });

  describe("suggestTests", () => {
    it("should generate test suggestions for uncovered controls", async () => {
      const licenseManager = createMockLicenseManager(true);
      const pack = new CompliancePack(provider, licenseManager);

      const suggestions = await pack.suggestTests("NCA_ECC", [
        "ECC-3-1: Data Encryption",
        "ECC-4-1: Network Security",
      ]);

      expect(suggestions.length).toBeGreaterThan(0);
    });
  });
});
