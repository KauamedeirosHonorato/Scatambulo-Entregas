/**
 * js/chat.js
 * Contém a lógica para controlar a interface do chat, como abrir, fechar e navegar entre as visualizações.
 */

import { getConversationId, sendMessage, listenToConversation, markChatAsRead, uploadChatImage, listenToConversationUnreadCounts, markConversationAsRead, listenToChatNotifications, setTypingStatus, listenToTypingStatus, deleteMessage, editMessage, toggleReaction, clearConversation, markMessagesDelivered, markMessagesRead } from './firebase.js';
import { debounce } from './utils.js';

let currentUser = null;
let activeConversationId = null;
let unsubscribeConversationListener = null;
let unsubscribeTypingListener = null;
let editingMessageId = null;
let replyingToMessage = null; // NEW: State for the message being replied to
let currentMessages = {}; // NEW: Cache for all messages in the current conversation
let activePicker = null; // To hold the currently active emoji picker
let chatNotificationSound = null;
let userInteracted = false;
let pendingImageFile = null; // NEW: State for the pending image file
// Prevent double initialization which causes duplicate event listeners/messages
let chatInitialized = false;
// Accessibility / focus management
let previousActiveElement = null;
let focusTrapHandler = null;
const FOCUSABLE_SELECTORS = 'a[href], area[href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tenta tocar um som, lidando com as restrições de autoplay dos navegadores.
 * @param {HTMLAudioElement} audio - O elemento de áudio a ser tocado.
 */
function tryPlaySound(audio) {
  if (!audio) return;
  if (userInteracted) {
    audio.play().catch(e => console.warn("Audio play failed:", e));
    return;
  }

  const playOnFirstInteraction = () => {
    try {
      audio.play().catch(e => console.warn("Audio play failed on first interaction:", e));
    } finally {
      userInteracted = true;
      window.removeEventListener('click', playOnFirstInteraction);
      window.removeEventListener('touchstart', playOnFirstInteraction);
      window.removeEventListener('keydown', playOnFirstInteraction);
    }
  };

  window.addEventListener('click', playOnFirstInteraction, { once: true });
  window.addEventListener('touchstart', playOnFirstInteraction, { once: true });
  window.addEventListener('keydown', playOnFirstInteraction, { once: true });
}

/**
 * Inicializa os event listeners e a lógica para a janela de chat.
 */
export function initializeChat() {
  if (chatInitialized) {
    // Already initialized; avoid attaching duplicate listeners
    console.debug('initializeChat: already initialized, skipping');
    return;
  }
  const maxRetries = 10;
  let retries = 0;

  function attemptInit() {
    const chatModal = document.getElementById('chat-modal');
    if (chatModal) {
      // Elemento encontrado, prossiga com a inicialização
      setupChat(chatModal);
    } else if (retries < maxRetries) {
      // Elemento não encontrado, tente novamente após um pequeno atraso
      retries++;
      setTimeout(attemptInit, 100);
    } else {
      // Excedeu as tentativas, registre um erro claro
      console.error("Chat initialization failed: Could not find #chat-modal element after multiple attempts.");
    }
  }

  function setupChat(chatModal) {
    // mark as initialized as soon as setup begins
    chatInitialized = true;
  const chatModalContent = chatModal.querySelector('.chat-modal-content');
  const chatLiveRegion = document.getElementById('chat-live-region');
    // Prevent clicks inside the modal content from bubbling to the backdrop/container
    if (chatModalContent) {
      chatModalContent.addEventListener('click', (e) => { e.stopPropagation(); });
    }
    // O restante da lógica original de initializeChat vai aqui...
    const openChatButtons = document.querySelectorAll('#chat-button');
    const closeChatButton = document.getElementById('chat-close-button');
    const clearChatButton = document.getElementById('clear-chat-button'); // Botão Adicionado
    const floatingChatButton = document.getElementById('floating-chat-button');
    const backButton = document.getElementById('chat-back-button');
    const conversationListView = document.getElementById('chat-conversation-list-view');
    const messagesView = document.getElementById('chat-messages-view');
    const conversationListContainer = document.querySelector('.chat-conversation-list');
    const messageInputForm = document.getElementById('chat-input-form');
    const messageInput = document.getElementById('chat-message-input');
    const messagesList = document.getElementById('chat-messages-list');
    const conversationTitle = document.getElementById('chat-conversation-title');
    const conversationIcon = document.getElementById('chat-header-icon');
    const imageInput = document.getElementById('chat-image-input');
    const attachButton = document.querySelector('.chat-attach-button');
    const typingIndicator = document.getElementById('chat-typing-indicator');
    const typingIndicatorText = document.getElementById('typing-indicator-text');
    const replyPreview = document.getElementById('chat-reply-preview');
    const replyPreviewAuthor = document.getElementById('reply-preview-author');
    const replyPreviewSnippet = document.getElementById('reply-preview-snippet');
    const cancelReplyButton = document.getElementById('cancel-reply-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    const emojiToggleButton = document.getElementById('chat-emoji-button');

    // Emoji sets for the picker
    const emojiSets = {
      smileys: ['😀','😃','😄','😁','😆','😂','🙂','😉','😊','😍','😘','😎','🤩','🤔','😴','😢','😭','😡'],
      gestures: ['👍','👎','🙏','👏','🤝','👌','✌️','👊','🤘','🤙'],
      animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮']
    };

    // Populate emoji grids (idempotent)
    function populateEmojiPicker() {
      if (!emojiPicker) return;
      const grids = emojiPicker.querySelectorAll('.emoji-grid');
      grids.forEach(grid => {
        if (grid.dataset._populated) return;
        const tab = grid.dataset.tabContent;
        const list = emojiSets[tab] || [];
        grid.innerHTML = '';
        list.forEach((ch) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'emoji-btn';
          btn.textContent = ch;
          btn.title = ch;
          grid.appendChild(btn);
        });
        grid.dataset._populated = '1';
      });
    }

    // Insert emoji at cursor in input
    function insertAtCursor(input, text) {
      try {
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const value = input.value || '';
        input.value = value.slice(0, start) + text + value.slice(end);
        const pos = start + text.length;
        input.setSelectionRange(pos, pos);
        input.focus();
      } catch (e) {
        // fallback: append
        input.value = (input.value || '') + text;
        try { input.focus(); } catch(e) {}
      }
    }

    // Toggle the emoji picker (global, near the input)
    function toggleEmojiPicker() {
      if (!emojiPicker) return;
      const isVisible = emojiPicker.classList.contains('visible');
      if (isVisible) {
        hideEmojiPicker();
        return;
      }
      populateEmojiPicker();
      emojiPicker.classList.add('visible');
      emojiPicker.setAttribute('aria-hidden', 'false');
      activePicker = emojiPicker;
    }

    // Handle tab switch inside picker
    if (emojiPicker) {
      emojiPicker.addEventListener('click', (ev) => {
        const tabBtn = ev.target.closest('.emoji-tab');
        if (tabBtn) {
          // switch
          emojiPicker.querySelectorAll('.emoji-tab').forEach(b => b.classList.remove('active'));
          tabBtn.classList.add('active');
          const tab = tabBtn.dataset.tab;
          emojiPicker.querySelectorAll('.emoji-grid').forEach(g => {
            if (g.dataset.tabContent === tab) { g.removeAttribute('hidden'); } else { g.setAttribute('hidden',''); }
          });
          return;
        }

        const emojiBtn = ev.target.closest('.emoji-btn');
        if (emojiBtn && messageInput) {
          insertAtCursor(messageInput, emojiBtn.textContent);
          // keep picker open for multiple emojis
        }
      });
    }

    if (emojiToggleButton) {
      emojiToggleButton.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleEmojiPicker(); });
    }

    // NEW: Image Preview Elements
    const imagePreview = document.getElementById('chat-image-preview');
    const imagePreviewElement = document.getElementById('image-preview-element');
    const cancelImagePreviewButton = document.getElementById('cancel-image-preview-btn');

    // Cria o elemento de áudio para as notificações
    chatNotificationSound = new Audio('audio/ChatNotificacao.mp3');
    chatNotificationSound.preload = 'auto';

    // Get current user
    try {
      currentUser = JSON.parse(localStorage.getItem("currentUser"));
      if (!currentUser || !currentUser.username) {
          console.error("Chat: Current user not found or invalid.");
          return;
      }
    } catch (e) {
      console.error("Chat: Failed to parse current user from localStorage.", e);
      return;
    }

    // --- Centralized Notification Listener ---
    listenToChatNotifications(currentUser.username, (notification) => {
      const isChatOpen = chatModal.classList.contains('active');
      const hasUnread = notification.hasUnread && !isChatOpen;

      // Controle do Botão Flutuante (para entregador)
      if (floatingChatButton) {
        const badge = floatingChatButton.querySelector('.badge');
        if (hasUnread) {
          floatingChatButton.style.display = 'flex';
          floatingChatButton.dataset.conversationId = notification.lastConversationId || '';
          if (badge) badge.style.display = 'flex';
        } else {
          floatingChatButton.style.display = 'none';
          if (badge) badge.style.display = 'none';
        }
      }

      // Controle do Badge do Cabeçalho (para admin/confeiteira)
      const headerChatButton = document.getElementById('chat-button');
      if (headerChatButton) {
        const badge = headerChatButton.querySelector('.badge');
        if (badge) {
          badge.style.display = hasUnread ? 'flex' : 'none';
        }
      }

      // Tocar som de notificação
      if (hasUnread) {
        tryPlaySound(chatNotificationSound);
      }
    });

    // --- View Management ---

    const allRoles = [
        { id: 'angela', name: 'Ângela', icon: 'ph-user-gear' },
        { id: 'sofia', name: 'Sofia', icon: 'ph-cake' },
        { id: 'entregador', name: 'Entregador', icon: 'ph-moped' }
    ];

    function getOtherParticipantInfo(conversationId) {
        if (!conversationId || !currentUser) return null;
        const participants = conversationId.split('_');
        const otherUserId = participants.find(p => p !== currentUser.username);
        if (!otherUserId) return null;
        
        const roleInfo = allRoles.find(role => role.id === otherUserId);
        if (!roleInfo) return null;

        const displayName = roleInfo.id === 'entregador' ? 'Entregador' : roleInfo.name;
        return {
            name: displayName,
            icon: roleInfo.icon
        };
    }

    const openChat = (directConversationId = null) => {
      // Save focus and open modal
      previousActiveElement = document.activeElement;
      // Sequence: show backdrop first, then content to avoid click-through/flash
      chatModal.classList.add('active');
      document.body.classList.add('chat-open');
      if (chatModalContent) {
        // focus after a short delay so the backdrop paints first and avoids accidental background clicks
        setTimeout(() => {
          try { chatModalContent.focus(); } catch (e) {}
          enableFocusTrap();
        }, 80);
      }
      if (floatingChatButton) floatingChatButton.style.display = 'none';
      // Mark notifications as read when opening the chat window
      markChatAsRead(currentUser.username);

      if (directConversationId) {
          const otherUserInfo = getOtherParticipantInfo(directConversationId);
          if (otherUserInfo) {
              openConversationView(directConversationId, otherUserInfo.name, otherUserInfo.icon);
              return; // Impede a execução do fallback
          }
      }

      // Fallback: abre a lista de conversas se nenhum ID direto for fornecido ou encontrado
      renderConversationList();
      goBackToConversationList();
    };

    // Expose openChat via a custom event so external modules can request the modal to open
    try {
      chatModal.addEventListener('open-chat', (ev) => {
        const id = ev && ev.detail ? ev.detail : null;
        try { openChat(id); } catch(e) { console.warn('open-chat handler failed', e); }
      });
    } catch (e) {
      // ignore
    }

    const closeChat = () => {
      chatModal.classList.remove('active');
      document.body.classList.remove('chat-open');
      disableFocusTrap();
      try {
        if (previousActiveElement && previousActiveElement.focus) previousActiveElement.focus();
      } catch (e) {}
      // Unsubscribe from any active conversation when closing the modal
      if (unsubscribeConversationListener) {
        unsubscribeConversationListener();
        unsubscribeConversationListener = null;
      }
      // Unsubscribe from typing listener
      if (unsubscribeTypingListener) {
          unsubscribeTypingListener();
          unsubscribeTypingListener = null;
      }

      // Se um campo de edição estiver aberto, cancele-o
      if (editingMessageId) {
          cancelEdit();
      }

      // Se um campo de resposta estiver aberto, cancele-o
      if (replyingToMessage) {
          cancelReply();
      }
      if (pendingImageFile) cancelImagePreview(); // NEW

      // Se o seletor de emoji estiver aberto, esconda-o
      if (activePicker) {
          hideEmojiPicker();
      }
    };

    const openConversationView = (conversationId, title, iconClass) => {
      // Mark as read as soon as it's opened
      markConversationAsRead(currentUser.username, conversationId);

      activeConversationId = conversationId;
      conversationListView.style.display = 'none';
      messagesView.style.display = 'flex';
      backButton.style.display = 'block';
      if (clearChatButton) clearChatButton.style.display = 'block'; // Mostra o botão

      conversationTitle.textContent = title;
      conversationIcon.className = `ph-fill ${iconClass}`;

      // Clear previous messages and listen for new ones
      messagesList.innerHTML = '<li>Carregando mensagens...</li>';
      if (unsubscribeConversationListener) unsubscribeConversationListener();
      unsubscribeConversationListener = listenToConversation(conversationId, (messages) => {
          currentMessages = messages; // Cache the full message map
          renderMessages(messages);
      });

      // Listen for typing status
      if (unsubscribeTypingListener) unsubscribeTypingListener();
      unsubscribeTypingListener = listenToTypingStatus(conversationId, (typingUsers) => {
          handleTypingStatusUpdate(typingUsers, title);
      });

      // Mark messages as delivered for this user (sets delivered flags on messages sent to them)
      try {
        markMessagesDelivered(conversationId, currentUser.username).catch(() => {});
      } catch (e) {
        // ignore
      }

      // Also mark messages as read for this user
      try {
        markMessagesRead(conversationId, currentUser.username).catch(() => {});
      } catch (e) {
        // ignore
      }
    };

    const goBackToConversationList = () => {
      // Stop broadcasting typing status for the conversation we are leaving
      if (activeConversationId) {
          setTypingStatus(activeConversationId, currentUser.username, false);
      }

      activeConversationId = null;
      conversationListView.style.display = 'block';
      messagesView.style.display = 'none';
      backButton.style.display = 'none';
      if (clearChatButton) clearChatButton.style.display = 'none'; // Esconde o botão

      conversationTitle.textContent = 'Conversas';
      conversationIcon.className = 'ph ph-chats-circle';

      // Unsubscribe from conversation listener when going back to the list
      if (unsubscribeConversationListener) {
        unsubscribeConversationListener();
        unsubscribeConversationListener = null;
      }
      // Unsubscribe from typing listener
      if (unsubscribeTypingListener) {
          unsubscribeTypingListener();
          unsubscribeTypingListener = null;
      }

      // Se um campo de resposta estiver aberto, cancele-o
      if (replyingToMessage) {
          cancelReply();
      }
      if (pendingImageFile) cancelImagePreview(); // NEW

      // Se o seletor de emoji estiver aberto, esconda-o
      if (activePicker) {
          hideEmojiPicker();
      }
    };

    // --- Data Rendering ---

    const renderConversationList = () => {
      conversationListContainer.innerHTML = ''; // Clear existing list

      const otherRoles = allRoles.filter(role => role.id !== currentUser.username);

      otherRoles.forEach(role => {
          const conversationId = getConversationId(currentUser.username, role.id);
          const displayName = role.id === 'entregador' ? 'Entregador' : role.name;

          const item = document.createElement('div');
          item.className = 'conversation-item';
          item.dataset.conversationId = conversationId;
          item.dataset.conversationName = displayName;
          item.dataset.conversationIcon = role.icon;

          item.innerHTML = `
              <i class="ph-fill ${role.icon}"></i>
              <div class="conversation-details">
                <strong>${displayName}</strong>
                <span>Clique para conversar</span>
              </div>
              <div class="conversation-badge" style="display: none;"></div>
          `;
          conversationListContainer.appendChild(item);
      });
    };

    const renderMessages = (messages) => {
      messagesList.innerHTML = '';
      if (Object.keys(messages).length === 0) {
          messagesList.innerHTML = '<li style="text-align: center; color: var(--cor-texto-secundario); list-style: none;">Nenhuma mensagem ainda. Comece a conversa!</li>';
          return;
      }

      const sortedMessages = Object.entries(messages).sort(([, a], [, b]) => (a.timestamp || 0) - (b.timestamp || 0));

      sortedMessages.forEach(([messageId, msg]) => {
          const item = document.createElement('div');
          const messageType = msg.senderId === currentUser.username ? 'sent' : 'received';
          item.className = `chat-message ${messageType}`;
          item.dataset.messageId = messageId;

          // Store data for editing
          if (messageType === 'sent' && msg.type !== 'image' && msg.type !== 'deleted') {
              item.dataset.originalContent = msg.content;
          }

          const date = new Date(msg.timestamp);
          const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          let bubbleClasses = 'message-bubble';
          let messageContentHTML = '';
          if (msg.type === 'image') {
              // It's an image message
              bubbleClasses += ' image-only';
              messageContentHTML = `<img src="${msg.content}" alt="Imagem enviada" loading="lazy">`;
          } else if (msg.type === 'deleted') {
              bubbleClasses += ' deleted';
              messageContentHTML = `<i>${msg.content}</i>`;
          } else {
              // It's a text message (or old message without type)
              messageContentHTML = msg.content;
          }

          // Add edited indicator
          if (msg.edited) {
              messageContentHTML += ' <span class="edited-indicator">(editado)</span>';
          }

          // Add quoted message if it's a reply
          let quotedMessageHTML = '';
          if (msg.replyTo && currentMessages[msg.replyTo.messageId]) {
              const originalMsg = currentMessages[msg.replyTo.messageId];
              const originalAuthor = originalMsg.senderId === currentUser.username ? 'Você' : getOtherParticipantInfo(activeConversationId)?.name || originalMsg.senderId;
              let originalContentSnippet = originalMsg.type === 'image' ? 'Imagem' : originalMsg.content;

              quotedMessageHTML = `
                  <div class="quoted-message">
                      <strong>${originalAuthor}</strong>
                      <span>${originalContentSnippet}</span>
                  </div>
              `;
          }

          let actionsHTML = '';
          if (msg.type !== 'deleted') {
              let editDeleteButtons = '';
              if (messageType === 'sent' && msg.type === 'text') {
                  editDeleteButtons = `
                      <button class="edit-btn" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                      <button class="delete-btn" title="Apagar"><i class="ph ph-trash"></i></button>
                  `;
              }
              actionsHTML = `
                  <div class="message-actions">
                      <button class="react-btn" title="Reagir"><i class="ph ph-smiley"></i></button>
                      <button class="reply-btn" title="Responder"><i class="ph ph-arrow-bend-up-left"></i></button>
                      ${editDeleteButtons}
                  </div>
              `;
          }

            // Status indicator for sent messages (sent / delivered / read)
            let statusHTML = '';
            if (messageType === 'sent') {
              if (msg.read) {
                statusHTML = `<span class="message-status read" title="Lida">✓✓</span>`;
              } else if (msg.delivered) {
                statusHTML = `<span class="message-status delivered" title="Entregue">✓✓</span>`;
              } else {
                statusHTML = `<span class="message-status sent" title="Enviado">✓</span>`;
              }
            }

            item.innerHTML = `
              <div class="${bubbleClasses}">
                ${quotedMessageHTML}
                ${messageContentHTML}
              </div>
              <div class="message-meta">
              <span class="message-timestamp">${time}</span>
              ${statusHTML}
              </div>
              ${actionsHTML}
            `;
          messagesList.appendChild(item);
      });

      // Scroll to the bottom smoothly and announce last message for screen readers
      const lastMessageEl = messagesList.lastElementChild;
      if (lastMessageEl) {
        try {
          lastMessageEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } catch (e) {
          messagesList.scrollTop = messagesList.scrollHeight;
        }
      }

      // Announce latest message in the live region for assistive tech
      try {
        if (chatLiveRegion && sortedMessages.length) {
          const lastMsg = sortedMessages[sortedMessages.length - 1][1];
          const author = lastMsg.senderId === currentUser.username ? 'Você' : (getOtherParticipantInfo(activeConversationId)?.name || lastMsg.senderId);
          const snippet = lastMsg.type === 'image' ? 'Imagem' : (lastMsg.content || '').toString().slice(0, 120);
          chatLiveRegion.textContent = `${author}: ${snippet}`;
        }
      } catch (e) {}

      // Keep the input focused for quick replies
      try { if (messageInput) messageInput.focus(); } catch (e) {}
    };

    const handleTypingStatusUpdate = (typingUsers, conversationPartnerName) => {
      if (!typingIndicator || !typingIndicatorText) return;

      // Filter out the current user to see if others are typing
      const otherTypingUsers = Object.keys(typingUsers).filter(
        userId => userId !== currentUser.username && typingUsers[userId] === true
      );

      if (otherTypingUsers.length > 0) {
        // In a 1-on-1 chat, we can just use the partner's name.
        // For group chat, this would need to be more complex (e.g., "User1 and User2 are typing")
        typingIndicatorText.textContent = `${conversationPartnerName} está digitando...`;
        typingIndicator.classList.add('visible');
      } else {
        typingIndicator.classList.remove('visible');
      }
    };

    const updateConversationBadges = (unreadCounts) => {
      // Reset all badges first
      document.querySelectorAll('.conversation-badge').forEach(badge => {
          badge.style.display = 'none';
          badge.textContent = '';
      });

      if (!unreadCounts) return;

      for (const conversationId in unreadCounts) {
          const count = unreadCounts[conversationId].unread_count;
          if (count > 0) {
              const item = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
              if (item) {
                  const badge = item.querySelector('.conversation-badge');
                  if (badge) {
                      badge.textContent = count;
                      badge.style.display = 'flex';
                  }
              }
          }
      }
    };

    // --- Event Handlers ---

    const handleClearConversation = () => {
      if (!activeConversationId) return;
      // use styled confirm modal if available
      (async () => {
        try {
          const ui = await import('./ui.js');
          const confirmed = await ui.showConfirm("Tem certeza que deseja apagar todas as mensagens desta conversa? Esta ação não pode ser desfeita.");
          if (confirmed) {
            clearConversation(activeConversationId).catch(err => console.error("Failed to clear conversation:", err));
          }
        } catch (e) {
          // fallback to native confirm
          const confirmed = confirm("Tem certeza que deseja apagar todas as mensagens desta conversa? Esta ação não pode ser desfeita.");
          if (confirmed) {
            clearConversation(activeConversationId).catch(err => console.error("Failed to clear conversation:", err));
          }
        }
      })();
    };

    // --- Emoji Picker Logic ---
    function showEmojiPicker(messageElement) {
        if (!emojiPicker) return;

        // Hide any other open picker/actions
        hideEmojiPicker();
        document.querySelectorAll('.chat-message.actions-visible').forEach(el => el.classList.remove('actions-visible'));

        const bubble = messageElement.querySelector('.message-bubble');
        if (!bubble) return;

        const rect = bubble.getBoundingClientRect();
        const modalRect = chatModal.getBoundingClientRect();

        // Position picker above the bubble
        emojiPicker.style.top = `${rect.top - modalRect.top - emojiPicker.offsetHeight - 10}px`;
        
        // Center the picker horizontally relative to the bubble
        const pickerWidth = emojiPicker.offsetWidth;
        const bubbleCenter = rect.left - modalRect.left + (rect.width / 2);
        let leftPosition = bubbleCenter - (pickerWidth / 2);

        // Ensure picker doesn't go off-screen
        if (leftPosition < 10) leftPosition = 10;
        if (leftPosition + pickerWidth > modalRect.width - 10) leftPosition = modalRect.width - pickerWidth - 10;

        emojiPicker.style.left = `${leftPosition}px`;
        
        emojiPicker.dataset.messageId = messageElement.dataset.messageId;
        emojiPicker.classList.add('visible');
        activePicker = emojiPicker;
    }

    function hideEmojiPicker() {
        if (activePicker) {
            activePicker.classList.remove('visible');
            activePicker = null;
        }
    }

    // Focus trap helpers for accessibility
    function enableFocusTrap() {
      disableFocusTrap();
      focusTrapHandler = function(e) {
        if (e.key !== 'Tab') return;
        const focusable = Array.from(chatModal.querySelectorAll(FOCUSABLE_SELECTORS)).filter(el => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      };
      document.addEventListener('keydown', focusTrapHandler);
    }

    function disableFocusTrap() {
      if (focusTrapHandler) {
        document.removeEventListener('keydown', focusTrapHandler);
        focusTrapHandler = null;
      }
    }

    function handleReplyToMessage(messageId) {
      if (editingMessageId) {
          cancelEdit();
      }
      if (pendingImageFile) cancelImagePreview(); // NEW

      const originalMessage = currentMessages[messageId];
      if (!originalMessage) return;

      const authorName = originalMessage.senderId === currentUser.username ? 'Você' : getOtherParticipantInfo(activeConversationId)?.name || originalMessage.senderId;
      let contentSnippet = originalMessage.type === 'image' ? 'Imagem' : originalMessage.content;

      replyingToMessage = {
          messageId: messageId,
          author: authorName,
          content: contentSnippet,
      };

      replyPreviewAuthor.textContent = `Respondendo a ${authorName}`;
      replyPreviewSnippet.textContent = contentSnippet;
      replyPreview.classList.add('visible');
      messageInput.focus();
    }

    function cancelReply() {
      replyingToMessage = null;
      if (replyPreview) {
          replyPreview.classList.remove('visible');
      }
    }

    // NEW: Handle canceling image preview
    function cancelImagePreview() {
        pendingImageFile = null;
        if (imagePreview) imagePreview.classList.remove('visible');
        if (imageInput) imageInput.value = ''; // Reset file input
    }

    function handleDeleteMessage(messageId) {
      (async () => {
        try {
          const ui = await import('./ui.js');
          const confirmed = await ui.showConfirm("Tem certeza que deseja apagar esta mensagem? Esta ação não pode ser desfeita.");
          if (confirmed) {
            deleteMessage(activeConversationId, messageId).catch(err => console.error("Failed to delete message:", err));
          }
        } catch (e) {
          // fallback
          const confirmed = confirm("Tem certeza que deseja apagar esta mensagem? Esta ação não pode ser desfeita.");
          if (confirmed) {
            deleteMessage(activeConversationId, messageId).catch(err => console.error("Failed to delete message:", err));
          }
        }
      })();
    }

    function handleEditMessage(messageElement, messageId) {
      if (editingMessageId) {
          cancelEdit();
      }
      editingMessageId = messageId;

      const bubble = messageElement.querySelector('.message-bubble');
      const originalContent = messageElement.dataset.originalContent || '';

      messageElement.classList.remove('actions-visible');
      bubble.classList.add('editing');
      bubble.innerHTML = `
          <div class="edit-input-container">
              <input type="text" class="edit-message-input" value="${originalContent}">
              <button class="cancel-edit-btn" title="Cancelar"><i class="ph ph-x-circle"></i></button>
              <button class="save-edit-btn" title="Salvar"><i class="ph ph-check-circle"></i></button>
          </div>
      `;
      const input = bubble.querySelector('.edit-message-input');
      input.focus();
      input.select();
    }

    function handleSaveEdit(messageId, newContent) {
      if (!newContent.trim()) {
          cancelEdit();
          return;
      }
      editMessage(activeConversationId, messageId, newContent.trim()).catch(err => {
          console.error("Failed to edit message:", err);
      });
      editingMessageId = null;
    }

    function cancelEdit() {
      if (!editingMessageId) return;
      const messageElement = document.querySelector(`.chat-message[data-message-id="${editingMessageId}"]`);
      if (messageElement) {
          const bubble = messageElement.querySelector('.message-bubble');
          const originalContent = messageElement.dataset.originalContent || '';
          
          // A re-renderização pelo Firebase vai cuidar de restaurar o estado visual correto,
          // mas podemos forçar uma atualização visual imediata se quisermos.
          // Por simplicidade, vamos apenas limpar o estado de edição.
          bubble.classList.remove('editing');
          bubble.innerHTML = originalContent; // Restauração simples
      }
      editingMessageId = null;
      // A próxima atualização do Firebase corrigirá completamente a UI.
    }

    const stopTyping = debounce(() => {
      if (activeConversationId) {
        setTypingStatus(activeConversationId, currentUser.username, false);
      }
    }, 2000); // Stop typing after 2 seconds of inactivity

    const handleTypingInput = () => {
      if (activeConversationId) {
        // Immediately notify that user is typing
        setTypingStatus(activeConversationId, currentUser.username, true);
        // Schedule notification to stop typing
        stopTyping();
      }
    };

    const handleSendMessage = async (e) => {
      e.preventDefault();
      const content = messageInput.value.trim();
      if ((!content && !pendingImageFile) || !activeConversationId) return;

      stopTyping.cancel();
      setTypingStatus(activeConversationId, currentUser.username, false);

      const replyInfo = replyingToMessage ? { messageId: replyingToMessage.messageId, content: replyingToMessage.content } : null;

      // Disable inputs while sending
      messageInput.disabled = true;
      const sendButton = document.getElementById('chat-send-button');
      if (sendButton) sendButton.disabled = true;

      try {
          let messageContent = content;
          let messageType = 'text';

          if (pendingImageFile) {
              const downloadUrl = await uploadChatImage(pendingImageFile);
              messageContent = downloadUrl; // Image URL is the main content
              messageType = 'image';
              // TODO: If there's text, send it as a separate message or handle as a caption.
              // For now, we prioritize the image.
          }

          await sendMessage(activeConversationId, currentUser.username, messageContent, messageType, replyInfo);

          messageInput.value = '';
          if (replyingToMessage) cancelReply();
          if (pendingImageFile) cancelImagePreview();

      } catch (err) {
          console.error("Failed to send message:", err);
          // TODO: showToast("Erro ao enviar mensagem", "error");
      } finally {
          // Re-enable inputs
          messageInput.disabled = false;
          if (sendButton) sendButton.disabled = false;
          messageInput.focus();
      }
    };

    // MODIFIED: This function now only handles the preview
    const handleImageUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Cancel any ongoing reply to avoid UI clutter
      if (replyingToMessage) cancelReply();

      pendingImageFile = file;

      const reader = new FileReader();
      reader.onload = (event) => {
          if(imagePreviewElement) imagePreviewElement.src = event.target.result;
          if(imagePreview) imagePreview.classList.add('visible');
      };
      reader.readAsDataURL(file);
      messageInput.focus();
    };

    // --- Event Listeners Initialization ---

    openChatButtons.forEach(button => button.addEventListener('click', () => openChat()));

    if (floatingChatButton) {
      floatingChatButton.addEventListener('click', () => {
          const conversationId = floatingChatButton.dataset.conversationId;
          // Abre a conversa específica ou a lista de conversas como fallback
          openChat(conversationId || null);
      });
    }

    if (closeChatButton) closeChatButton.addEventListener('click', closeChat);
    if (clearChatButton) clearChatButton.addEventListener('click', handleClearConversation); // Listener Adicionado
    if (backButton) backButton.addEventListener('click', goBackToConversationList);
    if (messageInputForm) messageInputForm.addEventListener('submit', handleSendMessage);
    if (imageInput) imageInput.addEventListener('change', handleImageUpload);
    if (cancelReplyButton) cancelReplyButton.addEventListener('click', cancelReply);
    if (cancelImagePreviewButton) cancelImagePreviewButton.addEventListener('click', cancelImagePreview); // NEW
    if (messageInput) messageInput.addEventListener('input', handleTypingInput);

    // Adiciona o listener para a lista de conversas
    if (conversationListContainer) {
      conversationListContainer.addEventListener('click', (event) => {
        const conversationItem = event.target.closest('.conversation-item');
        if (conversationItem) {
          const { conversationId, conversationName, conversationIcon } = conversationItem.dataset;
          if (conversationId && conversationName && conversationIcon) {
            openConversationView(conversationId, conversationName, conversationIcon);
          }
        }
      });
    }

    // Listen for unread counts to update badges on the conversation list
    listenToConversationUnreadCounts(currentUser.username, updateConversationBadges);

    chatModal.addEventListener('click', (event) => {
      // Close when clicking the backdrop or container itself, but not when clicking the content
      const clickedBackdrop = event.target && (event.target.classList && event.target.classList.contains('chat-modal-backdrop'));
      if (event.target === chatModal || clickedBackdrop) {
        if (editingMessageId) {
          cancelEdit();
        }
        if (replyingToMessage) {
          cancelReply();
        }
        if (pendingImageFile) cancelImagePreview(); // NEW
        hideEmojiPicker();
        closeChat();
      }
    });

    messagesList.addEventListener('scroll', hideEmojiPicker);

    messagesList.addEventListener('click', (event) => {
      const target = event.target;
      const messageElement = target.closest('.chat-message');
      if (!messageElement) return;

      const messageId = messageElement.dataset.messageId;
      const isSentMessage = messageElement.classList.contains('sent');

      // Handle clicks on action buttons inside the menu
      if (target.closest('.react-btn')) {
          showEmojiPicker(messageElement);
          return;
      }
      if (target.closest('.reply-btn')) {
          handleReplyToMessage(messageId);
          return;
      }
      if (isSentMessage && target.closest('.delete-btn')) {
          handleDeleteMessage(messageId);
          return;
      }
      if (isSentMessage && target.closest('.edit-btn')) {
          handleEditMessage(messageElement, messageId);
          return;
      }

      // Handle click on existing reaction pill
      const reactionPill = target.closest('.reaction-pill');
      if (reactionPill) {
          const emoji = reactionPill.dataset.emoji;
          toggleReaction(activeConversationId, messageId, currentUser.username, emoji);
          return;
      }

      // Handle clicks inside the edit UI
      if (target.closest('.save-edit-btn')) {
          const input = messageElement.querySelector('.edit-message-input');
          handleSaveEdit(messageId, input.value);
          return;
      }
      if (target.closest('.cancel-edit-btn')) {
          cancelEdit();
          return;
      }

      // If the click was on the bubble itself, toggle the action menu
      if (target.closest('.message-bubble') && !target.closest('.edit-input-container')) {
          // Hide other menus
          document.querySelectorAll('.chat-message.actions-visible').forEach(el => {
              if (el !== messageElement) {
                  el.classList.remove('actions-visible');
              }
          });
          // Toggle current menu
          messageElement.classList.toggle('actions-visible');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && chatModal.classList.contains('active')) {
        if (activePicker) {
            hideEmojiPicker();
        }
        if (editingMessageId) {
          cancelEdit();
        }
        if (pendingImageFile) cancelImagePreview(); // NEW
        // If in message view, go back. If in list view, close.
        if (messagesView.style.display === 'flex') {
          goBackToConversationList();
        } else {
          closeChat();
        }
      }
      if (event.key === 'Enter' && editingMessageId) {
          const input = document.querySelector(`.chat-message[data-message-id="${editingMessageId}"] .edit-message-input`);
          if (input) handleSaveEdit(editingMessageId, input.value);
      }
    });
  }

  // Inicia o processo de inicialização
  attemptInit();
}

/**
 * Programmatically request the chat modal to open. This dispatches a
 * custom `open-chat` event onto the `#chat-modal` element which will be
 * handled by the initialization code (if present).
 * @param {string|null} directConversationId
 */
export function openChatWindow(directConversationId = null) {
  try {
    const chatModal = document.getElementById('chat-modal');
    if (!chatModal) {
      // If component not present, still call initialize to ensure it will be created later
      try { initializeChat(); } catch(e) {}
      return;
    }
    const ev = new CustomEvent('open-chat', { detail: directConversationId });
    chatModal.dispatchEvent(ev);
  } catch (e) {
    console.warn('openChatWindow failed', e);
  }
}