// Lógica para o modal de visualização de impressão

import { loadQrCodeLibrary } from '../js/ui.js';

export function showPrintPreviewModal(order) {
    const modal = document.getElementById('modal-print-preview');
    const printContent = document.getElementById('print-content');

    // Preenche as informações do pedido
    printContent.innerHTML = `
        <p><strong>ID do Pedido:</strong> ${order.id}</p>
        <p><strong>Cliente:</strong> ${order.customerName}</p>
        <p><strong>Endereço:</strong> ${order.address}</p>
        <p><strong>Item:</strong> ${order.item}</p>
        <p><strong>Status:</strong> ${order.status}</p>
    `;

    // Gere o QR Code
    const qrContainer = document.getElementById('print-qrcode-container');
    if (qrContainer) {
        const trackingUrl = `https://scatambulo-entregas-iivh.vercel.app/rastreio.html?id=${order.id.toLowerCase()}`;
        loadQrCodeLibrary(() => {
            try {
                const qr = qrcode(0, 'M'); // Nível de correção de erro M
                qr.addData(trackingUrl);
                qr.make();
                qrContainer.innerHTML = qr.createImgTag(4, 8); // cellSize=4, margin=8
            } catch (e) {
                console.error("Erro ao gerar QR Code:", e);
                qrContainer.innerHTML = "Erro QR";
            }
        });
    }


    modal.style.display = 'block';

    const closeModal = () => {
        modal.style.display = 'none';
        window.removeEventListener('click', closeOnOutsideClick);
    };

    const closeOnOutsideClick = (event) => {
        if (event.target === modal) {
            closeModal();
        }
    };

    // Configura o botão de fechar
    const closeButton = modal.querySelector('.close-button');
    closeButton.onclick = closeModal;

    // Configura o botão de imprimir
    const printButton = document.getElementById('print-button');
    printButton.onclick = function() {
        document.body.classList.add('printing-active');
        window.onafterprint = function() {
            document.body.classList.remove('printing-active');
        };
        window.print();
    };

    // Configura o botão de gerar PDF
    const pdfButton = document.getElementById('pdf-button');
    pdfButton.onclick = function() {
        loadHtml2PdfScript(() => {
            const element = document.getElementById('print-content-wrapper');
            const opt = {
                margin:       [0.5, 0, 0, 0],
                filename:     `pedido-${order.id}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(element).save();
        });
    };

    // Fecha o modal se o usuário clicar fora dele
    window.addEventListener('click', closeOnOutsideClick);
}

function loadHtml2PdfScript(callback) {
    if (typeof html2pdf === 'function') {
        callback();
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.onload = callback;
    document.head.appendChild(script);
}
