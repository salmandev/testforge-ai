# Contributing to TestForge AI

Thank you for your interest in contributing to TestForge AI! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- **Node.js** >= 22.0.0
- **Bun** >= 1.1.38
- **Git**

### Setup

```bash
# Clone the repository
git clone https://github.com/testforge-ai/testforge-ai.git
cd testforge-ai

# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test

# Start the API server (development)
bun run dev:api

# Start the dashboard (development)
bun run dev:dashboard
```

## Project Structure

```
testforge-ai/
├── apps/
│   ├── api/              # Fastify REST + WebSocket API
│   └── dashboard/        # Next.js frontend
├── packages/
│   ├── core/             # Shared schemas, events, license
│   ├── ai-engine/        # AI providers, generators, analyzers
│   ├── web-runner/       # Playwright-based web test runner
│   ├── mobile-runner/    # Appium-based mobile test runner
│   ├── api-runner/       # REST, GraphQL, gRPC, WebSocket runners
│   ├── device-cloud/     # Device grid abstraction (local, cloud, 3rd party)
│   ├── reporter/         # Allure, JUnit, PDF, compliance reports
│   └── cli/              # TestForge CLI tool
├── docker/               # Docker configurations
└── .github/              # CI/CD workflows
```

## Development Workflow

1. **Create a branch** from `develop`:
   ```bash
   git checkout -b feature/my-feature develop
   ```

2. **Make your changes** following the coding standards below.

3. **Run checks locally**:
   ```bash
   bun run typecheck
   bun run lint
   bun run test
   bun run build
   ```

4. **Submit a Pull Request** to `develop`.

## Coding Standards

### TypeScript

- **Strict mode** enabled in all `tsconfig.json` files
- No `any` types unless absolutely necessary (use `unknown` instead)
- Use `interface` over `type` for object shapes
- Export types alongside their implementations
- Use Zod schemas for runtime validation

### Naming Conventions

- **Packages**: `@testforge/<name>` (kebab-case)
- **Files**: kebab-case (`test-generator.ts`)
- **Classes**: PascalCase (`TestGenerator`)
- **Functions/variables**: camelCase (`generateTests`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_CONFIG`)
- **Types/Interfaces**: PascalCase (`TestGeneratorInput`)

### Code Style

- Use `debug` package for logging (not `console.log`)
- Prefix private class members with `_` (`this._provider`)
- Document public APIs with JSDoc comments
- Keep files under 500 lines; split into modules

## Testing

- Write unit tests using **Vitest**
- Place test files adjacent to source: `feature.ts` → `feature.test.ts`
- Run tests: `bun run test` from any package directory
- Aim for meaningful coverage of business logic

## Adding a New Package

1. Create directory under `packages/`
2. Add `package.json` with `@testforge/` prefix
3. Add `tsconfig.json` extending root
4. Add `tsup.config.ts` for build configuration
5. Export from `src/index.ts`
6. Update root `turbo.json` if needed

## Adding a New AI Engine Module

1. Create directory under `packages/ai-engine/src/<module-name>/`
2. Implement your module with TypeScript interfaces
3. Add Zod schema for input/output validation
4. Export from `packages/ai-engine/src/index.ts`
5. Add to `package.json` exports if needed
6. Write tests

## Compliance & EE Features

- Enterprise Edition (EE) features must be gated by `LicenseManager`
- Use the `compliance-*` feature flags for regulatory frameworks
- Bilingual support (Arabic/English) where applicable

## CI/CD

- **CI** runs on every push/PR to `main` and `develop`
- Checks: lint, typecheck, build, test, docker build
- **Release** builds and pushes Docker images on GitHub release

## Reporting Issues

- Use GitHub Issues with appropriate labels
- Include reproduction steps for bugs
- Include expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
