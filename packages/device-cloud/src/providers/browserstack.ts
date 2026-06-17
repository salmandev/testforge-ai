import type { DeviceCloudProvider, Device, Session, Capabilities } from "../types.js";
import axios from "axios";
import debug from "debug";

const log = debug("testforge:device-cloud:browserstack");

/**
 * Configuration for BrowserStack adapter
 */
export interface BrowserStackConfig {
  /** BrowserStack username */
  username: string;
  /** BrowserStack access key */
  accessKey: string;
  /** BrowserStack REST API URL */
  baseUrl?: string;
}

/**
 * BrowserStackAdapter translates TestForge's DeviceCloudProvider interface
 * to BrowserStack's REST API
 */
export class BrowserStackAdapter implements DeviceCloudProvider {
  readonly providerId = "browserstack";

  private readonly username: string;
  private readonly accessKey: string;
  private readonly baseUrl: string;

  constructor(config: BrowserStackConfig) {
    this.username = config.username;
    this.accessKey = config.accessKey;
    this.baseUrl = config.baseUrl ?? "https://api.browserstack.com";
  }

  async getDevices(): Promise<Device[]> {
    log("Fetching BrowserStack devices");

    try {
      const response = await axios.get(`${this.baseUrl}/automate/devices.json`, {
        auth: { username: this.username, password: this.accessKey },
      });

      const devices: Device[] = [];

      // Parse Android devices
      for (const device of response.data.devices ?? []) {
        devices.push({
          id: `bs-android-${device.os_version}-${device.device}`,
          name: `${device.device} (${device.os_version})`,
          platform: "android",
          platformVersion: device.os_version,
          model: device.device,
          resolution: { width: 1080, height: 1920 },
          available: true,
          providerId: this.providerId,
          orientations: ["portrait", "landscape"],
        });
      }

      // Parse iOS devices
      for (const device of response.data.devices ?? []) {
        if (device.real_mobile === true || device.real_mobile === "true") {
          devices.push({
            id: `bs-ios-${device.os_version}-${device.device}`,
            name: `${device.device} (${device.os_version})`,
            platform: "ios",
            platformVersion: device.os_version,
            model: device.device,
            resolution: { width: 1179, height: 2556 },
            available: true,
            providerId: this.providerId,
            orientations: ["portrait", "landscape"],
          });
        }
      }

      log("Found %d BrowserStack devices", devices.length);
      return devices;
    } catch (error) {
      log("Failed to fetch BrowserStack devices: %O", error);
      return [];
    }
  }

  async launchSession(deviceId: string, caps: Capabilities): Promise<Session> {
    log("Launching BrowserStack session: %s", deviceId);

    // Parse device ID to extract os_version and device name
    const parts = deviceId.split("-");
    const platform = parts[1] as string;
    const osVersion = parts[2] ?? "14";
    const deviceName = parts.slice(3).join("-") ?? caps.deviceName ?? "Pixel 8";

    const response = await axios.post(
      `${this.baseUrl}/app-automate/session`,
      {
        capabilities: {
          platformName: platform === "ios" ? "ios" : "android",
          "appium:deviceName": deviceName,
          "appium:platformVersion": osVersion,
          "appium:automationName": caps.automationName ?? "UiAutomator2",
          "browserstack:userName": this.username,
          "browserstack:accessKey": this.accessKey,
          ...caps.extraCapabilities,
        },
      },
      {
        auth: { username: this.username, password: this.accessKey },
      }
    );

    const session = response.data;
    const device = (await this.getDevices()).find((d) => d.id === deviceId);

    return {
      sessionId: session.sessionId,
      device: device!,
      videoStreamUrl: session.browser_url,
      remoteUrl: session.appium_url ?? "https://hub.browserstack.com/wd/hub",
      capabilities: caps,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    };
  }

  async *streamVideo(sessionId: string): AsyncGenerator<Buffer, void, unknown> {
    log("BrowserStack video streaming via REST API for session: %s", sessionId);
    // BrowserStack provides video via their dashboard, not direct stream
    // In production, fetch video frames from their streaming endpoint
    return;
  }

  async endSession(sessionId: string): Promise<void> {
    log("Ending BrowserStack session: %s", sessionId);

    try {
      await axios.put(
        `${this.baseUrl}/app-automate/sessions/${sessionId}.json`,
        { status: "done" },
        { auth: { username: this.username, password: this.accessKey } }
      );
    } catch (error) {
      log("Failed to end BrowserStack session: %O", error);
    }
  }
}
