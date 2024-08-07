document.addEventListener("DOMContentLoaded", function () {
  const terms = document.getElementById("terms");
  const fileDrop = document.getElementById("file-drop");
  const fileInput = document.getElementById("file-input");
  const error = document.getElementById("error");
  const loading = document.getElementById("loading");
  const results = document.getElementById("results");

  let pages = [];
  let debounceTimer;
  let currentSearchController = null;

  fileDrop.addEventListener("click", () => fileInput.click());
  fileDrop.addEventListener("dragover", preventDefault);
  fileDrop.addEventListener("drop", handleFileDrop);
  fileInput.addEventListener("change", handleFileSelect);
  terms.addEventListener("input", debounceHandleTermsChange);

  function preventDefault(e) {
    e.preventDefault();
  }

  function handleFileDrop(e) {
    preventDefault(e);
    const file = e.dataTransfer.files[0];
    processFile(file);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    processFile(file);
  }

  function debounceHandleTermsChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleTermsChange, 300);
  }

  function handleTermsChange() {
    if (pages.length > 0) {
      const searchTerms = terms.value
        .split("\n")
        .filter((term) => term.trim() !== "");

      if (currentSearchController) {
        currentSearchController.abort();
      }

      currentSearchController = new AbortController();

      searchInTextAsync(pages, searchTerms, currentSearchController.signal);
    }
  }

  async function processFile(file) {
    if (file && file.type === "application/pdf") {
      error.textContent = "";
      loading.style.display = "block";
      fileDrop.textContent = file.name;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          let pageText = textContent.items
            .map((item) => item.str + (item.hasEOL ? "\n" : ""))
            .join(" ");

          if (i === 312 || i === 313) {
            console.log(textContent, pageText);
          }

          pageText = pageText.replace(/\s\s+/g, " ");

          pageText = pageText.replace(
            /Diário da Justiça Eletrônico do Tribunal Regional Eleitoral do Paraná \(DJE\/TRE-PR\)\. Documento assinado digitalmente/g,
            ""
          );
          pageText = pageText.replace(
            /conforme MP n\. 2\.200-2\/2001 de 24\.8\.2001, que institui a Infraestrutura de Chaves Públicas Brasileira - ICP-Brasil, podendo/g,
            ""
          );
          pageText = pageText.replace(
            /ser acessado no endereço eletrônico http:\/\/www\.tre-pr\.jus\.br\//g,
            ""
          );
          pageText = pageText.trim();

          // Remove header with dynamic content
          const pageMatch = pageText.match(
            /Ano \d{4} - n. \d+ \w+, [\w|ç|Ç|-]+, \d{2} de [\w|ç|Ç]+ de \d{4} (\d+)/gi
          );
          const pageNumber = pageMatch
            ? parseInt(pageMatch[0].match(/\d+$/)[0])
            : null;
          pageText = pageText.replace(
            /Ano \d{4} - n. \d+ \w+, [\w|ç|Ç|-]+, \d{2} de [\w|ç|Ç]+ de \d{4} \d+/gi,
            ""
          );
          pageText = pageText.trim();

          pages.push({ number: pageNumber, text: pageText });
        }

        const searchTerms = terms.value
          .split("\n")
          .filter((term) => term.trim() !== "");

        currentSearchController = new AbortController();

        searchInTextAsync(pages, searchTerms, currentSearchController.signal);
      } catch (err) {
        error.textContent = "Erro ao processar o PDF: " + err.message;
        console.error("PDF processing error:", err);
      } finally {
        loading.style.display = "none";
      }
    } else {
      error.textContent = "Por favor, selecione um arquivo PDF válido.";
    }
  }

  async function searchInTextAsync(pages, searchTerms, signal) {
    results.innerHTML = "<h2>Resultados da Pesquisa:</h2>";

    try {
      for (let i = 0; i < pages.length; i++) {
        if (signal.aborted) {
          throw new DOMException("Search aborted", "AbortError");
        }

        const page = pages[i];
        const previousPage = i > 0 ? pages[i - 1] : null;
        const nextPage = i < pages.length - 1 ? pages[i + 1] : null;

        let searchText =
          (previousPage ? previousPage.text.slice(-100) : "") +
          page.text +
          (nextPage ? nextPage.text.slice(0, 100) : "");

        searchText = searchText.replace(/\n/g, " ").replace(/\s\s+/g, " ");

        const combinedPages = [
          ...(i > 0 ? [pages[i - 1].text] : []),
          page.text,
          ...(i < pages.length - 1 ? [pages[i + 1].text] : []),
        ].join(" ");

        const occurrences = searchTerms.reduce((acc, term) => {
          const termRegex = new RegExp(
            term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "gi"
          );
          return acc + (searchText.match(termRegex) || []).length;
        }, 0);

        const uniqueOccurrences = [
          ...new Set(
            searchTerms.filter((term) =>
              new RegExp(
                term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "gi"
              ).test(searchText)
            )
          ),
        ];

        if (occurrences > 0) {
          const context = combinedPages.replace(
            new RegExp(
              `(${searchTerms
                .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join("|")})`,
              "gi"
            ),
            "<strong>$1</strong>"
          );

          const resultDiv = document.createElement("div");
          resultDiv.className = "result";
          resultDiv.innerHTML = `
            <p>Encontrado (${occurrences} ocorrências) na Página <strong>${
            page.number
          }</strong> - Termos: ${uniqueOccurrences.join(", ")}</p>
            <p class="context">${context.replace(/\n/g, "<br>")}</p>
          `;
          results.appendChild(resultDiv);
        }

        updateSearchProgress(Math.round((i / pages.length) * 100));

        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Search was aborted");
      } else {
        throw error;
      }
    }
  }

  function updateSearchProgress(percentage) {
    const progressBarFill = document.getElementById("progress-bar-fill");
    progressBarFill.style.width = `${percentage}%`;
    progressBarFill.textContent = `${percentage}%`;
    if (percentage === 100) {
      progressBarFill.textContent = "Pesquisa concluída!";
    }
  }
});
