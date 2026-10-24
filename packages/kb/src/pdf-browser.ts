// Browser-only: points pdf.js at its bundled worker. Import this module (lazily)
// before extractPdf in a WebView or browser; Node does not need it.
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export async function preparePdfWorker(): Promise<void> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}
