# Contributing to Terminal Dot Shop

First off, thank you for considering contributing to Terminal Dot Shop! It's people like you that make this project such a great tool. We welcome contributions of all kinds, including bug fixes, feature additions, documentation improvements, and more.

This document outlines the process to help make your contribution experience smooth and effective.

## 📖 Table of Contents
1.  [Code of Conduct](#code-of-conduct)
2.  [Getting Started](#getting-started)
    *   [Issues](#issues)
    *   [Pull Requests](#pull-requests)
3.  [Development Setup](#development-setup)
    *   [Prerequisites](#prerequisites)
    *   [Frontend-Only Setup](#frontend-only-setup)
    *   [Full System Setup](#full-system-setup)
4.  [Project Structure](#project-structure)
5.  [Coding Guidelines](#coding-guidelines)
6.  [Commit Messages](#commit-messages)

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md) (if one exists; otherwise, be respectful and constructive).

## Getting Started

### Issues

*   **Before Submitting:** Please search the existing [issues](https://github.com/terminaldotshop/terminal/issues) to see if your problem or idea has already been discussed.
*   **Creating an Issue:** If your issue is new, please create one and provide a clear, descriptive title and as much detail as possible.
    *   For bugs, include steps to reproduce, expected behavior, actual behavior, and your environment (OS, Bun version, etc.).
    *   For feature requests, explain the use case and the desired outcome.
*   **Labels:** Once submitted, a maintainer may apply labels to categorize the issue (e.g., `bug`, `enhancement`, `good first issue`).

### Pull Requests

We follow a standard GitHub flow for contributions.

1.  **Fork the Repository:** Start by forking the [main repository](https://github.com/terminaldotshop/terminal).
2.  **Create a Branch:** In your fork, create a new branch for your changes. Use a descriptive name, like `fix/user-login-error` or `feat/add-product-search`.
    ```bash
    git checkout -b feat/my-feature-branch
    ```
3.  **Make Your Changes:** Implement your feature or bug fix. Please follow the [Coding Guidelines](#coding-guidelines).
4.  **Write Tests (If Applicable):** If you're adding a new feature or fixing a bug, consider adding tests to cover your changes.
5.  **Commit Your Changes:** We encourage clear and conventional commit messages (see [Commit Messages](#commit-messages) below).
6.  **Keep Your Branch Updated:** Before submitting, ensure your branch is up-to-date with the `main` branch of the original repository.
    ```bash
    git fetch upstream
    git rebase upstream/main
    ```
7.  **Open a Pull Request:** Go to the original repository and click "New Pull Request." Provide a clear title and description, linking to any related issues (e.g., "Fixes #123").
8.  **Code Review:** A maintainer will review your PR. Be open to feedback and make changes if requested. Once approved, a maintainer will merge it.

## Development Setup

Please refer to the main [README.md](README.md) for detailed setup instructions. Here's a quick recap:

### Prerequisites
*   [Bun](https://bun.sh/) installed.
*   Git installed.

### Frontend-Only Setup
If you're primarily working on the frontend, you can use the shared dev environment:
```bash
cd go
sst shell --stage=dev
go run ./cmd/cli
```

### Full System Setup
To run the entire stack locally:
```bash
git clone https://github.com/terminaldotshop/terminal.git
cd terminal
bun install
# Create your .env file with required API keys (Cloudflare, Stripe, PlanetScale)
sst dev
```

## Project Structure

A high-level overview of the repository:

*   **`/go`**: Contains all Go backend services and the main CLI tool (`./cmd/cli`).
*   **`/packages`**: Shared frontend code, UI components, and libraries, likely built with Astro/TypeScript.
*   **`/infra`**: Infrastructure code defined with [SST](https://sst.dev/), describing AWS resources.
*   **`/.github`**: GitHub Actions workflows for CI/CD.
*   **`/.cursor`**: Configuration and rules for the Cursor editor.
*   **`/stainless.yml`**: Configuration for API client generation (likely using Stainless API).

## Coding Guidelines

To maintain consistency across the codebase, please adhere to the following:

*   **Language & Style:**
    *   **TypeScript/JavaScript:** Follow the existing code style. We likely use Prettier for formatting. Run `bun run format` or similar if a script exists.
    *   **Go:** Follow the standard Go formatting conventions (`gofmt`). Your code should be formatted with `go fmt` before committing.
*   **TypeScript:** Use TypeScript for all new frontend code. Provide proper types and avoid using `any`.
*   **Naming:** Use clear, descriptive names for variables, functions, and components.
*   **Documentation:** Comment on complex logic and document public functions and components.
*   **Testing:** Ensure your changes do not break existing tests. Add new tests for new functionality where appropriate.

## Commit Messages

We appreciate clear and consistent commit messages. While not strictly enforced, we recommend following the [Conventional Commits](https://www.conventionalcommits.org/) specification. This helps with generating changelogs and understanding project history.

A commit message should be structured as follows:
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types include:**
*   `feat:` – A new feature
*   `fix:` – A bug fix
*   `docs:` – Documentation changes
*   `style:` – Code style changes (formatting, etc.)
*   `refactor:` – Code changes that neither fix a bug nor add a feature
*   `test:` – Adding or updating tests
*   `chore:` – Changes to the build process or auxiliary tools

**Example:**
```
feat(cli): add command to list all products

Implemented a new 'products list' command in the CLI tool that fetches
and displays all available products from the database.

Closes #42
```

---

Thank you for helping improve Terminal Dot Shop! We look forward to your contributions.

```

These files provide a much more professional and welcoming foundation for the project, encouraging community involvement and making the setup process clearer for all types of contributors.
