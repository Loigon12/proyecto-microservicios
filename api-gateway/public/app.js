const $ = (id) => document.getElementById(id);
const form = $('auth-form');
const nameField = $('name-field');
const emailInput = $('email');
const passwordInput = $('password');
const nameInput = $('name');
const notice = $('notice');
let mode = 'login';

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === 'register';
  nameField.hidden = !registering;
  passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
  $('step-label').textContent = registering ? 'EMPIEZA EN UN MOMENTO' : 'BIENVENIDO DE NUEVO';
  $('form-title').textContent = registering ? 'Crea tu cuenta' : 'Inicia sesión';
  $('form-subtitle').textContent = registering ? 'Completa tus datos para comenzar.' : 'Introduce tus datos para acceder a tu cuenta.';
  $('submit-label').textContent = registering ? 'Crear mi cuenta' : 'Entrar a mi cuenta';
  $('switch-copy').innerHTML = registering
    ? '¿Ya tienes una cuenta? <button type="button" id="switch-link">Inicia sesión</button>'
    : '¿Todavía no tienes cuenta? <button type="button" id="switch-link">Regístrate gratis</button>';
  $('login-tab').classList.toggle('active', !registering);
  $('register-tab').classList.toggle('active', registering);
  $('login-tab').setAttribute('aria-selected', String(!registering));
  $('register-tab').setAttribute('aria-selected', String(registering));
  $('switch-link').addEventListener('click', () => setMode(registering ? 'login' : 'register'));
  clearNotice();
  clearErrors();
}
function showNotice(message, type = 'error') {
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
}
function clearNotice() { notice.hidden = true; notice.textContent = ''; notice.className = 'notice'; }
function clearErrors() {
  ['name','email','password'].forEach(key => {
    $(`${key}-error`).textContent = '';
    $(key).classList.remove('invalid');
  });
}
function validate() {
  clearErrors();
  let valid = true;
  if (mode === 'register' && nameInput.value.trim().length < 2) {
    $('name-error').textContent = 'Escribe tu nombre (mínimo 2 caracteres).';
    nameInput.classList.add('invalid'); valid = false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) {
    $('email-error').textContent = 'Introduce un correo válido.';
    emailInput.classList.add('invalid'); valid = false;
  }
  if (passwordInput.value.length < 8) {
    $('password-error').textContent = 'La contraseña debe tener al menos 8 caracteres.';
    passwordInput.classList.add('invalid'); valid = false;
  }
  return valid;
}
async function request(path, body = null, token = sessionStorage.getItem('accessToken'), method = null) {
  const response = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la solicitud.');
  return data;
}
$('login-tab').addEventListener('click', () => setMode('login'));
$('register-tab').addEventListener('click', () => setMode('register'));
$('switch-link').addEventListener('click', () => setMode('register'));
$('toggle-password').addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  $('toggle-password').textContent = showing ? 'Ver' : 'Ocultar';
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearNotice();
  if (!validate()) return;
  const button = $('submit-button');
  button.disabled = true;
  $('submit-label').textContent = 'Procesando…';
  try {
    const payload = { email: emailInput.value.trim(), password: passwordInput.value };
    if (mode === 'register') payload.name = nameInput.value.trim();
    const result = await request(`/api/auth/${mode}`, payload);
    if (mode === 'register') {
      showNotice('Cuenta creada. Ya puedes iniciar sesión.', 'success');
      setMode('login');
      emailInput.value = payload.email;
      passwordInput.value = '';
    } else {
      sessionStorage.setItem('accessToken', result.token);
      await showProfile(result.user);
    }
  } catch (error) {
    showNotice(error.message || 'Ocurrió un error de conexión.');
  } finally {
    button.disabled = false;
    $('submit-label').textContent = mode === 'register' ? 'Crear mi cuenta' : 'Entrar a mi cuenta';
  }
});
async function showProfile(userFromLogin) {
  let user = userFromLogin;
  try {
    const result = await request('/api/users/me', null, sessionStorage.getItem('accessToken'));
    user = result.user || user;
  } catch (error) {
    // Si el perfil no responde, se conserva el usuario validado por auth-service.
    console.warn('No se pudo consultar el perfil:', error.message);
  }
  $('auth-view').hidden = true;
  $('profile-view').hidden = false;
  $('profile-name').textContent = user.name || 'Usuario';
  $('profile-email').textContent = user.email || '';
  $('avatar').textContent = (user.name || user.email || 'U').trim().charAt(0).toUpperCase();
  await loadUsers();
}
function showCrudNotice(message, type = 'error') {
  const box = $('crud-notice');
  box.textContent = message;
  box.className = `notice ${type}`;
  box.hidden = false;
}
function clearCrudNotice() {
  $('crud-notice').hidden = true;
  $('crud-notice').textContent = '';
}
function resetCrudForm() {
  $('crud-form').reset();
  $('crud-id').value = '';
  $('crud-submit').innerHTML = 'Agregar usuario <span>＋</span>';
  $('crud-cancel').hidden = true;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}
async function loadUsers() {
  $('crud-loading').hidden = false;
  $('crud-empty').hidden = true;
  try {
    const result = await request('/api/users');
    const users = result.users || [];
    $('crud-list').innerHTML = users.map((user) => `
      <tr>
        <td data-label="Usuario">${escapeHtml(user.name)}</td>
        <td data-label="Correo">${escapeHtml(user.email)}</td>
        <td data-label="Acciones" class="crud-actions">
          <button type="button" class="crud-edit" data-edit="${escapeHtml(user.id)}">Editar</button>
          <button type="button" class="crud-delete" data-delete="${escapeHtml(user.id)}">Eliminar</button>
        </td>
      </tr>`).join('');
    $('crud-count').textContent = `${users.length} ${users.length === 1 ? 'registro' : 'registros'}`;
    $('crud-empty').hidden = users.length !== 0;
  } catch (error) {
    showCrudNotice(error.message || 'No se pudieron cargar los usuarios.');
  } finally {
    $('crud-loading').hidden = true;
  }
}
$('crud-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearCrudNotice();
  const id = $('crud-id').value;
  const name = $('crud-name').value.trim();
  const email = $('crud-email').value.trim();
  if (name.length < 2) {
    showCrudNotice('El nombre debe tener al menos 2 caracteres.');
    return;
  }
  const button = $('crud-submit');
  button.disabled = true;
  try {
    await request(id ? `/api/users/${encodeURIComponent(id)}` : '/api/users', { name, email }, sessionStorage.getItem('accessToken'), id ? 'PATCH' : 'POST');
    showCrudNotice(id ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.', 'success');
    resetCrudForm();
    await loadUsers();
  } catch (error) {
    showCrudNotice(error.message || 'No se pudo guardar el usuario.');
  } finally {
    button.disabled = false;
  }
});
$('crud-cancel').addEventListener('click', () => {
  resetCrudForm();
  clearCrudNotice();
});
$('crud-list').addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit]');
  const deleteButton = event.target.closest('[data-delete]');
  if (editButton) {
    try {
      const result = await request('/api/users');
      const user = (result.users || []).find(item => item.id === editButton.dataset.edit);
      if (!user) throw new Error('No se encontró el usuario seleccionado.');
      $('crud-id').value = user.id;
      $('crud-name').value = user.name;
      $('crud-email').value = user.email;
      $('crud-submit').innerHTML = 'Guardar cambios <span>✓</span>';
      $('crud-cancel').hidden = false;
      $('crud-name').focus();
      clearCrudNotice();
    } catch (error) {
      showCrudNotice(error.message);
    }
  }
  if (deleteButton) {
    const id = deleteButton.dataset.delete;
    if (!window.confirm('¿Seguro que deseas eliminar este usuario?')) return;
    try {
      await request(`/api/users/${encodeURIComponent(id)}`, null, sessionStorage.getItem('accessToken'), 'DELETE');
      showCrudNotice('Usuario eliminado correctamente.', 'success');
      if ($('crud-id').value === id) resetCrudForm();
      await loadUsers();
    } catch (error) {
      showCrudNotice(error.message || 'No se pudo eliminar el usuario.');
    }
  }
});

$('logout-button').addEventListener('click', () => {
  sessionStorage.removeItem('accessToken');
  $('profile-view').hidden = true;
  $('auth-view').hidden = false;
  form.reset();
  resetCrudForm();
  $('crud-list').innerHTML = '';
  setMode('login');
  showNotice('Has cerrado sesión correctamente.', 'success');
});
(async function restoreSession() {
  const token = sessionStorage.getItem('accessToken');
  if (!token) return;
  try {
    const result = await request('/api/users/me', null, token);
    await showProfile(result.user);
  } catch {
    sessionStorage.removeItem('accessToken');
  }
})();
