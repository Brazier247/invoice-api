import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import Veryfi from "@veryfi/veryfi-sdk";
import { createClient } from "@supabase/supabase-js";

console.log("Checking Supabase Config:", {
  url: process.env.SUPABASE_URL ? "FOUND" : "MISSING",
  key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "FOUND" : "MISSING"
});
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
  let tempPath = null;

  try {
    const { base64 } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Missing base64 invoice data" });
    }

    // 1. Create a Buffer from the base64 string
    const buffer = Buffer.from(base64, "base64");
    
    // 2. Define the path inside your 'uploads' folder
    const fileName = `invoice-${Date.now()}.pdf`;
    tempPath = path.join("uploads", fileName);

    // 3. Write the file to your 'uploads' folder
    fs.writeFileSync(tempPath, buffer);

    // 4 & 5. Send to Veryfi and Cleanup [IMPORTANT: DON'T SKIP THIS]
    const result = await veryfiClient.process_document(tempPath);
    fs.unlinkSync(tempPath); 

    // 6. Map fields to YOUR specific Supabase schema
    const mainInvoiceData = {
      invoice_number: result.invoice_number || `INV-${Date.now()}`,
      invoice_date: result.invoice_date || null,
      due_date: result.due_date || null,
      vendor_name: result.vendor?.name || null,
      vendor_address: result.vendor?.address || null,
      vendor_email: result.vendor?.email || null,
      vendor_phone: result.vendor?.phonenumber || null,
      customer_name: result.bill_to?.name || null,
      customer_address: result.bill_to?.address || null,
      subtotal: result.subtotal || null,
      tax_amount: result.tax || null,
      tax_rate: result.tax_lines?.[0]?.rate || null,
      total_amount: result.total || null,
      currency: result.currency_code || null,
      notes: result.notes || ""
    };

    // 7. Insert the Main Invoice into the 'invoices' table
    const { data: mainInvoice, error: mainError } = await supabase
      .from("invoices")
      .insert(mainInvoiceData)
      .select()
      .single();

    if (mainError) {
      console.error("Supabase main insert error:", mainError);
      return res.status(500).json({ error: "Invoice header insert failed" });
    }

    // 8. Insert Line Items into 'invoice_line_items' if they exist
    if (result.line_items && result.line_items.length > 0) {
      const itemsToInsert = result.line_items.map(item => ({
        invoice_number: mainInvoice.invoice_number, 
        description: item.description || "No description",
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total: item.total || 0
      }));

      const { error: itemError } = await supabase
        .from("invoice_line_items")
        .insert(itemsToInsert);

      if (itemError) {
        console.error("Line items insert failed:", itemError);
      }
    }

    // 9. Send the FINAL successful response
    res.json({
      message: "Invoice and line items processed successfully",
      invoice: mainInvoice
    });

  } catch (err) {
    console.error("Extraction error:", err);
    
    // Safety cleanup
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    
    res.status(500).json({ error: "Extraction failed", details: err.message });
  }
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});