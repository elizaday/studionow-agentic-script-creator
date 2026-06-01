import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_DPI = 96;
const DEFAULT_JPEG_QUALITY = 72;
const DEFAULT_SCALE_TO = 1280;
const DEFAULT_MAX_PAGES = 40;

export async function pdfToImageAttachments({
  pdfPath = null,
  pdfBase64 = null,
  source = "uploaded pdf",
  filename = null,
  dpi = DEFAULT_DPI,
  maxPages = DEFAULT_MAX_PAGES,
  startAssetIndex = 1
} = {}) {
  if (!pdfPath && !pdfBase64) {
    throw new Error("pdfToImageAttachments requires pdfPath or pdfBase64");
  }

  const workDir = await mkdtemp(join(tmpdir(), "sn-pdf-"));
  let resolvedPdfPath = pdfPath ? resolve(process.cwd(), pdfPath) : null;
  let cleanupBase64 = false;
  if (!resolvedPdfPath) {
    resolvedPdfPath = join(workDir, "input.pdf");
    await writeFile(resolvedPdfPath, Buffer.from(pdfBase64, "base64"));
    cleanupBase64 = true;
  }

  try {
    await runPdftoppm({
      input: resolvedPdfPath,
      outDir: workDir,
      dpi,
      lastPage: maxPages
    });

    const files = (await readdir(workDir))
      .filter((name) => name.toLowerCase().endsWith(".jpg"))
      .sort();

    const attachments = [];
    let assetIndex = startAssetIndex;
    for (const file of files) {
      const buf = await readFile(join(workDir, file));
      const pageMatch = file.match(/-(\d+)\.jpg$/i);
      const pageNumber = pageMatch ? Number(pageMatch[1]) : assetIndex - startAssetIndex + 1;
      attachments.push({
        id: `Asset ${assetIndex}`,
        source: filename ? `${filename} p.${pageNumber}` : `${source} p.${pageNumber}`,
        filename: file,
        mediaType: "image/jpeg",
        base64: buf.toString("base64"),
        detail: "auto"
      });
      assetIndex += 1;
    }

    return attachments;
  } finally {
    if (cleanupBase64 || workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function runPdftoppm({ input, outDir, dpi, lastPage }) {
  const args = [
    "-r", String(dpi),
    "-jpeg",
    "-jpegopt", `quality=${DEFAULT_JPEG_QUALITY}`,
    "-scale-to", String(DEFAULT_SCALE_TO),
    "-l", String(lastPage),
    input,
    join(outDir, "page")
  ];
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("pdftoppm", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      rejectRun(new Error(`pdftoppm failed to start: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`pdftoppm exited ${code}: ${stderr.trim()}`));
      }
    });
  });
}
