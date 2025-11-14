# Scatambulo Confeitaria - Sistema de Gestão de Pedidos

Um sistema web para a gestão de pedidos de uma confeitaria, com painéis dedicados para diferentes funções: administrador, confeiteira e entregador. O sistema oferece acompanhamento em tempo real do status dos pedidos e da localização do entregador, otimizando o fluxo de trabalho desde a criação do pedido até a entrega final.

## ✨ Funcionalidades Principais

- **Autenticação por Papel:** Sistema de login que direciona cada usuário para seu respectivo painel com funcionalidades específicas.
- **Painel Kanban Interativo:** Gerenciamento visual do ciclo de vida dos pedidos, com colunas de status (Pendente, Em Preparo, Feito, Pronto para Entrega, Entregue).
- **Atualizações em Tempo Real:** Utilização do Firebase Realtime Database para sincronizar o status dos pedidos e a localização do entregador entre todos os painéis instantaneamente.
- **Perfis de Usuário:**
    - **Administrador (Ângela):**
        - Visão completa de todos os pedidos no Kanban.
        - Mapa para visualização em tempo real da localização do entregador.
        - Criação de novos pedidos manualmente.
        - Extração automática de dados de pedidos a partir de mensagens de texto.
        - Destaque do pedido mais próximo da localização atual do entregador.
        - Funcionalidade para limpar o histórico de pedidos já entregues.
    - **Confeiteira (Sofia):**
        - Visão do Kanban focada nas etapas de produção (`Pendente`, `Em Preparo`, `Feito`).
        - Permissão para mover os pedidos entre as etapas de produção.
    - **Entregador:**
        - Lista de pedidos prontos para entrega.
        - Mapa com sua própria localização atualizada via GPS do dispositivo.
        - Cálculo e visualização de rotas até o endereço do cliente.
- **Integração com APIs Externas:**
    - **Leaflet:** Para exibição dos mapas interativos.
    - **OpenStreetMap:** Como provedor de mapas base.
    - **Nominatim:** Para geocodificação de endereços (converter endereço em coordenadas).
    - **OSRM (Open Source Routing Machine):** Para cálculo de rotas, distância e tempo estimado de entrega.
    - **ViaCEP:** Para preenchimento automático de endereço a partir do CEP no formulário de pedido.

## 🚀 Tecnologias Utilizadas

- **Frontend:** HTML5, CSS3, JavaScript (ES6 Modules)
- **Base de Dados em Tempo Real:** Google Firebase - Realtime Database
- **APIs de Mapeamento e Roteamento:**
    - Leaflet.js
    - OpenStreetMap
    - Nominatim
    - OSRM
- **API de Endereços:** ViaCEP

## 📂 Estrutura do Projeto

```
e:/AngelaEncomendas/
├── css/
│   └── style.css         # Estilos principais da aplicação
├── js/
│   ├── admin.js          # Lógica do painel do administrador
│   ├── confeiteira.js    # Lógica do painel da confeiteira
│   ├── entregador.js     # Lógica do painel do entregador
│   ├── login.js          # Lógica da tela de login
│   ├── firebase.js       # Configuração e exportação do Firebase SDK
│   └── main.js           # Script de login (versão alternativa/antiga)
├── CarroIcone/
│   └── Versa2025.png     # Ícone customizado para o mapa
├── admin.html            # Painel do Administrador
├── confeiteira.html      # Painel da Confeiteira
├── entregador.html       # Painel do Entregador
├── index.html            # Tela de Login
└── README.md             # Este arquivo
```

## 🔧 Configuração e Execução

### 1. Configuração do Firebase

As credenciais de acesso ao Firebase estão no arquivo `js/firebase.js`. Para usar seu próprio projeto Firebase, substitua o objeto `firebaseConfig` pelas credenciais do seu projeto.

```javascript
// e:/AngelaEncomendas/js/firebase.js

const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_AUTH_DOMAIN",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_STORAGE_BUCKET",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID",
  databaseURL: "SUA_DATABASE_URL"
};
```

### 2. Execução do Projeto

Como este é um projeto frontend estático, você pode simplesmente abrir o arquivo `index.html` em um navegador.

**Importante:** Para que a funcionalidade de geolocalização do entregador funcione, a página precisa ser servida em um **contexto seguro (HTTPS)**. A maneira mais fácil de fazer isso localmente é usando uma extensão de servidor web para o seu editor de código (como o "Live Server" para VS Code), que cria um servidor local e serve os arquivos.

## 🔑 Credenciais de Acesso

Os usuários e senhas padrão estão definidos no arquivo `js/login.js`:

- **Usuário:** `angela` | **Senha:** `0124` -> Painel de Administrador
- **Usuário:** `sofia` | **Senha:** `0125` -> Painel da Confeiteira
- **Usuário:** `entregador` | **Senha:** `0126` -> Painel do Entregador

---

_Este projeto foi desenvolvido para otimizar a logística e comunicação interna da Scatambulo Confeitaria._