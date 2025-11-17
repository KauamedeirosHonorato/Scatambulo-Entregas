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
    <h2>Olá, ${userName}!</h2>
    <p>${message}</p>
    <p>Atenciosamente,<br>Equipe</p>
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
