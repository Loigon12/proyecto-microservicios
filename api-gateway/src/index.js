
const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const PORT = Number(process.env.PORT || 8080);
const AUTH_URL =
  process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const USER_URL =
  process.env.USER_SERVICE_URL || 'http://localhost:3002';

app.disable('x-powered-by');

// Servir el frontend HTML, CSS y JavaScript.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Comprobar el estado del Gateway y sus servicios.
app.get('/api/health', async (_req, res) => {
  const check = async (url) => {
    try {
      const response = await fetch(`${url}/health`);
      return response.ok ? 'ok' : 'unavailable';
    } catch (error) {
      console.error(`Error comprobando ${url}:`, error.message);
      return 'unavailable';
    }
  };

  const [auth, user] = await Promise.all([
    check(AUTH_URL),
    check(USER_URL)
  ]);

  const healthy = auth === 'ok' && user === 'ok';

  res.status(healthy ? 200 : 503).json({
    service: 'api-gateway',
    status: healthy ? 'ok' : 'degraded',
    dependencies: {
      auth,
      user
    }
  });
});

// Proxy del servicio de autenticación.
// /api/auth/register -> /auth/register
// /api/auth/login    -> /auth/login
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: AUTH_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/auth${path}`,
    logger: console
  })
);

// Proxy del servicio de usuarios.
// /api/users/me -> /users/me
app.use(
  '/api/users',
  createProxyMiddleware({
    target: USER_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/users${path}`,
    logger: console
  })
);

// Devolver la aplicación frontend para las demás rutas.
app.get('*', (_req, res) => {
  res.sendFile(
    path.join(__dirname, '..', 'public', 'index.html')
  );
});

// Iniciar el servidor.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Gateway escuchando en el puerto ${PORT}`);
  console.log(`Servicio de autenticación: ${AUTH_URL}`);
  console.log(`Servicio de usuarios: ${USER_URL}`);
});
