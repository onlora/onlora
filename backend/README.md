# Backend for onlora.ai

This is the backend service for the onlora.ai application. It's built with Hono, a lightweight, fast, and flexible web framework for Node.js, and uses TypeScript. The backend handles API requests, authentication, database interactions, and other server-side logic.

## ✨ Features

*   RESTful API for core application functionalities (jams, posts, comments, users, feed, search, models)
*   Authentication using `better-auth`
*   Database management with Drizzle ORM and PostgreSQL
*   AI model interaction via `@ai-sdk/google` and `@ai-sdk/openai`
*   File storage using AWS S3
*   Structured logging with Pino
*   Containerized with Docker

## 🛠️ Technologies Used

*   **Framework:** [Hono](https://hono.dev/)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **Runtime:** [Node.js](https://nodejs.org/)
*   **Database:** [PostgreSQL](https://www.postgresql.org/)
*   **ORM:** [Drizzle ORM](https://orm.drizzle.team/)
*   **Authentication:** [Better Auth](https://github.com/better-auth/better-auth) (assumption based on dependency and CLI tool)
*   **AI SDKs:** `@ai-sdk/google`, `@ai-sdk/openai`
*   **File Storage:** AWS S3
*   **Containerization:** [Docker](https://www.docker.com/)
*   **Package Manager:** [Bun](https://bun.sh/) (used for local development)

## 🚀 Getting Started

### Prerequisites

*   Node.js (v20 or higher recommended)
*   Bun (optional, for local development if preferred over npm/yarn)
*   PostgreSQL server
*   AWS S3 bucket and credentials (if using S3 related features)
*   Access to Google and/or OpenAI services and API keys (if using AI features)

### Environment Variables

Create a `.env` file in the `backend` root directory. You'll need to populate it with necessary environment variables. Refer to `src/config/index.ts` (or similar configuration files) for required variables. Common variables might include:

```env
DATABASE_URL="postgresql://user:password@host:port/database"
PORT="8080"
LOG_LEVEL="info" # or "debug" for more verbose logging

# Auth variables (check better-auth documentation)
# e.g., AUTH_SECRET="your-super-secret-auth-key"
#       AUTH_REDIRECT_PROXY_URL="http://localhost:3000" (if using a frontend proxy)


# AWS S3 credentials (if applicable)
AWS_ACCESS_KEY_ID="your_aws_access_key_id"
AWS_SECRET_ACCESS_KEY="your_aws_secret_access_key"
AWS_REGION="your_aws_region"
AWS_S3_BUCKET_NAME="your_s3_bucket_name"

# AI SDK keys (if applicable)
GOOGLE_API_KEY="your_google_api_key"
OPENAI_API_KEY="your_openai_api_key"

# Add other necessary variables based on src/config.ts
```

### Installation

1.  Clone the repository.
2.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
3.  Install dependencies. Use `bun install`:
    ```bash
    bun install
    ```

### Database Setup

1.  Ensure your PostgreSQL server is running and accessible.
2.  Update the `DATABASE_URL` in your `.env` file.
3.  Generate database schema (if you made changes to `src/db/schema.ts`):
    ```bash
    bun run db:generate
    ```
4.  Apply migrations to set up the database tables:
    ```bash
    bun run db:migrate
    ```
    Alternatively, for development, you might push schema changes directly (use with caution):
    ```bash
    bun run db:push
    ```
5.  To use Drizzle Studio (a GUI for your database):
    ```bash
    bun run db:studio
    ```

### Running the Application

#### Development Mode

To run the application in development mode with live reloading:

```bash
bun run dev
```

The server will typically start on `http://localhost:8080` (or the port specified in your `.env`).

#### Production Mode

1.  Build the application:
    ```bash
    bun run build
    ```
2.  Start the application:
    ```bash
    bun run start
    ```

## 📜 Available Scripts

*   `dev`: Starts the development server with `tsx` for live reloading.
*   `dev:worker`: Starts a development worker (details in `src/workerRunner.ts`).
*   `build`: Compiles the TypeScript code to JavaScript in the `dist` directory using `tsup`.
*   `start`: Runs the compiled application from the `dist` directory.
*   `db:generate`: Generates Drizzle ORM migration files based on schema changes.
*   `db:migrate`: Applies pending database migrations.
*   `db:studio`: Starts Drizzle Studio to explore and manage your database.
*   `db:push`: Pushes schema changes directly to the database (useful for development, use migrations for production).

## 🏗️ Project Structure (Simplified)

```
backend/
├── src/
│   ├── config/       # Application configuration
│   ├── db/           # Database schema, migrations, and utilities (Drizzle ORM)
│   ├── lib/          # Core libraries, utilities (e.g., auth setup)
│   ├── middleware/   # Hono middleware (e.g., authentication checks)
│   ├── routes/       # API route definitions
│   ├── services/     # Business logic and service layers
│   ├── types/        # TypeScript type definitions
│   └── index.ts      # Main application entry point
├── Dockerfile        # Docker configuration for building the application image
├── drizzle.config.ts # Drizzle ORM configuration
├── package.json      # Project metadata and dependencies
├── bun.lockb         # Bun lockfile
└── tsconfig.json     # TypeScript compiler options
```

## 🐳 Docker

The application includes a `Dockerfile` for containerization.

### Building the Docker Image

```bash
docker build -t onlora-backend .
```
(Ensure you are in the `backend` directory)

### Running the Docker Container

```bash
docker run -p 8080:8080 --env-file .env onlora-backend
```

This command maps port 8080 of the container to port 8080 on your host machine and passes the environment variables from your local `.env` file. Adjust port mapping and environment variable management as needed for your deployment environment.

##  API Endpoints

The backend exposes several API endpoints under the `/api` prefix. Key route groups include:

*   `/api/auth/*`: Authentication-related endpoints handled by `better-auth`.
*   `/api/jams`: Jam-related operations.
*   `/api/posts`: Post-related operations.
*   `/api/comments`: Comment-related operations.
*   `/api/feed`: Feed generation.
*   `/api/users`: User profile and management.
*   `/api/search`: Search functionality.
*   `/api/models`: AI model interactions.

Refer to the route definitions in `src/routes/` for detailed endpoint specifications and request/response formats.

##  Logging

The application uses Pino for structured logging. In development, logs are pretty-printed to the console. In production, logs are typically in JSON format for easier processing by log management systems. The log level can be configured via the `LOG_LEVEL` environment variable.

## Error Handling

The application has a global error handler that catches unhandled exceptions and formats error responses consistently. Validation errors (e.g., from Zod) are returned with a 400 status code and detailed error messages.
