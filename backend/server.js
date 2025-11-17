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
  const { userName, userEmail, orderId } = req.body;

  if (!userName || !userEmail || !orderId) {
    return res.status(400).json({ success: false, message: "Missing required fields: userName, userEmail, or orderId." });
  }

  const html = `
    <h2>Olá, ${userName}!</h2>
    <p>Seu pedido <strong>#${orderId}</strong> foi recebido e está pendente.</p>
    <p>Avisaremos assim que ele começar a ser preparado.</p>
    <p>Atenciosamente,<br>Equipe</p>
  `;

  try {
    await sendEmail(userEmail, "Status do Pedido", html);
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
