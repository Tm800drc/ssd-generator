import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
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
  ExternalHyperlink,
} from "docx";

import { layouts } from "./layouts.js";
import { supportOptions } from "./supportOptions.js";
import { disclosureLevels } from "./disclosureLevels.js";
import { state, getActiveLayoutKey } from "./script.js";

const skipNoneIdentified = ["exams", "interactiveTeaching", "librarySupport"];
const DISCLOSURE_PLACEHOLDER =
  "Once selected, the disclosure level will automatically be inserted into this section.";
const GENERAL_PLACEHOLDER_REGEX = /Once selected.*?inserted.*?here/i;

function createExternalHyperlink(text, url) {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text,
        style: "Hyperlink",
        font: "Arial",
        size: 24,
      }),
    ],
  });
}

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

// Updated: now supports "heading" type
function createStructuredParagraphs(option) {
  if (!Array.isArray(option.structuredText)) return [];

  return option.structuredText
    .map((block) => {
      if (!block?.content?.trim()) return null;
      if (block.type === "heading") {
        // Headings: bigger, bold, extra spacing
        return new Paragraph({
          children: [
            new TextRun({
              text: block.content,
              font: "Arial",
              size: 24, // 14pt
              bold: true,
            }),
          ],
          spacing: { after: 200, before: 100 },
        });
      } else if (block.type === "subsection") {
        // Subsections: bold, indented
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
      } else if (block.type === "bullet") {
        // Bullets
        return createParagraph(block.content, true);
      }
      // Add more types here if needed
      return null;
    })
    .filter(Boolean);
}

function parseHtmlToParagraphs(html, bullet = false) {
  const DEBUG = false;
  if (DEBUG) console.log("parseHtmlToParagraphs input:", html);

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
      return createParagraph(cleaned, bullet);
    })
    .filter(Boolean); // remove nulls
}

function normalizeSupportContent(text) {
  return text?.replace(/\s+/g, " ").trim();
}

function mergeStructuredSectionItems(options) {
  const groups = [];
  const headingIndex = new Map();
  const rootGroup = {
    key: "__root__",
    heading: "",
    type: "root",
    bullets: [],
    bulletSet: new Set(),
  };

  groups.push(rootGroup);
  let currentGroup = rootGroup;

  options.forEach((opt) => {
    const entries = opt.structuredText
      ? opt.structuredText
      : [{ type: "bullet", content: opt.text }];

    entries.forEach((entry) => {
      if (entry.type === "heading" || entry.type === "subsection") {
        const heading = normalizeSupportContent(entry.content);
        if (!heading) return;

        const key = heading.toLowerCase();
        let group = headingIndex.get(key);
        if (!group) {
          group = {
            key,
            heading,
            type: entry.type,
            bullets: [],
            bulletSet: new Set(),
          };
          headingIndex.set(key, group);
          groups.push(group);
        }
        currentGroup = group;
      } else if (entry.type === "bullet") {
        const content = normalizeSupportContent(entry.content);
        if (!content) return;

        if (!currentGroup.bulletSet.has(content)) {
          currentGroup.bulletSet.add(content);
          currentGroup.bullets.push(content);
        }
      }
    });
  });

  return groups;
}

function createMergedSectionParagraphs(options) {
  if (!options || options.length === 0) return [];
  const groups = mergeStructuredSectionItems(options);
  const paragraphs = [];

  groups.forEach((group) => {
    if (group.type !== "root") {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: group.heading,
              font: "Arial",
              size: 24,
              bold: true,
            }),
          ],
          indent: group.type === "subsection" ? { left: 360 } : undefined,
          spacing: { after: 100, before: group.type === "subsection" ? 0 : 100 },
        })
      );
    }

    group.bullets.forEach((bullet) => {
      const para = createParagraph(bullet, true);
      if (para) paragraphs.push(para);
    });
  });

  return paragraphs;
}

function formatDownloadDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear() % 100).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

async function generateDocx() {
  const layoutKey = getActiveLayoutKey();
  const layout = layouts[layoutKey];
  if (!layout) return;
  const selectedMap = {};

  for (const opt of supportOptions) {
    const hasContent = opt.text?.trim() || Array.isArray(opt.structuredText);
    const matchesStudyMethod = opt.studyMethods?.includes(state.studyMethod);
    const matchesDisability = opt.categories?.some((category) =>
      state.disabilities.includes(category)
    );
    const hasSubjectRestriction =
      Array.isArray(opt.subjectAreas) && opt.subjectAreas.length > 0;
    const matchesSubjectArea =
      !hasSubjectRestriction ||
      (!!state.subjectTemplate && opt.subjectAreas.includes(state.subjectTemplate));

    if (
      state.selectedSupportIds.has(opt.id) &&
      hasContent &&
      matchesStudyMethod &&
      matchesDisability &&
      matchesSubjectArea
    ) {
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

  const logoUrl = `${import.meta.env.BASE_URL}logo.jpg`;
  const logoBlob = await fetch(logoUrl).then((res) => {
    if (!res.ok) throw new Error(`Failed to load logo: ${res.status}`);
    return res.blob();
  });
  const logoArrayBuffer = await logoBlob.arrayBuffer();

  let logoWidth = 240;
  let logoHeight = 240;
  try {
    const bitmap = await (typeof createImageBitmap === "function"
      ? createImageBitmap(logoBlob)
      : new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            resolve(img);
            URL.revokeObjectURL(img.src);
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(logoBlob);
        }));

    const naturalWidth = bitmap.width;
    const naturalHeight = bitmap.height;
    if (naturalWidth && naturalHeight) {
      const aspect = naturalWidth / naturalHeight;
      const maxLogoSize = 240;
      if (aspect >= 1) {
        logoWidth = maxLogoSize;
        logoHeight = Math.round(maxLogoSize / aspect);
      } else {
        logoHeight = maxLogoSize;
        logoWidth = Math.round(maxLogoSize * aspect);
      }
    }

    if (typeof bitmap.close === "function") {
      bitmap.close();
    }
  } catch (imageError) {
    console.warn("Could not read logo dimensions, using square fallback", imageError);
  }

  const rows = [];

  for (const [sectionId, section] of Object.entries(layout.sections)) {
    const isHeader = sectionId.toLowerCase().includes("header");
    const isGeneralRecommendations = sectionId === "generalRecommendations";
    const useBulletForLayout = [
      "generalRecommendations",
      "librarySupport",
    ].includes(sectionId);
    const supportItems = selectedMap[sectionId] || [];
    const layoutText = section.content || "";
    const isDisclosure = sectionId === "disclosure";
    const hasPlaceholder = isDisclosure
      ? layoutText.includes(DISCLOSURE_PLACEHOLDER)
      : GENERAL_PLACEHOLDER_REGEX.test(layoutText);

    const content = [];

    if (section.title) {
      if (sectionId === "dateApproved") {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: section.title,
                font: "Arial",
                size: 24,
                bold: true,
              }),
              new TextRun({
                text: formatDownloadDate(),
                font: "Arial",
                size: 24,
                bold: false,
              }),
            ],
            spacing: { after: 100 },
          })
        );
      } else {
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
    }

    let insertedCount = 0;

    if (sectionId === "dateApproved") {
      // The date is already rendered with the section title. Skip any further content processing.
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: content,
              verticalAlign: VerticalAlign.CENTER,
              shading: isHeader
                ? { fill: "D9D9D9" }
                : isGeneralRecommendations
                ? { fill: "E6F0FA" }
                : undefined,
              borders: {
                bottom: { style: BorderStyle.SINGLE, size: 2, color: "AAAAAA" },
              },
            }),
          ],
        })
      );
      continue;
    }

    if (hasPlaceholder) {
      const [before = "", after = ""] = layoutText.split(
        isDisclosure ? DISCLOSURE_PLACEHOLDER : GENERAL_PLACEHOLDER_REGEX
      );
      content.push(...parseHtmlToParagraphs(before, useBulletForLayout));

      const mergedSectionParagraphs = createMergedSectionParagraphs(supportItems);
      content.push(...mergedSectionParagraphs);
      insertedCount += mergedSectionParagraphs.length;

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

      const mergedSectionParagraphs = createMergedSectionParagraphs(supportItems);
      content.push(...mergedSectionParagraphs);
      insertedCount += mergedSectionParagraphs.length;
    }

    const validContent = content.filter((p) => p instanceof Paragraph);
    if (validContent.length > 0) {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: validContent,
              verticalAlign: VerticalAlign.CENTER,
              shading: isHeader
                ? { fill: "D9D9D9" }
                : isGeneralRecommendations
                ? { fill: "E6F0FA" }
                : undefined,
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
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 24,
          },
        },
      },
    },
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new ImageRun({
                                type: "jpg",
                                data: logoArrayBuffer,
                                transformation: { width: logoWidth, height: logoHeight },
                              }),
                            ],
                            spacing: { after: 0 },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        width: { size: 30, type: WidthType.PERCENTAGE },
                        borders: {
                          top: { style: BorderStyle.NONE },
                          bottom: { style: BorderStyle.NONE },
                          left: { style: BorderStyle.NONE },
                          right: { style: BorderStyle.NONE },
                        },
                      }),
                      new TableCell({
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
                        verticalAlign: VerticalAlign.CENTER,
                        width: { size: 70, type: WidthType.PERCENTAGE },
                        borders: {
                          top: { style: BorderStyle.NONE },
                          bottom: { style: BorderStyle.NONE },
                          left: { style: BorderStyle.NONE },
                          right: { style: BorderStyle.NONE },
                        },
                      }),
                    ],
                  }),
                ],
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideHorizontal: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
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

        children: [
          table,
          new Paragraph(""), // spacer line

          new Paragraph({
            children: [
              new TextRun({
                text: "Please adhere to the recommendations contained in the Code of Practice for Disabled Students, including the guidance on responsibilities around the implementation of adjustments. For advice on reasonable adjustments and ",
                font: "Arial",
                size: 24,
              }),
              createExternalHyperlink(
                "delivering inclusive teaching and learning",
                "https://www.disability.admin.cam.ac.uk/working-disabled-students/inclusive-teaching-and-learning"
              ),
              new TextRun({
                text: ", please contact the student's named Disability Adviser.",
                font: "Arial",
                size: 24,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = "Student_Support_Document.docx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { generateDocx };
