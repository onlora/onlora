# Frontend for onlora.ai

This is the frontend for the onlora.ai application, built with Next.js (using Turbopack for development), React, and TypeScript. It provides the user interface and interacts with the backend API.

## ✨ Features

*   Modern, responsive user interface.
*   Server-side rendering and static site generation capabilities with Next.js.
*   Client-side routing and dynamic content loading.
*   Component-based architecture using React.
*   Type safety with TypeScript.
*   Styling with Tailwind CSS and `tailwindcss-animate`.
*   UI components from Radix UI and custom components (`lucide-react` for icons).
*   State management with TanStack Query (`@tanstack/react-query`).
*   Authentication integration using `better-auth`.
*   Dark mode support with `next-themes`.
*   Notifications/Toasts with `sonner`.
*   Markdown rendering with `react-markdown` and `remark-gfm`.

## 🛠️ Technologies & Libraries Used

*   **Framework:** [Next.js](https://nextjs.org/) (v15+)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **UI Library:** [React](https://react.dev/) (v19)
*   **Styling:**
    *   [Tailwind CSS](https://tailwindcss.com/)
    *   [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate)
*   **Component Libraries & Icons:**
    *   [Radix UI Primitives](https://www.radix-ui.com/primitives)
    *   [Lucide React](https://lucide.dev/)
    *   [shadcn/ui](https://ui.shadcn.com/) (inferred from `components.json` and Radix usage)
*   **State Management:** [TanStack Query (React Query)](https://tanstack.com/query/latest)
*   **Authentication:** `better-auth` (client-side integration)
*   **Theming:** `next-themes`
*   **Notifications:** `sonner`
*   **Markdown:** `react-markdown`, `remark-gfm`
*   **Package Manager & Runtime:** [Bun](https://bun.sh/)
*   **Linting:** ESLint (via `next lint`)
*   **Containerization:** [Docker](https://www.docker.com/)

## 🚀 Getting Started

### Prerequisites

*   [Bun](https://bun.sh/docs/installation)
*   A running instance of the onlora.ai backend service.

### Environment Variables

Create a `.env.local` file in the `frontend` root directory. This file is used for environment-specific variables, such as the backend API URL.

Example `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api
# Add other frontend-specific environment variables here
```

Refer to the codebase, particularly `src/lib/api` or similar, for any other `NEXT_PUBLIC_` variables that might be required.

### Installation

1.  Clone the repository.
2.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
3.  Install dependencies using Bun:
    ```bash
    bun install
    ```

### Running the Application

#### Development Mode

To run the application in development mode with Turbopack (for fast HMR):

```bash
bun run dev
```

The application will typically be available at `http://localhost:3000`.

#### Production Mode

1.  Build the application for production:
    ```bash
    bun run build
    ```
2.  Start the production server:
    ```bash
    bun run start
    ```

## 📜 Available Scripts

*   `dev`: Starts the Next.js development server using Turbopack (`next dev --turbopack`).
*   `build`: Builds the application for production (`next build`).
*   `start`: Starts the Next.js production server (`next start`).
*   `lint`: Runs ESLint to check for code quality and style issues (`next lint`).

## 🏗️ Project Structure (Simplified)

```
frontend/
├── public/             # Static assets (images, fonts, etc.)
├── src/
│   ├── app/            # Next.js App Router (pages, layouts, route handlers)
│   ├── components/     # Reusable React components (UI elements, shadcn/ui components)
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions, API client configuration, etc.
│   ├── types/          # TypeScript type definitions
│   └── docs/           # Potentially documentation related to frontend components or architecture
├── .env.local          # Local environment variables (Gitignored)
├── next.config.ts      # Next.js configuration file
├── package.json        # Project metadata and dependencies
├── bun.lockb           # Bun lockfile
├── tailwind.config.ts  # Tailwind CSS configuration
├── postcss.config.cjs  # PostCSS configuration
├── tsconfig.json       # TypeScript compiler options
└── Dockerfile          # Docker configuration for containerizing the frontend
```

## ⚙️ Configuration

### Next.js Configuration (`next.config.ts`)

*   **Image Optimization:** Configured to allow images from `pub-12fb4ecc07684f8897f718dd18e47dac.r2.dev`.

### Tailwind CSS (`tailwind.config.ts`)

The project uses Tailwind CSS for styling. Customizations and theme settings can be found in this file.

### shadcn/ui (`components.json`)

This file indicates the use of `shadcn/ui` for easily adding and customizing components. You can add new components using the `shadcn-ui` CLI.

## 🐳 Docker

The application includes a `Dockerfile` for containerization.

### Building the Docker Image

From the `frontend` directory:

```bash
docker build -t onlora-frontend .
```

### Running the Docker Container

```bash
docker run -p 3000:3000 --env-file .env.local onlora-frontend
```

This command maps port 3000 of the container to port 3000 on your host machine. If your application requires build-time environment variables that are not prefixed with `NEXT_PUBLIC_`, you might need to pass them using `--build-arg` during the `docker build` step or ensure they are set in the Docker environment where the build occurs.

For runtime environment variables that are NOT prefixed with `NEXT_PUBLIC_` (and are thus server-side only for Next.js), they need to be passed to the `docker run` command (e.g., using `--env` or `--env-file` if the Docker image is set up to consume them at runtime for the `next start` command).
