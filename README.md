# onlora
### Vibe Artist Community

Welcome to onlora.ai, a platform where the goal is to empower everyone to create diverse media (from images to movies) like sending a message. It starts by enabling users to generate images, share their unique "Vibe," and inspire a global chain of creativity through "Remixing."

## Overview

The core vision of onlora.ai is **"Chat → Create → Remix."**

It empowers users to:
*   **Chat & Create**: Generate creative media (starting with images) through an intuitive chat-like interface called a "Jam."
*   **Share Vibes**: Publish their creations (image + prompt) as "Vibes," which can be public or private.
*   **Remix & Inspire**: Allow others to take the prompt and settings from a public Vibe to create their own versions, fostering an ever-evolving chain of inspiration.

The project is structured into two main components:
*   **Backend**: A Hono-based API server handling business logic, database interactions (Vibes, Jams, users, VE), AI service integrations for image generation, and social graph features.
*   **Frontend**: A Next.js application providing the user interface for Jams, Galleries, the social feed, and Vibe interactions.

Both components are containerized using Docker, and a `docker-compose.yml` file is provided for easier local development and orchestration.

## Project Structure

```
onlora/
├── backend/            # Hono (Node.js/TypeScript) backend service
├── frontend/           # Next.js (React/TypeScript) frontend application
├── .gitignore          # Specifies intentionally untracked files that Git should ignore
├── biome.json          # Biome formatter/linter configuration
├── docker-compose.yml  # Docker Compose configuration for running services
└── README.md           # This file
```

## Core Technologies

### Backend (`./backend`)
*   **Framework**: [Hono](https://hono.dev/)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Runtime**: [Node.js](https://nodejs.org/) (developed with [Bun](https://bun.sh/))
*   **Database**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)
*   **Authentication**: `better-auth`
*   **AI SDKs**: `@ai-sdk/google`, `@ai-sdk/openai` (for image generation)
*   **File Storage**: AWS S3
*   **Containerization**: [Docker](https://www.docker.com/)

### Frontend (`./frontend`)
*   **Framework**: [Next.js](https://nextjs.org/) (v15+, App Router)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **UI Library**: [React](https://react.dev/) (v19)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Component Libraries**: [Radix UI](https://www.radix-ui.com/primitives), [shadcn/ui](https://ui.shadcn.com/), [Lucide React](https://lucide.dev/)
*   **State Management**: [TanStack Query (React Query)](https://tanstack.com/query/latest)
*   **Authentication**: `better-auth` (client-side)
*   **Theming**: `next-themes`
*   **Notifications**: `sonner`
*   **Containerization**: [Docker](https://www.docker.com/)

## Key Features

*   **Jam (Chat-based Creation)**: Generate creative media (currently focused on images) through an interactive, conversational UI, with a vision to support richer media formats in the future.
*   **Vibe Creation & Management**: Publish AI-generated creative works (currently images) along with their prompts as "Vibes."
*   **Remix Functionality**: Users can easily take an existing public Vibe's prompt and settings to create their own variations, building upon others' creativity.
*   **Gallery**: Personal collections of Vibes, with options for public or private visibility.
*   **Vibe Energy (VE)**: An engagement and usage credit system (earn VE by publishing, getting remixed; spend VE by generating).
*   **AI Media Generation**: Core functionality leveraging AI models to produce creative media from text prompts, initially focusing on images with plans to expand to other formats like movies.
*   **Social Feed**: Discover Vibes through tabs like Recommended, Latest, and Following.
*   **Trending Vibes**: See popular public Vibes.
*   **User Profiles**: Manage personal information, and showcase created Vibes and liked Vibes.
*   **Search**: Find Vibes and users.
*   **Notifications**: Receive alerts for likes, comments, remixes, and follows.
*   **Responsive Design**: UI adaptable to various screen sizes.
*   **Dark Mode**: Support for light and dark themes.

## Getting Started

### Prerequisites
*   [Bun](https://bun.sh/docs/installation) (for local development of individual services)
*   [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/) (recommended for overall setup)
*   [Node.js](https://nodejs.org/) (v20+ if not using Bun exclusively for backend)
*   PostgreSQL Server (if not using the one provided by Docker Compose)
*   AWS S3 bucket and credentials (for file storage features)
*   Google and/or OpenAI API keys (for AI features)

### Development Environment Setup

The recommended way to set up the development environment is using Docker Compose.

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd onlora
    ```

2.  **Configure Environment Variables:**
    *   **Backend**: Create a `.env` file in the `backend/` directory. Refer to `backend/README.md` and `backend/src/config/index.ts` for required variables (e.g., `DATABASE_URL`, `AUTH_SECRET`, API keys).
        *   When using `docker-compose.yml`, the `DATABASE_URL` for the backend service should typically point to the PostgreSQL service defined in `docker-compose.yml` (e.g., `postgresql://user:password@db:5432/onlora_db`).
    *   **Frontend**: Create a `.env.local` file in the `frontend/` directory. Refer to `frontend/README.md` for required variables (e.g., `NEXT_PUBLIC_API_URL`).
        *   When using `docker-compose.yml`, `NEXT_PUBLIC_API_URL` should point to the backend service (e.g., `http://localhost:8080/api` if the backend is exposed on port 8080).

3.  **Build and Run with Docker Compose:**
    Ensure Docker Desktop is running. From the root directory of the project:
    ```bash
    docker-compose up --build
    ```
    This command will:
    *   Build the Docker images for the backend and frontend services if they don't exist or if `Dockerfile`s have changed.
    *   Start containers for the backend, frontend, and a PostgreSQL database (as defined in `docker-compose.yml`).
    *   The frontend should be accessible at `http://localhost:3000` and the backend API at `http://localhost:8080` (or as configured).

4.  **Database Migrations (Backend):**
    After the backend service starts successfully via Docker Compose, you may need to run database migrations. You can do this by executing the migration command inside the running backend container:
    ```bash
    docker-compose exec backend bun run db:migrate
    ```
    Alternatively, for initial setup or if you prefer to manage it from your host:
    ```bash
    cd backend
    bun run db:migrate # Ensure your .env here points to the Dockerized DB
    cd ..
    ```

### Running Services Individually (Alternative to Docker Compose)

If you prefer to run services outside of Docker Compose (e.g., for more direct debugging):

*   **Backend Service:**
    Refer to the detailed instructions in `backend/README.md`.
    ```bash
    cd backend
    # Setup .env, install dependencies (bun install)
    bun run dev
    ```

*   **Frontend Service:**
    Refer to the detailed instructions in `frontend/README.md`.
    ```bash
    cd frontend
    # Setup .env.local, install dependencies (bun install)
    bun run dev
    ```
    Ensure the backend service is running and accessible to the frontend.

## Docker Orchestration (`docker-compose.yml`)

The `docker-compose.yml` file in the root directory is configured to build and run:
*   The **backend** service.
*   The **frontend** service.
*   A **PostgreSQL** database service for the backend.

**Key services and ports (default):**
*   `frontend`: `http://localhost:3000`
*   `backend`: `http://localhost:8080`
*   `db` (PostgreSQL): Port `5432` (typically accessed by the backend service within the Docker network)

To start all services:
```bash
docker-compose up
```

To start in detached mode:
```bash
docker-compose up -d
```

To stop services:
```bash
docker-compose down
```

To rebuild images and restart:
```bash
docker-compose up --build
```

## Documentation

*   For backend details: `backend/README.md`
*   For frontend details: `frontend/README.md`