document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    // Usuários fixos para o sistema
    const users = {
      angela: { password: "123", panel: "admin.html" },
      sofia: { password: "456", panel: "confeiteira.html" },
      entregador: { password: "789", panel: "entregador.html" },
    };

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.toLowerCase();
        const password = document.getElementById('password').value;

        const user = users[username];

        if (user && user.password === password) {
            // Armazena os dados do usuário logado no localStorage
            const currentUser = {
                username: username,
                panel: user.panel
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            // Redireciona para o painel correto
            window.location.href = user.panel;
        } else {
            // Exibe mensagem de erro
            errorMessage.textContent = 'Usuário ou senha inválidos.';
            setTimeout(() => {
                errorMessage.textContent = '';
            }, 3000);
        }
    });

    // Se o usuário já estiver logado, redireciona-o
    const loggedInUser = JSON.parse(localStorage.getItem('currentUser'));
    if (loggedInUser && loggedInUser.panel) {
        window.location.href = loggedInUser.panel;
    }
});