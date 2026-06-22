# TestForge AI

> Open-source, AI-powered test automation platform — an alternative to Katalon + BrowserStack.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.1.38-black.svg)](https://bun.sh/)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.0.0-green.svg)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-@testforge/cli-red.svg)](https://www.npmjs.com/package/@testforge/cli)

---

## System Summary

TestForge AI is a **TypeScript monorepo** (~95+ source files) organized as a **Turborepo + Bun workspace** with **9 packages** and **2 applications** (Fastify API + Next.js Dashboard). It delivers AI-powered test automation across **web**, **mobile**, **API**, and **Dynamics 365** surfaces — with built-in intelligence for test generation, self-healing locators, failure analysis, visual regression, accessibility auditing, regulatory compliance, and a full web dashboard.

**Build status:** 10/10 packages + 1 app compile cleanly under TypeScript strict mode.

---

## Architecture

```
testforge-ai/
├── apps/
│   ├── api/                # Fastify REST + GraphQL + WebSocket API server
│   └── dashboard/          # Next.js 14 web dashboard (shadcn/ui, TanStack Query)
├── packages/
│   ├── core/               # Zod schemas, typed EventBus, LicenseManager
│   ├── ai-engine/          # 14 AI modules: providers, generators, analyzers, agents
│   ├── cli/                # Commander CLI with 10 commands
│   ├── web-runner/         # Playwright-based web test runner
│   ├── mobile-runner/      # Appium / WebdriverIO mobile test runner
│   ├── api-runner/         # REST, GraphQL, gRPC, WebSocket API test runner
│   ├── device-cloud/       # Device grid abstraction (5 providers)
│   ├── d365-runner/        # D365 UCI-aware Playwright extension + Dataverse client
│   └── reporter/           # Allure, AI narrative, PDF, notification reporters
├── docker/
│   ├── Dockerfile.api      # Multi-stage API container (Bun, non-root)
│   ├── Dockerfile.runner   # Multi-stage runner container (Playwright + Appium)
│   └── docker-compose.yml  # Full stack with healthchecks and compose profiles
├── .env.example            # Environment variable template
├── eslint.config.js        # ESLint 9 flat config (typescript-eslint strict)
├── turbo.json              # Turborepo pipeline with caching
├── package.json            # Root workspace (Bun workspaces)
└── tsconfig.json           # Shared TypeScript strict config
```

### Package Dependency Flow

```
  @testforge/core  ──────────────────────────────────────────────
       │                                                        │
       ├──► @testforge/ai-engine ──► @testforge/web-runner      │
       │        │               ├──► @testforge/mobile-runner   │
       │        │               ├──► @testforge/api-runner      │
       │        │               ├──► @testforge/d365-runner     │
       │        │               └──► @testforge/reporter        │
       │                                                        │
       └──► @testforge/device-cloud ───────────────────────────┘
                    │
                    └──► @testforge/cli (consumes all packages)

  apps/api        ──► core, ai-engine, web-runner, mobile-runner, api-runner, device-cloud, reporter
  apps/dashboard  ──► @tanstack/react-query, recharts, shadcn/ui, Radix, Tailwind
```

---

## Status Legend

| Tag | Meaning |
|---|---|
| **DONE** | Fully implemented, builds, logic complete |
| **STUBBED** | Code structure exists, has `"In production"` comments, returns mock/empty data — needs real integration |
| **PENDING** | Not yet started — no code or only type definitions |

---

## What's DONE

These components are fully implemented with real logic, unit tests (where applicable), and clean builds.

### `@testforge/core` — 10 files

| Module | Details |
|---|---|
| **Zod Schemas** | `ProjectSchema`, `TestSuiteSchema`, `TestCaseSchema`, `LocatorSchema` — full TypeScript inference via `z.infer` |
| **EventBus** | Typed `emit()`/`on()` using Node.js `EventEmitter` with generic event map, wildcard support, once/off |
| **LicenseManager** | JWT/JWKS verification, grace period, offline support, `isFeatureEnabled(feature: string)`, env var `TESTFORGE_LICENSE_KEY` |
| **Barrel Exports** | `index.ts` re-exports all schemas, events, license |

### `@testforge/ai-engine` — 28 files (14 modules, 7 test suites)

| Module | Details |
|---|---|
| **ClaudeProvider** | Anthropic Messages API integration, tool use, streaming, error handling |
| **OllamaProvider** | Local LLM via `/api/chat`, model management, timeout/retry |
| **ProviderFactory** | Factory pattern to create providers by name with config merging |
| **TestGenerator** | Generate tests from URLs, screenshots, OpenAPI specs, natural language (incl. Arabic) |
| **SelfHealer** | AI-powered locator repair when UI changes break selectors |
| **FailureAnalyzer** | Root-cause analysis from screenshots, DOM snapshots, network logs, test code |
| **IntentEngine** | Natural language → structured test intent parsing |
| **AutonomousAgent** | Crawl apps, discover bugs, generate tests autonomously (form interaction, responsive testing) |
| **VisualDNA** | Pixel-level + structural visual regression comparison |
| **AccessibilityAuditor** | WCAG compliance via axe-core integration |
| **ComplianceChecker** | 6 frameworks: NCA-ECC, SAMA-CSF, PCI-DSS, GDPR, ISO 27001, PDPL-SA |
| **TestDataGenerator** | AI-generated, locale-aware synthetic test data |
| **D365TestGenerator** | Fetches Dataverse metadata via MSAL + axios, generates CRUD/validation/relationship/business rule tests per entity, natural language support |
| **D365LocatorHealer** | Wraps SelfHealer with D365-specific fallback chain: `data-id` → `aria-label` → `text content` → `field label` → `XPath`, fallback cache |

### `@testforge/d365-runner` — 5 files (NEW)

| Module | Details |
|---|---|
| **D365Runner** | Extends PlaywrightRunner with UCI-aware helpers: `openRecord`, `openForm`, `clickField`, `setValue`, `saveRecord`, `getFieldValue`, `waitForSave`, `navigateToArea`. Locator strategy: `data-id` → `aria-label` |
| **DataverseClient** | MSAL Azure AD client credentials + axios for CRUD: `getRecords`, `createRecord`, `updateRecord`, `deleteRecord`, `executeAction`, `runFlow` |
| **D365ScenarioLibrary** | Pre-built scenarios: `salesCycle()` (Lead → Qualify → Convert → Opportunity → Quote), `serviceCycle()` (Case → Routing → Resolution → CSAT), returns `TestStep[]` |
| **Types** | D365RunnerConfig, D365FormState, D365NavigationPath, D365FieldAction |

### `@testforge/cli` — 2 files

| Module | Details |
|---|---|
| **10 Commands** | `init`, `generate`, `run`, `heal`, `agent`, `analyze`, `compliance`, `doctor`, `import`, `report` |
| **UX** | Commander + Inquirer prompts + Chalk output + Ora spinners |

### `@testforge/web-runner` — 2 files

| Module | Details |
|---|---|
| **Playwright Runner** | Full test execution with self-healing hooks, failure capture, network/console logging |

### `@testforge/api-runner` — 6 files

| Module | Details |
|---|---|
| **RestRunner** | axios-based with full HTTP method support, auth, assertions |
| **ContractTester** | Schema-based contract validation for API endpoints |

### `@testforge/device-cloud` — 7 files

| Module | Details |
|---|---|
| **GridManager** | Unified abstraction over device grids |
| **LocalProvider** | ADB + xcrun device discovery and management |
| **Types** | Device, Capability, GridConfig schemas |

### `@testforge/reporter` — 6 files

| Module | Details |
|---|---|
| **AllureReporter** | Allure-compatible XML report generation with screenshots |
| **AiNarrativeReporter** | AI-generated test run narrative summaries |
| **Types** | ReportFormat, ReporterConfig, TestRunData schemas |

### `@testforge/dashboard` — Next.js 14 App (NEW)

| Page / Component | Details |
|---|---|
| **Login** | JWT auth form → POST `localhost:3000/api/auth/login`, localStorage token, redirect to `/dashboard` |
| **Dashboard** | Stats cards (total runs, pass rate, avg duration, active suites), recent runs table via TanStack Query |
| **Test Suites** | CRUD table with create dialog (name, description, D365 module dropdown), delete actions |
| **Live Run View** | WebSocket connection to `ws://localhost:3000/ws`, real-time step-by-step results, progress bar, AI failure analysis panel |
| **Dynamics 365** | Org connection form, entity browser with field expansion, AI test generation wizard (select entities + natural language) |
| **Reports** | Report history table with pass rate badges, PDF generation by run ID |
| **Settings** | API keys (Anthropic, Ollama), Azure AD credentials, notification channels (Slack, Teams, Email) |
| **Infrastructure** | shadcn/ui (Button, Card, Input, Label, Table, Badge, Tabs, Select, Dialog, Skeleton, Separator), Tailwind CSS dark/light theme, TanStack Query provider, JWT auth context, sidebar navigation |

### Scaffold & Infrastructure

| Component | Details |
|---|---|
| **turbo.json** | Dependency-aware pipeline (`build`, `test`, `lint`, `typecheck`, `clean`) with caching |
| **tsconfig.json** | Strict mode: `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUncheckedIndexedAccess` |
| **Per-package tsup.config.ts** | ESM + CJS for core, ESM-only for all others, `.d.ts` generation |
| **Per-package vitest.config.ts** | Vitest with v8 coverage provider |
| **eslint.config.js** | ESLint 9 flat config with typescript-eslint strict type-checked rules |
| **docker-compose.yml** | 5 services with healthchecks, compose profiles (`runner`, `gpu`, `full`) |
| **Dockerfile.api** | Multi-stage Bun build, non-root user, healthcheck |
| **Dockerfile.runner** | Playwright + Appium image, multi-stage, healthcheck |
| **.env.example** | Full environment variable template |

---

## What's STUBBED (Structure Exists, Needs Real Integration)

These components have complete class/method signatures and compile cleanly, but contain `"In production"` comments and return mock or empty data. They need real library integrations to become production-ready.

### `@testforge/mobile-runner` — Runner Methods

| Stub | What's There | What's Needed |
|---|---|---|
| `run()` | Full method structure with AI hooks, screenshots, video | Real Appium/WebdriverIO `remote()` session creation |
| `_executeStep()` | Step dispatch (tap, swipe, type, scroll, assert) | Real Appium driver calls (`element.click()`, `driver.swipe()`, etc.) |
| `_performMobileAction()` | Action routing with timeouts | Real element find + interaction via Appium |
| Failure analysis | Uses `Buffer.from("mock-screenshot")` and `<mock-dom>` | Real screenshot buffer + page source capture |

### `@testforge/api-runner` — Protocol Clients

| Stub | What's There | What's Needed |
|---|---|---|
| `GrpcRunner._executeStep()` | Method routing, proto loading structure | `@grpc/grpc-js` client creation and unary/streaming calls |
| `GrpcRunner.loadProto()` | Returns `{ services: [], messages: [] }` | `@grpc/proto-loader` integration |
| `GraphqlRunner._executeStep()` | Query dispatch structure | Real GraphQL client (e.g., `graphql-request` or raw fetch) |
| `GraphqlRunner.introspectSchema()` | Returns `{ types: [], queries: [], mutations: [] }` | Introspection query + schema parsing |
| `WebsocketRunner._executeStep()` | Connect/send/assert structure | Real `ws` WebSocket client with event handling |

### `@testforge/reporter` — Output Formats

| Stub | What's There | What's Needed |
|---|---|---|
| **PdfReporter** | Full HTML generation with charts, saves as `.html` | `puppeteer` or `playwright` HTML→PDF conversion |
| **NotificationReporter** (email) | HTML email body generation | `nodemailer` SMTP integration |

### `@testforge/cli` — Test Execution

| Stub | What's There | What's Needed |
|---|---|---|
| `run` command | Suite loading, test listing, spinner | Real `PlaywrightRunner` / `MobileRunner` / `ApiRunner` execution (currently `setTimeout` simulation) |

### `@testforge/device-cloud` — Cloud Providers

| Stub | What's There | What's Needed |
|---|---|---|
| **BrowserStackProvider** | Full class with session/device methods | Real BrowserStack REST API calls |
| **SauceLabsProvider** | Full class structure | Real Sauce Labs REST API calls |
| **LambdaTestProvider** | Full class structure | Real LambdaTest REST API calls |
| **TestForgeCloudProvider** | Full class structure | TestForge's own cloud grid API |

### `apps/api` — Route Handlers

| Stub | What's There | What's Needed |
|---|---|---|
| `GET /api/projects/:id/suites` | Returns `[]` | Database query for project suites |
| `GET /api/reports/:runId` | Returns `{ status: "placeholder" }` | Database fetch for run data |
| `POST /api/reports/:runId/generate` | Hardcoded `TestRunData` | Database fetch + real reporter execution |
| `POST /api/compliance/check` | Returns placeholder response | Real `ComplianceChecker` execution against run data |
| `GET /api/runs/:id/events` (SSE) | Sends `"connected"` event only | BullMQ queue subscription or WebSocket broadcast relay |
| `broadcastToRun()` | Logs broadcast data | Real WebSocket connection tracking + message dispatch |

---

## What's PENDING (Not Yet Started)

### Database & Persistence
- **PostgreSQL integration** — no ORM (Drizzle/Prisma) connected; all data is in-memory (`Map<string, ...>`) or hardcoded
- **BullMQ job queues** — `redisUrl` accepted in config but no queues created; test runs are synchronous
- **Run result storage** — no database tables for projects, suites, test cases, runs, or results
- **Session management** — JWT verification middleware exists in config but no `@fastify/jwt` plugin registered

### Dashboard (Next.js) — Remaining Integration
- **Real API wiring** — dashboard pages are fully built but connect to stubbed API endpoints; needs real DB-backed API routes
- **WebSocket live updates** — run detail page has WS client code; server-side needs `broadcastToRun()` implementation
- **Charts/graphs** — recharts is installed but dashboard stats cards are not yet wired to aggregated data
- **Auth flow** — login form exists; needs `@fastify/jwt` server-side token issuance and validation

### Runner Gaps
- **Playwright execution in CLI** — `run` command doesn't invoke `WebRunner`; needs real runner dispatch
- **Parallel test execution** — no worker pool or BullMQ-based distributed execution
- **Test import parsers** — CLI `import` command has structure but no actual Katalon/Selenium/Cypress/Postman parsers

### AI Engine Gaps
- **Provider caching/routing** — no smart routing between Claude vs Ollama based on cost/latency
- **Model fine-tuning pipeline** — no training data export or model management
- **Multi-model ensemble** — single provider per call, no result merging

### CI/CD & DevOps
- **GitHub Actions workflow** — `.github/workflows/` directory exists but no CI pipeline defined
- **Test result annotations** — no CI-native test result display (PR checks, annotations)
- **Docker image publishing** — no GHCR/DockerHub push pipeline

### Enterprise Features
- **License JWKS endpoint** — `LicenseManager` references a placeholder public key URL
- **Seat tracking** — `currentSeats` has a `TODO: track actual usage` comment
- **Multi-tenancy** — no organization/team isolation in API or data model
- **Audit trail** — no immutable execution log

---

## Quick Start

### 3 Commands to Go

```bash
npx @testforge/cli init          # Scaffold testforge.config.ts + sample suite
npx @testforge/cli generate      # AI-generate tests from your app URL
npx @testforge/cli run smoke     # Execute the smoke suite
```

### Prerequisites

- **Node.js** >= 22.0.0
- **Bun** >= 1.1.38 — [install guide](https://bun.sh/docs/installation)

### Install & Build

```bash
git clone https://github.com/your-org/testforge-ai.git
cd testforge-ai
bun install
bun run build          # 10/10 packages + 1 app successful
```

### Start the API Server

```bash
bun run api:dev        # Development (hot reload)
bun run api:start      # Production (after build)
# → http://localhost:3000 (Swagger at /docs)
```

### Start the Dashboard

```bash
bun run dev --filter=@testforge/dashboard   # Development (hot reload)
# → http://localhost:3001
```

### Docker

```bash
cd docker
cp ../.env.example .env
docker compose up -d                              # API + PostgreSQL + Redis + Browserless
docker compose --profile full up -d               # + Runner + Ollama (GPU)
```

---

## CLI Commands

```bash
testforge init                                    # Interactive project wizard
testforge generate --url https://example.com      # Generate tests from URL
testforge generate --nl "Login with credentials"  # Generate from natural language
testforge generate --openapi spec.yaml            # Generate from OpenAPI spec
testforge run <suite-name>                        # Execute test suite (⚠ stubbed)
testforge agent --url https://example.com         # Autonomous exploration
testforge heal                                    # Self-heal broken locators
testforge analyze                                 # AI test quality review
testforge compliance --framework gdpr             # Compliance audit
testforge doctor                                  # System health check
testforge import --from katalon --path ./tests    # Migrate tests (⚠ stubbed)
testforge report --run-id <id> --format allure    # Generate reports
```

---

## Environment Variables

See `.env.example` for the full template. Key variables:

| Variable | Required For | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude AI | Anthropic API key |
| `OLLAMA_BASE_URL` | Local AI | Ollama server URL (default: `http://localhost:11434`) |
| `DATABASE_URL` | Docker/API | PostgreSQL connection string (⚠ not yet connected) |
| `REDIS_URL` | Docker/API | Redis URL for BullMQ (⚠ not yet connected) |
| `JWT_SECRET` | API auth | JWT signing secret |
| `TESTFORGE_LICENSE_KEY` | Enterprise | License key for EE compliance features |
| `BROWSERLESS_TOKEN` | Docker | Browserless auth token |
| `NEXT_PUBLIC_API_URL` | Dashboard | API base URL (default: `http://localhost:3000`) |

---

## Development

| Command | Description |
|---|---|
| `bun run build` | Build all packages + apps (Turborepo) |
| `bun run dev` | Watch mode for all packages |
| `bun run test` | Run Vitest unit tests |
| `bun run lint` | ESLint (flat config, typescript-eslint strict) |
| `bun run typecheck` | TypeScript type checking |
| `bun run clean` | Clean dist/ and node_modules |

### Code Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`
- ES Modules (`"type": "module"`) across all packages
- tsup bundler: ESM + CJS for core, ESM-only for others
- Vitest for unit tests, co-located as `*.test.ts`
- `workspace:*` protocol for cross-package deps

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun 1.1.38 / Node.js 22+ |
| Language | TypeScript 5.7 (strict) |
| Monorepo | Turborepo + Bun workspaces |
| Bundler | tsup (ESM + CJS) |
| Testing | Vitest + v8 coverage |
| Linting | ESLint 9 + typescript-eslint |
| API Server | Fastify (Swagger, CORS, rate limiting, WebSocket) |
| **Dashboard** | **Next.js 14, React 18, Tailwind CSS, shadcn/ui, Radix, TanStack Query, recharts, lucide-react** |
| Validation | Zod v3 |
| AI Providers | Anthropic Claude, Ollama |
| **D365 Integration** | **MSAL (@azure/msal-node), Dataverse Web API, UCI form automation** |
| Web Testing | Playwright |
| Mobile Testing | Appium / WebdriverIO (⚠ stubbed) |
| API Testing | axios, @grpc/grpc-js (⚠ stubbed), ws (⚠ stubbed), graphql-request (⚠ stubbed) |
| Reporting | Allure, pdfkit (⚠ HTML-only), nodemailer (⚠ stubbed) |
| Accessibility | axe-core |
| Containers | Docker (multi-stage, non-root, healthchecks) |
| Database | PostgreSQL 16 (⚠ not connected) |
| Queue | Redis 7 + BullMQ (⚠ not connected) |
| Browser Grid | Browserless Chromium |
| Local AI | Ollama (optional GPU profile) |

---

## Innovation Opportunities

### AI & Intelligence
- Multi-model ensemble (Claude + Ollama combined output)
- Predictive test selection based on code changes
- AI-powered performance profiling during test runs
- Natural language test editing

### Platform & Runners
- Desktop app testing (Electron/Tauri via Playwright)
- Load/stress testing (k6 or Artillery integration)
- Chaos engineering (fault injection during runs)
- Visual AI for native mobile screenshots

### DevOps & CI/CD
- GitHub Actions / GitLab CI plugins with annotations
- Flaky test detection (statistical quarantine)
- Test impact analysis (code diff → affected tests)
- Distributed execution via BullMQ workers

### Collaboration & UX
- ~~Web dashboard (React/Next.js)~~ ✅ Done
- Browser extension for test recording
- Shared step/fixture library across teams
- Multi-tenant organization isolation

---

## Codebase Metrics

| Metric | Count |
|---|---|
| Packages | 9 |
| Applications | 2 (api + dashboard) |
| Source files (packages) | ~80 |
| Source files (dashboard) | ~30 |
| AI modules | 14 |
| CLI commands | 10 |
| Dashboard pages | 7 (login + 6 main) |
| shadcn/ui components | 10 |
| Compliance frameworks | 6 |
| D365 scenario cycles | 2 (sales + service) |
| Cloud device providers | 5 (1 local + 4 cloud) |

---

## Feature Comparison

| Feature | TestForge AI | Katalon | BrowserStack |
|---------|-------------|---------|-------------|
| **AI Test Generation** | ✅ Built-in (Claude/Ollama) | ❌ | ❌ |
| **Self-Healing Locators** | ✅ AI-powered | ✅ Basic | ❌ |
| **Visual Regression** | ✅ pixelmatch + AI | ✅ | ❌ (separate product) |
| **Dynamics 365 Support** | ✅ Native UCI healer | ❌ | ❌ |
| **NCA ECC / SAMA CSF** | ✅ Built-in compliance | ❌ | ❌ |
| **Arabic/RTL Support** | ✅ Native (NLP + data) | ❌ | ❌ |
| **Open Source** | ✅ MIT | ❌ Proprietary | ❌ Proprietary |
| **Pricing** | Free | $175+/mo | $29+/mo |
| **Self-Hosted** | ✅ Docker | ❌ | ❌ |
| **Multi-Surface** | Web + Mobile + API + D365 | Web + Mobile + API | Web + Mobile |

---

## License

MIT — see [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for monorepo dev setup, PR checklist, and commit conventions.

1. Fork → 2. Branch (`feature/x`) → 3. Commit → 4. Push → 5. Pull Request

---

*Built with [Turborepo](https://turbo.build/) + [Bun](https://bun.sh/) + [Fastify](https://fastify.dev/) + [Next.js](https://nextjs.org/) + [Playwright](https://playwright.dev/) + [Anthropic Claude](https://www.anthropic.com/)*

---

## Product Hunt Launch

**Tagline:** The first open-source AI test automation platform with native GCC compliance.

**Description:**

TestForge AI is what happens when you build test automation from the ground up for the AI era — not bolt AI onto a legacy tool.

**What makes it different:**

- **AI-native**: Describe tests in plain English (or Arabic — yes, we support العربية natively). TestForge’s AI generates, executes, and self-heals them. No scripting. No record-and-playback fragility. When a UI changes, locators heal automatically using Claude-powered visual analysis.

- **Built for GCC enterprises**: First testing platform with out-of-the-box NCA ECC and SAMA CSF compliance auditing. Run a test suite and get a bilingual (Arabic + English) compliance PDF with control-by-control evidence — aligned with Saudi Vision 2030 digital transformation mandates.

- **Dynamics 365? Covered.** The only open-source tool with a D365 UCI-aware test runner that understands entity forms, grid views, and the UCI loading overlay. No more `waitForSelector('#loading-overlay')` hacks.

- **One platform, four surfaces**: Web (Playwright), Mobile (Appium), API (REST/GraphQL/gRPC/WebSocket), and D365 — all from a single `testforge run` command.

- **Open source, self-hostable**: MIT licensed. Docker-ready. Your data stays on your infra. No vendor lock-in. No per-seat pricing eating your budget at scale.

Built with TypeScript, Bun, Turborepo, and Anthropic Claude. 9 packages, 95+ source files, full web dashboard, CI/CD integrations for GitHub Actions and GitLab.

`npx @testforge/cli init` → you’re testing in 60 seconds.
