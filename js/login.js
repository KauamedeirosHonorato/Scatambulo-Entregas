document.addEventListener('DOMContentLoaded', () => {
  // --- AVISO DE SEGURANÇA ---
  // Manter senhas no código do frontend não é seguro.
  // Considere usar o Firebase Authentication para um login seguro.
  const userPanels = {
    angela: "admin.html",
    entregador: "entregador.html",
    sofia: "confeiteira.html",
  };

  // Simula a verificação de senha que aconteceria em um backend seguro.
  const passwordMap = {
    angela: "0124",
    entregador: "0126",
    sofia: "0125",
  };
  const loginButton = document.getElementById("login-button");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginError = document.getElementById("login-error");

  // Função para tentar logar ao pressionar Enter
  const attemptLogin = () => {
    const username = usernameInput.value.toLowerCase().trim();
    const password = passwordInput.value;

    if (!username || !password) {
      loginError.textContent = "Por favor, preencha usuário e senha.";
      return;
    }

    const expectedPassword = passwordMap[username];
    const panel = userPanels[username];

    if (panel && expectedPassword === password) {
      // Salva o usuário logado para persistir a sessão
      localStorage.setItem("currentUser", JSON.stringify({ username, panel }));
      loginError.textContent = "";
      window.location.href = panel;
    } else {
      loginError.textContent = "Usuário ou senha inválidos.";
    }
  };

  loginButton.addEventListener("click", attemptLogin);

  passwordInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      attemptLogin();
    }
  });

  usernameInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      attemptLogin();
    }
  });

  // Verifica se já existe um usuário logado e redireciona
  const loggedInUser = localStorage.getItem("currentUser");
  if (loggedInUser) {
    const user = JSON.parse(loggedInUser);
    if (user && user.panel) {
      window.location.href = user.panel;
    }
  }
});