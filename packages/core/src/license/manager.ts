import { EEFeatureSchema, type EEFeature } from "../schemas/index.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import debug from "debug";

const log = debug("testforge:license");

/**
 * License types supported by TestForge
 */
export const LicenseTypeSchema = EEFeatureSchema.enum;
export type LicenseType = EEFeature;

/**
 * License status indicating validity and state
 */
export type LicenseStatus =
  | "valid"
  | "expired"
  | "invalid"
  | "grace-period"
  | "offline";

/**
 * A verified license object with metadata
 */
export interface License {
  /** License key identifier */
  id: string;
  /** License holder name */
  holder: string;
  /** License type (CE or EE) */
  type: "CE" | "EE";
  /** Enabled enterprise features */
  features: EEFeature[];
  /** License expiration date */
  expiresAt: Date;
  /** When license was issued */
  issuedAt: Date;
  /** License status */
  status: LicenseStatus;
  /** Maximum number of seats/users */
  maxSeats: number;
  /** Current seat count */
  currentSeats: number;
}

/**
 * Payload structure for JWT license tokens
 */
interface LicensePayload {
  sub: string;
  holder: string;
  type: "CE" | "EE";
  features: EEFeature[];
  exp: number;
  iat: number;
  seats: number;
}

/**
 * Default grace period in days when license server is unreachable
 */
const GRACE_PERIOD_DAYS = 7;

/**
 * Default TestForge public key for JWT verification (in production, fetch from server)
 * This is a placeholder — replace with actual public key from testforge.io
 */
const DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2Z3pDqK8x5YqKx6mJ
FILL_IN_WITH_ACTUAL_PUBLIC_KEY
PlaceholderReplaceableKeyValue123456789012345678901234567890
-----END PUBLIC KEY-----`;

/**
 * LicenseManager handles verification of TestForge license keys
 *
 * Supports:
 * - JWT-based verification against testforge.io public key
 * - 7-day grace period if license server unreachable
 * - 100% offline operation for Community Edition (no phone-home)
 *
 * @example
 * ```ts
 * const manager = new LicenseManager();
 * const license = await manager.verifyLicenseKey("eyJhbG...");
 * if (manager.check("ai-agent")) { ... }
 * ```
 */
export class LicenseManager {
  private _license: License | null = null;
  private _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private _gracePeriodEnd: Date | null = null;
  private _lastVerificationAttempt: Date | null = null;
  private readonly _publicKey: string;
  private readonly _licenseServerUrl: string;

  /**
   * Creates a new LicenseManager instance
   *
   * @param options - Configuration options
   * @param options.publicKey - PEM-encoded public key for JWT verification
   * @param options.licenseServerUrl - URL of the license verification server
   */
  constructor(options?: { publicKey?: string; licenseServerUrl?: string }) {
    this._publicKey = options?.publicKey ?? DEFAULT_PUBLIC_KEY;
    this._licenseServerUrl =
      options?.licenseServerUrl ?? "https://license.testforge.io/verify";

    // Initialize JWKS if URL is provided
    if (this._licenseServerUrl) {
      try {
        this._jwks = createRemoteJWKSet(
          new URL(`${this._licenseServerUrl}/.well-known/jwks.json`)
        );
      } catch {
        log("Failed to initialize JWKS, falling back to static key");
      }
    }
  }

  /**
   * Verifies a license key and returns the License object or null
   *
   * @param key - JWT-encoded license key
   * @returns Verified License object or null if invalid
   */
  async verifyLicenseKey(key: string): Promise<License | null> {
    this._lastVerificationAttempt = new Date();

    try {
      // Attempt JWT verification
      const payload = await this._verifyJwt(key);
      if (!payload) {
        log("JWT verification failed");
        return this._handleVerificationFailure(key);
      }

      // Build license object from JWT payload
      this._license = this._payloadToLicense(payload);
      log("License verified successfully: %s (%s)", this._license.id, this._license.type);
      return this._license;
    } catch (error) {
      log("License verification error: %O", error);
      return this._handleVerificationFailure(key);
    }
  }

  /**
   * Checks if a specific enterprise feature is available
   *
   * @param feature - The EE feature to check
   * @returns true if the feature is available (CE always has basic features)
   */
  check(feature: EEFeature): boolean {
    // Community Edition has no EE features
    if (!this._license) {
      log("No license present, feature %s unavailable", feature);
      return false;
    }

    // CE type never has EE features
    if (this._license.type === "CE") {
      log("CE license, feature %s unavailable", feature);
      return false;
    }

    // Check if feature is in the license
    const hasFeature = this._license.features.includes(feature);
    log(
      "Feature %s %s for %s license",
      feature,
      hasFeature ? "available" : "unavailable",
      this._license.type
    );
    return hasFeature;
  }

  /**
   * Convenience method to check if a named feature is enabled.
   *
   * Accepts a plain string so callers don't need to import EEFeature.
   * Reads TESTFORGE_LICENSE_KEY from the environment — if no key is set
   * all enterprise features return false (Community Edition mode).
   *
   * @param feature - Feature name string (must match an EEFeature value)
   * @returns true if the feature is available under the current license
   *
   * @example
   * ```ts
   * const manager = new LicenseManager();
   * if (manager.isFeatureEnabled("compliance-gdpr")) {
   *   // run GDPR compliance audit
   * }
   * ```
   */
  isFeatureEnabled(feature: string): boolean {
    // If no license key is set in the environment, we're in CE mode
    const envKey = process.env.TESTFORGE_LICENSE_KEY;
    if (!envKey && !this._license) {
      log("No TESTFORGE_LICENSE_KEY in env, CE mode — feature %s unavailable", feature);
      return false;
    }

    // Validate the feature string against known EE features
    const parsed = EEFeatureSchema.safeParse(feature);
    if (!parsed.success) {
      log("Unknown feature name: %s", feature);
      return false;
    }

    return this.check(parsed.data);
  }

  /**
   * Returns the current license, or null if none is loaded
   */
  get license(): License | null {
    return this._license;
  }

  /**
   * Returns whether we're operating in offline/grace period mode
   */
  get isOffline(): boolean {
    return (
      this._gracePeriodEnd !== null && this._gracePeriodEnd > new Date()
    );
  }

  /**
   * Returns the timestamp of the last license verification attempt
   */
  get lastVerificationAttempt(): Date | null {
    return this._lastVerificationAttempt;
  }

  /**
   * Attempts to verify a JWT license token
   */
  private async _verifyJwt(key: string): Promise<LicensePayload | null> {
    try {
      // Try JWKS first if available
      if (this._jwks) {
        const { payload } = await jwtVerify<LicensePayload>(key, this._jwks, {
          issuer: "testforge.io",
          audience: "testforge-client",
        });
        return payload;
      }

      // Fall back to static public key
      const encoder = new TextEncoder();
      const { payload } = await jwtVerify<LicensePayload>(
        key,
        encoder.encode(this._publicKey)
      );
      return payload;
    } catch (error) {
      log("JWT verify failed: %O", error);
      return null;
    }
  }

  /**
   * Handles verification failure with grace period logic
   */
  private async _handleVerificationFailure(
    _key: string
  ): Promise<License | null> {
    // If we were previously verified and within grace period, allow operation
    if (
      this._license &&
      this._gracePeriodEnd &&
      new Date() < this._gracePeriodEnd
    ) {
      log("Operating in grace period until %s", this._gracePeriodEnd.toISOString());
      this._license.status = "grace-period";
      return this._license;
    }

    // Set grace period for future offline operation
    this._gracePeriodEnd = new Date();
    this._gracePeriodEnd.setDate(
      this._gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS
    );

    if (this._license) {
      this._license.status = "offline";
      log(
        "License server unreachable, grace period until %s",
        this._gracePeriodEnd.toISOString()
      );
      return this._license;
    }

    return null;
  }

  /**
   * Converts a JWT payload to a License object
   */
  private _payloadToLicense(payload: LicensePayload): License {
    const status: LicenseStatus =
      payload.exp * 1000 < Date.now() ? "expired" : "valid";

    return {
      id: payload.sub,
      holder: payload.holder,
      type: payload.type,
      features: payload.features,
      expiresAt: new Date(payload.exp * 1000),
      issuedAt: new Date(payload.iat * 1000),
      status,
      maxSeats: payload.seats,
      currentSeats: payload.seats, // TODO: track actual usage
    };
  }
}
