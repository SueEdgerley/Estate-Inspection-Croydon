import { put } from "@vercel/blob";

export async function uploadInspectionPdfToBlob(opts: {
  inspectionId: string;
  pdfBytes: Uint8Array;
}) {
  const { inspectionId, pdfBytes } = opts;

  // Keep names stable and predictable
  const pathname = `inspections/${inspectionId}/report.pdf`;

  const blob = await put(pathname, pdfBytes, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false, // makes the URL stable for a given inspection
    cacheControlMaxAge: 0,  // avoid stale PDFs while you're iterating
  });

  return blob.url;
}
