import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  Header,
  AlignmentType,
  PageOrientation,
  VerticalAlign,
  convertMillimetersToTwip,
} from "docx";

import { layouts } from "./layouts.js";
import { supportOptions } from "./supportOptions.js";
import { disclosureLevels } from "./disclosureLevels.js";
import { state } from "./script.js";

const skipNoneIdentified = ["exams", "interactiveTeaching", "librarySupport"];
const DISCLOSURE_PLACEHOLDER =
  "Once selected, the disclosure level will automatically be inserted into this section.";
const GENERAL_PLACEHOLDER_REGEX = /Once selected.*?inserted.*?here/i;

function createParagraph(text, bullet = false) {
  const cleaned = text
    ?.replace(/&nbsp;/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Skip if empty or only punctuation
  if (!cleaned || cleaned.length < 2 || /^[.·•\-–—*]+$/.test(cleaned))
    return null;

  return new Paragraph({
    children: [new TextRun({ text: cleaned, font: "Arial", size: 24 })],
    bullet: bullet ? { level: 0 } : undefined,
    spacing: { after: 100 },
  });
}

function parseHtmlToParagraphs(html, bullet = false) {
  console.log("📄 parseHtmlToParagraphs input:", html);

  const liRegex = /<li[^>]*>(.*?)<\/li>/gis;
  const lis = [...html.matchAll(liRegex)];

  // If it contains list items, parse each <li>
  if (lis.length > 0) {
    return lis
      .map((match) => {
        let content = match[1]
          ?.replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();
        console.log("  → list item:", content);
        return createParagraph(content, true);
      })
      .filter(Boolean); // filter out null/invalid paragraphs
  }

  // Otherwise, treat it as plain HTML content
  const plain = html.replace(/<[^>]+>/g, "").trim();
  return plain
    .split(/\n|\r/)
    .map((line) => {
      const cleaned = line.replace(/\s+/g, " ").trim();
      console.log("  → plain line:", cleaned);
      return createParagraph(cleaned, bullet);
    })
    .filter(Boolean); // remove nulls
}

function createStructuredParagraphs(option) {
  if (!Array.isArray(option.structuredText)) return [];

  return option.structuredText
    .map((block) => {
      if (!block?.content?.trim()) return null;
      if (block.type === "bullet") {
        return createParagraph(block.content, true);
      } else if (block.type === "subsection") {
        return new Paragraph({
          children: [
            new TextRun({
              text: block.content,
              font: "Arial",
              size: 24,
              bold: true,
            }),
          ],
          indent: { left: 360 },
          spacing: { after: 100 },
        });
      }
      return null;
    })
    .filter(Boolean);
}

async function generateDocx() {
  const layout = layouts[state.studyMethod];
  const selectedMap = {};

  for (const opt of supportOptions) {
    const hasContent = opt.text?.trim() || Array.isArray(opt.structuredText);
    if (state.selectedSupportIds.has(opt.id) && hasContent) {
      if (!selectedMap[opt.targetSection]) selectedMap[opt.targetSection] = [];
      selectedMap[opt.targetSection].push(opt);
    }
  }

  const disclosureLabel = disclosureLevels.find(
    (d) => d.value === state.disclosure
  )?.text;
  if (disclosureLabel?.trim()) {
    if (!selectedMap["disclosure"]) selectedMap["disclosure"] = [];
    selectedMap["disclosure"].push({
      id: "disclosure_level",
      text: disclosureLabel.trim(),
      targetSection: "disclosure",
    });
  }

  const rows = [];

  for (const [sectionId, section] of Object.entries(layout.sections)) {
    const isHeader = sectionId.toLowerCase().includes("header");
    const useBulletForLayout = ["generalRecommendations", "library"].includes(
      sectionId
    );
    const supportItems = selectedMap[sectionId] || [];
    const layoutText = section.content || "";
    const isDisclosure = sectionId === "disclosure";
    const hasPlaceholder = isDisclosure
      ? layoutText.includes(DISCLOSURE_PLACEHOLDER)
      : GENERAL_PLACEHOLDER_REGEX.test(layoutText);

    const content = [];

    if (section.title) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: section.title,
              font: "Arial",
              size: 24,
              bold: true,
            }),
          ],
          spacing: { after: 100 },
        })
      );
    }

    let insertedCount = 0;

    if (hasPlaceholder) {
      const [before = "", after = ""] = layoutText.split(
        isDisclosure ? DISCLOSURE_PLACEHOLDER : GENERAL_PLACEHOLDER_REGEX
      );
      content.push(...parseHtmlToParagraphs(before, useBulletForLayout));

      for (const opt of supportItems) {
        if (opt.structuredText) {
          const paras = createStructuredParagraphs(opt);
          content.push(...paras);
          insertedCount += paras.length;
        } else {
          const isDisclosure = sectionId === "disclosure";
          const para = createParagraph(opt.text, !isDisclosure ? true : false);
          if (para) {
            content.push(para);
            insertedCount++;
          }
        }
      }

      const hasOnlyPlaceholder =
        hasPlaceholder &&
        !layoutText.replace(GENERAL_PLACEHOLDER_REGEX, "").match(/\w{3,}/);

      if (
        insertedCount === 0 &&
        hasOnlyPlaceholder &&
        !skipNoneIdentified.includes(sectionId)
      ) {
        content.push(createParagraph("None identified at this time."));
      }

      content.push(...parseHtmlToParagraphs(after, useBulletForLayout));
    } else {
      content.push(...parseHtmlToParagraphs(layoutText, useBulletForLayout));

      for (const opt of supportItems) {
        if (opt.structuredText) {
          const paras = createStructuredParagraphs(opt);
          content.push(...paras);
          insertedCount += paras.length;
        } else {
          const para = createParagraph(opt.text, !isDisclosure);
          if (para) {
            content.push(para);
            insertedCount++;
          }
        }
      }
    }

    const validContent = content.filter((p) => p instanceof Paragraph);
    if (validContent.length > 0) {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: validContent,
              verticalAlign: VerticalAlign.CENTER,
              shading: isHeader ? { fill: "D9D9D9" } : undefined,
              borders: {
                bottom: { style: BorderStyle.SINGLE, size: 2, color: "AAAAAA" },
              },
            }),
          ],
        })
      );
    }
  }

  const table = new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      insideHorizontal: { style: BorderStyle.NONE },
    },
  });

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "Student Support Document",
                    font: "Arial",
                    size: 40,
                    bold: false,
                  }),
                ],
              }),
            ],
          }),
        },
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(35),
              bottom: convertMillimetersToTwip(12.7),
              left: convertMillimetersToTwip(12.7),
              right: convertMillimetersToTwip(12.7),
            },
            size: { orientation: PageOrientation.PORTRAIT },
          },
        },
        children: [table],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Student_Support_Document.docx";
  a.click();
  URL.revokeObjectURL(url);
}

export { generateDocx };
