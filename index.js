import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.get("/test-env", (req, res) => {
  res.json({
    SUPABASE_URL: process.env.SUPABASE_URL ? "OK" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING",
    VERYFI_CLIENT_ID: process.env.VERYFI_CLIENT_ID ? "OK" : "MISSING",
    VERYFI_USERNAME: process.env.VERYFI_USERNAME ? "OK" : "MISSING",
    VERYFI_API_KEY: process.env.VERYFI_API_KEY ? "OK" : "MISSING"
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});