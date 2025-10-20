const form = document.getElementById('login-form');
const messageElement = document.getElementById('message');

const backendBaseUrl = (window.APP_CONFIG && window.APP_CONFIG.backendUrl) || '';

const buildUrl = (path) => {
  if (!backendBaseUrl) {
    return path;
  }

  return `${backendBaseUrl.replace(/\/$/, '')}${path}`;
};

const showMessage = (text, type = 'error') => {
  messageElement.textContent = text;
  messageElement.classList.remove('error', 'success');
  messageElement.classList.add(type);
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('Validando…', 'success');

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(buildUrl('/api/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      showMessage(result.message || 'Credenciales incorrectas.', 'error');
      return;
    }

    showMessage('Inicio de sesión exitoso, redirigiendo…', 'success');
    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error('Login error:', error);
    showMessage('No se pudo conectar con el servidor. Intenta nuevamente.', 'error');
  }
});
