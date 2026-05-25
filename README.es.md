<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/calco-lockup-dark.svg">
  <img src="docs/brand/calco-lockup-light.svg" alt="calco" width="320">
</picture>

*Tu infraestructura, en dos lenguas.*

**Español** · [English](README.md)

![Status](https://img.shields.io/badge/estado-pre--MVP-orange) ![License](https://img.shields.io/badge/licencia-Apache_2.0-blue)

</div>

---

## Sobre calco

calco es una herramienta visual para diseñar y leer infraestructura cloud en AWS. Funciona en dos direcciones: arrastrás recursos de AWS en un canvas y exportás Terraform limpio, o importás un repositorio de Terraform existente y la herramienta lo dibuja — con dependencias, huecos y decisiones olvidadas hechas visibles.

El nombre viene de *papel calco* — el papel translúcido sobre el que los dibujantes técnicos copiaban o modificaban planos arquitectónicos. La metáfora es exacta: el código Terraform y el diagrama del canvas son calcos uno del otro, capas de la misma realidad vistas desde dos ángulos. calco traduce entre ambas direcciones.

Está hecho para devs que piensan visualmente pero terminan escribiendo HCL, y para equipos que heredaron infraestructura de alguien que se fue hace dos años.

## Estado del proyecto

**Pre-MVP.** Marca y arquitectura definidas, código en desarrollo.

Este repositorio actualmente contiene:

- [`docs/BRAND.md`](docs/BRAND.md) — identidad de marca, sistema de color, voz

Más en camino. La aplicación todavía no es ejecutable. Ver el [roadmap](#roadmap) más abajo.

## Los dos flujos

```
GREENFIELD                              BROWNFIELD

  ┌─────────────┐                         ┌─────────────┐
  │   canvas    │                         │   *.tf      │
  │  ┌─┐ ┌─┐    │                         │  resource   │
  │  └─┘ └─┘    │  ─── traduce ────►      │  aws_vpc    │
  │     ┌─┐     │                         │  aws_subnet │
  │     └─┘     │                         └──────┬──────┘
  └──────┬──────┘                                │
         │                                       ▼
         ▼                                ┌─────────────┐
  ┌─────────────┐                         │   canvas    │
  │   *.tf      │                         │  (dibujado  │
  │  HCL listo  │                         │   desde tu  │
  │  para apply │                         │   TF real)  │
  └─────────────┘                         └─────────────┘
```

## Arquitectura

Monolito modular con arquitectura hexagonal (ports & adapters) en el backend, organización feature-based en el frontend. El graph model es la única fuente de verdad entre canvas y código.

Detalle completo en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Decisiones y rationale en [`docs/adr/`](docs/adr/).

## Stack técnico

| Capa          | Herramienta                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| Frontend      | TypeScript, Vite, React 19, `@xyflow/react`, Tailwind v4, shadcn/ui         |
| Estado        | Zustand (cliente) + TanStack Query (servidor)                               |
| Routing       | React Router 7                                                              |
| Backend       | Go 1.26, Huma v2, chi v5                                                    |
| API           | REST + OpenAPI 3.1 (autogenerado por Huma)                                  |
| Motor HCL     | `hashicorp/hcl/v2` + `hclwrite` (in-process)                                |
| Runner        | Docker (`terraform validate`, `plan -refresh=false`, `graph`)               |
| Base de datos | sqlc + goose · pgx (Postgres, hosted) · modernc.org/sqlite (self-host)      |
| Deploy        | Docker Compose (self-host) · ECS Fargate (hosted)                           |

## Roadmap

- [x] Marca y sistema de diseño (`docs/BRAND.md`)
- [x] Documento de arquitectura (`docs/ARCHITECTURE.md`) y ADRs
- [ ] Scaffold del repo (monorepo, lint, CI)
- [ ] Graph model y generador de HCL (greenfield)
- [ ] Canvas con React Flow (~15 recursos AWS)
- [ ] Sandbox del Terraform runner
- [ ] Importador brownfield (visualización read-only)
- [ ] MVP self-hosted (Docker Compose)
- [ ] Versión hosteada (auth, multi-tenant, AWS connect)

## Quick start

Todavía no es ejecutable. Cuando el MVP esté en pie, esta sección documentará `docker compose up` y el flujo de desarrollo local.

## Estructura del repo

```
calco/
├── docs/
│   ├── adr/                          # registros de decisiones arquitectónicas
│   │   ├── 0001-architecture-pattern.md
│   │   ├── 0002-backend-language.md
│   │   ├── 0003-api-and-web-framework.md
│   │   └── 0004-data-layer.md
│   ├── brand/                        # assets del logo + preview
│   │   ├── calco-symbol-light.svg
│   │   ├── calco-symbol-dark.svg
│   │   ├── calco-lockup-light.svg
│   │   ├── calco-lockup-dark.svg
│   │   └── preview.html
│   ├── ARCHITECTURE.md
│   └── BRAND.md
├── LICENSE
├── README.md
└── README.es.md
```

Más carpetas aparecerán a medida que el proyecto crezca.

## Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitectura del sistema, capas, flujos (en inglés)
- [`docs/BRAND.md`](docs/BRAND.md) — identidad de marca y sistema de diseño
- [`docs/adr/`](docs/adr/) — registros de decisiones arquitectónicas (en inglés)

## Licencia

Apache 2.0. Ver [LICENSE](LICENSE).

El core open source vive en este repositorio. Las features comerciales — hosting administrado, multi-tenancy, integración con cuentas AWS, soporte — viven en un repositorio privado separado y no están cubiertas por esta licencia.

## Autor

Construido por [Joshua Franco](https://github.com/JoshF8).
