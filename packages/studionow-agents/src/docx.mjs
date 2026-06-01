import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType
} from "docx";

export async function buildScriptDocx({ title, markdown, assets = [] }) {
  const { titleLine, metadataLines, tableRows } = parseScriptMarkdown(markdown);
  const assetMap = buildAssetMap(assets);
  const children = [];

  children.push(new Paragraph({
    text: titleLine || title || "StudioNow Script",
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 }
  }));

  for (const line of metadataLines) {
    children.push(new Paragraph({
      children: parseInlineRuns(line, assetMap),
      spacing: { after: 120 }
    }));
  }

  children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
  children.push(buildTable(tableRows, [36, 16, 48], assetMap));

  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  return Packer.toBuffer(doc);
}

export async function buildProducerNotesDocx({ title, markdown }) {
  const blocks = parseMarkdownBlocks(markdown);
  const children = [
    new Paragraph({
      text: title || "Producer Notes",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 }
    })
  ];

  for (const block of blocks) {
    if (block.type === "heading") {
      children.push(new Paragraph({
        text: block.text,
        heading: headingLevelFor(block.level),
        spacing: { before: 180, after: 120 }
      }));
      continue;
    }

    if (block.type === "bullet") {
      children.push(new Paragraph({
        children: parseInlineRuns(block.text),
        bullet: { level: 0 },
        spacing: { after: 80 }
      }));
      continue;
    }

    if (block.type === "table") {
      children.push(buildTable(block.rows, block.widthWeights));
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      continue;
    }

    if (block.type === "rule") {
      children.push(new Paragraph({
        border: {
          bottom: { color: "C9CDD3", size: 6, style: BorderStyle.SINGLE }
        },
        spacing: { after: 120 }
      }));
      continue;
    }

    children.push(new Paragraph({
      children: parseInlineRuns(block.text),
      spacing: { after: 120 }
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  return Packer.toBuffer(doc);
}

function parseScriptMarkdown(markdown) {
  const lines = normalize(markdown).split("\n");
  const titleLine = lines.find((line) => /^\[.*\]$/.test(line.trim()))?.trim().replace(/^\[(.*)\]$/, "$1") || "";
  const firstTableIndex = lines.findIndex((line) => /^\|/.test(line.trim()));
  const metadataLines = lines
    .slice(0, firstTableIndex === -1 ? lines.length : firstTableIndex)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[.*\]$/.test(line));

  const tableLines = lines.slice(firstTableIndex).filter((line) => /^\|/.test(line.trim()));
  const rows = parseMarkdownTable(tableLines);
  return { titleLine, metadataLines, tableRows: rows };
}

function parseMarkdownBlocks(markdown) {
  const lines = normalize(markdown).split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^- /.test(line.trim())) {
      blocks.push({ type: "bullet", text: line.trim().slice(2).trim() });
      i += 1;
      continue;
    }

    if (/^\|/.test(line.trim())) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      blocks.push({
        type: "table",
        rows: parseMarkdownTable(tableLines),
        widthWeights: inferWidthWeights(parseMarkdownTable(tableLines)[0] || [])
      });
      continue;
    }

    const paragraphLines = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s+/.test(lines[i]) && !/^- /.test(lines[i].trim()) && !/^\|/.test(lines[i].trim()) && !/^---+$/.test(lines[i].trim())) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function parseMarkdownTable(lines) {
  const rows = [];
  for (const line of lines) {
    if (/^\|\s*-/.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function buildTable(rows, widthWeights = [], assetMap = new Map()) {
  const safeRows = rows.length ? rows : [["No content"]];
  const weights = widthWeights.length ? widthWeights : inferWidthWeights(safeRows[0]);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: safeRows.map((cells, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: cells.map((cell, cellIndex) => new TableCell({
        width: { size: weights[cellIndex] || Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
        shading: rowIndex === 0 ? { fill: "F1F3F5", type: ShadingType.CLEAR, color: "auto" } : undefined,
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: cellToParagraphs(cell, rowIndex === 0, assetMap)
      }))
    }))
  });
}

function cellToParagraphs(text, isHeader = false, assetMap = new Map()) {
  const parts = String(text || "").split(/\s{2,}\n|\n/);
  return parts.map((part) => new Paragraph({
    children: isHeader ? [new TextRun({ text: stripMarkdown(part), bold: true })] : parseInlineRuns(part, assetMap),
    spacing: { after: 80 }
  }));
}

function parseInlineRuns(text, assetMap = new Map()) {
  const runs = [];
  const pattern = /(\[Asset\s+\d+\]|\*\*[^*]+\*\*|\*[^*]+\*)/gi;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: stripMarkdown(text.slice(lastIndex, match.index)) }));
    }
    const token = match[0];
    const asset = assetMap.get(normalizeAssetId(token));
    if (asset) {
      runs.push(new ImageRun({
        data: Buffer.from(asset.data, "base64"),
        transformation: { width: 150, height: 96 },
        type: imageRunType(asset.mediaType)
      }));
      runs.push(new TextRun({ text: ` ${asset.id}`, italics: true, color: "666666", size: 18 }));
    } else if (/^\[Asset\s+\d+\]$/i.test(token)) {
      runs.push(new TextRun({ text: token, italics: true, color: "666666" }));
    } else if (token.startsWith("**")) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: stripMarkdown(text.slice(lastIndex)) }));
  }

  return runs.length ? runs : [new TextRun({ text: stripMarkdown(text) })];
}

function buildAssetMap(assets) {
  const map = new Map();
  for (const asset of assets || []) {
    const data = asset?.data || asset?.base64;
    if (!asset?.id || !data) continue;
    map.set(normalizeAssetId(asset.id), { ...asset, data });
  }
  return map;
}

function normalizeAssetId(value) {
  const match = String(value || "").match(/Asset\s+(\d+)/i);
  return match ? `Asset ${match[1]}` : String(value || "").trim();
}

function imageRunType(mediaType) {
  const subtype = String(mediaType || "image/jpeg").split("/")[1] || "jpeg";
  if (subtype === "jpeg") return "jpg";
  return subtype.toLowerCase();
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/\\n/g, "\n")
    .replace(/`/g, "")
    .trim();
}

function inferWidthWeights(headerRow) {
  const joined = headerRow.join(" ").toLowerCase();
  if (joined.includes("audio") && joined.includes("visual")) {
    return [36, 14, 50];
  }
  if (headerRow.length === 2) return [36, 64];
  if (headerRow.length === 3) return [26, 22, 52];
  return new Array(headerRow.length).fill(Math.floor(100 / Math.max(1, headerRow.length)));
}

function headingLevelFor(level) {
  if (level === 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
}

function normalize(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}
