import type { DeviceCloudProvider, Device, Session, Capabilities } from "../types.js";
import axios from "axios";
import debug from "debug";

const log = debug("testforge:device-cloud:lambdatest");

/**
 * Configuration for LambdaTest adapter
 */
export interface LambdaTestConfig {
  /** LambdaTest username */
  username: string;
  /** LambdaTest access key */
  accessKey: string;
  /** LambdaTest REST API URL */
  baseUrl?: string;
}

/**
 * LambdaTestAdapter translates TestForge's DeviceCloudProvider interface
 * to LambdaTest's REST API
 */
export class LambdaTestAdapter implements DeviceCloudProvider {
  readonly providerId = "lambdatest";

  private readonly username: string;
  private readonly accessKey: string;
  private readonly baseUrl: string;

  constructor(config: LambdaTestConfig) {
    this.username = config.username;
    this.accessKey = config.accessKey;
    this.baseUrl = config.baseUrl ?? "https://mobile-api.lambdatest.com";
  }

  async getDevices(): Promise<Device[]> {
    log("Fetching LambdaTest devices");

    try {
      const response = await axios.get(`${this.baseUrl}/framework/v3/devices`, {
        auth: { username: this.username, password: this.accessKey },
      });

      const devices: Device[] = [];

      for (const device of response.data?.data ?? []) {
        if (device.isRealDevice && device.deviceType === "mobile") {
          devices.push({
            id: `lt-${device.os}-${device.deviceName}`,
            name: device.deviceName,
            platform: device.os === "android" ? "android" : "ios",
            platformVersion: device.osVersion,
            model: device.deviceName,
            resolution: {
              width: device.width ?? 1080,
              height: device.height ?? 1920,
            },
            available: device.available ?? true,
            providerId: this.providerId,
            orientations: ["portrait", "landscape"],
          });
        }
      }

      log("Found %d LambdaTest devices", devices.length);
      return devices;
    } catch (error) {
      log("Failed to fetch LambdaTest devices: %O", error);
      return [];
    }
  }

  async launchSession(deviceId: string, caps: Capabilities): Promise<Session> {
    log("Launching LambdaTest session: %s", deviceId);

    const response = await axios.post(
      `${this.baseUrl}/framework/v3/start-test`,
      {
        devices: [deviceId],
        capabilities: {
          platformName: caps.platformName,
          deviceName: caps.deviceName,
          platformVersion: caps.platformVersion,
          app: caps.appPackage,
          isRealMobile: true,
          network: "wifi",
          ...caps.extraCapabilities,
        },
      },
      {
        auth: { username: this.username, password: this.accessKey },
      }
    );

    const data = response.data?.data;
    const device = (await this.getDevices()).find((d) => d.id === deviceId);

    return {
      sessionId: data?.testId ?? `lt-session-${Date.now()}`,
      device: device!,
      videoStreamUrl: data?.devToolsUrl,
      remoteUrl: "https://mobile-hub.lambdatest.com/wd/hub",
      capabilities: caps,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    };
  }

  async *streamVideo(sessionId: string): AsyncGenerator<Buffer, void, unknown> {
    log("LambdaTest video streaming for session: %s", sessionId);
    // LambdaTest provides devToolsUrl for live streaming
    return;
  }

  async endSession(sessionId: string): Promise<void> {
    log("Ending LambdaTest session: %s", sessionId);

    try {
      await axios.put(
        `${this.baseUrl}/framework/v3/stop-test/${sessionId}`,
        {},
        { auth: { username: this.username, password: this.accessKey } }
      );
    } catch (error) {
      log("Failed to end LambdaTest session: %O", error);
    }
  }
}
