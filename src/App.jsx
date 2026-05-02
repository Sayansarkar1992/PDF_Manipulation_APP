import { useState } from "react";

const actionContent = {
  compress: {
    eyebrow: "Reduce Size",
    title: "Compress a PDF for easier sharing",
    description:
      "Rasterize pages at a smaller scale and quality to create a lighter file. Best for upload-friendly copies.",
    accent: "amber",
  },
  merge: {
    eyebrow: "Combine Files",
    title: "Join multiple PDFs into one clean document",
    description:
      "Preserve page order, rearrange files visually, and export a single merged PDF in the browser.",
    accent: "teal",
  },
  split: {
    eyebrow: "Slice Precisely",
    title: "Split one PDF into page-range packs",
    description:
      "Define ranges like 1-3, 5, 8-10 and download separate PDFs together as a zip archive.",
    accent: "rose",
  },
};

const compressionProfiles = [
  {
    id: "gentle",
    label: "Gentle",
    scale: 1.2,
    quality: 0.86,
    note: "Better visual quality, smaller reduction.",
  },
  {
    id: "balanced",
    label: "Balanced",
    scale: 1,
    quality: 0.72,
    note: "Recommended for sharing and storage.",
  },
  {
    id: "tight",
    label: "Tight",
    scale: 0.78,
    quality: 0.56,
    note: "Maximum size reduction with lower fidelity.",
  },
];

const preferredMergeRenderScale = 1.5;
const maxMergeCanvasPixels = 12_000_000;
const maxMergeCanvasSide = 4096;

const initialState = {
  compress: false,
  merge: false,
  split: false,
};

let compressionModulesPromise;
let pdfLibPromise;
let zipPromise;

async function loadCompressionModules() {
  if (!compressionModulesPromise) {
    compressionModulesPromise = Promise.all([
      import("jspdf"),
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([jspdfModule, pdfjsModule, workerModule]) => {
      pdfjsModule.GlobalWorkerOptions.workerSrc = workerModule.default;

      return {
        AnnotationMode: pdfjsModule.AnnotationMode,
        jsPDF: jspdfModule.jsPDF,
        getDocument: pdfjsModule.getDocument,
      };
    });
  }

  return compressionModulesPromise;
}

async function loadPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = import("pdf-lib").then((module) => module.PDFDocument);
  }

  return pdfLibPromise;
}

async function loadZip() {
  if (!zipPromise) {
    zipPromise = import("jszip").then((module) => module.default);
  }

  return zipPromise;
}

function App() {
  const [activeAction, setActiveAction] = useState("compress");
  const [compressFile, setCompressFile] = useState(null);
  const [compressionMode, setCompressionMode] = useState("balanced");
  const [mergeFiles, setMergeFiles] = useState([]);
  const [splitFile, setSplitFile] = useState(null);
  const [splitRanges, setSplitRanges] = useState("");
  const [splitPageCount, setSplitPageCount] = useState(null);
  const [loading, setLoading] = useState(initialState);
  const [status, setStatus] = useState({
    type: "idle",
    message: "Your files stay in the browser. Nothing uploads anywhere.",
  });

  const activeCopy = actionContent[activeAction];
  const setBusy = (key, value) => {
    setLoading((current) => ({ ...current, [key]: value }));
  };

  const resetStatus = (message) => {
    setStatus({ type: "idle", message });
  };

  const handleCompressFile = (event) => {
    const [file] = Array.from(event.target.files ?? []);
    setCompressFile(file ?? null);
    if (file) {
      resetStatus(`Selected ${file.name} for compression.`);
    }
    event.target.value = "";
  };

  const handleMergeFiles = (event) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setMergeFiles((current) => {
      const existingFileKeys = new Set(current.map(getFileKey));
      const nextFiles = files.filter((file) => !existingFileKeys.has(getFileKey(file)));

      return [...current, ...nextFiles];
    });
    resetStatus(`Added ${files.length} PDF file${files.length > 1 ? "s" : ""} to the merge list.`);
    event.target.value = "";
  };

  const handleMoveMergeFile = (index, direction) => {
    setMergeFiles((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }

      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleRemoveMergeFile = (index) => {
    setMergeFiles((current) => {
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
    resetStatus("Removed PDF from the merge list.");
  };

  const handleSplitFile = async (event) => {
    const [file] = Array.from(event.target.files ?? []);
    setSplitFile(file ?? null);
    setSplitPageCount(null);

    if (!file) {
      return;
    }

    try {
      const PDFDocument = await loadPdfLib();
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const pageCount = pdf.getPageCount();
      setSplitPageCount(pageCount);
      setSplitRanges("");
      resetStatus(`Loaded ${file.name} with ${pageCount} page${pageCount > 1 ? "s" : ""}.`);
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: "This file could not be read as a PDF.",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleCompress = async () => {
    if (!compressFile) {
      setStatus({ type: "error", message: "Choose a PDF file to compress first." });
      return;
    }

    setBusy("compress", true);
    setStatus({ type: "working", message: "Compressing PDF pages. This can take a moment." });

    try {
      const activeProfile =
        compressionProfiles.find((profile) => profile.id === compressionMode) ?? compressionProfiles[1];
      const PDFDocument = await loadPdfLib();
      const { jsPDF, getDocument } = await loadCompressionModules();
      const bytes = await compressFile.arrayBuffer();
      const optimizedPdf = await PDFDocument.load(bytes);
      const optimizedBytes = await optimizedPdf.save({
        useObjectStreams: true,
        updateFieldAppearances: false,
      });
      const optimizedBlob = new Blob([optimizedBytes], { type: "application/pdf" });
      const pdf = await getDocument({ data: bytes }).promise;
      let doc;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: activeProfile.scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas rendering is not available in this browser.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;

        const image = canvas.toDataURL("image/jpeg", activeProfile.quality);
        const pageWidth = viewport.width;
        const pageHeight = viewport.height;
        const orientation = pageWidth > pageHeight ? "landscape" : "portrait";

        if (!doc) {
          doc = new jsPDF({
            orientation,
            unit: "pt",
            format: [pageWidth, pageHeight],
            compress: true,
          });
        } else {
          doc.addPage([pageWidth, pageHeight], orientation);
          doc.setPage(pageNumber);
        }

        doc.addImage(image, "JPEG", 0, 0, pageWidth, pageHeight, undefined, "MEDIUM");
      }

      const rasterBlob = doc.output("blob");
      const candidates = [optimizedBlob, rasterBlob].filter((blob) => blob.size < compressFile.size);
      const output = candidates.sort((left, right) => left.size - right.size)[0];

      if (!output) {
        setStatus({
          type: "error",
          message:
            "This PDF is already compact. The generated copies were not smaller than the original.",
        });
        return;
      }

      const outputName = compressFile.name.replace(/\.pdf$/i, "") + "-compressed.pdf";
      triggerDownload(output, outputName);
      const reduction = Math.max(0, Math.round(((compressFile.size - output.size) / compressFile.size) * 100));

      setStatus({
        type: "success",
        message: `Compressed PDF downloaded as ${outputName} with about ${reduction}% size reduction.`,
      });
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: "Compression failed. Try a different file or a lighter compression mode.",
      });
    } finally {
      setBusy("compress", false);
    }
  };

  const handleMerge = async () => {
    if (mergeFiles.length < 2) {
      setStatus({
        type: "error",
        message: "Add at least two PDFs to create a merged file.",
      });
      return;
    }

    setBusy("merge", true);
    setStatus({ type: "working", message: "Rendering and merging selected PDFs." });

    try {
      const { AnnotationMode, jsPDF, getDocument } = await loadCompressionModules();
      let mergedDoc;
      let pageCount = 0;

      for (const file of mergeFiles) {
        let sourcePdf;

        try {
          const bytes = await file.arrayBuffer();
          sourcePdf = await getDocument({
            data: bytes,
            enableXfa: true,
            stopAtErrors: false,
          }).promise;
        } catch (error) {
          throw new Error(`Could not read "${file.name}". ${formatPdfError(error)}`);
        }

        for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
          try {
            const page = await sourcePdf.getPage(pageNumber);
            const outputViewport = page.getViewport({ scale: 1 });
            const renderScale = getMergeRenderScale(outputViewport);
            const renderViewport = page.getViewport({ scale: renderScale });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d", { alpha: false });

            if (!context) {
              throw new Error("Canvas rendering is not available in this browser.");
            }

            canvas.width = Math.ceil(renderViewport.width);
            canvas.height = Math.ceil(renderViewport.height);
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
              annotationMode: AnnotationMode?.ENABLE_FORMS ?? 2,
              canvasContext: context,
              intent: "display",
              viewport: renderViewport,
            }).promise;

            const pageWidth = outputViewport.width;
            const pageHeight = outputViewport.height;
            const orientation = pageWidth > pageHeight ? "landscape" : "portrait";
            const pageFormat = [pageWidth, pageHeight];

            if (!mergedDoc) {
              mergedDoc = new jsPDF({
                orientation,
                unit: "pt",
                format: pageFormat,
                compress: true,
              });
            } else {
              mergedDoc.addPage(pageFormat, orientation);
              mergedDoc.setPage(pageCount + 1);
            }

            mergedDoc.addImage(
              canvas.toDataURL("image/jpeg", 0.95),
              "JPEG",
              0,
              0,
              pageWidth,
              pageHeight,
              undefined,
              "FAST",
            );

            page.cleanup();
            canvas.width = 0;
            canvas.height = 0;
            pageCount += 1;
          } catch (error) {
            throw new Error(
              `Could not render page ${pageNumber} from "${file.name}". ${formatPdfError(error)}`,
            );
          }
        }

        await sourcePdf.destroy();
      }

      if (!mergedDoc || pageCount === 0) {
        throw new Error("Merge failed because no pages were found in the selected PDFs.");
      }

      const output = mergedDoc.output("blob");
      triggerDownload(output, "merged-document.pdf");

      setStatus({
        type: "success",
        message: `Merged ${mergeFiles.length} PDFs into ${pageCount} page${pageCount === 1 ? "" : "s"} and downloaded merged-document.pdf.`,
      });
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: error.message || "Merge failed. Confirm all selected files are valid PDFs.",
      });
    } finally {
      setBusy("merge", false);
    }
  };

  const handleSplit = async () => {
    if (!splitFile) {
      setStatus({ type: "error", message: "Choose a PDF file to split first." });
      return;
    }

    setBusy("split", true);
    setStatus({ type: "working", message: "Creating split files and packaging them in a zip." });

    try {
      const [PDFDocument, JSZip] = await Promise.all([loadPdfLib(), loadZip()]);
      const groups = parseRanges(splitRanges, splitPageCount);
      const bytes = await splitFile.arrayBuffer();
      const sourcePdf = await PDFDocument.load(bytes);
      const zip = new JSZip();
      const baseName = splitFile.name.replace(/\.pdf$/i, "");

      for (const group of groups) {
        const nextPdf = await PDFDocument.create();
        const pageIndexes = group.map((pageNumber) => pageNumber - 1);
        const pages = await nextPdf.copyPages(sourcePdf, pageIndexes);
        pages.forEach((page) => nextPdf.addPage(page));

        const chunk = await nextPdf.save();
        const label = formatRangeLabel(group);
        zip.file(`${baseName}-${label}.pdf`, chunk);
      }

      const archive = await zip.generateAsync({ type: "blob" });
      triggerDownload(archive, `${baseName}-split.zip`);

      setStatus({
        type: "success",
        message: `Created ${groups.length} split PDF file${groups.length > 1 ? "s" : ""}.`,
      });
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: error.message || "Split failed. Check the page range format and try again.",
      });
    } finally {
      setBusy("split", false);
    }
  };

  return (
    <main className={`shell accent-${activeCopy.accent}`}>
      <section className="workspace">
        <div className="action-tabs" role="tablist" aria-label="PDF actions">
          {Object.entries(actionContent).map(([key, action]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === activeAction}
              className={key === activeAction ? "tab active" : "tab"}
              onClick={() => setActiveAction(key)}
            >
              <span>{action.eyebrow}</span>
              <strong>{action.title}</strong>
            </button>
          ))}
        </div>

        <div className="tool-grid">
          <section className="tool-card">
            {activeAction === "compress" ? (
              <CompressPanel
                compressFile={compressFile}
                compressionMode={compressionMode}
                onFileChange={handleCompressFile}
                onModeChange={setCompressionMode}
                onRun={handleCompress}
                working={loading.compress}
              />
            ) : null}

            {activeAction === "merge" ? (
              <MergePanel
                files={mergeFiles}
                onFilesChange={handleMergeFiles}
                onMove={handleMoveMergeFile}
                onRemove={handleRemoveMergeFile}
                onRun={handleMerge}
                working={loading.merge}
              />
            ) : null}

            {activeAction === "split" ? (
              <SplitPanel
                splitFile={splitFile}
                splitRanges={splitRanges}
                splitPageCount={splitPageCount}
                onFileChange={handleSplitFile}
                onRangeChange={setSplitRanges}
                onRun={handleSplit}
                working={loading.split}
              />
            ) : null}

            <p className="status-message">{status.message}</p>
          </section>
        </div>
      </section>
    </main>
  );
}

function CompressPanel({ compressFile, compressionMode, onFileChange, onModeChange, onRun, working }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Compress PDF</p>
          <h3>Generate a smaller copy</h3>
        </div>
      </div>

      <div className="file-picker">
        <input
          id="compress-file-input"
          className="file-picker-input"
          type="file"
          accept="application/pdf"
          onChange={onFileChange}
        />
        <label htmlFor="compress-file-input" className="file-picker-button">
          Choose PDF file
        </label>
        <p className="file-picker-hint">Select one PDF file</p>
      </div>

      {compressFile ? (
        <div className="file-line">
          <strong>{compressFile.name}</strong>
          <span>{formatSize(compressFile.size)}</span>
        </div>
      ) : null}

      <div className="profile-list">
        {compressionProfiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className={profile.id === compressionMode ? "profile active" : "profile"}
            onClick={() => onModeChange(profile.id)}
          >
            <strong>{profile.label}</strong>
            <span>{profile.note}</span>
          </button>
        ))}
      </div>

      <button type="button" className="primary-button" onClick={onRun} disabled={working}>
        {working ? "Compressing..." : "Download compressed PDF"}
      </button>
    </div>
  );
}

function MergePanel({ files, onFilesChange, onMove, onRemove, onRun, working }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Merge PDFs</p>
          <h3>Build one combined document</h3>
        </div>
      </div>

      <div className="file-picker">
        <input
          id="merge-file-input"
          className="file-picker-input"
          type="file"
          accept="application/pdf"
          multiple
          onChange={onFilesChange}
        />
        <label htmlFor="merge-file-input" className="file-picker-button">
          Choose PDF files
        </label>
        <p className="file-picker-hint">Select two or more PDF files</p>
      </div>

      <div className="file-stack">
        {files.length === 0 ? (
          <p className="placeholder">No files selected yet.</p>
        ) : (
          files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="merge-row">
              <div>
                <strong>{file.name}</strong>
                <span>{formatSize(file.size)}</span>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}>
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, 1)}
                  disabled={index === files.length - 1}
                >
                  Down
                </button>
                <button type="button" onClick={() => onRemove(index)}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button type="button" className="primary-button" onClick={onRun} disabled={working}>
        {working ? "Merging..." : "Download merged PDF"}
      </button>
    </div>
  );
}

function SplitPanel({
  splitFile,
  splitRanges,
  splitPageCount,
  onFileChange,
  onRangeChange,
  onRun,
  working,
}) {
  const splitPlaceholder = splitPageCount
    ? `How to split\nUse commas to create separate output files.\nExamples: 1-3, 4-6, 7\nDetected pages: 1-${splitPageCount}`
    : "How to split\nUse commas to create separate output files.\nExamples: 1-3, 4-6, 7";

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Split PDF</p>
          <h3>Export selected page groups</h3>
        </div>
      </div>

      <div className="file-picker">
        <input
          id="split-file-input"
          className="file-picker-input"
          type="file"
          accept="application/pdf"
          onChange={onFileChange}
        />
        <label htmlFor="split-file-input" className="file-picker-button">
          Choose PDF file
        </label>
        <p className="file-picker-hint">Select one PDF file</p>
      </div>

      {splitFile ? (
        <div className="file-line">
          <strong>{splitFile.name}</strong>
          <span>
            {formatSize(splitFile.size)}
            {splitPageCount ? ` • ${splitPageCount} pages` : ""}
          </span>
        </div>
      ) : null}

      <label className="field">
        <span>Page ranges</span>
        <textarea
          rows="4"
          value={splitRanges}
          onChange={(event) => onRangeChange(event.target.value)}
          placeholder={splitPlaceholder}
        />
      </label>

      <button type="button" className="primary-button" onClick={onRun} disabled={working}>
        {working ? "Splitting..." : "Download zip of split PDFs"}
      </button>
    </div>
  );
}

function parseRanges(input, maxPageCount) {
  if (!input.trim()) {
    throw new Error("Enter at least one page range.");
  }

  return input.split(",").map((token) => {
    const trimmed = token.trim();

    if (!trimmed) {
      throw new Error("Page ranges contain an empty entry.");
    }

    if (trimmed.includes("-")) {
      const [startText, endText] = trimmed.split("-").map((segment) => segment.trim());
      const start = Number(startText);
      const end = Number(endText);

      if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0 || start > end) {
        throw new Error(`Invalid page range: ${trimmed}`);
      }

      if (maxPageCount && end > maxPageCount) {
        throw new Error(`Range ${trimmed} exceeds the page count.`);
      }

      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }

    const page = Number(trimmed);

    if (!Number.isInteger(page) || page <= 0) {
      throw new Error(`Invalid page number: ${trimmed}`);
    }

    if (maxPageCount && page > maxPageCount) {
      throw new Error(`Page ${page} exceeds the page count.`);
    }

    return [page];
  });
}

function formatRangeLabel(group) {
  if (group.length === 1) {
    return `page-${group[0]}`;
  }

  return `pages-${group[0]}-${group[group.length - 1]}`;
}

function formatSize(size) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getMergeRenderScale(viewport) {
  const sideScale = Math.min(
    preferredMergeRenderScale,
    maxMergeCanvasSide / viewport.width,
    maxMergeCanvasSide / viewport.height,
  );
  const pixelScale = Math.sqrt(maxMergeCanvasPixels / (viewport.width * viewport.height));

  return Math.max(0.5, Math.min(preferredMergeRenderScale, sideScale, pixelScale));
}

function getFileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatPdfError(error) {
  const message = error instanceof Error ? error.message : "";

  if (!message) {
    return "The browser PDF parser rejected this file.";
  }

  if (/encrypted/i.test(message)) {
    return "It appears to be encrypted or permission-protected.";
  }

  if (/password/i.test(message)) {
    return "It appears to need a password before it can be merged.";
  }

  if (/invalid|parse|xref|trailer|object/i.test(message)) {
    return "It opens in a reader, but its internal PDF structure is not accepted by this browser merger.";
  }

  return message;
}

function triggerDownload(blob, fileName) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(href), 1200);
}

export default App;
