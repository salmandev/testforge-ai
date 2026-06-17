import type { DeviceCloudProvider, Device, Session, Capabilities } from "../types.js";
import axios from "axios";
import debug from "debug";

const log = debug("testforge:device-cloud:testforge");

/**
 * Configuration for TestForge Cloud Provider
 */
export interface TestForgeCloudConfig {
  /** TestForge cloud API URL */
  baseUrl?: string;
  /** API key for authentication */
  apiKey: string;
  /** Organization ID */
  orgId?: string;
}

/**
 * TestForgeCloudProvider connects to TestForge's own device cloud (EE)
 */
export class TestForgeCloudProvider implements DeviceCloudProvider {
  readonly providerId = "testforge-cloud";

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly orgId: string;

  constructor(config: TestForgeCloudConfig) {
    this.baseUrl = config.baseUrl ?? "https://cloud.testforge.io";
    this.apiKey = config.apiKey;
    this.orgId = config.orgId ?? "default";
  }

  async getDevices(): Promise<Device[]> {
    log("Fetching devices from TestForge cloud");

    try {
      const response = await axios.get(`${this.baseUrl}/api/devices`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "X-Org-Id": this.orgId,
        },
      });

      const devices: Device[] = response.data.devices.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        name: d.name as string,
        platform: d.platform as Device["platform"],
        platformVersion: d.platformVersion as string,
        model: d.model as string,
        resolution: d.resolution as { width: number; height: number },
        available: (d.available as boolean) ?? false,
        providerId: this.providerId,
        orientations: (d.orientations as string[]) ?? ["portrait"],
      }));

      log("Found %d cloud devices", devices.length);
      return devices;
    } catch (error) {
      log("Failed to fetch cloud devices: %O", error);
      return [];
    }
  }

  async launchSession(deviceId: string, caps: Capabilities): Promise<Session> {
    log("Launching cloud session for device: %s", deviceId);

    const response = await axios.post(
      `${this.baseUrl}/api/devices/${deviceId}/session`,
      { capabilities: caps, orgId: this.orgId },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = response.data;
    const device = (await this.getDevices()).find((d) => d.id === deviceId);

    if (!device) {
      throw new Error(`Device not found after session creation: ${deviceId}`);
    }

    return {
      sessionId: data.sessionId as string,
      device,
      videoStreamUrl: data.videoStreamUrl as string | undefined,
      remoteUrl: data.remoteUrl as string,
      capabilities: caps,
      startedAt: new Date(),
      expiresAt: new Date(data.expiresAt as string),
    };
  }

  async *streamVideo(sessionId: string): AsyncGenerator<Buffer, void, unknown> {
    log("Streaming video for session: %s", sessionId);

    // Connect to WebSocket video stream
    const { default: WebSocket } = await import("ws");

    const wsUrl = `${this.baseUrl}/api/sessions/${sessionId}/video?token=${this.apiKey}`;
    const ws = new WebSocket(wsUrl);

    const messageQueue: Buffer[] = [];
    let error: Error | null = null;
    let closed = false;

    ws.on("message", (data) => {
      if (data instanceof Buffer) {
        messageQueue.push(data);
      }
    });

    ws.on("error", (err) => {
      error = err as Error;
    });

    ws.on("close", () => {
      closed = true;
    });

    try {
      while (!closed && !error) {
        if (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          if (msg) yield msg;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (error) {
        log("Video stream error: %O", error);
      }
    } finally {
      ws.close();
    }
  }

  async endSession(sessionId: string): Promise<void> {
    log("Ending cloud session: %s", sessionId);

    try {
      await axios.delete(`${this.baseUrl}/api/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
    } catch (error) {
      log("Failed to end cloud session: %O", error);
    }
  }
}
