document.addEventListener('DOMContentLoaded', () => {
    // Usuários fixos
    const users = {
        'angela': { password: '0124', panel: 'admin.html' },
        'alexandre': { password: '0126', panel: 'entregador.html' },
        'sofia': { password: '0125', panel: 'confeiteira.html' }
    };

    const loginButton = document.getElementById('login-button');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');

    // Função para tentar logar ao pressionar Enter
    const attemptLogin = () => {
        const username = usernameInput.value.toLowerCase().trim();
        const password = passwordInput.value;

        if (!username || !password) {
            loginError.textContent = 'Por favor, preencha usuário e senha.';
            return;
        }

        const user = users[username];

        if (user && user.password === password) {
            // Salva o usuário logado para persistir a sessão
            localStorage.setItem('currentUser', JSON.stringify({ username, panel: user.panel }));
            loginError.textContent = '';
            // Redireciona para o painel correto
            window.location.href = user.panel;
        } else {
            loginError.textContent = 'Usuário ou senha inválidos.';
        }
    };

    loginButton.addEventListener('click', attemptLogin);
    
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            attemptLogin();
        }
    });

    usernameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            attemptLogin();
        }
    });

    // Verifica se já existe um usuário logado e redireciona
    const loggedInUser = localStorage.getItem('currentUser');
    if (loggedInUser) {
        const user = JSON.parse(loggedInUser);
        if (user && user.panel) {
            window.location.href = user.panel;
        }
    }
});