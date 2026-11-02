import "dotenv/config";
import { pathToFileURL } from "node:url";
import app from "./src/app.js";
import connectDB from "./src/db.js";

// Export the Express app for Vercel's zero-config serverless adapter.
export default app;

// Keep the traditional listener for local development and tests.
const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const PORT = process.env.PORT || 5000;

  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`StudioSpace API running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Failed to connect to MongoDB:", err.message);
      process.exit(1);
    });
}
