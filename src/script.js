console.log("supportOptions loaded?", supportOptions?.length);
console.log("script.js loaded");

import { supportOptions } from "./supportOptions.js";
import { disclosureLevels } from "./disclosureLevels.js";
import { disabilityLabels } from "./disabilityLabels.js";
import { layouts } from "./layouts.js";

const state = {
  studyMethod: null,
  disclosure: null,
  disabilities: [],
  selectedSupportIds: new Set(),
};

const methodInputs = document.querySelectorAll('input[name="method"]');
const disclosureInputs = document.querySelectorAll('input[name="disclosure"]');
const disabilityInputs = document.querySelectorAll('input[name="disability"]');
const supportOptionsContainer = document.getElementById("support-options");

const methodRadios = document.querySelectorAll('input[name="method"]');

methodRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    const newMethod = radio.value;

    if (state.studyMethod === newMethod) return;

    // Update state
    state.studyMethod = newMethod;
    state.disclosure = "";
    state.disabilities = [];
    state.selectedSupportIds.clear();

    // Reset UI selections
    document
      .querySelectorAll('input[name="disclosure"]')
      .forEach((rb) => (rb.checked = false));
    document
      .querySelectorAll('input[name="disability"]')
      .forEach((cb) => (cb.checked = false));

    // Re-render components
    renderSupportOptions();
    renderPreview();
  });
});

disclosureInputs.forEach((input) => {
  input.addEventListener("change", () => {
    state.disclosure = input.value;
    handleStateUpdate();
    console.log("Disclosure level:", state.disclosure); // Delete before launch
  });
});

disabilityInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const value = input.value;
    if (input.checked) {
      if (!state.disabilities.includes(value)) {
        state.disabilities.push(value);
      }
    } else {
      state.disabilities = state.disabilities.filter((d) => d !== value);
    }
    handleStateUpdate();
    console.log("Disabilities:", state.disabilities); // Delete before launch
  });
});

function handleStateUpdate() {
  console.log("State updated:", state); // Delete before launch
  renderSupportOptions();
  renderPreview();
}

function renderSupportOptions() {
  supportOptionsContainer.innerHTML = "";

  const supportOptionsSection = document.getElementById("support-options");

  // Show or hide support section based on selection
  if (state.disabilities.length === 0) {
    supportOptionsSection.style.display = "none";
    return; // don't render anything if nothing selected
  } else {
    supportOptionsSection.style.display = "block";
  }

  if (!state.studyMethod || state.disabilities.length === 0) {
    return; // No support options to render if study method or disclosure is not selected
  }

  console.log("Ready to filter support options..."); // Delete before launch

  const filteredOptions = supportOptions.filter((option) => {
    const matchesStudyMethod = option.studyMethods.includes(state.studyMethod);
    const matchesDisability = option.categories.some((category) =>
      state.disabilities.includes(category)
    );
    return matchesStudyMethod && matchesDisability;
  });

  const groupedOptions = {};

  filteredOptions.forEach((option) => {
    option.categories.forEach((category) => {
      if (state.disabilities.includes(category)) {
        if (!groupedOptions[category]) {
          groupedOptions[category] = [];
        }
        groupedOptions[category].push(option);
      }
    });
  });

  for (const category of Object.keys(groupedOptions)) {
    const card = document.createElement("div");
    card.className = "support-card";

    const title = document.createElement("h3");
    title.textContent = disabilityLabels[category] || category;
    title.style.cursor = "pointer";
    card.appendChild(title);

    const list = document.createElement("div");
    list.className = "support-list";
    list.style.display = "none";

    //toggle list visibility on title click
    title.addEventListener("click", () => {
      list.style.display = list.style.display === "none" ? "block" : "none";
    });

    groupedOptions[category].forEach((option) => {
      const label = document.createElement("label");
      label.className = "support-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = option.id;
      checkbox.name = `support-${option.id}`;
      checkbox.dataset.section = option.targetSection;
      checkbox.checked = state.selectedSupportIds.has(option.id);

      if (option.class) {
        checkbox.classList.add(option.class);
      }

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.selectedSupportIds.add(option.id);
        } else {
          state.selectedSupportIds.delete(option.id);
        }

        const allCheckboxes = document.querySelectorAll(
          `input[value="${option.id}"]`
        );
        allCheckboxes.forEach((cb) => {
          if (cb !== checkbox) {
            cb.disabled = checkbox.checked;
            cb.parentElement.classList.toggle(
              "duplicate-disabled",
              checkbox.checked
            );
          }
        });

        renderPreview();
      });

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(" " + option.label));
      list.appendChild(label);
    });

    card.appendChild(list);
    supportOptionsContainer.appendChild(card);
  }
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

function buildMergedSectionHtml(options) {
  if (!options || options.length === 0) return "";
  const groups = mergeStructuredSectionItems(options);
  let html = "";

  groups.forEach((group) => {
    if (group.type !== "root") {
      html += `<div class="support-heading">${group.heading}</div>`;
    }
    if (group.bullets.length) {
      html += `<ul class="support-bullets">${group.bullets
        .map((bullet) => `<li>${bullet}</li>`)
        .join("")}</ul>`;
    }
  });

  return html;
}

function renderPreview() {
  const outputContainer = document.getElementById("doc-output");
  outputContainer.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "Student Support Document (SSD)";
  title.className = "ssd-title"; // optional styling

  outputContainer.appendChild(title);

  if (!state.studyMethod) return;

  const layout = layouts[state.studyMethod];
  const selectedOptions = supportOptions.filter((opt) =>
    state.selectedSupportIds.has(opt.id)
  );
  document.querySelector(".preview-paper").classList.remove("preview-empty");

  const sectionOptions = {};
  selectedOptions.forEach((opt) => {
    if (!sectionOptions[opt.targetSection]) {
      sectionOptions[opt.targetSection] = [];
    }
    sectionOptions[opt.targetSection].push(opt);
  });

  // Loop through layout sections and build HTML
  for (const [sectionId, section] of Object.entries(layout.sections)) {
    const sectionDiv = document.createElement("div");
    sectionDiv.className = section.class || "";

    // Section heading
    if (section.title) {
      const heading = document.createElement("h3");
      heading.textContent = section.title;
      sectionDiv.appendChild(heading);
    }

    const contentDiv = document.createElement("div");
    contentDiv.className = "section-content";
    contentDiv.dataset.section = sectionId;

    let content = (section.content || "").trim();

    if (sectionId === "generalRecommendations") {
      const lines = content.split("\n").filter((line) => line.trim());
      const bulletHtml = lines
        .map((line) => `<li>${line.trim()}</li>`)
        .join("");
      content = `<ul>${bulletHtml}</ul>`;
    }

    // Replace disclosure placeholder
    if (sectionId === "disclosure" && state.disclosure) {
      const disclosureText =
        disclosureLevels.find((d) => d.value === state.disclosure)?.text || "";
      content = content.replace(
        "Once selected, the disclosure level will automatically be inserted into this section",
        `<p>${disclosureText}</p>`
      );
    }

    // Replace support placeholder or "None identified"
    const supportHtml = buildMergedSectionHtml(sectionOptions[sectionId]);
    if (supportHtml) {
      if (
        content.includes(
          "Once selected, support recommendations will automatically be inserted here."
        )
      ) {
        content = content.replace(
          "Once selected, support recommendations will automatically be inserted here.",
          supportHtml
        );
      } else if (content.trim() === "None identified") {
        content = supportHtml;
      } else {
        // Append support text if no placeholder
        content += supportHtml;
      }
    }

    // Inject processed content
    const baseContent = document.createElement("div");
    baseContent.innerHTML = content;
    contentDiv.appendChild(baseContent);
    sectionDiv.appendChild(contentDiv);
    outputContainer.appendChild(sectionDiv);
  }
}

/* document.addEventListener("DOMContentLoaded", () => {
  const downloadBtn = document.getElementById("download-doc");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (typeof generateDocx === "function") {
        generateDocx();
      } else {
        console.error("generateDocx is not defined.");
      }
    });
  }
}); */

export { state };
