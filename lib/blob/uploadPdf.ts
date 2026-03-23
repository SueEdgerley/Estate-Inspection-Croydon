import { put } from "@vercel/blob";

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
