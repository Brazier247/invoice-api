import express from "express";
import cors from "cors";
import Veryfi from "@veryfi/veryfi-sdk";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increased limit for PDFs

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Veryfi client
const veryfiClient = new Veryfi(
  process.env.VERYFI_CLIENT_ID,
  process.env.VERYFI_USERNAME,
  process.env.VERYFI_API_KEY
);

// Test endpoint
app.get("/test-env", (req, res) => {
  res.json({
    SUPABASE_URL: process.env.SUPABASE_URL ? "OK" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING",
    VERYFI_CLIENT_ID: process.env.VERYFI_CLIENT_ID ? "OK" : "MISSING",
    VERYFI_USERNAME: process.env.VERYFI_USERNAME ? "OK" : "MISSING",
    VERYFI_API_KEY: process.env.VERYFI_API_KEY ? "OK" : "MISSING"
  });
});

// Invoice extraction endpoint
app.post("/extract-invoice", async (req, res) => {
  try {
    const { base64 } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Missing base64 invoice" });
    }

    // Extract with Veryfi using base64
    const result = await veryfiClient.process_document({
      file_data: base64,
      file_name: "invoice.jpg"
    });

    // Map fields for Supabase
    const invoiceData = {
      supplier_name: result.vendor?.name || null,
      invoice_number: result.invoice_number || null,
      invoice_date: result.invoice_date || null,
      total: result.total || null,
      currency: result.currency_code || null,
      line_items: result.line_items || [],
      raw_json: result
    };

    const { data, error } = await supabase
      .from("invoices")
      .insert(invoiceData)
      .select();

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: "Supabase insert failed" });
    }

    res.json({
      message: "Invoice processed",
      invoice: data[0]
    });

  } catch (err) {
    console.error("Extraction error:", err);
    res.status(500).json({ error: "Extraction failed" });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});