import { loadQrCodeLibrary } from './ui.js';
import { printViaIframe } from './utils.js';

function loadHtml2PdfScript() {
    return new Promise((resolve, reject) => {
        if (typeof html2pdf === 'function') {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function generatePdfContent(order) {
    return `
        <div style="font-family: Arial; padding: 20px; font-size: 16px;">
            <h2>Angela Confeitaria </h2>

            <p><strong>NUMERO DO PEDIDO:</strong> ${order.numero}</p>
            <p><strong>CLIENTE:</strong> ${order.cliente}</p>

            <p><strong>ENDERECO:</strong> ${order.endereco}</p>

            <p><strong>COMPLEMENTO:</strong> ${order.complemento || ''}</p>

            <p><strong>SABOR:</strong> ${order.sabor}</p>

            <p><strong>STATUS:</strong> ${order.status}</p>

            <p>Obrigado pela preferência!</p>

            <p><strong>QRCODE:</strong></p>
            <img src="${order.qrcode}" style="width: 180px; margin-top: 10px;" />

            <p style="margin-top: 20px; font-size: 13px;">
                ${new Date().toLocaleString("pt-BR")}
            </p>
        </div>
    `;
}

export function showPrintPreviewModal(order) {
    const modal = document.getElementById('modal-print-preview');
    if (!modal) {
        console.error("Elemento #modal-print-preview não encontrado.");
        return;
    }

    const printContent = document.getElementById('print-content');
    const qrContainer = document.getElementById('print-qrcode-container');

    printContent.innerHTML = '';
    qrContainer.innerHTML = '';

    const mainContentHTML = `
        <div style="font-family: Arial; padding: 10px; font-size: 14px;">
            <h2 style="text-align: center;">Angela Confeitaria </h2>

            <p><strong>NUMERO DO PEDIDO:</strong> ${order.id || ''}</p>
            <p><strong>CLIENTE:</strong> ${order.nomeCliente || ''}</p>

            <p><strong>ENDERECO:</strong> ${order.rua || ''}, ${order.numero || ''}, ${order.bairro || ''} - ${order.cidade || ''} - CEP: ${order.cep || ''}</p>

            <p><strong>COMPLEMENTO:</strong> ${order.complemento || ''}</p>

            <p><strong>SABOR:</strong> ${order.nomeBolo || ''}</p>

            <p><strong>STATUS:</strong> ${(order.status || '').toUpperCase()}</p>
        </div>
    `;
    printContent.innerHTML = mainContentHTML;
    
    // Check if order.observacao exists and parse it
    if (order.observacao) {
        const dados = parseMensagem(order.observacao);

        // Populate input fields if they exist
        const nomeClienteInput = document.getElementById("nomeCliente");
        if (nomeClienteInput) nomeClienteInput.value = dados.nome;

        const dataEntregaInput = document.getElementById("dataEntrega");
        if (dataEntregaInput) dataEntregaInput.value = dados.dataEntrega;

        const horarioEntregaInput = document.getElementById("horarioEntrega");
        if (horarioEntregaInput) horarioEntregaInput.value = dados.horarioEntrega;

        const cepInput = document.getElementById("cep");
        if (cepInput) cepInput.value = dados.cep;

        const ruaInput = document.getElementById("rua");
        if (ruaInput) ruaInput.value = dados.endereco;

        const bairroInput = document.getElementById("bairro");
        if (bairroInput) bairroInput.value = dados.bairro;

        const cidadeInput = document.getElementById("cidade");
        if (cidadeInput) cidadeInput.value = dados.cidade;
    }

    
    const trackingUrl = `https://scatambulo-entregas-iivh.vercel.app/rastreio.html?id=${order.id.toLowerCase()}`;
    loadQrCodeLibrary(() => {
        try {
            const qr = qrcode(0, 'M');
            qr.addData(trackingUrl);
            qr.make();
            qrContainer.innerHTML = qr.createImgTag(5, 4);
        } catch (e) {
            console.error("Erro ao gerar QR Code no modal:", e);
            qrContainer.innerHTML = "Erro QR";
        }
    });

    modal.classList.add('active');

    const closeModal = () => modal.classList.remove('active');
    const closeButton = modal.querySelector('.close-button');
    closeButton.onclick = closeModal;
    window.onclick = (event) => {
        if (event.target === modal) {
            closeModal();
        }
    };

    const printButton = document.getElementById('print-button');
    if (printButton) {
        printButton.onclick = () => window.print();
    } else {
        console.error("Botão de imprimir #print-button não encontrado no modal.");
    }

    const pdfButton = document.getElementById('pdf-button');
    if (pdfButton) {
        pdfButton.onclick = async function() {
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
            this.disabled = true;

            await new Promise(resolve => loadQrCodeLibrary(resolve));

            const mappedOrder = {
                numero: order.id,
                cliente: order.nomeCliente,
                whatsapp: order.whatsapp,
                email: order.emailCliente,
                endereco: `${order.rua || ''}, ${order.numero || ''}, ${order.bairro || ''} - ${order.cidade || ''} - CEP: ${order.cep || ''}`,
                complemento: order.complemento,
                sabor: order.nomeBolo,
                status: (order.status || '').toUpperCase(),
                qrcode: ''
            };

            const trackingUrl = `https://scatambulo-entregas-iivh.vercel.app/rastreio.html?id=${order.id.toLowerCase()}`;
            try {
                const qr = qrcode(0, 'M');
                qr.addData(trackingUrl);
                qr.make();
                mappedOrder.qrcode = qr.createDataURL(4, 4);
            } catch (e) {
                console.error("Erro ao gerar QR Code para PDF:", e);
            }

            const content = generatePdfContent(mappedOrder);
            
            printViaIframe(content);

            this.innerHTML = '<i class="fas fa-file-pdf"></i> Salvar PDF';
            this.disabled = false;
        };
    } else {
        console.error("Botão de PDF #pdf-button não encontrado no modal.");
    }
}

function normalizarMensagem(msg) {
    return msg
        .replace(/--- DADOS PARA ENTREGA ---/i, "\n")
        .replace(/Nome:/i, "\nNome:")
        .replace(/Vela de brinde\?:/i, "\nBrinde:")
        .replace(/Data de entrega:/i, "\nData:")
        .replace(/Horário para entrega:/i, "\nHorario:")
        .replace(/CEP:/i, "\nCEP:")
        .replace(/Endereço:/i, "\nEndereco:")
        .replace(/Bairro:/i, "\nBairro:")
        .replace(/Cidade:/i, "\nCidade:")
        .trim();
}

function getCampo(campo, texto) {
    const regex = new RegExp(`${campo}:\\s*([^\\n]+)`, "i");
    const m = texto.match(regex);
    return m ? m[1].trim() : "";
}

function parseMensagem(msgOriginal) {
    const msg = normalizarMensagem(msgOriginal);

    return {
        nome: getCampo("Nome", msg),
        brinde: getCampo("Brinde", msg),
        dataEntrega: getCampo("Data", msg),
        horarioEntrega: getCampo("Horario", msg),
        cep: getCampo("CEP", msg),
        endereco: getCampo("Endereco", msg),
        bairro: getCampo("Bairro", msg),
        cidade: getCampo("Cidade", msg),
    };
}