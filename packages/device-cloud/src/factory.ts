import type { DeviceCloudProvider, Device, Capabilities, Session } from "../types.js";
import { LocalProvider } from "../providers/local.js";
import { TestForgeCloudProvider } from "../providers/testforge-cloud.js";
import { BrowserStackAdapter } from "../providers/browserstack.js";
import { SauceLabsAdapter } from "../providers/saucelabs.js";
import { LambdaTestAdapter } from "../providers/lambdatest.js";
import { GridManager } from "../grid-manager.js";
import debug from "debug";

const log = debug("testforge:device-cloud:factory");

/**
 * Configuration for DeviceCloudFactory
 */
export interface DeviceCloudFactoryConfig {
  /** Enable local device detection */
  enableLocal?: boolean;
  /** TestForge Cloud API key (EE) */
  testforgeApiKey?: string;
  /** BrowserStack credentials */
  browserstack?: { username: string; accessKey: string };
  /** SauceLabs credentials */
  saucelabs?: { username: string; accessKey: string };
  /** LambdaTest credentials */
  lambdatest?: { username: string; accessKey: string };
  /** Custom providers to register */
  customProviders?: DeviceCloudProvider[];
}

/**
 * Capability mapping from abstract requirements to concrete capabilities
 */
export interface MappedCapabilities {
  /** Platform name normalized */
  platformName: string;
  /** Recommended platform version */
  platformVersion?: string;
  /** Recommended device name */
  deviceName?: string;
  /** Recommended browser */
  browserName?: string;
  /** Screen resolution */
  resolution?: string;
  /** Appium automation name */
  automationName?: string;
  /** Provider-specific extra caps */
  providerCaps: Record<string, Record<string, unknown>>;
}

/**
 * Maps abstract device requirements to concrete capabilities per provider
 */
export class CapabilityMapper {
  private static readonly DEVICE_DATABASE: Record<string, {
    platform: string;
    version: string;
    resolution: string;
    browser: string;
  }> = {
    "iphone-15-pro": { platform: "iOS", version: "17.0", resolution: "1179x2556", browser: "safari" },
    "iphone-15": { platform: "iOS", version: "17.0", resolution: "1179x2556", browser: "safari" },
    "iphone-14": { platform: "iOS", version: "16.0", resolution: "1170x2532", browser: "safari" },
    "pixel-8": { platform: "Android", version: "14", resolution: "1080x2400", browser: "chrome" },
    "pixel-7": { platform: "Android", version: "14", resolution: "1080x2400", browser: "chrome" },
    "samsung-s24": { platform: "Android", version: "14", resolution: "1080x2340", browser: "chrome" },
    "samsung-s23": { platform: "Android", version: "13", resolution: "1080x2340", browser: "chrome" },
    "ipad-pro": { platform: "iOS", version: "17.0", resolution: "2048x2732", browser: "safari" },
    "galaxy-tab": { platform: "Android", version: "14", resolution: "1600x2560", browser: "chrome" },
  };

  /**
   * Map abstract requirements to concrete capabilities for each provider
   */
  static map(requirements: {
    platform?: string;
    device?: string;
    browser?: string;
    version?: string;
    resolution?: string;
  }): MappedCapabilities {
    const deviceKey = requirements.device?.toLowerCase().replace(/\s+/g, "-") ?? "";
    const deviceInfo = this.DEVICE_DATABASE[deviceKey];

    const platform = requirements.platform ?? deviceInfo?.platform ?? "web";
    const platformVersion = requirements.version ?? deviceInfo?.version;
    const browser = requirements.browser ?? deviceInfo?.browser ?? "chromium";
    const resolution = requirements.resolution ?? deviceInfo?.resolution;

    const isMobile = platform.toLowerCase() === "ios" || platform.toLowerCase() === "android";
    const isIos = platform.toLowerCase() === "ios";
    const isAndroid = platform.toLowerCase() === "android";

    return {
      platformName: platform,
      platformVersion,
      deviceName: requirements.device,
      browserName: browser,
      resolution,
      automationName: isIos ? "XCUITest" : isAndroid ? "UiAutomator2" : undefined,
      providerCaps: {
        browserstack: {
          "bstack:options": {
            os: isMobile ? (isIos ? "ios" : "android") : "Windows",
            osVersion: platformVersion,
            deviceName: requirements.device,
            buildName: `TestForge-${Date.now()}`,
          },
        },
        saucelabs: {
          "sauce:options": {
            platformName: platform,
            browserName: browser,
            browserVersion: platformVersion ?? "latest",
            deviceName: requirements.device,
          },
        },
        lambdatest: {
          "lt:options": {
            platformName: platform,
            browserName: browser,
            browserVersion: platformVersion ?? "latest",
            deviceName: requirements.device,
            build: `TestForge-${Date.now()}`,
          },
        },
      },
    };
  }

  /**
   * Get list of known devices
   */
  static getKnownDevices(): string[] {
    return Object.keys(this.DEVICE_DATABASE);
  }
}

/**
 * DeviceCloudFactory creates and configures device cloud providers and grid managers
 *
 * @example
 * ```ts
 * const grid = DeviceCloudFactory.create({
 *   enableLocal: true,
 *   browserstack: { username: "user", accessKey: "key" },
 * });
 * const devices = await grid.getAllDevices();
 * ```
 */
export class DeviceCloudFactory {
  /**
   * Create a fully configured GridManager from factory config
   */
  static create(config: DeviceCloudFactoryConfig = {}): GridManager {
    const providers = this.createProviders(config);

    return new GridManager({
      providers: providers.map((p, i) => ({
        provider: p,
        priority: i,
        enabled: true,
      })),
    });
  }

  /**
   * Create provider instances from config
   */
  static createProviders(config: DeviceCloudFactoryConfig): DeviceCloudProvider[] {
    const providers: DeviceCloudProvider[] = [];

    // 1. Local devices (highest priority)
    if (config.enableLocal !== false) {
      providers.push(new LocalProvider());
      log("Added LocalProvider");
    }

    // 2. TestForge Cloud (EE)
    if (config.testforgeApiKey) {
      providers.push(new TestForgeCloudProvider({ apiKey: config.testforgeApiKey }));
      log("Added TestForgeCloudProvider");
    }

    // 3. BrowserStack
    if (config.browserstack) {
      providers.push(new BrowserStackAdapter({
        username: config.browserstack.username,
        accessKey: config.browserstack.accessKey,
      }));
      log("Added BrowserStackAdapter");
    }

    // 4. SauceLabs
    if (config.saucelabs) {
      providers.push(new SauceLabsAdapter({
        username: config.saucelabs.username,
        accessKey: config.saucelabs.accessKey,
      }));
      log("Added SauceLabsAdapter");
    }

    // 5. LambdaTest
    if (config.lambdatest) {
      providers.push(new LambdaTestAdapter({
        username: config.lambdatest.username,
        accessKey: config.lambdatest.accessKey,
      }));
      log("Added LambdaTestAdapter");
    }

    // 6. Custom providers
    if (config.customProviders) {
      providers.push(...config.customProviders);
      log("Added %d custom provider(s)", config.customProviders.length);
    }

    log("DeviceCloudFactory: %d providers configured", providers.length);
    return providers;
  }

  /**
   * Quick-start: create grid and launch session in one call
   */
  static async quickLaunch(config: DeviceCloudFactoryConfig, requirements: {
    platform?: string;
    device?: string;
    browser?: string;
    version?: string;
  }): Promise<{ session: Session; provider: DeviceCloudProvider; grid: GridManager }> {
    const grid = this.create(config);
    const caps = CapabilityMapper.map(requirements);

    const { device, provider } = await grid.selectDevice({
      platformName: caps.platformName,
      platformVersion: caps.platformVersion,
      deviceName: caps.deviceName,
      browserName: caps.browserName,
    });

    const session = await provider.launchSession(device.id, {
      platformName: caps.platformName,
      platformVersion: caps.platformVersion,
      deviceName: caps.deviceName,
      browserName: caps.browserName,
      automationName: caps.automationName,
      extraCapabilities: caps.providerCaps[provider.providerId],
    });

    return { session, provider, grid };
  }
}
