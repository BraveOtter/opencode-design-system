# OpenCode Design System

[![versión en npm](https://img.shields.io/npm/v/opencode-design-system)](https://www.npmjs.com/package/opencode-design-system)
[![Licencia MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/BraveOtter/opencode-design-system/blob/main/LICENSE)
[![OpenCode v2](https://img.shields.io/badge/OpenCode-v2-6f42c1)](https://opencode.ai/v2/docs/)

**Un plugin colaborativo de OpenCode v2 para crear y evolucionar sistemas de diseño portables y neutrales respecto al framework, que los agentes de IA puedan seguir de verdad.**

[English](https://github.com/BraveOtter/opencode-design-system/blob/main/README.md) · [Español](https://github.com/BraveOtter/opencode-design-system/blob/main/README.es.md) · [Português (Brasil)](https://github.com/BraveOtter/opencode-design-system/blob/main/README.pt-BR.md)

El sistema de diseño se convierte en la memoria visual duradera del proyecto: **Markdown y JSON** estructurados para tokens semánticos, preferencias explícitas, decisiones de diseño, componentes, patrones y especificaciones de pantallas. Se genera una vista HTML interactiva a partir de esas fuentes; nunca es una segunda fuente de verdad.

## ¿Por qué este plugin?

- **Empieza con una conversación, no con un cuestionario.** Aclara solo las decisiones importantes de identidad que aún no estén definidas y conserva explícitas las preferencias del usuario.
- **Documenta lo que ya existe.** Un análisis acotado y de solo lectura ayuda a formalizar una interfaz existente sin rediseñarla silenciosamente.
- **Entrega a los agentes el contexto pertinente.** La carga progresiva proporciona los tokens, componentes, patrones y pautas relevantes para cada tarea de UI, en vez de volcar todo el sistema en cada prompt.
- **Evoluciona el sistema con coherencia.** Registra decisiones, dependencias de tokens semánticos, componentes y patrones afectados, estado y versiones del sistema de diseño.
- **Evita depender de un framework.** El formato autoritativo es Markdown y JSON, no React, Vue, Tailwind ni una vista generada.
- **Protege los archivos del proyecto.** El análisis y las comprobaciones son de solo lectura. La creación no reemplaza un directorio `design-system/` existente y conserva el contenido de `AGENTS.md` fuera del bloque administrado por el plugin.

## Requisitos

- [OpenCode v2](https://opencode.ai/v2/docs/)
- Node.js **22.19 o posterior**

## Instalación

### Instalar el paquete publicado en npm

Instálalo globalmente con la CLI de OpenCode:

```sh
opencode plugin add opencode-design-system
```

Para fijar la versión actual:

```sh
opencode plugin add opencode-design-system@1.0.1
```

O configúralo para un proyecto en `opencode.json` o `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-design-system"]
}
```

OpenCode carga los plugins configurados al iniciar. Si no aparece, reinicia OpenCode o el servicio de OpenCode.

### Instalar directamente desde GitHub

Para instalar la versión más reciente de la rama predeterminada:

```sh
opencode plugin add github:BraveOtter/opencode-design-system
```

Para fijar una versión etiquetada:

```sh
opencode plugin add github:BraveOtter/opencode-design-system#v1.0.1
```

### Usar un checkout local

Clona el repositorio, instala las dependencias de desarrollo y compílalo:

```sh
npm install
npm run build
```

Después, indica a OpenCode la ruta del checkout (ajusta la ruta relativa a tu proyecto):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["../opencode-design-system"]
}
```

El repositorio también incluye un entrypoint local opcional para pruebas en `plugins/local/index.js`; no se carga automáticamente ni forma parte del paquete npm.

## Primeros pasos

Crea un sistema a partir de una dirección visual:

```text
/design-system Un espacio de trabajo sereno y compacto, con verdes apagados, superficies nítidas y sin degradados.
```

Si el proyecto ya tiene una interfaz, pide al agente que la analice primero. Explicará lo que encontró y preguntará si quieres documentar la identidad visual existente o empezar desde cero antes de crear archivos:

```text
/design-system Analiza la interfaz de esta aplicación y ayúdame a documentar su lenguaje visual actual.
```

Para diseñar una pantalla sin pedir al plugin que implemente código de UI:

```text
/design-screen Administración de usuarios con búsqueda, filtros, invitaciones y estados vacíos.
```

También puedes pedir una especificación de pantalla en lenguaje natural sin usar `/design-screen`. Cuando existe un manifest, el plugin remite al agente a `AGENTS.md` y a las pautas pertinentes del sistema.

## Comandos

| Comando | Función |
| --- | --- |
| `/design-system [idea]` | Crear un sistema en colaboración o conversar sobre cómo documentar una interfaz existente. |
| `/design-system/update [cambio]` | Aplicar un cambio semántico versionado e identificar la documentación dependiente. |
| `/design-system/preview` | Regenerar la vista interactiva a partir de los archivos estructurados. |
| `/design-system/check` | Comprobación heurística de solo lectura para detectar posibles diferencias entre estilos y tokens documentados. |
| `/design-screen [pantalla]` | Guardar una especificación lista para implementar, sin escribir código de UI de la aplicación. |

El plugin también registra las herramientas `design_system_create`, `design_system_read`, `design_system_analyze`, `design_system_update`, `design_system_preview`, `design_system_check` y `design_system_screen_spec` para que el agente las use cuando lo necesite.

## Cómo funciona

### Un flujo cuidadoso para productos existentes

La herramienta `design_system_analyze` lee posibles fuentes de UI y estilos, configuraciones reconocidas de frameworks y dependencias declaradas. Resume evidencias como variables CSS, colores, radios, espaciado, breakpoints responsive y componentes candidatos. El análisis tiene límites, omite directorios de dependencias y compilación, no sigue enlaces simbólicos y no modifica los archivos que lee. Los resultados son indicios, no una prueba de que una diferencia sea un error.

El agente explica las incertidumbres y pregunta antes de normalizar decisiones visuales importantes o ambiguas. Analizar no significa que tenga permiso para rediseñar ni modificar el código de la aplicación.

### Protección de los archivos del proyecto

Crear un sistema escribe un nuevo directorio `design-system/` y añade o actualiza únicamente el bloque administrado por el plugin en el `AGENTS.md` raíz. Si `design-system/` ya contiene archivos, la creación no los reemplaza. Las actualizaciones escriben deliberadamente en los artefactos del sistema; las herramientas integradas de análisis y comprobación nunca editan archivos de UI de la aplicación.

Las instrucciones administradas de `AGENTS.md` son portables: indican a OpenCode y a otros agentes cómo encontrar las fuentes neutrales al framework y cargar solo lo necesario para cada tarea. El plugin no copia agentes, comandos ni skills al proyecto.

### Una fuente de verdad portable

El directorio generado suele tener esta estructura:

```text
design-system/
├── README.md
├── manifest.json
├── tokens.json
├── preferences.json
├── FOUNDATIONS.md
├── AI-GUIDELINES.md
├── DECISIONS.md
├── CHANGELOG.md
├── schema/
├── components/
├── patterns/
├── screens/
├── preview/
│   └── index.html
└── tools/
    └── generate-preview.mjs

AGENTS.md  # El contenido existente se conserva fuera del bloque administrado.
```

El manifest indexa temas, versiones, archivos y las referencias a tokens declaradas por cada componente y patrón. Los sistemas empiezan en `0.1.0` con la versión de esquema `1.0.0`; su estado puede ser `draft`, `review` o `stable`.

Los tokens usan rutas semánticas y pueden definir varios temas:

```json
{
  "$schema": "./schema/tokens.schema.json",
  "schemaVersion": "1.0.0",
  "themes": {
    "light": {
      "color": {
        "surface": { "base": "#f6f8f7", "raised": "#ffffff" },
        "text": { "primary": "#17211f", "secondary": "#65726d" },
        "accent": { "primary": "#276f55" }
      },
      "radius": { "control": "6px", "card": "8px" },
      "spacing": { "sm": "8px", "md": "16px" }
    }
  }
}
```

El vocabulario puede ampliarse para incluir tipografía, layout, elevación, movimiento, breakpoints, foco y estados. Los componentes describen propósito, variantes, tokens, comportamiento, accesibilidad, adaptación responsive y relaciones. Los patrones documentan composiciones útiles, como formularios, navegación, filtros, tablas y estados vacíos.

### Actualizaciones significativas y versionadas

`/design-system/update` lee el manifest y los documentos pertinentes antes de cambiar el sistema. Por defecto, una actualización de token semántico aplica esa ruta a todos los temas; usa el prefijo `themes.<name>.` para modificar solo uno. La actualización registra el motivo, encuentra los dependientes declarados, actualiza la documentación pertinente y regenera la vista previa.

El impacto en la versión del sistema de diseño sigue estas reglas:

- **PATCH**: correcciones compatibles o cambios de documentación.
- **MINOR**: nuevas adiciones compatibles, como un token, componente o patrón.
- **MAJOR**: cambios que pueden romper contratos de diseño existentes.

Estas versiones corresponden al sistema de diseño generado en el proyecto, no al paquete npm del plugin. De forma predeterminada, los sistemas actualizados vuelven a `draft` para que una persona pueda revisarlos.

## Vista interactiva

`design-system/preview/index.html` se genera a partir del manifest, los tokens y las especificaciones de componentes y patrones. Incluye muestras de tokens, ejemplos de componentes, cambio de tema cuando hay varios y ejemplos interactivos. Respeta el foco visible por teclado y `prefers-reduced-motion`.

Regénérala en OpenCode con `/design-system/preview` o, sin el plugin, desde la raíz del proyecto:

```sh
node design-system/tools/generate-preview.mjs
```

El renderer independiente no tiene dependencias externas. Edita los archivos estructurados Markdown y JSON, no el HTML generado, para cambiar el sistema.

## Desarrollo y pruebas

```sh
npm install
npm run typecheck
npm test
npm run build
```

Las pruebas cubren un flujo integrado en un proyecto temporal: análisis de solo lectura, creación y conservación de archivos del usuario, actualización del bloque administrado de `AGENTS.md`, especificaciones de pantallas, cambios de tokens entre temas, vistas previas, comprobaciones y seguridad de rutas.

## Documentación

- [Guía de plugins de OpenCode v2](https://opencode.ai/v2/docs/build/plugins)
- [Configuración de plugins de OpenCode](https://opencode.ai/v2/docs/plugins)
- [Comandos de OpenCode](https://opencode.ai/v2/docs/commands)
- [Instrucciones de OpenCode y `AGENTS.md`](https://opencode.ai/v2/docs/instructions)
- [Referencia de la API de plugins](https://opencode.ai/v2/docs/api)
- [Paquete npm](https://www.npmjs.com/package/opencode-design-system)
- [Reportar un problema](https://github.com/BraveOtter/opencode-design-system/issues)

## Licencia

Este proyecto está publicado bajo la [Licencia MIT](https://github.com/BraveOtter/opencode-design-system/blob/main/LICENSE).
