import { describe, it, expect, vi, beforeEach } from "vitest";
import { LicenseManager, type License } from "./index.js";
import type { EEFeature } from "../schemas/index.js";

// Mock jose for JWT verification
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(),
}));

// Mock debug
vi.mock("debug", () => ({
  default: vi.fn(() => vi.fn()),
}));

import { jwtVerify } from "jose";

const mockJwtVerify = vi.mocked(jwtVerify);

describe("LicenseManager", () => {
  let manager: LicenseManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new LicenseManager();
  });

  describe("verifyLicenseKey", () => {
    it("should verify a valid EE license key", async () => {
      const mockPayload = {
        sub: "license-001",
        holder: "Test Company",
        type: "EE",
        features: ["ai-agent", "compliance-nca-ecc"] as EEFeature[],
        exp: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year from now
        iat: Math.floor(Date.now() / 1000),
        seats: 10,
      };

      mockJwtVerify.mockResolvedValueOnce({ payload: mockPayload } as never);

      const license = await manager.verifyLicenseKey("valid-jwt-token");

      expect(license).not.toBeNull();
      expect(license!.id).toBe("license-001");
      expect(license!.holder).toBe("Test Company");
      expect(license!.type).toBe("EE");
      expect(license!.features).toContain("ai-agent");
      expect(license!.status).toBe("valid");
    });

    it("should return null for invalid key", async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error("Invalid token"));

      const license = await manager.verifyLicenseKey("invalid-token");

      expect(license).toBeNull();
    });

    it("should mark expired licenses as expired", async () => {
      const mockPayload = {
        sub: "license-expired",
        holder: "Expired Co",
        type: "EE",
        features: [] as EEFeature[],
        exp: Math.floor(Date.now() / 1000) - 86400, // yesterday
        iat: Math.floor(Date.now() / 1000) - 86400 * 366,
        seats: 5,
      };

      mockJwtVerify.mockResolvedValueOnce({ payload: mockPayload } as never);

      const license = await manager.verifyLicenseKey("expired-jwt");

      expect(license).not.toBeNull();
      expect(license!.status).toBe("expired");
    });

    it("should handle CE licenses with no EE features", async () => {
      const mockPayload = {
        sub: "license-ce",
        holder: "Community User",
        type: "CE",
        features: [] as EEFeature[],
        exp: Math.floor(Date.now() / 1000) + 86400 * 365,
        iat: Math.floor(Date.now() / 1000),
        seats: 1,
      };

      mockJwtVerify.mockResolvedValueOnce({ payload: mockPayload } as never);

      const license = await manager.verifyLicenseKey("ce-jwt");

      expect(license).not.toBeNull();
      expect(license!.type).toBe("CE");
      expect(license!.features).toEqual([]);
    });
  });

  describe("check", () => {
    it("should return false when no license is loaded", () => {
      expect(manager.check("ai-agent")).toBe(false);
    });

    it("should return false for CE license with EE feature", async () => {
      const mockPayload = {
        sub: "license-ce",
        holder: "Community User",
        type: "CE",
        features: [] as EEFeature[],
        exp: Math.floor(Date.now() / 1000) + 86400 * 365,
        iat: Math.floor(Date.now() / 1000),
        seats: 1,
      };

      mockJwtVerify.mockResolvedValueOnce({ payload: mockPayload } as never);
      await manager.verifyLicenseKey("ce-jwt");

      expect(manager.check("ai-agent")).toBe(false);
      expect(manager.check("compliance-nca-ecc")).toBe(false);
    });

    it("should return true for EE license with requested feature", async () => {
      const mockPayload = {
        sub: "license-ee",
        holder: "Enterprise Corp",
        type: "EE",
        features: ["ai-agent", "visual-dna"] as EEFeature[],
        exp: Math.floor(Date.now() / 1000) + 86400 * 365,
        iat: Math.floor(Date.now() / 1000),
        seats: 50,
      };

      mockJwtVerify.mockResolvedValueOnce({ payload: mockPayload } as never);
      await manager.verifyLicenseKey("ee-jwt");

      expect(manager.check("ai-agent")).toBe(true);
      expect(manager.check("visual-dna")).toBe(true);
      expect(manager.check("compliance-nca-ecc")).toBe(false);
    });
  });

  describe("grace period", () => {
    it("should set grace period when verification fails but license exists", async () => {
      // First, load a valid license
      const mockPayload = {
        sub: "license-grace",
        holder: "Grace Period Co",
        type: "EE",
        features: ["ai-agent"] as EEFeature[],
        exp: Math.floor(Date.now() / 1000) + 86400 * 365,
        iat: Math.floor(Date.now() / 1000),
        seats: 5,
      };

      mockJwtVerify.mockResolvedValueOnce({ payload: mockPayload } as never);
      const license = await manager.verifyLicenseKey("jwt-token");
      expect(license).not.toBeNull();

      // Now simulate server unreachable
      mockJwtVerify.mockRejectedValueOnce(new Error("Network error"));
      const offlineLicense = await manager.verifyLicenseKey("jwt-token");

      // Should still return the license from cache with offline status
      // (grace period is set for subsequent calls)
      expect(offlineLicense).not.toBeNull();
      expect(["offline", "grace-period"]).toContain(offlineLicense!.status);
    });
  });

  describe("isOffline", () => {
    it("should return false when no grace period is set", () => {
      expect(manager.isOffline).toBe(false);
    });
  });

  describe("license getter", () => {
    it("should return null when no license is loaded", () => {
      expect(manager.license).toBeNull();
    });

    it("should return the loaded license", async () => {
      const mockPayload = {
        sub: "license-getter",
        holder: "Getter Co",
        type: "EE",
        features: [] as EEFeature[],
        exp: Math.floor(Date.now() / 1000) + 86400 * 365,
        iat: Math.floor(Date.now() / 1000),
        seats: 10,
      };

      mockJwtVerify.mockResolvedValueOnce({ payload: mockPayload } as never);
      await manager.verifyLicenseKey("jwt");

      const loadedLicense = manager.license;
      expect(loadedLicense).not.toBeNull();
      expect(loadedLicense!.id).toBe("license-getter");
    });
  });
});
