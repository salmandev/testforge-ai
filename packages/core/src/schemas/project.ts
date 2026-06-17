import { z } from "zod";

/**
 * Integration configuration for third-party services
 */
export const IntegrationConfigSchema = z.object({
  /** Slack webhook URL for notifications */
  slackWebhookUrl: z.string().url().optional(),
  /** Microsoft Teams webhook URL */
  teamsWebhookUrl: z.string().url().optional(),
  /** Email notification configuration */
  emailConfig: z
    .object({
      smtpHost: z.string(),
      smtpPort: z.number(),
      from: z.string().email(),
      to: z.array(z.string().email()),
    })
    .optional(),
  /** GitHub repository for PR creation */
  githubRepo: z.string().optional(),
  /** Jira project key for bug creation */
  jiraProjectKey: z.string().optional(),
});

export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

/**
 * Enterprise Edition feature flags
 */
export const EEFeatureSchema = z.enum([
  "compliance-nca-ecc",
  "compliance-sama-csf",
  "compliance-pci-dss",
  "compliance-gdpr",
  "compliance-iso-27001",
  "compliance-pdpl-sa",
  "device-cloud",
  "pdf-reports",
  "ai-agent",
  "visual-dna",
  "autonomous-testing",
  "team-collaboration",
  "sso-saml",
  "audit-logs",
  "custom-branding",
  "priority-support",
]);

export type EEFeature = z.infer<typeof EEFeatureSchema>;

/**
 * A project containing all test configuration
 */
export const ProjectSchema = z.object({
  /** Unique project identifier */
  id: z.string(),
  /** Human-readable project name */
  name: z.string(),
  /** Primary base URL of the application under test */
  baseUrl: z.string().url(),
  /** Named environment configurations */
  environments: z.record(z.string()).default({}),
  /** Third-party integration configurations */
  integrations: IntegrationConfigSchema.partial().default({}),
  /** Enabled enterprise license features */
  licenseFeatures: z.array(EEFeatureSchema).default([]),
  /** Default AI provider configuration */
  aiProvider: z
    .object({
      type: z.enum(["anthropic", "ollama"]),
      model: z.string().optional(),
      baseUrl: z.string().url().optional(),
    })
    .optional(),
  /** Default browser/device configuration */
  defaultBrowsers: z
    .array(
      z.object({
        browser: z.enum(["chromium", "firefox", "webkit"]),
        viewport: z.object({ width: z.number(), height: z.number() }).optional(),
        mobile: z.boolean().default(false),
      })
    )
    .default([{ browser: "chromium" }]),
  /** Project-level tags */
  tags: z.array(z.string()).default([]),
  /** Default execution timeout */
  defaultTimeout: z.number().default(30000),
  /** Screenshot capture mode */
  screenshotMode: z.enum(["off", "on-failure", "always"]).default("on-failure"),
  /** Video recording enabled */
  videoRecording: z.boolean().default(false),
  /** Trace recording for Playwright */
  traceRecording: z.boolean().default(false),
  /** Timestamp when project was created */
  createdAt: z.coerce.date().default(() => new Date()),
  /** Timestamp when project was last modified */
  updatedAt: z.coerce.date().optional(),
});

export type Project = z.infer<typeof ProjectSchema>;
