/**
 * Carrega um ou mais componentes HTML em um elemento contêiner.
 * @param {string} containerSelector - O seletor CSS do elemento que receberá os componentes.
 * @param {string[]} componentPaths - Um array de caminhos para os arquivos HTML dos componentes.
 * @param {() => void} [callback] - Uma função opcional a ser executada após o carregamento dos componentes.
 */
export async function loadComponents(containerSelector, componentPaths, callback) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error(`Container element '${containerSelector}' not found.`);
        return;
    }

    const fetchPromises = componentPaths.map(path => fetch(path).then(response => response.text()));

    try {
        const componentsHtml = await Promise.all(fetchPromises);
        container.innerHTML = componentsHtml.join('');

        // Executa o callback se ele for fornecido
        if (callback && typeof callback === 'function') {
            callback();
        }
    } catch (error) {
        console.error('Error loading components:', error);
    }
}