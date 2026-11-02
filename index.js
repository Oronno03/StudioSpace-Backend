require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/db");

// Export the Express app for Vercel's zero-config serverless adapter.
module.exports = app;

// Keep the traditional listener for local development and tests.
if (require.main === module) {
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
