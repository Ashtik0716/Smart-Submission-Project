import { parseRequirements } from "./parser.js";
import { reconcileFormats } from "./formats.js";
import { getFileInfo, checkFile, formatBytes, countPdfPages } from "./analyzer.js";
import { readImageSize } from './analyzer.js'


// ---------- Runs INSIDE the webpage ----------
// Must be fully self-contained: no outside variables or functions.
function detectUploadFields() {
    const inputs = document.querySelectorAll('input[type="file"]');

    return Array.from(inputs).map((input, index) => {
        // 1. Label: explicit <label for="id">, or a wrapping <label>
        let labelText = "";
        if (input.id) {
            const explicit = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
            if (explicit) labelText = explicit.textContent.trim();
        }
        if (!labelText) {
            const wrapping = input.closest("label");
            if (wrapping) labelText = wrapping.textContent.trim();
        }

        // 2. Fallback: plain text sitting directly in the parent
        const parent = input.parentElement;
        if (!labelText && parent) {
            labelText = Array.from(parent.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent.trim())
                .join(" ")
                .trim();
        }

        // 3. Fallback: a heading-like element in a surrounding container
        //    (strong, b, legend, h1-h6) that does not contain the input
        if (!labelText) {
            let box = input.parentElement;
            for (let depth = 0; depth < 3 && box && box !== document.body; depth++) {
                const heading = Array.from(
                    box.querySelectorAll("strong, b, legend, h1, h2, h3, h4, h5, h6")
                ).find((el) => !el.contains(input) && el.textContent.trim());
                if (heading) {
                    labelText = heading.textContent.trim();
                    break;
                }
                box = box.parentElement;
            }
        }

        // 4. Nearby instructions: widen up to 3 levels, stop at the first
        //    container that has useful text. A Set prevents duplicates.
        const found = new Set();
        let container = input.parentElement;
        for (let depth = 0; depth < 3 && container && container !== document.body; depth++) {
            container.querySelectorAll("p, small, span, div, li").forEach((el) => {
                if (el.contains(input)) return;                          // skip wrappers of the input
                if (el.querySelector("p, small, span, div, li")) return; // leaf elements only
                const t = el.textContent.trim().replace(/\s+/g, " ");
                if (t && t !== labelText) found.add(t);
            });
            if (found.size) break;                                     // found some, stop widening
            container = container.parentElement;
        }
        const instructions = Array.from(found).slice(0, 3);

        // 4b. Last-resort label: the first instruction line, but only if it
        //     looks like a title (short, no size/page/format rule in it)
        if (!labelText && instructions.length) {
            const first = instructions[0];
            const looksLikeRule = /\d+\s*(kb|mb|gb|pages?)|\b(pdf|docx|pptx|xlsx|png|jpe?g|webp)\b/i.test(first);
            if (first.length <= 80 && !looksLikeRule) {
                labelText = first;
                instructions.shift(); // don't show the same text twice
            }
        }

        // 5. accept attribute as a clean list
        const accept = (input.getAttribute("accept") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

        // 6. Is the input actually visible? Many sites hide it behind a styled button.
        const style = getComputedStyle(input);
        const rect = input.getBoundingClientRect();
        const visible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            parseFloat(style.opacity) > 0 &&
            rect.width > 0 &&
            rect.height > 0;

        return {
            index,
            name: input.name || "",
            id: input.id || "",
            label: labelText || "(no label found)",
            accept,
            multiple: input.multiple,
            required: input.required,
            instructions, visible,
        };
    });
}

// ---------- Runs in the POPUP ----------
const analyzeBtn = document.getElementById("analyze-btn");
const resultsEl = document.getElementById("results");
const pageTitleEl = document.getElementById("page-title");

// State: remember the last scan and the chosen file so we can re-render
let lastFields = [];
let currentInfo = null;
const ICON = { pass: "✓", fail: "✗", unknown: "?" };

const fileInput = document.getElementById("file-input");
const fileInfoEl = document.getElementById("file-info");

fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    currentInfo = getFileInfo(file);

    // Only PDFs get a page count for now
    if (currentInfo.extension === "pdf") {
        fileInfoEl.textContent = "Reading PDF…";
        const result = await countPdfPages(file);
        if (result.pages != null) currentInfo.pages = result.pages;
        else currentInfo.pageError = result.error;
    }

    if (["png", "jpg", "webp"].includes(currentInfo.extension)) {
        fileInfoEl.textContent = "Reading image…";
        const result = await readImageSize(file);
        if (result.width != null) {
            currentInfo.width = result.width;
            currentInfo.height = result.height;
        } else {
            currentInfo.imageError = result.error;
        }
    }

    const sizeText = currentInfo.width != null ? ` · ${currentInfo.width}×${currentInfo.height}px` : "";
    fileInfoEl.textContent =
        `${currentInfo.name} · ${formatBytes(currentInfo.sizeBytes)}${pagesText}${sizeText} · ${currentInfo.mime}`;
    fileInfoEl.textContent =
        `${currentInfo.name} · ${formatBytes(currentInfo.sizeBytes)}${pagesText} · ${currentInfo.mime}`;
    if (lastFields.length) renderResults(lastFields);
});



analyzeBtn.addEventListener("click", async () => {
    analyzeBtn.disabled = true;
    resultsEl.innerHTML = '<p class="muted">Scanning…</p>';

    try {
        // Get the tab the user is looking at
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        pageTitleEl.textContent = tab.title || tab.url;



        // Run the detector inside that tab; returns one result per frame
        const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: detectUploadFields,
        });

        renderResults(injection.result);
    } catch (err) {
        // Happens on chrome:// pages, the Web Store, or blocked pages
        resultsEl.innerHTML = `<p class="muted">Can't scan this page: ${escapeHtml(err.message)}</p>`;
    } finally {
        analyzeBtn.disabled = false;
    }
});

function renderResults(fields) {
    if (!fields || fields.length === 0) {
        lastFields = fields;
        resultsEl.innerHTML = '<p class="muted">No file upload fields found on this page.</p>';
        return;
    }

    resultsEl.innerHTML = fields
        .map((f) => {
            // Interpret the raw instruction text here in the popup
            const req = parseRequirements(f.instructions);

            const rules = [];
            if (req.maxSizeBytes !== null)
                rules.push(`Max size: ${formatBytes(req.maxSizeBytes)} (from “${req.evidence.size}”)`);
            if (req.maxPages !== null)
                rules.push(`Max pages: ${req.maxPages} (from “${req.evidence.pages}”)`);
            if (req.minPages !== null)
                rules.push(`Min pages: ${req.minPages} (from “${req.evidence.pages}”)`);
                        if (req.maxDimensions)
                rules.push(`Max dimensions: ${req.maxDimensions.width}×${req.maxDimensions.height}px (from “${req.evidence.dimensions}”)`);
            if (req.minDimensions)
                rules.push(`Min dimensions: ${req.minDimensions.width}×${req.minDimensions.height}px (from “${req.evidence.dimensions}”)`);

            const fmt = reconcileFormats(f.accept, req.textFormats);
            if (fmt.allowed)
                rules.push(`Allowed formats: ${fmt.allowed.join(", ")} (from ${fmt.source})`);
            if (fmt.conflict)
                rules.push(`⚠ Page text names different formats than the upload field accepts`);
            if (req.naming)
                rules.push(
                    `Naming: ${req.naming.template} (you'll need to provide: ${req.naming.tokens.join(", ")})`
                );
            const checksHtml = currentInfo
                ? checkFile(currentInfo, req, fmt)
                    .map((c) => `<p class="check ${c.status}">${ICON[c.status]} ${escapeHtml(c.message)}</p>`)
                    .join("")
                : "";

            return `
      <section class="card">
        <p class="label">Field ${f.index + 1}${f.required ? " · required" : " · optional"}${f.visible ? "" : " · custom upload button"}</p>
        <p><strong>${escapeHtml(f.label)}</strong></p>
        <p class="muted">Accepts: ${f.accept.length ? escapeHtml(f.accept.join(", ")) : "any file type"}</p>
        <p class="muted">Multiple files: ${f.multiple ? "yes" : "no"}</p>
        ${rules.map((r) => `<p class="rule">${escapeHtml(r)}</p>`).join("")}
        ${checksHtml}
        ${f.instructions.map((t) => `<p class="muted">“${escapeHtml(t)}”</p>`).join("")}
      </section>`;
        })
        .join("");
}

// Page text is untrusted: escape it before putting it into innerHTML
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}