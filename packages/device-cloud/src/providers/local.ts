import type { DeviceCloudProvider, Device, Session, Capabilities } from "../types.js";
import debug from "debug";
import { execSync } from "node:child_process";

const log = debug("testforge:device-cloud:local");

/**
 * Configuration for the LocalProvider
 */
export interface LocalProviderConfig {
  /** ADB path (default: "adb") */
  adbPath?: string;
  /** Enable iOS device detection via libimobiledevice */
  enableIos?: boolean;
  /** idevice_id path (default: "idevice_id") */
  idevicePath?: string;
}

/**
 * LocalProvider detects and manages connected USB devices
 *
 * Android: Uses ADB (Android Debug Bridge)
 * iOS: Uses libimobiledevice (idevice_id)
 */
export class LocalProvider implements DeviceCloudProvider {
  readonly providerId = "local";

  private readonly adbPath: string;
  private readonly enableIos: boolean;

  constructor(config: LocalProviderConfig = {}) {
    this.adbPath = config.adbPath ?? "adb";
    this.enableIos = config.enableIos ?? true;
  }

  async getDevices(): Promise<Device[]> {
    const devices: Device[] = [];

    // Detect Android devices via ADB
    try {
      const adbDevices = this._runCommand(`${this.adbPath} devices`);
      const lines = adbDevices.split("\n").slice(1);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("*") || !trimmed.includes("device")) {
          continue;
        }

        const [serial, state] = trimmed.split(/\s+/);
        if (state !== "device") continue;

        const deviceInfo = this._getAndroidDeviceInfo(serial!);
        devices.push({
          id: `local-android-${serial}`,
          name: deviceInfo.model ?? `Android Device (${serial})`,
          platform: "android",
          platformVersion: deviceInfo.platformVersion ?? "unknown",
          model: deviceInfo.model ?? serial ?? "unknown",
          resolution: { width: 1080, height: 1920 },
          available: true,
          providerId: this.providerId,
          orientations: ["portrait", "landscape"],
        });
      }
    } catch (error) {
      log("ADB device detection failed: %O", error);
    }

    // Detect iOS devices via libimobiledevice
    if (this.enableIos) {
      try {
        const iosDevices = this._runCommand(`idevice_id -l`);
        const udidList = iosDevices
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        for (const udid of udidList) {
          const deviceInfo = this._getIosDeviceInfo(udid);
          devices.push({
            id: `local-ios-${udid}`,
            name: deviceInfo.productName ?? `iOS Device (${udid?.substring(0, 8)}...)`,
            platform: "ios",
            platformVersion: deviceInfo.productVersion ?? "unknown",
            model: deviceInfo.productType ?? "unknown",
            resolution: { width: 1179, height: 2556 },
            available: true,
            providerId: this.providerId,
            orientations: ["portrait", "landscape"],
          });
        }
      } catch (error) {
        log("iOS device detection failed: %O", error);
      }
    }

    log("Found %d local devices", devices.length);
    return devices;
  }

  async launchSession(deviceId: string, caps: Capabilities): Promise<Session> {
    log("Launching local session: %s", deviceId);

    const device = (await this.getDevices()).find((d) => d.id === deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (!device.available) {
      throw new Error(`Device not available: ${device.name}`);
    }

    // For local devices, the "session" is the local ADB/USB connection
    const session: Session = {
      sessionId: `local-session-${Date.now()}`,
      device,
      remoteUrl: "http://localhost:4723",
      capabilities: caps,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
    };

    log("Local session created: %s", session.sessionId);
    return session;
  }

  async *streamVideo(_sessionId: string): AsyncGenerator<Buffer, void, unknown> {
    // Local provider doesn't support video streaming directly
    // Video recording is handled by Appium/Playwright
    log("Video streaming not supported for local provider");
    return;
  }

  async endSession(sessionId: string): Promise<void> {
    log("Ending local session: %s", sessionId);
    // No explicit teardown for local devices
  }

  /**
   * Run a shell command and return output
   */
  private _runCommand(command: string): string {
    return execSync(command, { encoding: "utf-8", timeout: 5000 });
  }

  /**
   * Get Android device info via adb shell
   */
  private _getAndroidDeviceInfo(serial: string): {
    model?: string;
    platformVersion?: string;
    product?: string;
  } {
    try {
      const model = this._runCommand(
        `${this.adbPath} -s ${serial} shell getprop ro.product.model`
      ).trim();
      const platformVersion = this._runCommand(
        `${this.adbPath} -s ${serial} shell getprop ro.build.version.release`
      ).trim();
      const product = this._runCommand(
        `${this.adbPath} -s ${serial} shell getprop ro.product.name`
      ).trim();

      return { model, platformVersion, product };
    } catch {
      return {};
    }
  }

  /**
   * Get iOS device info via ideviceinfo
   */
  private _getIosDeviceInfo(udid: string): {
    productName?: string;
    productVersion?: string;
    productType?: string;
  } {
    try {
      const productName = this._runCommand(
        `ideviceinfo -u ${udid} -k ProductName`
      ).trim();
      const productVersion = this._runCommand(
        `ideviceinfo -u ${udid} -k ProductVersion`
      ).trim();
      const productType = this._runCommand(
        `ideviceinfo -u ${udid} -k ProductType`
      ).trim();

      return { productName, productVersion, productType };
    } catch {
      return {};
    }
  }
}
