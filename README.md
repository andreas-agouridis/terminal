<h1 align="center">
  <br>
  <!-- Placeholder for Logo - Replace with your actual logo URL -->
  <img src="https://github.com/user-attachments/assets/22f1c60c-3079-4536-8ba8-f116017b438f?text=TERMINAL" alt="Terminal Logo" width="200">
  <br>
  Terminal
  <br>
</h1>



<h4 align="center">The modern, open-source e-commerce platform built for the terminal.</h4>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-development">Development</a> •
  <a href="#-contributing">Contributing</a> •
  <a href="#-license">License</a>
</p>

<p align="center">
  <img alt="Stars" src="https://img.shields.io/github/stars/terminaldotshop/terminal?style=for-the-badge&color=ffcb6b"/>
  <img alt="Forks" src="https://img.shields.io/github/forks/terminaldotshop/terminal?style=for-the-badge&color=84c0c4"/>
  <img alt="Languages" src="https://img.shields.io/github/languages/top/terminaldotshop/terminal?style=for-the-badge&color=c792ea"/>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge&color=89ddff"/>
</p>

---

## Features

*   **Built for Speed:** A fast, responsive, and intuitive interface for both customers and administrators.
*   **Terminal-First Experience:** A unique CLI tool (`go run ./cmd/cli`) for managing your store directly from your terminal.
*   **Modern Tech Stack:** Built with **TypeScript**, **Go**, and **Astro** for a robust and scalable foundation.
*   **Cloud-Native:** Leverages Cloudflare, Stripe, and PlanetScale (or your own services) for a production-ready setup.
*   **Full-Stack Monorepo:** Organized with `bun` workspaces for seamless frontend and backend development.

## Tech Stack

*   **Monorepo Tooling:** [Bun](https://bun.sh/)
*   **Frontend:** [Astro](https://astro.build/), TypeScript, CSS
*   **Backend:** [Go](https://go.dev/)
*   **Infrastructure:** [SST](https://sst.dev/) (for AWS), Cloudflare, PlanetScale
*   **Payments:** Stripe
*   **Languages:** TypeScript (73.6%), Go (17.9%), Astro (7.9%), and others.

## Getting Started

### Prerequisites
*   Install [Bun](https://bun.sh/) (v1.0.0 or later recommended).
*   Git
*   (Optional for full system) An AWS account and [SST](https://sst.dev/) configured.

### Quick Start (Frontend Only)

If you're only interested in working on the frontend, you can connect to the shared development environment:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/terminaldotshop/terminal.git
    cd terminal
    ```
2.  **Navigate to the Go directory and connect to the dev stage:**
    ```bash
    cd go
    sst shell --stage=dev
    ```
    This command connects you to the `dev` environment and opens a new bash shell with the necessary secrets loaded.
3.  **Run the CLI tool:**
    ```bash
    go run ./cmd/cli
    ```

> **! Important Note:** Running `sst shell` loads development secrets into your environment. Avoid logging your environment variables, especially during streams or screen sharing.

### Running the Full System

To run the entire system locally for backend or full-stack development:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/terminaldotshop/terminal.git
    cd terminal
    ```
2.  **Install dependencies:**
    ```bash
    bun install
    ```
3.  **Set up your environment variables.** Create a `.env` file in the root with your service tokens:
    ```env
    CLOUDFLARE_API_TOKEN=your_cloudflare_token
    STRIPE_API_KEY=your_stripe_key
    PLANETSCALE_SERVICE_TOKEN_ID=your_pscale_token_id
    PLANETSCALE_SERVICE_TOKEN=your_pscale_token
    ```
4.  **Start the development environment:**
    ```bash
    sst dev
    ```
    This command will start all your frontend and backend services in development mode with live reloading.

## Development

### Project Structure
*   `/infra` - SST infrastructure as code (AWS, etc.)
*   `/packages` - Shared frontend packages and UI components
*   `/go` - Go backend services and the CLI tool
*   `/.cursor` - Cursor editor settings and rules
*   `/.github` - GitHub Actions workflows

### For Terminal Team Members (Internal AWS Setup)

If you are part of the core terminal team with AWS access, configure your AWS credentials like this:

1.  Add the following to your `~/.aws/config` file:
    ```ini
    [sso-session terminal]
    sso_start_url = https://terminaldotshop.awsapps.com/start
    sso_region = us-east-2

    [profile terminal-dev]
    sso_session = terminal
    sso_account_id = 058264103289
    sso_role_name = AdministratorAccess
    region = us-east-2

    [profile terminal-production]
    sso_session = terminal
    sso_account_id = 211125775473
    sso_role_name = AdministratorAccess
    region = us-east-2
    ```
2.  Log in once a day using the command in the project root:
    ```bash
    bun sso
    ```

## Contributing

We welcome contributions from the community! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to get started, report issues, and submit pull requests.

## License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  <a href="https://github.com/terminaldotshop/terminal">View on GitHub</a> •
  <a href="https://github.com/terminaldotshop/terminal/issues">Report a Bug</a> •
  <a href="https://github.com/terminaldotshop/terminal/discussions">Discussions</a>
</p>
