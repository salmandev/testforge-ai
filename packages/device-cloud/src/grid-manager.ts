import type { DeviceCloudProvider, Device, Session, Capabilities } from "./types.js";
import debug from "debug";

const log = debug("testforge:device-cloud:grid-manager");

/**
 * Configuration for the GridManager
 */
export interface GridManagerConfig {
  /** Ordered list of provider preferences */
  providers: ProviderEntry[];
}

/**
 * A provider entry with priority and configuration
 */
export interface ProviderEntry {
  /** Provider instance */
  provider: DeviceCloudProvider;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this provider is enabled */
  enabled?: boolean;
}

/**
 * GridManager distributes test runs across available device providers
 *
 * Priority order (default):
 * 1. Local devices (ADB/USB)
 * 2. TestForge Cloud (EE)
 * 3. BrowserStack
 * 4. SauceLabs
 * 5. LambdaTest
 */
export class GridManager {
  private readonly _providers: ProviderEntry[];

  constructor(config: GridManagerConfig) {
    this._providers = config.providers
      .filter((p) => p.enabled !== false)
      .sort((a, b) => a.priority - b.priority);

    log("GridManager initialized with %d providers", this._providers.length);
  }

  /**
   * Get all available devices across all providers
   */
  async getAllDevices(): Promise<Device[]> {
    const allDevices: Device[] = [];

    for (const entry of this._providers) {
      try {
        const devices = await entry.provider.getDevices();
        allDevices.push(...devices);
      } catch (error) {
        log("Failed to get devices from %s: %O", entry.provider.providerId, error);
      }
    }

    log("Total devices available across providers: %d", allDevices.length);
    return allDevices;
  }

  /**
   * Get devices from a specific provider
   */
  async getDevicesByProvider(providerId: string): Promise<Device[]> {
    const entry = this._providers.find((p) => p.provider.providerId === providerId);
    if (!entry) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    return entry.provider.getDevices();
  }

  /**
   * Select the best device for a given capability set, using priority order
   */
  async selectDevice(caps: Capabilities): Promise<{ device: Device; provider: DeviceCloudProvider }> {
    for (const entry of this._providers) {
      try {
        const devices = await entry.provider.getDevices();
        const available = devices.filter((d) => d.available);

        // Match by platform
        const platformMatch = available.find((d) => {
          const platformLower = caps.platformName?.toLowerCase() ?? "";
          return (
            d.platform === platformLower ||
            (platformLower.includes("android") && d.platform === "android") ||
            (platformLower.includes("ios") && d.platform === "ios")
          );
        });

        if (platformMatch) {
          log("Selected device %s from provider %s", platformMatch.id, entry.provider.providerId);
          return { device: platformMatch, provider: entry.provider };
        }
      } catch (error) {
        log("Provider %s failed during selection: %O", entry.provider.providerId, error);
      }
    }

    throw new Error(
      "No suitable device found. Check provider connectivity and device availability."
    );
  }

  /**
   * Launch a session on the selected device
   */
  async launchSession(
    deviceId: string,
    caps: Capabilities
  ): Promise<{ session: Session; provider: DeviceCloudProvider }> {
    // Find which provider owns this device
    for (const entry of this._providers) {
      try {
        const devices = await entry.provider.getDevices();
        const device = devices.find((d) => d.id === deviceId);

        if (device) {
          const session = await entry.provider.launchSession(deviceId, caps);
          log("Session launched on provider %s: %s", entry.provider.providerId, session.sessionId);
          return { session, provider: entry.provider };
        }
      } catch (error) {
        log("Provider %s failed during session launch: %O", entry.provider.providerId, error);
      }
    }

    throw new Error(`Device not found in any provider: ${deviceId}`);
  }

  /**
   * End a session on the appropriate provider
   */
  async endSession(sessionId: string, provider: DeviceCloudProvider): Promise<void> {
    log("Ending session %s on provider %s", sessionId, provider.providerId);
    await provider.endSession(sessionId);
  }

  /**
   * Stream video from a session
   */
  streamVideo(sessionId: string, provider: DeviceCloudProvider): AsyncGenerator<Buffer, void, unknown> {
    return provider.streamVideo(sessionId);
  }

  /**
   * Get all registered providers
   */
  getProviders(): { providerId: string; priority: number }[] {
    return this._providers.map((p) => ({
      providerId: p.provider.providerId,
      priority: p.priority,
    }));
  }
}
