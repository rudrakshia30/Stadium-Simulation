# CrowdSphere AI

Intelligent matchday command system for safer stadiums and better fan experiences at FIFA World Cup 2026.

## Setup Instructions

To set up and run the application locally, follow these steps:

1. Clone the repository.
2. Install all dependencies:
   ```bash
   npm run install:all
   # Or individually:
   cd server && npm install
   cd ../client && npm install
   ```
3. Create a `.env` file in the `server` directory and add the required environment variables.
4. Start the application:
   ```bash
   npm run dev
   ```

## Environment Variables

The application requires the following environment variables to be set in your `server/.env` file:

*   `PORT`: The port on which the Express server will run (default: `8080`).
*   `NODE_ENV`: The environment mode (`development`, `production`, or `test`).
*   `JWT_SECRET`: A secure random string used to sign session cookies.
*   `OPS_ACCESS_CODE`: The password code used to access the Operations Command Centre.
*   `GEMINI_API_KEY`: Your Google Gemini API Key. If left blank, the application will run in demo fixture mode.
*   `GEMINI_MODEL`: The Gemini model identifier (default: `gemini-2.5-flash`).
*   `CLIENT_ORIGIN`: The origin URL of the client application (default: `http://localhost:5173`).

## Disclaimer

CrowdSphere AI is an independent demonstration prototype using simulated venue data. It is not affiliated with or endorsed by FIFA. All venue data, incidents, and scenarios are simulated for demonstration purposes. No real operations decisions should be made using this system.
