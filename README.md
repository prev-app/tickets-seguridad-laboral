# Tickets de capacitación en seguridad laboral

Aplicación web responsive con ticket de entrada, ticket de salida y panel administrador. Está preparada para publicarse en GitHub Pages y usar Supabase como base de datos y autenticación.

## Funciones

- configuración del curso, profesor/a, horas, modalidad y fechas;
- apertura y cierre de la participación;
- tickets breves vinculados por correo electrónico;
- editor visual de una a tres preguntas técnicas según el tema del curso;
- comparación de respuestas correctas entre entrada y salida para cada pregunta;
- expectativa inicial en texto y cumplimiento final total, parcial o no cumplido;
- clasificación auditable de expectativas por reglas de palabras clave;
- gráfico y tabla que cruzan cada tipo de expectativa con su cumplimiento;
- validación de que exista una entrada antes de aceptar la salida;
- exportación de respuestas a CSV con fecha y hora;
- informe estadístico descargable e imprimible en PDF;
- medias, medianas, mínimos, máximos, desviaciones, rangos y casos válidos;
- participantes que mejoraron, no variaron o disminuyeron;
- valores extremos por criterio IQR y representatividad en la muestra;
- reinicio protegido por confirmación;
- acceso administrador mediante una única clave compartida, validada por Supabase Auth;
- identificador técnico oculto en la interfaz; la clave se rota desde Supabase;
- protección de datos mediante políticas RLS.

## Puesta en marcha

1. Crear un proyecto en Supabase.
2. Ejecutar [`supabase.sql`](supabase.sql) en el SQL Editor.
   Si la aplicación ya estaba instalada, ejecutar las migraciones que todavía no se hayan aplicado. Para agregar las preguntas editables sin perder respuestas, usar [`migration-technical-questions.sql`](migration-technical-questions.sql). Para habilitar Trabajadores, Inspectores y Capacitación interna, ejecutar después [`migration-audience-types.sql`](migration-audience-types.sql); los cursos históricos se conservan como Trabajadores.
3. En **Authentication > Users**, crear un único usuario administrador con el identificador técnico indicado en `config.js`, una clave compartida de al menos 6 caracteres y la opción **Auto confirm user** activada.
4. Copiar el UUID de ese usuario y ejecutar:

   ```sql
   insert into public.admin_profiles (user_id) values ('UUID-DEL-USUARIO');
   ```

5. En [`config.js`](config.js), completar la URL del proyecto, la clave pública y el identificador técnico del usuario administrador. Los capacitadores ingresan únicamente la clave compartida.
6. Publicar los archivos en GitHub Pages.

La clave `anon` es pública por diseño. La protección real está en las políticas RLS de `supabase.sql`; nunca se debe incluir la clave `service_role` en el sitio.

Si una persona deja el equipo, se debe cambiar la clave del usuario técnico en Supabase y compartir la nueva solamente con las personas autorizadas. Al ser una clave común, todos los capacitadores tienen los mismos permisos y no existe trazabilidad individual de quién realizó cada acción.

## Prueba local

Si `config.js` no contiene credenciales, la aplicación funciona en modo demostración y guarda datos en el almacenamiento local del navegador. Este modo sirve para pruebas, pero no comparte respuestas entre dispositivos ni protege el panel administrador.

Para servir los archivos localmente:

```powershell
python -m http.server 4173
```

Luego abrir `http://localhost:4173`.
