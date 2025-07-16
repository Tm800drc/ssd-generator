import "./style.css";
import "./script.js";
import { generateDocx } from "./docGenerator.js";

console.log("Main script loaded");

document.addEventListener("DOMContentLoaded", () => {
  const downloadButton = document.getElementById("download-doc");
  if (downloadButton) {
    downloadButton.addEventListener("click", generateDocx);
  }
});
