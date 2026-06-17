# TestForge AI — Project Context

## Project Overview

**TestForge AI** is an open-source, AI-powered test automation platform designed to compete with Katalon and BrowserStack. It provides end-to-end test automation capabilities across web, mobile, and API testing, powered by AI providers like Claude (Anthropic) and Ollama (local LLM).

The project is structured as a **TypeScript monorepo** (~75 source files) using **Bun** as the package manager and **Turborepo** for task orchestration. **All 9 packages build successfully** under TypeScript strict mode.

### Architecture

```
testforge-ai/
├── apps/
│   └── api/                # Fastify REST + WebSocket API server
├── packages/
│   ├── core/               # Zod schemas, typed EventBus, LicenseManager
│   ├── ai-engine/          # 12 AI modules with 7 test suites
│   ├── cli/                # Commander CLI with 10 commands
│   ├── web-runner/         # Playwright-based web test runner
│   ├── mobile-runner/      # Appium / WebdriverIO mobile test runner
│   ├── api-runner/         # REST, GraphQL, gRPC, WebSocket API test runner
│   ├── device-cloud/       # Device grid abstraction (5 providers)
│   └── reporter/           # Allure, AI narrative, PDF, notification reporters
├── docker/
│   ├── Dockerfile.api      # Multi-stage API container (Bun, non-root)
│   ├── Dockerfile.runner   # Multi-stage runner (Playwright + Appium)
│   └── docker-compose.yml  # Full stack with healthchecks + compose profiles
├── .env.example            # Environment variable template
├── eslint.config.js        # ESLint 9 flat config (typescript-eslint strict)
├── turbo.json              # Turborepo pipeline with caching
├── package.json            # Root workspace (Bun workspaces)
└── tsconfig.json           # Shared TypeScript strict config
```

### Package Dependency Flow

```
  @testforge/core ──► @testforge/ai-engine ──► web-runner, mobile-runner, api-runner, reporter
                  └──► @testforge/device-cloud ──► @testforge/cli (consumes all)
  apps/api ──► @testforge/core
```

---

## Implementation Status

### DONE (Fully Implemented, Builds Clean)

| Package | Files | Key Components |
|---|---|---|
| **@testforge/core** | 10 | Zod v3 schemas (Project, TestSuite, TestCase, Locator), typed EventBus (generic emit/on via Node EventEmitter), LicenseManager with JWT/JWKS + `isFeatureEnabled()` |
| **@testforge/ai-engine** | 24 | ClaudeProvider, OllamaProvider, ProviderFactory, TestGenerator, SelfHealer, FailureAnalyzer, IntentEngine, AutonomousAgent, VisualDNA, AccessibilityAuditor (axe-core), ComplianceChecker (6 frameworks), TestDataGenerator — **7 test suites** |
| **@testforge/cli** | 2 | 10 commands: init, generate, run, heal, agent, analyze, compliance, doctor, import, report |
| **@testforge/web-runner** | 2 | Playwright runner with self-healing hooks, failure capture, network/console logging |
| **@testforge/api-runner** | 6 | RestRunner (axios), ContractTester (schema validation); GrpcRunner/WebsocketRunner/GraphqlRunner have structure but protocol calls are stubbed |
| **@testforge/device-cloud** | 7 | GridManager, LocalProvider (ADB/xcrun), BrowserStack/SauceLabs/LambdaTest/TestForgeCloud providers (class structure, API calls stubbed) |
| **@testforge/reporter** | 6 | AllureReporter (XML), AiNarrativeReporter (AI summaries), types; PdfReporter/NotificationReporter have HTML generation but output is stubbed |
| **apps/api** | 11 | Fastify server, 7 route groups, WebSocket upgrade, Swagger, JWT auth config, rate limiting |
| **Docker** | 4 | Multi-stage Dockerfiles, docker-compose with PostgreSQL/Redis/Browserless/Ollama, healthchecks, compose profiles |
| **Scaffold** | ~20 | turbo.json, tsconfig.json, tsup.config.ts (per-package), vitest.config.ts (per-package), eslint.config.js, .env.example |

### STUBBED (Code Exists, Returns Mock Data — "In production" Comments)

| Component | Location | What's Stubbed | What's Needed |
|---|---|---|---|
| Mobile runner actions | `mobile-runner/runner.ts` | tap/swipe/type/scroll/assert use `setTimeout` | Real Appium/WebdriverIO `remote()` driver |
| Mobile screenshots | `mobile-runner/runner.ts` | `Buffer.from("mock-screenshot")`, `<mock-dom>` | Real screenshot buffer + page source |
| gRPC execution | `api-runner/grpc-runner.ts` | Returns empty, no real calls | `@grpc/grpc-js` client |
| gRPC proto loading | `api-runner/grpc-runner.ts` | Returns `{ services: [], messages: [] }` | `@grpc/proto-loader` |
| GraphQL execution | `api-runner/graphql-runner.ts` | No real HTTP call to endpoint | `graphql-request` or fetch |
| GraphQL introspection | `api-runner/graphql-runner.ts` | Returns `{ types: [], queries: [], mutations: [] }` | Introspection query |
| WebSocket execution | `api-runner/websocket-runner.ts` | Structure exists, no real ws client | `ws` library integration |
| PDF generation | `reporter/pdf.ts` | Saves HTML instead of PDF | `puppeteer` HTML→PDF |
| Email notifications | `reporter/notification.ts` | Generates HTML body, doesn't send | `nodemailer` SMTP |
| CLI `run` command | `cli/cli.ts` | `setTimeout` simulation | Real runner dispatch |
| Cloud providers | `device-cloud/providers/` | Full class methods, empty API calls | Real REST API integrations |
| API reports route | `api/routes/reports.ts` | Returns placeholder / hardcoded data | Database + reporter execution |
| API compliance route | `api/routes/compliance.ts` | Returns placeholder response | Real ComplianceChecker execution |
| API runs SSE | `api/routes/runs.ts` | Sends "connected" only | BullMQ queue subscription |
| API broadcastToRun | `api/websocket/index.ts` | Logs only, no client tracking | WebSocket connection map + dispatch |

### PENDING (Not Started)

| Area | What's Missing |
|---|---|
| **Database** | No ORM (Drizzle/Prisma), no PostgreSQL connection, no tables — all data in-memory `Map` or hardcoded |
| **Job Queues** | `redisUrl` accepted but no BullMQ queues created — runs are synchronous |
| **JWT Auth** | Config accepts `jwtSecret` but no `@fastify/jwt` plugin registered |
| **Web Dashboard** | No frontend exists — API-only |
| **Test Import Parsers** | CLI `import` has structure but no Katalon/Selenium/Cypress/Postman parsers |
| **CI/CD Pipeline** | `.github/workflows/` exists but empty — no GitHub Actions |
| **Parallel Execution** | No worker pool or BullMQ distributed execution |
| **License JWKS** | `LicenseManager` references placeholder public key URL |
| **Seat Tracking** | `currentSeats` has TODO for actual usage tracking |
| **Multi-tenancy** | No org/team isolation |
| **Audit Trail** | No immutable execution log |

---

## Key Features

- **AI-Powered Test Generation** — Generate tests from URLs, screenshots, OpenAPI specs, Postman collections, or natural language (including Arabic)
- **Self-Healing Locators** — Automatically repair broken element locators using AI
- **Autonomous Test Agent** — Crawl applications, find bugs, and generate tests autonomously
- **Failure Analysis** — AI-driven analysis of test failures with root cause suggestions
- **Visual Regression** — Visual DNA comparison for UI change detection
- **Accessibility Testing** — WCAG compliance auditing via axe-core integration
- **Compliance Auditing** — Built-in packs for NCA-ECC, SAMA-CSF, PCI-DSS, GDPR, ISO 27001, PDPL-SA
- **Multi-Platform Support** — Web (Playwright), Mobile (Appium), API (REST/GraphQL/gRPC/WebSocket)
- **Test Import** — Migrate tests from Katalon, Selenium, Cypress, Robot Framework, Postman

### AI Providers

| Provider | Type | Configuration |
|----------|------|---------------|
| Claude (Anthropic) | Cloud | `ANTHROPIC_API_KEY` env var |
| Ollama | Local | `OLLAMA_BASE_URL` env var (default: `http://localhost:11434`) |

---

## Building and Running

### Prerequisites

- **Node.js** >= 22.0.0
- **Bun** >= 1.1.38

### Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run build` | Build all 9 packages (via Turborepo) |
| `bun run dev` | Start all packages in watch mode |
| `bun run test` | Run all tests (Vitest) |
| `bun run lint` | Run ESLint across all packages |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run clean` | Clean build artifacts and node_modules |

### Per-Package Commands

```bash
cd packages/ai-engine
bun run build       # Build ai-engine
bun run test        # Run ai-engine tests
bun run dev         # Watch mode for ai-engine
```

### CLI Usage

```bash
testforge init                          # Initialize a new project (interactive wizard)
testforge generate --url <url>          # Generate tests from URL crawl
testforge generate --nl "text"          # Generate tests from natural language
testforge generate --openapi spec.yaml  # Generate API tests from OpenAPI spec
testforge run <suite>                   # Run a test suite (⚠ stubbed)
testforge agent --url <url>             # Start autonomous test agent
testforge heal                          # Run self-healing on broken locators
testforge analyze                       # AI review of test quality
testforge compliance --framework gdpr   # Run compliance audit
testforge doctor                        # Check system configuration
testforge import --from katalon --path  # Import tests (⚠ stubbed)
testforge report --run-id <id>          # Generate reports
```

### Docker

```bash
cd docker
cp ../.env.example .env
docker compose up -d                     # API + PostgreSQL + Redis + Browserless
docker compose --profile full up -d      # + Runner + Ollama (GPU)
```

### Environment Variables

See `.env.example` for full template. Key variables:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API authentication |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `DATABASE_URL` | PostgreSQL connection (⚠ not yet connected) |
| `REDIS_URL` | Redis for BullMQ (⚠ not yet connected) |
| `TESTFORGE_LICENSE_KEY` | Enterprise license key |
| `JWT_SECRET` | JWT signing secret |
| `BROWSERLESS_TOKEN` | Browserless auth token |

---

## Development Conventions

### Code Style

- **TypeScript strict mode** — `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`
- **ES Modules** — All packages use `"type": "module"`
- **Bundle output** — `tsup` produces ESM (and CJS for core) with `.d.ts` declaration files
- **Path conventions** — Source in `src/`, output to `dist/`, tests co-located as `*.test.ts`

### Package Structure

```
packages/<name>/
├── src/
│   ├── index.ts           # Main entry point with barrel exports
│   └── <feature>/         # Feature modules
│       ├── index.ts
│       └── index.test.ts  # Co-located tests
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

### Testing

- **Vitest** across all packages
- Tests co-located as `*.test.ts`
- Coverage via v8 provider → `coverage/`

### Workspace Dependencies

```json
{
  "dependencies": {
    "@testforge/core": "workspace:*",
    "@testforge/ai-engine": "workspace:*"
  }
}
```

### Naming Convention

- **Packages** — `@testforge/<name>` (scoped)
- **Debug namespaces** — `testforge:<package>` (e.g., `testforge:cli`)
- **Exports** — Subpath exports in `package.json` for feature-gated imports

### Git / CI

- Turborepo handles caching via `.turbo/cache/`
- `.gitignore` excludes `dist/`, `node_modules/`, `.env*`, `coverage/`, `reports/`, `screenshots/`
- CI pipeline not yet defined (`.github/workflows/` empty)
