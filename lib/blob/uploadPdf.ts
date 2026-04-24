import { put } from "@vercel/blob";

/**
 * Uploads a PDF to Vercel Blob Storage using `@vercel/blob` `put()`.
 * Server-side auth: set `BLOB_READ_WRITE_TOKEN` in the environment (Vercel
 * usually injects this when Blob is enabled for the project). See:
 * https://vercel.com/docs/storage/vercel-blob
 */

export async function uploadInspectionPdfToBlob(opts: {
  inspectionId: string;
  pdfBytes: Uint8Array;
  /** "report" = full PDF, "poster" = issues-only poster */
  kind?: "report" | "poster";
}) {
  const { inspectionId, pdfBytes, kind = "report" } = opts;

  const pathname =
    kind === "poster"
      ? `inspections/${inspectionId}/poster.pdf`
      : `inspections/${inspectionId}/report.pdf`;

  const blob = await put(pathname, pdfBytes, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });

  return blob.url;
}
