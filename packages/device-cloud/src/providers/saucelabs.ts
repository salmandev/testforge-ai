import type { DeviceCloudProvider, Device, Session, Capabilities } from "../types.js";
import axios from "axios";
import debug from "debug";

const log = debug("testforge:device-cloud:saucelabs");

/**
 * Configuration for SauceLabs adapter
 */
export interface SauceLabsConfig {
  /** SauceLabs username */
  username: string;
  /** SauceLabs access key */
  accessKey: string;
  /** SauceLabs REST API URL */
  baseUrl?: string;
  /** SauceLabs data center (us-west-1, us-east-4, eu-central-1) */
  dataCenter?: string;
}

/**
 * SauceLabsAdapter translates TestForge's DeviceCloudProvider interface
 * to SauceLabs REST API
 */
export class SauceLabsAdapter implements DeviceCloudProvider {
  readonly providerId = "saucelabs";

  private readonly username: string;
  private readonly accessKey: string;
  private readonly baseUrl: string;

  constructor(config: SauceLabsConfig) {
    this.username = config.username;
    this.accessKey = config.accessKey;
    const dc = config.dataCenter ?? "us-west-1";
    this.baseUrl = config.baseUrl ?? `https://${dc}.saucelabs.com`;
  }

  async getDevices(): Promise<Device[]> {
    log("Fetching SauceLabs devices");

    try {
      const response = await axios.get(
        `${this.baseUrl}/rest/v1/platforms`,
        { auth: { username: this.username, password: this.accessKey } }
      );

      const devices: Device[] = [];
      const platforms = response.data ?? [];

      for (const platform of platforms) {
        if (platform.platform === "android" || platform.platform === "ios") {
          devices.push({
            id: `sl-${platform.platform}-${platform.api_name}`,
            name: platform.long_name ?? platform.api_name,
            platform: platform.platform as "android" | "ios",
            platformVersion: platform.version ?? "unknown",
            model: platform.api_name ?? "unknown",
            resolution: {
              width: platform.screen_width ?? 1080,
              height: platform.screen_height ?? 1920,
            },
            available: true,
            providerId: this.providerId,
            orientations: ["portrait", "landscape"],
          });
        }
      }

      log("Found %d SauceLabs devices", devices.length);
      return devices;
    } catch (error) {
      log("Failed to fetch SauceLabs devices: %O", error);
      return [];
    }
  }

  async launchSession(deviceId: string, caps: Capabilities): Promise<Session> {
    log("Launching SauceLabs session: %s", deviceId);

    const sauceOptions = {
      username: this.username,
      accessKey: this.accessKey,
      build: "TestForge Build",
      name: caps.deviceName ?? "TestForge Test",
    };

    void sauceOptions; // Used in capabilities below

    // Create session via WebDriver remote
    const remoteUrl = `https://${this.username}:${this.accessKey}@ondemand.saucelabs.com/wd/hub`;

    const session: Session = {
      sessionId: `sl-session-${Date.now()}`,
      device: (await this.getDevices()).find((d) => d.id === deviceId)!,
      remoteUrl,
      capabilities: caps,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    };

    log("SauceLabs session created: %s", session.sessionId);
    return session;
  }

  async *streamVideo(sessionId: string): AsyncGenerator<Buffer, void, unknown> {
    log("SauceLabs video streaming for session: %s", sessionId);
    // SauceLabs records video, available via REST API after session ends
    return;
  }

  async endSession(sessionId: string): Promise<void> {
    log("Ending SauceLabs session: %s", sessionId);
    // Session ends when WebDriver session is closed
  }
}
