import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
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
  process.env.VERYFI_API_KEY,
  process.env.VERYFI_CLIENT_SECRET
);

// Test endpoint
app.get("/test-env", (req, res) => {
  res.json({
    SUPABASE_URL: process.env.SUPABASE_URL ? "OK" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING",
    VERYFI_CLIENT_ID: process.env.VERYFI_CLIENT_ID ? "OK" : "MISSING",
    VERYFI_USERNAME: process.env.VERYFI_USERNAME ? "OK" : "MISSING",
    VERYFI_API_KEY: process.env.VERYFI_API_KEY ? "OK" : "MISSING",
    VERYFI_CLIENT_SECRET: process.env.VERYFI_CLIENT_SECRET ? "OK" : "MISSING"
  });
});

// Invoice extraction endpoint
app.post("/extract-invoice", async (req, res) => {
  let tempPath = null; // We create this variable here so we can delete the file even if an error occurs

  try {
    const { base64 } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Missing base64 invoice data" });
    }

    // 1. Create a Buffer from the base64 string
    const buffer = Buffer.from(base64, "base64");
    
    // 2. Define the path inside your new 'uploads' folder
    // We use Date.now() to make sure every file has a unique name
    const fileName = `invoice-${Date.now()}.pdf`;
    tempPath = path.join("uploads", fileName);

    // 3. Write the file to your 'uploads' folder
    fs.writeFileSync(tempPath, buffer);

    // 4. Send the REAL FILE PATH to Veryfi
    // This fixes the 'Object instead of String' error
    const result = await veryfiClient.process_document(tempPath);

    // 5. Cleanup: Delete the file from the uploads folder immediately
    fs.unlinkSync(tempPath); 

    // 6. Map fields for Supabase
    const invoiceData = {
      supplier_name: result.vendor?.name || null,
      invoice_number: result.invoice_number || null,
      invoice_date: result.invoice_date || null,
      total: result.total || null,
      currency: result.currency_code || null,
      line_items: result.line_items || [],
      raw_json: result
    };

    // 7. Save to your Supabase Database
    const { data, error } = await supabase
      .from("invoices")
      .insert(invoiceData)
      .select();

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: "Supabase insert failed" });
    }

    res.json({
      message: "Invoice processed and saved successfully",
      invoice: data[0]
    });

  } catch (err) {
    console.error("Extraction error:", err);
    
    // Safety check: If Veryfi failed, we still want to delete the temp file
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    
    res.status(500).json({ error: "Extraction failed", details: err.message });
  }
});