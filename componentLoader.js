/**
 * Carrega um ou mais componentes HTML em um elemento contêiner.
 * @param {string} containerSelector - O seletor CSS do elemento que receberá os componentes.
 * @param {string[]} componentPaths - Um array de caminhos para os arquivos HTML dos componentes.
 */
export async function loadComponents(containerSelector, componentPaths) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error(`Container element '${containerSelector}' not found.`);
        return;
    }

    const fetchPromises = componentPaths.map(path => fetch(path).then(response => response.text()));

    try {
        const componentsHtml = await Promise.all(fetchPromises);
        container.innerHTML = componentsHtml.join('');
    } catch (error) {
        console.error('Error loading components:', error);
    }
}