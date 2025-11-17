const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// Configure the email transport using the default SMTP transport and a GMail account.
const transporter = nodemailer.createTransport({
    host: functions.config().smtp.host,
    port: functions.config().smtp.port,
    secure: false, // true for 465, false for other ports
    auth: {
        user: functions.config().smtp.user,
        pass: functions.config().smtp.pass,
    },
});

// Sends an email confirmation when a new order is created.
exports.onNewOrder = functions.database.ref('/pedidos/{pedidoId}')
    .onCreate(async (snapshot, context) => {
        const order = snapshot.val();
        const pedidoId = context.params.pedidoId;

        if (order.status !== 'pendente') {
            return null;
        }

        const mailOptions = {
            from: `Angela Encomendas <${functions.config().smtp.from}>`,
            to: functions.config().email.recipient,
            subject: `Novo Pedido Recebido: #${pedidoId.substring(0, 5)}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2 style="color: #333;">Novo Pedido Recebido!</h2>
                    <p>Um novo pedido foi registrado no sistema.</p>
                    <h3>Detalhes do Pedido: #${pedidoId.substring(0, 5)}</h3>
                    <ul>
                        <li><strong>Cliente:</strong> ${order.nomeCliente}</li>
                        <li><strong>Bolo:</strong> ${order.nomeBolo}</li>
                        <li><strong>Endereço:</strong> ${order.endereco}</li>
                        <li><strong>WhatsApp:</strong> ${order.whatsapp || 'N/A'}</li>
                    </ul>
                    <p>Por favor, acesse o painel de administração para mais detalhes.</p>
                    <hr>
                    <p style="font-size: 0.8em; color: #777;">Este é um email automático, por favor não responda.</p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log('Email de novo pedido enviado para:', mailOptions.to);
        } catch (error) {
            console.error('Houve um erro ao enviar o email:', error);
        }

        return null;
    });
