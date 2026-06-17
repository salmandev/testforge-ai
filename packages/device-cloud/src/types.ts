/**
 * Device capabilities specification for session launch
 */
export interface Capabilities {
  /** Platform name (iOS, Android, Windows, macOS, Linux) */
  platformName: string;
  /** Platform version (e.g., "17.0", "14") */
  platformVersion?: string;
  /** Device name (e.g., "iPhone 15 Pro", "Pixel 8") */
  deviceName?: string;
  /** Browser to launch (chromium, firefox, safari, chrome) */
  browserName?: string;
  /** Whether to run in headed mode */
  headed?: boolean;
  /** Screen resolution (e.g., "1920x1080") */
  resolution?: string;
  /** App package/activity for mobile */
  appPackage?: string;
  appActivity?: string;
  /** Automation name for Appium */
  automationName?: string;
  /** Additional custom capabilities */
  extraCapabilities?: Record<string, unknown>;
}

/**
 * A device available for test execution
 */
export interface Device {
  /** Unique device identifier */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Device platform */
  platform: "ios" | "android" | "windows" | "macos" | "linux" | "web";
  /** Platform version */
  platformVersion: string;
  /** Device model/manufacturer */
  model: string;
  /** Screen resolution */
  resolution: { width: number; height: number };
  /** Whether the device is currently available */
  available: boolean;
  /** Provider this device belongs to */
  providerId: string;
  /** Device orientation support */
  orientations: ("portrait" | "landscape")[];
}

/**
 * An active device session
 */
export interface Session {
  /** Session identifier */
  sessionId: string;
  /** Device being used */
  device: Device;
  /** WebSocket URL for video streaming */
  videoStreamUrl?: string;
  /** WebDriver remote URL */
  remoteUrl: string;
  /** Session capabilities negotiated */
  capabilities: Capabilities;
  /** When the session started */
  startedAt: Date;
  /** Session timeout timestamp */
  expiresAt: Date;
}

/**
 * DeviceCloudProvider interface — abstracts device/grid backends
 *
 * Implementations:
 * - LocalProvider: connected USB devices via ADB/libimobiledevice
 * - TestForgeCloudProvider: TestForge's own cloud (EE)
 * - BrowserStackAdapter: BrowserStack grid
 * - SauceLabsAdapter: Sauce Labs grid
 * - LambdaTestAdapter: LambdaTest grid
 */
export interface DeviceCloudProvider {
  /** Provider identifier */
  readonly providerId: string;

  /**
   * List all available devices from this provider
   */
  getDevices(): Promise<Device[]>;

  /**
   * Launch a new device session with the specified capabilities
   */
  launchSession(deviceId: string, caps: Capabilities): Promise<Session>;

  /**
   * Stream video from a device session as an async generator of frames
   */
  streamVideo(sessionId: string): AsyncGenerator<Buffer, void, unknown>;

  /**
   * End a device session and release resources
   */
  endSession(sessionId: string): Promise<void>;
}
