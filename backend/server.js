import express from "express";
import { sendEmail } from "./emailService.js";
import cors from "cors"; // Import cors

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // For parsing application/json

// Email sending route
app.post("/notify-order-status", async (req, res) => {
  const { userName, userEmail, orderId, status } = req.body;

  if (!userName || !userEmail || !orderId || !status) {
    return res.status(400).json({ success: false, message: "Missing required fields: userName, userEmail, orderId, or status." });
  }

  let subject = "Atualização do Status do Pedido";
  let message = "";

  switch (status) {
    case "pendente":
      subject = "Seu Pedido Foi Recebido!";
      message = `Seu pedido <strong>#${orderId}</strong> foi recebido e está pendente. Avisaremos assim que ele começar a ser preparado.`;
      break;
    case "em_preparo":
      subject = "Seu Pedido Está Sendo Preparado!";
      message = `Ótimas notícias! Seu pedido <strong>#${orderId}</strong> está agora <strong>em preparação</strong>. Em breve estará a caminho!`;
      break;
    case "entregue":
      subject = "Seu Pedido Foi Entregue!";
      message = `Seu pedido <strong>#${orderId}</strong> foi <strong>entregue</strong> com sucesso! Esperamos que aproveite.`;
      break;
    default:
      message = `O status do seu pedido <strong>#${orderId}</strong> foi atualizado para: <strong>${status}</strong>.`;
      break;
  }

  const html = `
    <div style="font-family: 'Poppins', sans-serif; color: #333; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
      <h2 style="color: #D4AF37;">Olá, ${userName}!</h2>
      <p style="font-size: 16px; line-height: 1.5;">${message}</p>
      <p style="font-size: 14px; color: #777; margin-top: 30px;">Atenciosamente,<br>Equipe Scatambulo</p>
      <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;">
      <p style="font-size: 12px; color: #aaa; text-align: center;">Este é um email automático, por favor não responda.</p>
    </div>
  `;

  try {
    await sendEmail(userEmail, subject, html);
    res.json({ success: true, message: "Email notification sent." });
  } catch (error) {
    console.error("Failed to send email:", error);
    res.status(500).json({ success: false, message: "Failed to send email notification.", error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
