/**
 * Carrega um ou mais componentes HTML em um elemento contêiner.
 * @param {string} containerSelector - O seletor CSS do elemento que receberá os componentes.
 * @param {string[]} componentPaths - Um array de caminhos para os arquivos HTML dos componentes.
 * @returns {Promise<void>} Uma Promise que resolve quando os componentes são carregados.
 */
export function loadComponents(containerSelector, componentPaths = []) {
  return new Promise(async (resolve, reject) => {
    const container = document.querySelector(containerSelector);
    if (!container) {
      const errorMsg = `Container element '${containerSelector}' not found.`;
      console.error(errorMsg);
      return reject(new Error(errorMsg));
    }

    // Componentes globais que devem ser carregados em todas as páginas
    const globalComponents = [
      "components/modal-novo-pedido.html",
      "components/modal-confirm-delivery.html",
      "components/modal-confirm.html",
      "components/modal-read-message.html",
    ];
    // Usa Set para garantir que não haja caminhos duplicados
    const allPaths = [...new Set([...componentPaths, ...globalComponents])].map(path =>
      new URL(path, document.baseURI).href
    );

    const fetchPromises = allPaths.map((path) => {
      console.log("Attempting to load component from URL:", path); // Adicionado para depuração
      return fetch(path).then((res) => res.text());
    });

    try {
      const componentsHtml = await Promise.all(fetchPromises);
      container.innerHTML = componentsHtml.join("");
      resolve(); // Resolve a Promise após o innerHTML ser definido
    } catch (error) {
      console.error("Error loading components:", error);
      reject(error);
    }
  });
}
