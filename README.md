# Student Support Document Generator (SSD Generator)

A web-based tool designed to assist university disability advisers in generating tailored Student Support Documents (SSDs) for disabled students based on study mode, disclosure level, and specific support needs.

This project was built as a practical solution for the Accessibility and Disability Resource Centre (ADRC) at the University of Cambridge, and serves as a personal portfolio project to demonstrate my skills in web development, accessibility, and user-focused design.

---

## Live Demo

[View the live site](https://Tm800drc.github.io/ssd-generator)

---

## Features

- Select **study mode** (Taught / Research)
- Choose **disclosure level**
- Filter support options by **disability category**
- Toggle support options to generate a live preview
- Generate a downloadable, professionally formatted **Word document**
- Automatically formats structured support content (headings, bullets, etc.)
- Highlights enhanced adjustments in orange as they are only for use when recommended by medical professionals
- Clean, accessible user interface built with **Vite + vanilla JS + HTML/CSS**

---

## Tech Stack

| Frontend         | Build Tool | Document Export  | Hosting        |
|------------------|------------|------------------|----------------|
| HTML5, CSS3, JS  | Vite       | `docx` (npm)     | GitHub Pages   |

---

## How to Run Locally

```bash
git clone https://github.com/Tm800drc/ssd-generator.git
cd ssd-generator
npm install
npm run dev
