// Convert base64 to Buffer for Veryfi SDK
const buffer = Buffer.from(base64, "base64");

// Extract with Veryfi
const result = await veryfiClient.process_document(buffer);