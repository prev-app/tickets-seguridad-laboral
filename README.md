# Tickets de capacitación en seguridad laboral

Aplicación web responsive con ticket de entrada, ticket de salida y panel administrador. Está preparada para publicarse en GitHub Pages y usar Supabase como base de datos y autenticación.

## Funciones

- configuración del curso, profesor/a, horas, modalidad y fechas;
- apertura y cierre de la participación;
- tickets breves vinculados por correo electrónico;
- validación de que exista una entrada antes de aceptar la salida;
- exportación de respuestas a CSV con fecha y hora;
- informe estadístico descargable e imprimible en PDF;
- medias, medianas, mínimos, máximos, desviaciones, rangos y casos válidos;
- participantes que mejoraron, no variaron o disminuyeron;
- valores extremos por criterio IQR y representatividad en la muestra;
- reinicio protegido por confirmación;
- control de acceso de administración mediante Supabase Auth y RLS.

## Puesta en marcha

1. Crear un proyecto en Supabase.
2. Ejecutar [`supabase.sql`](supabase.sql) en el SQL Editor.
3. En **Authentication > Users**, crear el usuario administrador.
4. Copiar el UUID de ese usuario y ejecutar:

   ```sql
   insert into public.admin_profiles (user_id) values ('UUID-DEL-USUARIO');
   ```

5. En [`config.js`](config.js), completar la URL del proyecto y la clave pública `anon`.
6. Publicar los archivos en GitHub Pages.

La clave `anon` es pública por diseño. La protección real está en las políticas RLS de `supabase.sql`; nunca se debe incluir la clave `service_role` en el sitio.

## Prueba local

Si `config.js` no contiene credenciales, la aplicación funciona en modo demostración y guarda datos en el almacenamiento local del navegador. Este modo sirve para pruebas, pero no comparte respuestas entre dispositivos ni protege el panel administrador.

Para servir los archivos localmente:

```powershell
python -m http.server 4173
```

Luego abrir `http://localhost:4173`.
