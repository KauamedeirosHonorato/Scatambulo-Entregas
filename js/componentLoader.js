/**
 * js/componentLoader.js
 * Utilitário para carregar componentes HTML em um contêiner.
 */

/**
 * Carrega um ou mais componentes HTML em um elemento contêiner.
 * @param {string} containerSelector - O seletor CSS do elemento que receberá os componentes.
 * @param {string[]} [componentPaths=[]] - Um array de caminhos para os arquivos HTML dos componentes.
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

    // Usa Set para garantir que não haja caminhos duplicados
    const allPaths = [...new Set(componentPaths)].map(
      (path) => new URL(path, document.baseURI).href
    );

    if (allPaths.length === 0) {
        resolve();
        return;
    }

    const fetchPromises = allPaths.map((path) => {
      // Adicionado para lidar com possíveis erros 404 em ambiente de desenvolvimento
      return fetch(path)
        .then((res) => {
          if (!res.ok) {
            throw new Error(
              `Failed to load component: ${path} (Status: ${res.status})`
            );
          }
          return res.text();
        })
        .catch((err) => {
          console.warn(err.message);
          return ""; // Retorna string vazia para não quebrar o Promise.all, mas avisa o erro
        });
    });

    try {
      const componentsHtml = await Promise.all(fetchPromises);
      container.innerHTML = componentsHtml.join("");
      resolve(); // Resolve a Promise após o innerHTML ser definido
    } catch (error) {
      console.error("Erro ao carregar componentes:", error);
      reject(error);
    }
  });
}
