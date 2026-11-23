This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Importar publicaciones de Instagram

Usa Node.js 22.18 o posterior para ejecutar los scripts TypeScript. Guarda el JSON de Apify en `fixtures/apify/`, que está excluido de Git.

Para revisar el archivo local sin conexión a la base de datos, ejecuta en PowerShell:

```powershell
$archivo = 'fixtures/apify/dataset_instagram-scraper_2026-11-20_21-13-46-821.json'
npm run instagram:importar -- --archivo $archivo --validar --usuario tekiagencia
```

En `.env.local`, configura `DATABASE_URL` para la rama de Neon que vayas a usar. El importador solo necesita esa variable. El dashboard usa también las variables requeridas por la aplicación (`ACCESS_KEY`, `SESSION_SECRET`, `ENCRYPTION_KEY` y `CRON_SECRET`). `APIFY_TOKEN` es opcional y privado del servidor. Se usará únicamente cuando se autorice y se conecte una ejecución manual.

Con aprobación para aplicar la migración en la rama elegida, ejecuta `npm run db:migrate`. Abre `npm run db:studio`, busca `tekiagencia` en `cuentas` y copia el UUID. Si la cuenta aún no existe, debe registrarse en `cuentas` antes de importar.

```powershell
npm run instagram:importar -- --archivo $archivo --cuenta '<UUID de tekiagencia>'
```

El script informa cuántas publicaciones procesó, insertó, actualizó y rechazó. Compara el propietario de cada fila con la cuenta seleccionada. Una primera importación del archivo de referencia en una cuenta sin publicaciones debe insertar 47. Repetir el mismo dataset reutiliza la ingesta y registra cero inserciones y actualizaciones. Un dataset distinto agrega una captura por publicación. En la importación local, la hora de captura corresponde al momento de importación.

En Drizzle Studio, filtra `ingestas` y `posts` por el UUID de la cuenta. La ingesta debe figurar como `completada` y tener 47 publicaciones procesadas. En `metricas_post`, filtra por el UUID de esa ingesta y comprueba las 47 capturas. Las métricas ausentes figuran como `NULL`.

Para verificar el panel, inicia `npm run dev`, accede por `/acceso` y selecciona `@tekiagencia` en `/dashboard`. Comprueba las publicaciones y sus métricas más recientes. Si hay otra cuenta, selecciónala para comprobar su listado independiente.

El proveedor de Apify usa el actor [Instagram Scraper](https://apify.com/apify/instagram-scraper/input-schema). El cliente queda disponible solo para código de servidor y exige autorización por llamada. Reserva la cuenta en Neon para evitar solapamientos entre instancias. Si se pierde la confirmación de Apify, la reserva vence automáticamente.

## Chat de marca

El chat guarda las conversaciones y mensajes por cuenta en PostgreSQL. Antes de abrirlo en desarrollo, confirma la rama de Neon de `DATABASE_URL` y aplica las migraciones pendientes con autorización. `0002_chat.sql` agrega `conversaciones`, `mensajes` y `cuotas_chat` y debe seguir a `0001_square_sentinels.sql`.

Usa esta configuración en `.env.local` para probar el flujo completo sin llamadas de IA:

```dotenv
AI_PROVIDER=mock
AI_DAILY_REQUEST_LIMIT=20
```

En `/dashboard/chat`, selecciona una cuenta, crea una conversación y envía un mensaje. La respuesta dice «Respuesta de prueba». Recarga para revisar el historial y cambia de cuenta para verificar el aislamiento. Para comprobar el error de cuota, configura `AI_DAILY_REQUEST_LIMIT=1` y prueba dos solicitudes nuevas con una cuenta sin solicitudes del día. `npm test` usa PostgreSQL local en memoria para probar persistencia, reintentos, cuotas y las consultas de Instagram, sin acceder a Neon, Anthropic o Apify.

Para activar Claude después de autorizar el gasto, configura `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL` con el identificador de un modelo habilitado en tu cuenta. Usa variables privadas del servidor. El proveedor por defecto es `mock`, sin necesidad de clave ni modelo. El límite diario es por cuenta y se reinicia a medianoche de Bogotá. Cada intento nuevo de generación reserva cuota, incluidos los que fallan. Reenviar una solicitud completada recupera su respuesta guardada sin consumir otra solicitud. El servidor limita el cuerpo a 16 KiB, cada mensaje a 2.000 caracteres, cada conversación a 100 mensajes, el contexto a los últimos diez turnos completos más la consulta actual y cada paso de Claude a 2.000 tokens de salida y la generación del turno a 65 segundos. Si se alcanza el límite de salida, la respuesta incluye un aviso.

Las consultas de Instagram quedaron preparadas en el servidor y todavía están desactivadas para Claude. Usan la captura más reciente de cada publicación y exponen solo métricas públicas. Los rankings suman las interacciones registradas (likes y comentarios disponibles), y los agregados incluyen cobertura para distinguir ausencias de ceros.

## Analítica de Instagram

Con `DATABASE_URL` apuntando a Neon dev, corre `npm run dev`, inicia sesión, selecciona `@tekiagencia` y abre **Analítica** en el dashboard. Sin filtros, el dataset de referencia debe mostrar 47 publicaciones: 30 carruseles, 14 videos y 3 imágenes. Filtra por **Video / Reel** para comprobar que los indicadores y el ranking solo consideran los 14 videos. Puedes filtrar también por fechas de publicación inclusivas en horario de Bogotá y ordenar la tabla por fecha o por interacciones.

El análisis toma la última captura de cada publicación. Los totales suman valores conocidos y muestran cuántas publicaciones los aportaron. Las interacciones requieren likes y comentarios conocidos. El múltiplo siempre usa la mediana de la cuenta completa, incluso con filtros, y figura como «Sin datos» si la mediana es cero o desconocida. El promedio mensual considera los meses entre la primera y la última publicación de la selección, incluidos los meses intermedios sin publicaciones.

El gráfico mensual agrupa por fecha de publicación y usa las últimas métricas disponibles. No reconstruye cómo cambiaron las interacciones a lo largo del tiempo. Instagram no proporciona alcance, guardados, compartidos ni seguidores históricos en este dataset. La pantalla usa las tablas existentes y no requiere migraciones nuevas.

## Perfil de marca

`0003_perfiles_marca.sql` crea una fila por cuenta en `perfiles_marca`, con una clave foránea a `cuentas`, fechas de creación y actualización, y una revisión para detectar ediciones concurrentes. Los pilares se guardan como un arreglo JSONB junto con el resto del perfil. El editor usa exclusivamente la tabla nueva. La columna histórica `cuentas.perfil_marca` queda intacta y sus valores no se copian automáticamente.

Tras aprobar la migración, confirma que `DATABASE_URL` apunta a Neon dev y ejecuta `npm run db:migrate`. Luego inicia `npm run dev`, selecciona una cuenta y abre **Marca** en el dashboard. Guarda un nombre y un pilar, recarga y comprueba que se conservaron. Cambia de cuenta para comprobar que el perfil es independiente. En Drizzle Studio, busca `perfiles_marca` y filtra por el UUID de la cuenta. Para comprobar la concurrencia, abre el mismo perfil en dos pestañas, guarda en una y luego intenta guardar en la otra. La segunda pestaña conserva el borrador y avisa que hay una versión más reciente.

Las cuatro secciones admiten guardados parciales. Los límites de texto son de 120 a 1.200 caracteres según el campo. Se admiten hasta ocho pilares, cada uno con nombre obligatorio y hasta seis temas de 160 caracteres. `npm test` verifica validación, persistencia, aislamiento, concurrencia y construcción del contexto con PostgreSQL local en memoria.

`obtenerContextoMarca(cuentaId)` solo devuelve contexto para la cuenta activa de una sesión válida. Omite valores vacíos, IDs y fechas, y acota los campos, pilares y temas incluidos. `contextoMarcaParaPrompt` serializa ese contexto como datos de referencia sin autoridad sobre las instrucciones del sistema. El chat todavía no consume estas funciones.

### Identidad visual

`0004_identidad_visual.sql` agrega `perfiles_marca.identidad_visual` como JSONB, con un objeto vacío para los perfiles existentes. Se guarda en la misma fila y con la misma revisión del perfil porque estas listas se leen y editan como parte del mismo formulario. Así se conserva el orden, el aislamiento por cuenta y la protección contra guardados concurrentes en una sola operación.

Una vez autorizada y aplicada `0004` en Neon dev, abre **Marca → Identidad visual** en una cuenta de prueba. Guarda una regla de logotipo, dos colores y una tipografía. Reordena los colores, quita uno y recarga para comprobar la persistencia. En Drizzle Studio, filtra `perfiles_marca` por `cuenta_id` y revisa el objeto `identidad_visual`. Los códigos siguen el formato `#RRGGBB`. Los campos descriptivos se pueden dejar en blanco y la vista previa tipográfica utiliza fuentes del dispositivo.

`obtenerContextoMarca` incluye las reglas de logotipo, el estilo, los lineamientos y hasta seis colores y tres tipografías, con textos abreviados. Para comprobar el JSON de referencia sin usar un modelo, ejecuta `npm test` o revisa las aserciones en `tests/perfil-marca.test.ts`. En una etapa posterior, los manuales pueden asociarse por el ID de `perfiles_marca` en una relación aparte. Las referencias actuales son texto editable.

## Enriquecimiento de publicaciones

`0005_enriquecimientos_post.sql` crea una tabla vinculada a `posts`. Guarda el tema principal y los secundarios, intención, tono, gancho y su explicación, resumen y descripción visual nullable. Registra proveedor, modelo, versiones, modalidad, hash, fecha y uso de tokens cuando se conoce. Los reintentos de la misma identidad acumulan el uso conocido. Las versiones y entradas distintas conservan resultados separados. Los registros `mock` quedan etiquetados y no se incluyen en las estadísticas.

Tras autorizar y aplicar `0005` en Neon dev, mantén `ENRICHMENT_PROVIDER=mock` (valor predeterminado), inicia `npm run dev` y abre **Enriquecimiento** en el dashboard de una cuenta de prueba. Selecciona hasta cuatro publicaciones, elige **Solo texto**, previsualiza y confirma el lote. Comprueba el progreso y abre **Ver clasificación de prueba**. Una segunda vista previa de la misma selección debe identificar los resultados guardados. En Drizzle Studio se pueden consultar en `enriquecimientos_post` por `post_id` y `proveedor`.

Para habilitar Claude manualmente, configura `ENRICHMENT_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL`. Configura también `ENRICHMENT_MAX_BATCH_USD`, `ENRICHMENT_INPUT_USD_PER_MTOK` y `ENRICHMENT_OUTPUT_USD_PER_MTOK` con el presupuesto y las tarifas vigentes por millón de tokens del modelo elegido. `ENRICHMENT_MAX_INPUT_TOKENS` y `ENRICHMENT_MAX_OUTPUT_TOKENS` tienen valores predeterminados de 12.000 y 600. La vista previa reserva el costo de esos límites multiplicado por el número de publicaciones elegibles. Después de confirmar, el proveedor verifica el conteo de entrada de cada solicitud con margen antes de generar. Una configuración incompleta o un conteo que excede la reserva bloquea la generación. El importe mostrado es aproximado. Consulta las [tarifas oficiales de Claude](https://platform.claude.com/docs/en/about-claude/pricing) para configurar el modelo.

Para una primera prueba de solo texto con Claude Haiku 5.5 y el chat en mock, agrega a `.env.local` este bloque y conserva la clave de API válida en `ANTHROPIC_API_KEY`:

```dotenv
AI_PROVIDER=mock
ENRICHMENT_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-haiku-5-5
ENRICHMENT_MAX_BATCH_POSTS=1
ENRICHMENT_MAX_INPUT_TOKENS=12000
ENRICHMENT_MAX_OUTPUT_TOKENS=600
ENRICHMENT_INPUT_USD_PER_MTOK=0.10
ENRICHMENT_OUTPUT_USD_PER_MTOK=0.50
ENRICHMENT_MAX_BATCH_USD=0.002
```

Reinicia `npm run dev`. Verifica que Chat indique **Modo de prueba** y Enriquecimiento indique **Anthropic · Ejecución manual**. Selecciona una publicación, mantén **Solo texto**, revisa la reserva aproximada de 0,0015 USD y confirma solo si autorizas el cargo. En Vercel, configura las mismas variables privadas en el entorno que vaya a usar Claude, añade `ANTHROPIC_API_KEY` como sensible y vuelve a desplegar. Un entorno que deba permanecer simulado puede usar `AI_PROVIDER=mock` y `ENRICHMENT_PROVIDER=mock`.

Para habilitar imágenes, configura `ENRICHMENT_IMAGE_ORIGIN` con el origen HTTPS exacto de un almacén público de Vercel Blob autorizado. Usa referencias persistidas e inmutables en `posts.imagen_persistida`. El modo visual omite publicaciones sin una referencia válida. La imagen solo se descarga al ejecutar un lote real confirmado. Se admite JPEG, PNG, WebP o GIF de hasta 4 MiB. El modo mock no descarga imágenes y siempre identifica sus resultados como simulados.

`obtenerPerfilEnriquecido` combina el contexto de marca con distribuciones de temas, intenciones, tonos y ganchos de la última clasificación real guardada por publicación. Calcula medianas descriptivas de interacciones únicamente cuando al menos cinco publicaciones de la categoría tienen likes y comentarios conocidos. `npm test` verifica el flujo con PostgreSQL en memoria.

## Competencia

`0006_competidores.sql` crea un registro por pareja de cuenta propia y usuario de Instagram. Conserva el motivo de seguimiento y el estado por cuenta, y deriva la URL del usuario normalizado. El UUID del registro puede vincularse a futuras publicaciones o ingestas sin mezclar competidores con cuentas propias.

En Neon dev, abre **Competencia** en el dashboard, selecciona una cuenta de prueba y añade un usuario o una URL de perfil. Comprueba que el contador cambie al editar, desactivar y reactivar, y que otra cuenta pueda registrar el mismo usuario de forma independiente. Los perfiles aparecen como «Perfil sin verificar». Este módulo solo administra el registro manual y ofrece desactivación para conservar los datos.

`COMPETIDORES_MAX_ACTIVOS` es opcional y admite enteros de 1 a 5. El valor predeterminado es 5. Si se reduce, los registros activos se conservan y solo se bloquean nuevas activaciones hasta que haya un cupo. PostgreSQL serializa las mutaciones por cuenta y garantiza un máximo estructural de cinco cupos distintos. `npm test` verifica el flujo localmente.

### Importación de competidores

`0007_ingesta_competidores.sql` agrega `posts_competidor`, `metricas_post_competidor` e `ingestas_competidor`. La cuenta seguidora se obtiene a través del registro en `competidores`. Las claves foráneas compuestas impiden asociar una captura con una publicación o ingesta de otro competidor. Las tablas de publicaciones propias conservan sus datos y consultas. Tras la primera ingesta, el usuario de Instagram del competidor se conserva para proteger su historial.

En **Competencia**, abre **Publicaciones** para un competidor y usa **Importar JSON**. El archivo debe ser UTF-8, de hasta 600 KiB y con un arreglo de hasta 250 registros. El importador rechaza filas de otros autores, conserva métricas ausentes como `NULL` y descarta comentarios individuales. Una copia del mismo dataset reutiliza la ingesta. Un dataset nuevo actualiza por shortcode y añade una captura por publicación aceptada.

Para probar con una cuenta de prueba en Neon dev, registra `@rival_prueba`, copia los UUID de la cuenta seguidora y del registro competidor y ejecuta:

```powershell
npm run instagram:importar -- --archivo 'tests/fixtures/competidor-apify.json' --cuenta '<UUID cuenta propia>' --competidor '<UUID competidor>'
```

El ejemplo debe guardar dos publicaciones. Repite el comando para comprobar la idempotencia. Para validar el fixture sin escribir en Neon, ejecuta `npm run instagram:importar -- --archivo 'tests/fixtures/competidor-apify.json' --validar --usuario rival_prueba`. Las pruebas de `npm test` también son locales.

Para habilitar corridas de pago después de autorizarlas, configura `APIFY_TOKEN` como secreto del servidor, `APIFY_COMPETIDORES_HABILITADO=true` y `APIFY_COMPETIDORES_MAX_USD` como tope solicitado por corrida en USD. `APIFY_COMPETIDORES_MAX_RESULTADOS` admite de 1 a 100 y por defecto es 20. Confirma los límites en la ficha del competidor activo y pulsa **Iniciar corrida**. El actor tiene un límite configurado de 120 segundos. Usa **Consultar estado** para traer el dataset al terminar o **Cancelar corrida** para solicitar el aborto. El servidor no espera a que termine el actor. Si Apify no confirma si recibió el inicio, el registro queda bloqueado para evitar una segunda corrida y requiere reconciliación con el historial de Apify. Los cargos dependen del plan y del actor. Consulta la [ficha de Instagram Scraper](https://apify.com/apify/instagram-scraper) y los [límites de ejecución de Apify](https://docs.apify.com/api/v2/actors-runs-post).

## Comparación competitiva

En Neon dev, selecciona la cuenta propia y abre **Competencia → Comparar rendimiento**. Elige hasta cinco competidores y aplica las fechas. La cuenta propia se incluye siempre. Las fechas se interpretan en hora de Bogotá e incluyen ambos extremos. Sin fechas, se usa la primera y la última publicación del conjunto seleccionado.

- Las tarjetas muestran volumen, ritmo mensual, última publicación, última captura, interacciones y reproducciones de videos.
- El ritmo divide el volumen entre los meses calendario que toca el intervalo común, incluidos los meses sin actividad y los meses parciales. El gráfico mensual muestra los meses con publicaciones en al menos una cuenta.
- Las interacciones suman Me gusta y comentarios cuando ambos existen. La mediana, el promedio y el ranking usan esa muestra. La cobertura muestra cuántas publicaciones tienen datos sobre el total. Las reproducciones solo se calculan sobre videos con cifra conocida. Se conserva la diferencia entre cero y dato desconocido.
- La fecha de última captura de una tarjeta es la más reciente entre las publicaciones filtradas. Las capturas pueden ser de fechas distintas, incluso posteriores al intervalo de publicación. Las muestras pueden tener tamaños y cobertura diferentes. No se usan métricas privadas ni datos de seguidores.
- En `src/lib/competencia/comparacion.ts`, una consulta SQL restringe los competidores a la cuenta activa, selecciona la última captura por publicación con `LEFT JOIN LATERAL`, calcula los agregados y devuelve diez destacadas por página. Reutiliza los índices de ámbito y fecha existentes. No requiere migraciones.

Para verificarlo en Neon dev, compara el total de la tarjeta propia con `posts` para esa cuenta y los de cada rival con `posts_competidor` para su registro. Aplica el mismo intervalo para comprobar el recuento. Para comprobar una destacada, toma únicamente la primera captura de su tabla de métricas al ordenar por `capturada_en DESC, id DESC`. La prueba `tests/comparacion-competitiva.test.ts` cubre el intervalo compartido, distintos formatos y tamaños de muestra, métricas nulas y en cero, competidores vacíos, aislamiento, capturas históricas y paginación.

## Herramientas competitivas del chat

| Herramienta | Consulta |
| --- | --- |
| `comparar_con_competencia` | Reutiliza los agregados SQL del dashboard. Acepta hasta cinco @usuarios registrados, un intervalo y los indicadores actividad, interacciones y videos. Por defecto incluye los competidores activos. |
| `posts_destacados_competencia` | Ordena por interacciones, Me gusta, comentarios o reproducciones conocidas de la última captura. Permite filtrar por fecha y formato. Devuelve hasta diez publicaciones con su enlace y un extracto de hasta 240 caracteres del caption, marcado como contenido externo no confiable. |
| `formatos_por_cuenta` | Reutiliza los agregados SQL por formato para la cuenta propia o un competidor. Devuelve frecuencia, mediana de interacciones y cobertura por formato. |

La sesión resuelve la cuenta activa en el servidor. Las consultas son de solo lectura y las herramientas aceptan usernames autorizados. Los resultados distinguen cero y dato desconocido. El ranking excluye valores desconocidos para la métrica indicada y las reproducciones solo se ordenan entre videos. Las fechas corresponden a la publicación en hora de Bogotá. Las capturas pueden ser posteriores al intervalo. Cada turno admite hasta cuatro consultas y tres pasos del modelo, con el último paso reservado para redactar. El historial guarda el texto final.

El chat en modo mock conserva su respuesta de prueba. Para ejecutar las herramientas directamente contra Neon dev sin tokens, configura `DATABASE_URL` para dev y usa el username de la cuenta propia. El segundo argumento, opcional, selecciona un competidor por username. El comando muestra el tamaño del extracto de caption.

```powershell
node --env-file=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/probar-herramientas-competencia.ts tekiagencia
npm test
```

Las pruebas usan PostgreSQL local efímero y un modelo simulado de AI SDK que llama herramientas, recibe los resultados y transmite la respuesta. No requieren Anthropic ni Apify.

Preguntas de ejemplo para el chat cuando se habilite el proveedor real

- Compara la mediana de interacciones y la cobertura con mis competidores activos en noviembre de 2026.
- Dame los tres videos con más reproducciones conocidas de @competidor y enlaza los originales.
- ¿Qué formatos publiqué más entre octubre y noviembre de 2026 y qué mediana de interacciones tuvo cada formato?

## Contexto de marca en el chat

Cada respuesta nueva del proveedor Claude consulta el perfil guardado de la cuenta activa con `obtenerContextoMarca(cuentaId)`. La función comprueba la cuenta en el servidor. Las herramientas de competencia conservan el mismo ámbito. Un turno ya guardado se recupera del historial como antes.

El prompt del sistema incluye un bloque separado de referencia con identidad, audiencia, comunicación, estrategia, pilares e identidad visual. Los campos vacíos se omiten. El bloque JSON conserva hasta tres pilares, seis colores y tres tipografías, y tiene un límite de 12 KiB UTF-8. El chat puede usar preferencias y restricciones para adaptar las propuestas, pero el perfil editable no puede cambiar permisos ni instrucciones. El bloque se construye a partir del perfil guardado, sin llamadas adicionales al modelo.

Para verificar el prompt sin tokens, ejecuta la prueba de perfil. Usa PostgreSQL local y un modelo simulado de AI SDK. Inspecciona el prompt real que recibiría el proveedor y comprueba el cambio de cuenta, la ausencia de perfil, el límite de tamaño y una instrucción maliciosa almacenada como dato. Con `AI_PROVIDER=mock`, la interfaz sigue mostrando su respuesta de prueba.

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/perfil-marca.test.ts
```

## Herramientas de Instagram propio en el chat

Las herramientas consultan únicamente la cuenta activa resuelta en el servidor. Usan la última captura por publicación. Los campos con valor `null` representan datos desconocidos. Las interacciones suman Me gusta y comentarios cuando ambos se conocen. Los totales usan los valores disponibles y se acompañan de su cobertura.

| Herramienta | Ejemplo de pregunta |
| --- | --- |
| `obtenerPublicacionesRecientes` | Muéstrame mis cinco publicaciones más recientes con sus enlaces y fechas de captura. |
| `obtenerMejoresPublicaciones` | ¿Qué tres publicaciones propias tienen más interacciones registradas? |
| `obtenerRendimientoPorFormato` | Compara la mediana y la cobertura de imágenes, carruseles y videos en noviembre de 2026. |
| `obtenerResumenInstagram` | Resume mi actividad y las métricas públicas disponibles en noviembre de 2026. |
| `buscarPublicaciones` | Busca publicaciones cuyo caption mencione «diseño» y enlaza las coincidencias. |

Los listados devuelven cinco filas por defecto y permiten hasta diez por llamada. La búsqueda admite texto literal o shortcode y devuelve un fragmento del caption marcado como contenido no confiable. El resumen y los formatos aceptan `desde` y `hasta` en formato YYYY-MM-DD, con ambos extremos incluidos en hora de Bogotá. La fecha de captura puede ser posterior al intervalo de publicación.

Los listados reutilizan `src/lib/instagram/consultas-chat.ts`. Los agregados reutilizan la consulta del dashboard con salida reducida. El chat comparte el límite de cuatro consultas entre Instagram propio y Competencia, con un máximo de tres pasos del modelo y el último reservado para redactar. Con `AI_PROVIDER=mock`, la interfaz conserva su respuesta de prueba.

Para probar sin tokens, ejecuta la prueba de consultas. Usa PostgreSQL local efímero y un modelo simulado que elige una herramienta, recibe su resultado y continúa el streaming.

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/consultas-instagram.test.ts
```

## Enriquecimientos semánticos en el chat

| Herramienta | Ejemplo |
| --- | --- |
| `buscarPublicacionesPorTema` | Busca las publicaciones clasificadas sobre diseño e indica si tienen descripción visual guardada. |
| `consultarDistribucionTemas` | ¿Cuáles son mis temas principales más frecuentes y qué proporción de las publicaciones tiene clasificación? |
| `consultarDistribucionIntenciones` | ¿Cómo se distribuyen las publicaciones educativas, informativas y comerciales? |
| `consultarDistribucionTonos` | ¿Qué tonos aparecen más en la muestra enriquecida? |
| `identificarGanchosFrecuentes` | ¿Qué tipos de gancho se han observado y cuántas publicaciones carecen de evidencia de gancho? |
| `compararRendimientoPorCategoriaSemantica` | Compara las medianas y los tamaños de muestra por intención. |

La lectura reutiliza el resumen semántico y la consulta de última captura. Selecciona una clasificación por publicación propia. Solo considera resultados de Anthropic completados, con las versiones de esquema y prompt activas y el hash del contenido efectivo vigente. El hash se recalcula con los mismos campos que al enriquecer, incluido el perfil compacto y, para la modalidad visual, la referencia de imagen válida. Un cambio en esos insumos puede dejar clasificaciones fuera de la cobertura. Si hay varios resultados vigentes, se usa el más reciente. No se descargan imágenes durante el chat.

La cobertura distingue publicaciones importadas, clasificadas, con descripción visual y con ambas métricas de interacción. La búsqueda incluye temas secundarios y devuelve hasta cinco publicaciones. Las distribuciones cuentan el tema principal y devuelven hasta diez categorías. Las medianas solo se muestran con cinco o más publicaciones con Me gusta y comentarios conocidos por categoría. El ranking es descriptivo y no permite inferir causalidad. Los textos semánticos son datos de referencia no confiables. Una clasificación textual nunca aporta descripción visual.

Estas herramientas comparten el límite de cuatro consultas y tres pasos del modelo con las demás herramientas. Para verificar filtrado, muestras, aislamiento y streaming sin tokens, ejecuta:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/enriquecimiento.test.ts
```

## Tendencias · modelo de datos y servicio

La migración aditiva `drizzle/0008_tendencias.sql` crea tres tablas. `solicitudes_tendencias` pertenece a la cuenta propia y guarda la clave de idempotencia, el estado, el proveedor, el modelo y las fechas. También admite tokens y costo aproximado cuando el motor los devuelve para un resultado válido. `resultados_tendencias` guarda cuatro propuestas ordenadas por solicitud y `fuentes_tendencias` guarda de una a cinco fuentes por propuesta. Las claves foráneas mantienen la relación hasta la cuenta. Las migraciones 0008 y 0009 ya están aplicadas en Neon dev.

- `src/lib/tendencias/servidor.ts` resuelve la cuenta y prepara el servicio autenticado. Las lecturas de detalle e historial funcionan sin proveedor.
- `src/lib/tendencias/servicio.ts` recibe un motor inyectado, construye el contexto de investigación con el perfil compacto y mantiene ese bloque de referencia separado de las instrucciones. Es responsable de asignar los UUID y la fecha de investigación.
- `src/lib/tendencias/contrato.ts` exige exactamente cuatro propuestas distintas con campos obligatorios y fuentes HTTPS. El contrato del futuro adaptador devuelve las evidencias de búsqueda por separado de las propuestas. El motor solo puede citar URLs presentes en esas evidencias y el servicio usa sus títulos, medios y fechas, cuando existan. Un enlace sin evidencia o un resultado incompleto hace fallar la solicitud completa. En este paso no hay comprobación de enlaces por red.
- `src/lib/tendencias/repositorio.ts` escribe las cuatro propuestas, sus fuentes y el estado final en una transacción. Los errores de validación o proveedor guardan el estado de la solicitud sin resultados parciales. La misma clave UUID dentro de la misma cuenta devuelve la investigación original, incluso si otra solicitud está en curso. Una clave nueva inicia otra investigación. El plazo de reserva es de 90 segundos. La caché y su expiración se describen en el Paso 6.3.
- `src/db/transacciones.ts` comparte el acceso transaccional de Neon entre el chat y tendencias.

Las pruebas usan PostgreSQL local efímero. Cubren preservación de datos existentes, tres o cinco propuestas, campos faltantes, fuentes inválidas o no respaldadas, aislamiento, concurrencia, persistencia y reversión de una escritura incompleta. El motor de prueba utiliza dominios reservados `.test`. Este paso no incluye interfaz, endpoint ni adaptador de búsqueda web.

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/tendencias.test.ts
```

### Proveedor de búsqueda web de tendencias

`TRENDS_PROVIDER=mock` es el valor predeterminado. Devuelve cuatro propuestas marcadas como simuladas con fuentes de prueba en `.test` y costo cero. El proveedor se selecciona en el servicio de tendencias de la cuenta activa.

Con `ai` 7.0.179 y `@ai-sdk/anthropic` 4.0.107, Anthropic usa la herramienta oficial `webSearch_20250305`. El flujo separa búsqueda con citas y salida JSON estructurada. La primera generación obtiene resultados de la herramienta y pasajes citados. Solo admite citas con pasaje y una URL HTTPS que también aparezca en un resultado recuperado. La segunda generación recibe esas evidencias con identificadores temporales y no dispone de búsqueda. El servidor vuelve a vincular los identificadores con las URLs originales y valida las cuatro propuestas con Zod. La edad relativa del resultado no se convierte en fecha de publicación. Se guarda la fecha de investigación y se omite la publicación cuando no hay fecha exacta disponible. Un resultado recuperado y citado no equivale a una verificación independiente de su contenido.

Se verificó documentalmente que el modelo local `claude-haiku-5-5` admite búsqueda web. También se admiten `claude-sonnet-4-6` y `claude-opus-4-6`. El entorno puede definir `TRENDS_ANTHROPIC_MODEL` o usar el valor de `ANTHROPIC_MODEL`. Habilita Web Search en la consola de Anthropic antes de una prueba autorizada. Las versiones, citas y compatibilidad se describen en la [guía de búsqueda web](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), la [referencia de herramientas](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference) y la [guía de Haiku 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5).

Configuración de ejemplo para una prueba autorizada con Haiku 5.5. Conserva `ANTHROPIC_API_KEY` como secreto del servidor o en `.env.local`.

```dotenv
TRENDS_PROVIDER=anthropic
TRENDS_ANTHROPIC_MODEL=claude-haiku-5-5
TRENDS_MARKET=Colombia
TRENDS_MAX_SEARCHES=2
TRENDS_MAX_INPUT_TOKENS=40000
TRENDS_MAX_OUTPUT_TOKENS=2000
TRENDS_TIMEOUT_MS=60000
TRENDS_MAX_COST_USD=0.05
TRENDS_INPUT_USD_PER_MTOK=0.10
TRENDS_OUTPUT_USD_PER_MTOK=0.50
```

`TRENDS_MARKET` es opcional y se aplica al despliegue. Los límites predeterminados son tres búsquedas (1–5), 40.000 tokens de entrada combinada, 2.000 tokens de salida por generación y 60 segundos. Se permiten hasta dos generaciones, cada una con un solo paso de AI SDK y cero reintentos. La clave de idempotencia del servicio evita iniciar una investigación adicional para la misma solicitud. El proveedor distingue problemas de cuota, acceso, búsqueda, evidencia, presupuesto y tiempo sin devolver datos privados del error.

Anthropic cobra 0,01 USD por búsqueda exitosa más tokens. La segunda generación añade el costo de estructuración. Los dos conteos previos de tokens son gratuitos. En el ejemplo, la reserva estimada es 0,026 USD. El motor verifica el presupuesto antes de generar, antes de estructurar y al recibir el consumo. Anthropic incorpora los resultados durante la primera llamada y puede facturar tokens que el conteo previo no conoce. El tope de aplicación es estimado y no revierte cargos ya incurridos. Verifica las tarifas del modelo y nivel de contexto antes de una prueba real. [Precios de Claude](https://platform.claude.com/docs/en/about-claude/pricing) · [Búsqueda web y precios](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) · [Conteo de tokens](https://platform.claude.com/docs/en/build-with-claude/token-counting).

Para probar sin costo:

```powershell
$env:TRENDS_PROVIDER = 'mock'
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/probar-motor-tendencias.ts
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/tendencias-proveedor.test.ts
Remove-Item Env:TRENDS_PROVIDER
```

Cuando se autorice una prueba de pago, configura las variables anteriores en `.env.local` y ejecuta el siguiente comando. La prueba del motor es independiente de Neon y no persiste resultados.

```powershell
node --env-file=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/probar-motor-tendencias.ts --autorizar-costo --sector "Agencia de branding"
```

### Caché y control de costos de tendencias

`drizzle/0009_cache_tendencias.sql` agrega huella de caché, tema, mercado, reserva estimada y búsquedas web observadas, con un índice de vigencia y un índice único parcial para reservas activas. Se aplica después de `0008`. Las filas anteriores sin huella siguen disponibles en el historial y no se usan como caché para criterios nuevos.

| Variable | Valor predeterminado y alcance |
| --- | --- |
| `TRENDS_CACHE_HOURS` | 24 horas. Admite enteros de 12 a 24. El valor se aplica al guardar una investigación. |
| `TRENDS_DAILY_LIMIT` | 3 investigaciones por cuenta y día de Bogotá. Admite enteros de 1 a 20. |
| `TRENDS_MARKET` | Mercado por defecto opcional. El solicitante puede elegir un mercado para una investigación. |
| `TRENDS_MAX_COST_USD`, `TRENDS_MAX_SEARCHES`, `TRENDS_MAX_INPUT_TOKENS`, `TRENDS_MAX_OUTPUT_TOKENS`, `TRENDS_TIMEOUT_MS` | Presupuesto aproximado y límites técnicos del proveedor descritos arriba. |

Desde el servidor, `consultar({ tema, mercado })` devuelve una investigación vigente, una reserva en curso o `requiere_confirmacion` con la estimación y una huella. Si excede el presupuesto devuelve `fuera_presupuesto`. La consulta es de solo lectura. Para iniciar una investigación, después de que el usuario confirme, invoca `investigar({ tema, mercado, clave, confirmada: true, huella })` con un UUID de idempotencia. Si los criterios o la estimación cambiaron, vuelve a presentar la confirmación. El contexto incluye el tema y el mercado efectivos. La huella de caché incorpora la cuenta, el perfil relevante normalizado, el tema, el mercado, la versión del prompt, el proveedor y el modelo.

La reserva bloquea brevemente la fila de la cuenta, revisa vigencia, idempotencia y cuota en la misma transacción. Una reserva expirada se cierra al intentar otra ejecución confirmada. El cupo se consume al reservar, incluso en mock y si luego falla el proveedor. Consultar, recuperar historial o reutilizar la caché no consume cupo. El historial y el detalle marcan `cacheVencida` sin borrar resultados. La expiración nunca inicia una búsqueda.

La reserva aproximada incluye tokens y búsquedas y se guarda por separado del costo posterior estimado. Se conservan los tokens reportados por Anthropic y las búsquedas reportadas o identificadas en su respuesta, incluso cuando una etapa posterior falla y el consumo ya se conoce. El costo posterior sigue siendo una estimación y no representa la factura del proveedor.

Las pruebas cubren confirmación, vigencia, expiración, normalización, cambios de perfil, tema, mercado y modelo, aislamiento, concurrencia sobre la misma huella y sobre el último cupo, recuperación de reservas caducadas y consumo observado en fallos. Usan PostgreSQL efímero y transporte simulado.

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/tendencias.test.ts tests/tendencias-proveedor.test.ts
```

### Dashboard de tendencias

Abre **Tendencias** en el dashboard o visita `/dashboard/tendencias`. Elige la cuenta, escribe un tema opcional, selecciona el mercado y pulsa **Buscar tendencias**. La página lee el historial al abrirse. El botón consulta la caché y, si falta un resultado vigente, muestra una confirmación separada con la reserva aproximada y el máximo de búsquedas. **Cancelar** cierra la confirmación. En mock, tanto la confirmación como los resultados indican que se trata de una simulación.

Una investigación completada muestra cuatro tarjetas con fuentes clicables, fecha de investigación y datos de marca. El historial muestra las diez solicitudes más recientes de la cuenta. Al abrir una investigación vencida, la página conserva sus tarjetas como referencia histórica. **Actualizar investigación** está disponible cuando vence el resultado y vuelve a consultar la caché antes de ofrecer una confirmación. **Consultar estado** permite revisar una reserva activa sin iniciar otra búsqueda.

Cada acción vuelve a verificar la sesión y la cuenta activa, valida los campos con Zod y toma el presupuesto de la configuración del servidor. Las fuentes y textos se renderizan como texto y enlaces HTTPS, con apertura segura en otra pestaña. La interfaz distingue cuota diaria, presupuesto, ausencia de fuentes, fallos del proveedor y migraciones pendientes. Para usar la ruta con una base de datos deben estar aplicadas `0008` y `0009`.

Las pruebas locales de tendencias cubren caché, historial, cuatro tarjetas con fuentes, confirmación, parámetros manipulados, cambio de cuenta y errores. Usa `TRENDS_PROVIDER=mock` para comprobar el flujo sin costo. Las fuentes de mock son enlaces ficticios.

### Primera investigación real para Teki Agency

En la validación del Paso 6.5 se contrastaron las diez migraciones de Neon dev con el historial local y la huella de las 47 publicaciones propias. Una transacción revertida al terminar comprobó cuatro propuestas mock con fuentes, historial, 24 horas de vigencia, acierto de caché, cambio de perfil y mercado, expiración, cuota y aislamiento. El historial real de Teki Agency estaba vacío. La suite completa verifica concurrencia, errores de proveedor, presupuesto y confirmación, y el navegador local verifica la ruta protegida y las tarjetas en móvil y escritorio.

Para habilitar el flujo local, usa las variables del proveedor real descritas arriba. Para esta primera prueba se prevén tres búsquedas, hasta 40.000 tokens de entrada combinados, 2.000 de salida por generación, un timeout de 60 segundos, una reserva aproximada de 0,036 USD y un presupuesto estimado máximo de 0,05 USD. La cuota se limita a una investigación por cuenta y día de Bogotá. La caché dura 24 horas. Habilita Web Search en la consola de Anthropic. La presencia local de la clave se valida sin comprobarla contra el proveedor.

1. Reinicia `npm run dev`, abre `/dashboard/tendencias` y elige `@tekiagencia`.
2. Escribe «Tendencias recientes de marketing, creatividad e inteligencia artificial aplicadas a agencias MarTech.» y selecciona **Colombia**.
3. Pulsa **Buscar tendencias** y revisa la reserva. **Confirmar investigación** es el paso que inicia la llamada de pago.
4. Comprueba que el historial tenga una investigación completada, que muestre exactamente cuatro tendencias y que cada fuente respalde la afirmación junto a la que aparece. Revisa si los ejemplos y formatos son aplicables a Teki. En Neon dev, la fila de la solicitud registra `tokens_entrada`, `tokens_salida`, `busquedas_web` y `costo_estimado_usd` cuando están disponibles.
5. Repite **Buscar tendencias** con los mismos criterios y sin cambiar el perfil. Debe devolver la misma investigación, sin nueva confirmación ni otra fila en el historial. Abrir la página y esperar a la expiración solo consultan o muestran datos guardados.

Para volver al modo simulado cambia `TRENDS_PROVIDER=mock` en `.env.local` y reinicia el servidor local. El proveedor forma parte de la clave de caché. Las investigaciones guardadas conservan su etiqueta de origen. La configuración de un despliegue en Vercel se gestiona por separado.

## Banco de ideas de contenido

La migración aditiva `drizzle/0010_banco_ideas.sql` crea `generaciones_ideas`, `ideas_contenido` y `evidencias_ideas`. Las ideas heredan el proveedor y el modelo de su generación. Las referencias a los registros existentes se conservan junto a una instantánea de la evidencia. Las claves foráneas y un trigger de la nueva tabla protegen el ámbito por cuenta.

- `src/lib/ideas/contrato.ts` valida cada generación, idea, referencia, filtro y cambio de estado con Zod.
- `src/lib/ideas/evidencias.ts` resuelve referencias autorizadas y conserva métricas, fechas o fragmentos relevantes según el tipo. Las URLs salen de los registros existentes. Los enriquecimientos y tendencias simulados quedan excluidos como evidencia.
- `src/lib/ideas/repositorio.ts` registra generaciones completadas o fallidas. Guarda ideas y evidencias en una transacción. Repetir la misma clave con el mismo contenido recupera la generación original. Cambiar el contenido con la misma clave devuelve un conflicto. El cambio de estado verifica la revisión para evitar sobrescribir cambios concurrentes.
- `src/lib/ideas/servidor.ts` usa la cuenta activa verificada y el acceso transaccional compartido.

`tests/ideas.test.ts` aplica la migración en PostgreSQL efímero y comprueba datos históricos, persistencia, las cinco clases de evidencia, aislamiento, cambios de estado, reintentos y reversión ante evidencia inválida. El paso prepara la persistencia del banco de ideas. La interfaz y la generación automática quedan para pasos posteriores.

### Motor de contexto para ideas

`contextoIdeasDeCuentaActiva(intervalo?)` resuelve la cuenta en el servidor y ejecuta exclusivamente lecturas. Por defecto usa 90 días de publicación en hora de Bogotá. Acepta fechas inclusivas `{ desde, hasta }` y valida el contexto con Zod.

| Bloque | Origen y criterio |
| --- | --- |
| Marca | Perfil compacto con identidad, público, objetivos, tono, restricciones, pilares y lineamientos visuales. Cada campo conserva el ID del perfil. |
| Rendimiento propio | Analítica y última captura de Instagram. Los extremos se eligen solo entre publicaciones del mismo formato y de la misma franja de siete días desde su publicación hasta la captura. Se exige una edad de al menos siete días, cinco observaciones con Me gusta y comentarios y una diferencia real entre los extremos. Las medianas de formato y de franja se identifican por separado. |
| Semántica | Las publicaciones seleccionadas incluyen tema, intención y gancho cuando existe una clasificación propia vigente. Se conservan la referencia al enriquecimiento y su fecha. |
| Competencia | Comparación del Paso 5 con el mismo intervalo, frecuencias y distribución por formato. Los destacados conservan la fecha de captura y se alternan entre competidores. Las clasificaciones semánticas de competidores todavía no existen en el esquema. |
| Tendencias | Investigaciones reales guardadas y vigentes al consultar. Incluye relevancia, fechas y hasta dos fuentes por tendencia. La ausencia de estudios se informa sin iniciar otra búsqueda. |

Los textos externos se marcan como no confiables. Se indican muestras pequeñas, métricas faltantes y fuentes ausentes. Los límites por defecto son 8 publicaciones propias, 5 competidoras, 4 tendencias, 140 caracteres por caption y 12.288 bytes UTF-8. Se configuran con `IDEAS_CONTEXT_MAX_OWN`, `IDEAS_CONTEXT_MAX_COMPETITORS`, `IDEAS_CONTEXT_MAX_TRENDS`, `IDEAS_CONTEXT_MAX_CAPTION` e `IDEAS_CONTEXT_MAX_BYTES`. El motor alterna familias de evidencia y omite elementos que no caben. La prueba `tests/contexto-ideas.test.ts` usa PostgreSQL efímero y verifica aislamiento, vigencia, valores nulos, exclusión de publicaciones con ventanas no comparables, límites y resultados reproducibles con los mismos datos y reloj.

### Generador de ideas

`generarIdeasDeCuentaActiva(entrada)` es la entrada del servidor. Verifica la sesión, resuelve la cuenta activa y reserva una ejecución antes de leer el contexto o llamar al motor. Acepta un UUID de idempotencia, de una a cinco ideas (tres por defecto), tema, objetivo, público, formato, pilar e intervalo. El objetivo predeterminado es educar y aportar valor. Si se omite el intervalo se guarda el intervalo efectivo del motor de contexto.

El modelo recibe un catálogo de códigos de evidencia, sin UUID de origen ni URLs de las fuentes. Zod exige la cantidad solicitada y el servidor rechaza códigos inventados, duplicados y propuestas demasiado similares. Las ideas sin evidencia citada se marcan como exploratorias. El repositorio comprueba de nuevo las referencias y persiste las ideas, advertencias, evidencia y consumo en una transacción. Una salida inválida queda como generación fallida. La reserva evita duplicados en solicitudes simultáneas y protege la cuota por cuenta. Las reservas fallidas consumen cuota, que se reinicia a medianoche de Bogotá. Las reservas interrumpidas caducan a los 90 segundos y la clave vencida no reinicia la generación.

La migración aditiva `drizzle/0011_reservas_generador_ideas.sql` agrega las reservas y el campo de advertencias. Requiere `0010`. Las generaciones se inician por solicitud explícita.

| Variable | Uso |
| --- | --- |
| `IDEAS_PROVIDER` | `mock` por defecto. `anthropic` habilita la generación real. |
| `ANTHROPIC_API_KEY` | Secreto existente. Solo se requiere para el proveedor real. |
| `IDEAS_ANTHROPIC_MODEL` | Modelo de ideas con salida estructurada. Usa `ANTHROPIC_MODEL` si se omite. |
| `IDEAS_MAX_DAILY_GENERATIONS` | 3 intentos por cuenta y día por defecto. Acepta `IDEAS_DAILY_LIMIT` como alias anterior. |
| `IDEAS_MAX_PER_REQUEST` | Hasta 5 ideas por solicitud. El servidor aplica el mismo límite que el formulario. |
| `IDEAS_MAX_INPUT_TOKENS` | 12.000 por defecto. |
| `IDEAS_MAX_OUTPUT_TOKENS` | 2.000 por defecto. |
| `IDEAS_MAX_COST_USD` | Máximo estimado obligatorio para el proveedor real. |
| `IDEAS_INPUT_USD_PER_MTOK`, `IDEAS_OUTPUT_USD_PER_MTOK` | Tarifas obligatorias para estimar el costo del modelo configurado. |

El modo mock produce contenido ficticio sin referencias a publicaciones reales. El cliente real usa AI SDK 7.0.179 y Anthropic 4.0.107, conteo previo de entrada y una generación estructurada, sin herramientas ni reintentos automáticos. Usa las tendencias guardadas. No realiza búsquedas web ni peticiones a Apify. Ante un resultado que supera el cálculo, conserva el consumo reportado si está disponible. La estimación no equivale a la factura.

La prueba local `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/generador-ideas.test.ts` cubre una, tres y cinco ideas, persistencia, referencias, falta de evidencia, aislamiento, cuota, idempotencia, errores y presupuesto con transporte simulado.

### Dashboard y banco de ideas

En `/dashboard/ideas`, selecciona la cuenta activa, completa el formulario y pulsa **Generar ideas**. Usa `IDEAS_PROVIDER=mock` para verificar el recorrido sin créditos. Con `IDEAS_PROVIDER=anthropic`, el formulario muestra el presupuesto estimado y pide una confirmación separada. El presupuesto máximo se configura en el servidor y el costo final mostrado es estimado. La página carga el banco y el historial mediante lecturas.

Las generaciones válidas se guardan automáticamente. Abre **Ver generación** para revisar las tarjetas. Desde **Editar idea** puedes modificar el contenido y guardarlo. Usa **Guardar estado** para pasar una idea a revisión, aprobarla o descartarla. El banco conserva las descartadas y admite búsqueda literal por título, filtro por estado, orden por fecha y paginación. El historial muestra las 20 generaciones recientes y permite abrir sus resultados.

En **¿Por qué recomendamos esta idea?** encontrarás las evidencias históricas de la generación, sus enlaces HTTPS, las métricas y fechas disponibles, el tamaño de muestra y las limitaciones registradas. Las ideas simuladas aparecen etiquetadas. En evidencias anteriores puede faltar el tamaño de muestra. La edición manual conserva las evidencias originales.

Las migraciones `0010` y `0011` son requisitos de la ruta. Este paso reutiliza el esquema existente. Las pruebas `tests/ideas.test.ts` y `tests/generador-ideas.test.ts` cubren persistencia local, confirmación, filtros, fuentes, revisiones concurrentes, aislamiento y generación mock.

### Evaluación y retroalimentación de ideas

En **Dashboard → Ideas**, abre **Evaluar idea** en una tarjeta. Elige una calificación general de 1 a 5 y, si quieres, agrega un comentario y notas por categoría. Para evaluar una aprobación o un descarte, guarda primero ese estado y selecciona el motivo. Puedes editar la evaluación desde la misma tarjeta. El historial conserva la versión anterior.

La migración aditiva `0012_evaluaciones_ideas` crea una tabla con clave foránea compuesta hacia la idea de la cuenta, versión, calificaciones, comentario, motivo, fecha y una instantánea del estado, título y formato. No requiere rellenar datos de ideas anteriores. La escritura bloquea la fila de la idea y verifica tanto su revisión como la última evaluación antes de insertar. La ruta sigue mostrando el banco si la sección de evaluaciones no se puede cargar.

El historial muestra las 10 ideas mejor evaluadas según su nota vigente, las 10 descartadas actualizadas más recientemente, motivos por estado al evaluar, promedios de hasta 12 meses con actividad en hora de Bogotá y las 20 revisiones más recientes. El promedio mensual incluye revisiones. El ranking toma una sola evaluación por idea.

`preferenciasEditoriales()` consulta hasta 50 evaluaciones vigentes de ideas reales aprobadas o descartadas que conservan el estado evaluado. Resume hasta cuatro patrones de motivo y formato compartidos por dos o más ideas. Las aprobaciones requieren al menos 4/5. Los descartes pueden incluir hasta dos títulos breves por patrón como ejemplos. La generación real recibe el resumen como referencia secundaria al perfil de marca. Comentarios, notas individuales y evaluaciones simuladas quedan fuera del prompt.

Para probarlo con `IDEAS_PROVIDER=mock`, usa una cuenta de prueba en una base con las migraciones `0010` a `0012`. Genera una idea, evalúala, guarda una revisión y comprueba el historial. Cambia de cuenta para verificar el aislamiento. `tests/ideas.test.ts` valida la migración sobre ideas antiguas, el guardado, la edición concurrente, el historial y el resumen. `tests/generador-ideas.test.ts` verifica con un proveedor simulado que el resumen llegue al generador.

### Validación integral y primera generación real

La base Neon conectada registró las 14 migraciones hasta `0013`. Se aplicaron `0010` a `0013`, y las huellas de publicaciones propias y competidoras, métricas propias, competidores, tendencias y fuentes coincidieron antes y después. Teki conservó sus 47 publicaciones y tres competidores. Una prueba revertida comprobó 1, 3 y 5 ideas mock, cuota, idempotencia, edición, aprobación, evaluaciones, filtros y aislamiento. La restricción de evidencias rechazó un post de otra cuenta.

El formulario permite elegir ambas fechas del análisis o usar el período predeterminado de 90 días. En la validación de Teki, el contexto predeterminado incluyó perfil de marca, tres competidores y cinco publicaciones competidoras. Los extremos propios comparables, los enriquecimientos vigentes y las tendencias reales vigentes no aportaron ejemplos al contexto de esa prueba.

Con el intervalo del 24 de noviembre de 2025 al 23 de noviembre de 2026, el motor incorporó un resumen de 23 publicaciones propias con interacciones conocidas. Ese intervalo siguió sin aportar casos comparables por formato y edad de captura, ni tendencias vigentes.

Para ejecutar la primera prueba real cuando esté autorizada, conserva `ANTHROPIC_API_KEY` como secreto y configura estas variables del servidor en el entorno donde probarás:

```dotenv
IDEAS_PROVIDER=anthropic
IDEAS_ANTHROPIC_MODEL=claude-haiku-5-5
IDEAS_MAX_PER_REQUEST=5
IDEAS_MAX_DAILY_GENERATIONS=3
IDEAS_MAX_INPUT_TOKENS=12000
IDEAS_MAX_OUTPUT_TOKENS=2000
IDEAS_INPUT_USD_PER_MTOK=0.10
IDEAS_OUTPUT_USD_PER_MTOK=0.50
IDEAS_MAX_COST_USD=0.003
```

El techo técnico a esas tarifas es aproximadamente USD 0,0022 por solicitud, con un presupuesto configurado de USD 0,003. La estimación usa el conteo previo con margen y el máximo de salida. `0013` permite guardar por separado diagnósticos de presupuesto, entrada y salida. Una respuesta truncada se registra como fallida y no crea ideas parciales. Ajusta las tarifas si cambias de modelo o de modalidad.

Reinicia la app, selecciona **Teki Agency → Ideas**, elige **3** y usa el objetivo «Genera tres ideas de contenido para Teki Agency que combinen nuestro posicionamiento MarTech, el rendimiento de nuestras publicaciones, el análisis de competencia y las tendencias recientes disponibles». El botón **Confirmar generación** inicia la solicitud real. Comprueba tres ideas distintas con gancho, formato, justificación, fuentes válidas y las limitaciones que correspondan. Verifica que el historial registre la generación y el costo estimado. Los tokens se guardan en `generaciones_ideas`. La generación utiliza tendencias guardadas y no ejecuta Apify ni búsqueda web.

Para volver a simular, cambia `IDEAS_PROVIDER=mock` y reinicia el servidor local o vuelve a desplegar si cambiaste las variables en Vercel.
