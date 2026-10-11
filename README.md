# Parqueadero – gestión de mensualidades

App web (React + Vite + Supabase) para controlar celdas, clientes y pagos mensuales.

## 1. Supabase
1. Crea un proyecto en supabase.com.
2. SQL Editor → pega el contenido de `supabase/schema.sql` → Run.
3. Authentication → Users → "Add user" (correo y contraseña de tu mamá).
   Luego en Authentication → Sign In / Providers desactiva "Allow new users to sign up".
4. Project Settings → API: copia la **Project URL** y la **anon public key**.

Si ya habías corrido una versión anterior de `schema.sql`, corre también `supabase/migracion_mapa.sql` (agrega las columnas del mapa) y `supabase/migracion_gastos.sql` (crea la tabla de gastos).

## 2. Local
```
cp .env.example .env     # pega URL y anon key
npm install
npm run dev
```

## 3. Vercel
1. Sube la carpeta a un repositorio de GitHub.
2. En vercel.com → Add New → Project → importa el repo (Vercel detecta Vite solo).
3. Environment Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy. En el celular: abrir el link → menú del navegador → "Agregar a pantalla de inicio".

## Ajustes rápidos (src/App.jsx, arriba)
- `PAIS`: indicativo para WhatsApp (57 = Colombia).
- `DIAS_AVISO`: días antes del vencimiento para marcar "Por vencer".
- `METODOS`: formas de pago.
