# Proyecto de microservicios: login con Docker Compose

Aplicación didáctica de inicio de sesión y registro con HTML, CSS y JavaScript en el navegador, una API Gateway, dos microservicios Node.js y dos bases de datos PostgreSQL independientes.

## Arquitectura (5 contenedores)

- `api-gateway`: sirve la interfaz web y enruta `/api/auth/*` al servicio de autenticación y `/api/users/*` al servicio de usuarios.
- `auth-service`: registra usuarios, valida credenciales, genera JWT y consulta la base de autenticación.
- `user-service`: expone el perfil del usuario autenticado y consulta su propia base de datos.
- `auth-db`: PostgreSQL para credenciales (hash de contraseña).
- `user-db`: PostgreSQL para datos de perfil.

## Requisitos

- Docker Desktop con Docker Compose v2 habilitado.
- En Linux también funciona con Docker Engine y el plugin `docker compose`.

## Ejecutar

1. Descomprime el proyecto y abre una terminal dentro de `proyecto-microservicios/`.
2. Comprueba que Docker esté activo.
3. Ejecuta:

   ```bash
   docker compose config
   docker compose up --build -d
   docker compose ps
   ```

4. Abre `http://localhost:8080`.
5. Crea una cuenta en **Crear cuenta** y luego inicia sesión.

La primera compilación puede tardar mientras Docker descarga las imágenes e instala dependencias.

## Comandos útiles

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Logs de un servicio concreto
docker compose logs -f api-gateway
docker compose logs -f auth-service

# Parar los contenedores, conservar los datos
docker compose down

# Parar y borrar también los datos persistidos de las bases de datos
docker compose down -v
```

## API disponible

- `GET /api/health`: estado básico de gateway y servicios.
- `POST /api/auth/register`: `{ "name": "Ana", "email": "ana@example.com", "password": "Clave123!" }`
- `POST /api/auth/login`: `{ "email": "ana@example.com", "password": "Clave123!" }`
- `GET /api/users/me`: requiere `Authorization: Bearer <token>`.

## Notas de seguridad

Esta es una base educativa para desarrollo local, no una configuración de producción. Cambia todos los secretos antes de desplegar, no publiques `.env`, usa HTTPS en producción, limita intentos de acceso y agrega gestión segura de sesiones/refresh tokens y migraciones. El JWT se guarda en `sessionStorage` en el navegador para simplificar la demostración. Las contraseñas se almacenan como hash bcrypt, nunca como texto plano.

## Sobre el documento de requisitos

El archivo DOCX mencionado no venía adjunto en esta conversación. Esta implementación cumple la estructura y los cinco contenedores descritos en el mensaje; compara el DOCX con el proyecto y ajusta cualquier requisito adicional específico de la rúbrica.


## CRUD sencillo tras iniciar sesión

Después del login, el panel incluye un CRUD protegido por JWT para crear, listar, editar y eliminar registros de ejemplo. Estos registros se guardan en la base `user-db`, tabla `managed_users`, separados de las cuentas usadas para iniciar sesión.

Rutas del `user-service` (se consumen a través del API Gateway):
- `GET /api/users` — listar registros.
- `POST /api/users` — crear `{ "name": "Ana Pérez", "email": "ana@example.com" }`.
- `PATCH /api/users/:id` — actualizar nombre y correo.
- `DELETE /api/users/:id` — eliminar un registro.

Todas estas rutas requieren `Authorization: Bearer <token>`. Para reconstruir y arrancar: `docker compose up --build -d`. No ejecutes `docker compose down -v`, porque eliminaría los volúmenes de las bases de datos.
