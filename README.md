# localflow

Run CI/CD pipeline jobs locally in Docker — fast feedback before you push.

localflow reads your existing GitHub Actions or GitLab CI configuration and executes individual jobs inside Docker containers on your machine, with your project directory mounted in. No cloud. No waiting for a push.

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running locally

## Installation

```bash
git clone <repo>
cd localflow
npm install   # installs dependencies and compiles TypeScript automatically
npm link      # registers the `localflow` command on your PATH
```

After this, `localflow` is available globally in any terminal.

## Usage

### List available jobs

Scans the current directory for CI files and prints all jobs:

```bash
localflow list
```

Example output:

```
github-actions  .github/workflows/ci.yml
--------------------------------------------------
  build                    node:20
  test                     node:20 [needs: build]

gitlab-ci  .gitlab-ci.yml
--------------------------------------------------
  build                    python:3.12
  test                     python:3.12-slim [needs: build]
```

### Run a job

```bash
localflow run <job-name>
```

This will:
1. Pull the Docker image if not already present
2. Mount your project directory into `/workspace` inside the container
3. Execute all `run:` / `script:` steps in sequence with `set -e`, streaming logs to your terminal
4. Exit with the same exit code as the container

**Examples:**

```bash
# Run the "build" job from an auto-detected CI file in the current directory
localflow run build

# Specify a CI file explicitly
localflow run test --file .github/workflows/ci.yml

# Run against a different project directory
localflow run lint --dir /path/to/other/project
```

### Options

| Flag | Description |
|------|-------------|
| `-f, --file <path>` | Use a specific CI file instead of auto-detecting |
| `-d, --dir <path>` | Project directory to mount (default: current directory) |

## Supported CI formats

### GitHub Actions (`.github/workflows/*.yml`)

- **Image**: read from `container.image` or `container` (string). Falls back to `ubuntu:22.04` if only `runs-on` is specified.
- **Steps**: `run:` steps are executed. `uses:` steps (actions) are skipped with a warning.
- **Environment**: job-level `env:` is passed into the container. `${{ expression }}` values are stripped.
- **Dependencies**: `needs:` is detected and shown in `list`, but jobs always run in isolation.

For jobs to work with localflow, add a `container.image` so the runner knows which Docker image to use:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: node:20
    steps:
      - uses: actions/checkout@v4   # skipped locally — your directory is mounted automatically
      - name: Install
        run: npm ci
      - name: Test
        run: npm test
```

### GitLab CI (`.gitlab-ci.yml`)

- **Image**: read from the job's `image`, then the global `image`, then defaults to `ubuntu:22.04`. Both string and `{ name: ... }` forms are supported.
- **Steps**: each line in `script:` becomes a step. `before_script:` lines are prepended.
- **Environment**: global `variables:` are merged with job-level `variables:`.
- **Anchors**: YAML anchors and aliases (`<<: *template`) are resolved automatically.
- **Hidden jobs**: entries starting with `.` are skipped.

```yaml
image: node:20

variables:
  NODE_ENV: ci

.base: &base
  before_script:
    - npm ci

build:
  <<: *base
  script:
    - npm run build

test:
  <<: *base
  needs: [build]
  script:
    - npm test
```

## Limitations

- `uses:` steps (GitHub Actions actions like `actions/checkout`) are skipped — your project directory is already mounted into the container, so checkout is not needed.
- Matrix jobs are not supported — only the base job definition is used.
- `needs:` dependencies are not automatically run. Jobs always execute in isolation.
- Secrets and dynamic `${{ expression }}` values are not resolved.
- Services (e.g. GitLab CI `services:`) are not started.

## How it handles dependencies

When a job runs `npm install` or `go get`, localflow creates an anonymous Docker volume that shadows the dependency directory (`node_modules`, `vendor`) inside the container. This means:

- Packages are installed fresh inside the container on every run.
- Your local `node_modules` or `vendor` directory is never overwritten by the container's platform-specific binaries.

## Development

```bash
npm run dev -- list     # run via tsx without building
npm run build           # compile TypeScript to dist/
npm test                # run the test suite (vitest)
npm run test:watch      # watch mode
npm run typecheck       # type-check without emitting
```

CI runs automatically on GitHub Actions (`.github/workflows/ci.yml`) on every push and pull request, running typecheck → build → test on Node 20.

You can also run the CI job locally using localflow itself:

```bash
localflow run test --file .github/workflows/ci.yml
```

### Project structure

```
src/
  index.ts                   # CLI entry point
  cli/
    program.ts               # Commander setup
    commands/
      list.command.ts        # localflow list
      run.command.ts         # localflow run <job>
  parsers/
    types.ts                 # Shared Job / Step / Pipeline types
    parser.factory.ts        # Auto-detect and parse CI files
    github-actions.parser.ts
    gitlab-ci.parser.ts
  runner/
    docker.runner.ts         # Container lifecycle via dockerode
    stream.util.ts           # Multiplexed log stream handling
  logger/
    logger.ts                # Chalk-colored terminal output

tests/
  parsers/                   # Parser unit tests
  runner/                    # Runner unit tests

test-react/                  # Example: React + ESLint on node:20-alpine
test-angular/                # Example: Angular + ESLint on node:20-alpine
test-go/                     # Example: Go vet + build on golang:1.22-alpine
```
