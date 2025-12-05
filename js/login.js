/**
 * js/login.js - Lógica de Login e Redirecionamento
 */

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("login-page");

  const userPanels = {
    angela: "admin.html",
    entregador: "entregador.html",
    sofia: "confeiteira.html",
  };
  const loginContainer = document.querySelector(".login-content");

  // Simula a verificação de senha com credenciais fixas
  const passwordMap = {
    angela: "0124",
    entregador: "0126",
    sofia: "0125",
  };

  const loginButton = document.getElementById("login-button");
  const emailInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginError = document.getElementById("login-error");
  const togglePasswordBtn = document.getElementById(
    "toggle-password-visibility"
  );

  // Verifica se já existe um usuário logado e redireciona
  const loggedInUser = localStorage.getItem("currentUser");
  if (loggedInUser) {
    try {
      const user = JSON.parse(loggedInUser);
      if (user && user.panel) {
        window.location.href = user.panel;
      }
    } catch (e) {
      console.error("Erro ao parsear currentUser:", e);
      localStorage.removeItem("currentUser");
    }
  }

  const attemptLogin = (e) => {
    e.preventDefault(); // Impede o envio padrão do formulário
    const username = emailInput.value.toLowerCase().trim();
    const password = passwordInput.value;

    if (!username || !password) {
      loginError.textContent = "Por favor, preencha usuário e senha.";
      return;
    }

    loginError.textContent = "";

    const expectedPassword = passwordMap[username];
    const panel = userPanels[username];

    if (panel && expectedPassword === password) {
      // Login bem-sucedido
      localStorage.setItem("currentUser", JSON.stringify({ username, panel }));
      window.location.href = panel;
    } else {
      // Login falhou
      loginError.textContent = "Usuário ou senha inválidos.";
      if (loginContainer) {
        loginContainer.classList.add("shake");
        setTimeout(() => loginContainer.classList.remove("shake"), 800);
      }
    }
  };

  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.addEventListener("submit", attemptLogin);

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      const icon = togglePasswordBtn.querySelector("i");
      icon.classList.toggle("ph-eye", !isPassword);
      icon.classList.toggle("ph-eye-slash", isPassword);
      togglePasswordBtn.setAttribute(
        "aria-label",
        isPassword ? "Ocultar senha" : "Mostrar senha"
      );
    });
  }
});
