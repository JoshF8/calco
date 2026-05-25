# Brand — calco

> Documento de identidad de marca. Captura las decisiones de diseño, su rationale, y las reglas de uso. Es la narrativa; el código (`globals.css`, `tailwind.config.ts`) es la implementación.

---

## 1. Nombre y origen

**calco** (lowercase, siempre).

"Calco" en español de ingeniería es el papel translúcido sobre el que se copiaba un plano para reproducirlo o modificarlo. La metáfora es exacta: el código Terraform y el diagrama del canvas son calcos uno del otro — capas de la misma realidad, vistas desde dos ángulos.

El producto traduce entre ambas direcciones. La marca es ese acto de traducción.

### Reglas de escritura

- Siempre lowercase, también al inicio de oración cuando sea posible.
- Una sola palabra, sin guiones, sin separadores.
- En URLs: `calco.dev` (o equivalente).
- En código: `calco` como package name. `Calco` solo cuando la convención del lenguaje lo exige (clase, tipo).

---

## 2. Posicionamiento

**Producto:** herramienta visual para diseñar y leer infraestructura cloud en AWS.

**Tagline operativo:** *Tu infraestructura, en dos lenguas.*

**Arquetipo:** el Artesano — precisión, oficio, dedicación al detalle.

**Tono:** serio pero accesible, técnico pero no frío, con sensibilidad de diseño.

### Audiencia

**Primaria (mercado real):**
- Equipos técnicos junior/intermedio en Latam que necesitan diseñar infra sin ser expertos en Terraform.
- Equipos que heredaron repos de Terraform que nadie entiende y necesitan mapearlos.

**Secundaria (open source + portafolio):**
- Comunidad técnica internacional — HackerNews, GitHub, blogs técnicos.

### Lo que NO somos

- No competimos en el mercado US enterprise — vivimos donde otras herramientas no llegan.
- No somos un editor de diagramas genérico — somos específicamente IaC + AWS.
- No somos low-code/no-code — el código Terraform es ciudadano de primera clase, no un detalle oculto.

---

## 3. Logo

**Concepto:** dos cuadrados redondeados idénticos en offset diagonal. Ambos en graphite cálido al 60% de opacidad. La intersección — donde las capas se registran — aparece en **oxblood** (la tinta del calco).

La intersección oxblood es la única zona de color saturado del símbolo. Es el corazón conceptual de la marca: el momento donde el código y el diagrama se vuelven la misma cosa.

### Variantes

- **Símbolo + wordmark horizontal** — uso principal (web, header, marketing).
- **Símbolo solo** — favicon, avatar de GitHub, sticker, OG image compacto.
- **Wordmark solo** — copy denso, footer, contextos donde el símbolo no aporta.

### Espacios y tamaños

- Espacio de protección: mínimo igual a la altura del símbolo en todos los lados.
- Tamaño mínimo del símbolo: 24×24 px (digital), 12 mm (impresión).
- Tamaño mínimo del lockup horizontal: 96 px de ancho.

### Usos prohibidos

- No rotar el símbolo.
- No estirar ni deformar las proporciones.
- No cambiar el color de la intersección oxblood — es el único elemento fijo del logo.
- No usar sobre fondos que no sean cream (light) o dark graphite (dark). Ver sección Color.
- No agregar sombras, bordes, gradientes ni efectos.
- No re-tipografiar el wordmark (es Inter Display medium, no se sustituye).

---

## 4. Color

### Filosofía

Tres pilares semánticos. Toda decisión de color responde a uno de ellos:

1. **Paper** — el fondo, el soporte. Cream en light, dark warm graphite en dark.
2. **Ink** — el contenido. Graphite en light, cream en dark. Lo que se escribe sobre el paper.
3. **Registration** — el oxblood. El momento del calco. Aparece SOLO donde dos cosas se registran, encuentran o confirman.

Si dudás dónde poner color en una pantalla, preguntate: *¿esto es paper, ink, o registration?*

### Tokens

Los valores definitivos viven en `apps/web/src/styles/globals.css`. Acá la referencia narrativa:

**Brand raw:**

| Rol | Light | Dark |
|---|---|---|
| Paper (background) | `#F4EFE3` | `#1F1A17` |
| Ink (foreground) | `#3A3530` | `#E8DDC8` |
| Registration (accent) | `#5E222A` | `#6E2A35` |

**Status (light, ver `globals.css` para dark):**

| Rol | Hex | Por qué |
|---|---|---|
| Success | `#3D7A55` | Verde bosque cálido — convive con la paleta warm. |
| Warning | `#C4842A` | Amber, no naranja chillón. |
| Destructive | `#B22929` | Rojo puro y saturado, deliberadamente **distinto** del oxblood para evitar confusión semántica. |
| Info | `#4566A8` | Azul de plano arquitectónico — guiño a la metáfora. |

### Reglas de uso del oxblood (críticas)

El oxblood es el corazón de la marca. Si se gasta, se pierde.

**El oxblood NUNCA pinta:**
- Fondos de página, headers, sidebars.
- Cards o áreas extensas.
- Texto largo.
- Alertas o status (eso lo hace `destructive` u otros).

**El oxblood SÍ pinta:**
- La intersección del logo. Siempre. Inmutable.
- Focus ring de inputs (`--ring`).
- El botón CTA primario crítico — **uno por vista, no más**.
- Indicadores de "registrado / guardado / confirmado".
- Subrayado del link activo (current page).
- Borde inferior del tab activo.

**Test mental:** si vieras la pantalla en thumbnail, ¿el oxblood te marca dónde está la acción importante? Si no, sobra.

---

## 5. Tipografía

### Familia primaria

**Sans-serif geométrica** con presencia editorial. Candidatos en orden:

1. **Inter** — open source, gratis, completa, neutra. **Default para MVP.**
2. **GT Walsheim** — pago, más personalidad geométrica. Opción premium.
3. **Söhne** — pago, más editorial. Opción premium.

Para MVP: **Inter** cargada vía `next/font` (o equivalente). Migración futura si el budget lo permite.

### Familia mono (para HCL / código)

**JetBrains Mono** o **Geist Mono**. Decisión final cuando armemos el editor de HCL en el canvas.

### Jerarquía

| Token | Tamaño | Weight | Tracking | Uso |
|---|---|---|---|---|
| Display | 48–64 px | 600 | -0.02em | Hero, landing |
| H1 | 32 px | 600 | -0.01em | Page title |
| H2 | 24 px | 600 | normal | Section header |
| H3 | 18 px | 500 | normal | Subsection |
| Body | 16 px | 400 | normal (lh 1.6) | Texto principal |
| Small | 14 px | 400 | normal | Metadata, labels |
| Caption | 12 px | 500 | +0.02em | Tags, uppercase opcional |

### Wordmark del logo

**Inter Display** weight medium (500), lowercase, tracking +0.01em. La x-height del wordmark se alinea ópticamente con la altura del cuadrado interior del símbolo.

---

## 6. Voz y tono

### Principios de copy

- **Directo, no cute.** "Importá tu repo" > "¡Subí tu código mágicamente!"
- **Técnico cuando corresponde.** Nombres reales: VPC, Terraform, HCL. No simplificamos a "redes" si el usuario sabe leer "VPC".
- **Segunda persona, informal en español.** "Importás" / "Aplicás" — no "Importe" / "Aplique".
- **Inglés para términos técnicos, español para todo lo demás.** No traducimos `terraform apply` ni "canvas".
- **Sin signos de exclamación.** Casi nunca. La marca es seria.
- **Sin emojis en producto.** En README/blog/marketing pueden aparecer con moderación; en UI nunca.

### Ejemplos

**Bueno:**
- *"calco dibuja la infra que ya tenés."*
- *"Conectá tu cuenta AWS para importar el estado real."*
- *"Esta intersección representa una dependencia entre dos recursos."*

**Malo:**
- *"¡Dibujá tu cloud de manera súper fácil! 🚀"*
- *"Conectate y dejá que la magia ocurra."*
- *"Ups, algo salió mal. ¡Intentá de nuevo!"*
  → mejor: *"No pudimos leer el archivo Terraform. Verificá que la sintaxis sea válida."*

### Tono según contexto

- **Errores:** específico, accionable, sin culpa. Decimos qué pasó y qué hacer.
- **Onboarding:** breve, demuestra el valor en 30 segundos. No tutoriales largos al inicio.
- **Marketing:** propositivo, no superlativo. "Una herramienta", no "La mejor herramienta".
- **Documentación técnica:** preciso, con ejemplos de código, sin paja.

---

## 7. Aplicación

### Favicon

Símbolo solo (los dos cuadrados con intersección oxblood). SVG escalable. La intersección debe seguir siendo visible a 16×16 — si se pierde, simplificá el offset.

### OG image (social cards)

1200×630 px. Background paper cream (light) o dark graphite (dark). Logo a la izquierda. Tagline opcional debajo del wordmark en graphite suave.

### README de GitHub

Logo header centrado, paper background. Badges debajo (license, tests, version, package). H1 con wordmark decorativo o solo `# calco`. Voz coherente con sección 6.

### Sticker / merch

Símbolo solo o lockup horizontal. Imprimir sobre cream o blanco satinado. Evitar fondos negros agresivos — siempre warm.

---

## Mantenimiento

Este documento se actualiza junto con cualquier cambio a la marca. Si cambia un token de color en código, actualizar la sección 4. Si cambia el tono editorial, actualizar la sección 6.

**División de responsabilidades:**

- **Este `BRAND.md`** → captura el resultado y las reglas.
- **`docs/adr/`** → captura las decisiones específicas y por qué se tomaron (por ejemplo: *"ADR-0003: por qué oxblood y no azul como acento de marca"*).
- **Código (`globals.css`, `tailwind.config.ts`)** → la implementación técnica autoritativa.
