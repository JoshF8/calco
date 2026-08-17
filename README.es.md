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

calco es una herramienta visual para diseñar y leer infraestructura cloud en AWS. Funciona en dos direcciones: arrastrás recursos de AWS en un canvas y exportás Terraform limpio, o importás un repositorio de Terraform existente y la herramienta lo dibuja — con dependencias, huecos y decisiones olvidadas hechas visibles. Los límites de los `module` importados se dibujan como contenedores read-only, así la estructura de un repo real basado en módulos se ve de un vistazo.

El nombre viene de *papel calco* — el papel translúcido sobre el que los dibujantes técnicos copiaban o modificaban planos arquitectónicos. La metáfora es exacta: el código Terraform y el diagrama del canvas son calcos uno del otro, capas de la misma realidad vistas desde dos ángulos. calco traduce entre ambas direcciones.

Está hecho para devs que piensan visualmente pero terminan escribiendo HCL, y para equipos que heredaron infraestructura de alguien que se fue hace dos años.

## Estado del proyecto

**Pre-MVP, ejecutable en modo desarrollo.** Marca, arquitectura y ambos flujos están implementados para el camino core; el empaquetado de producción y las features cloud quedan pendientes.

Qué existe hoy:

- **Greenfield** — canvas → generar → Terraform exportable
- **Brownfield** — importá una carpeta de Terraform y mirala dibujada; los `module` locales se resuelven como contenedores read-only; lo que no se puede dibujar termina en un reporte de importación agrupado en vez de una pared de errores
- **Docs** — sistema de marca, documento de arquitectura, 6 ADRs

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

## Capturas

| Diseño en el canvas                      | Importá un repo real                          |
| ---------------------------------------- | --------------------------------------------- |
| <img src="docs/screenshots/greenfield-canvas.png" width="740" alt="Greenfield: el ejemplo de tres capas incluido, dibujado en el canvas" /> | <img src="docs/screenshots/brownfield-eks-modules.png" width="740" alt="Brownfield: el repo terraform-aws-eks importado, con cada module local dibujado como contenedor read-only" /> |

La captura izquierda es el ejemplo de tres capas incluido, en el canvas. La derecha es el root module de `terraform-aws-modules/terraform-aws-eks` importado tal cual: 107 recursos, cada `module` local dibujado como contenedor read-only con sus recursos anidados adentro (0 solapamientos, todo dentro del viewport).

Lo que no se puede dibujar se reporta, no se traga:

<img src="docs/screenshots/import-diagnostics-grouped.png" width="860" alt="Reporte de importación del mismo repo: 841 diagnósticos agrupados en 109 grupos por causa y archivo" />

En esa misma importación de EKS, hay 841 constructos que todavía no se representan en el canvas (referencias `var.*`, interpolaciones, data sources…). En vez de 1.609 diagnósticos planos se muestran como **109 grupos por causa y archivo** — cada grupo a un click del archivo culpable.

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
| Runner        | Docker (`terraform validate`, `plan -refresh=false`, `graph`) — futuro      |
| Base de datos | sqlc + goose · pgx (Postgres, hosted) · modernc.org/sqlite (self-host)      |
| Deploy        | Docker Compose (self-host) · ECS Fargate (hosted)                           |

## Roadmap

- [x] Marca y sistema de diseño (`docs/BRAND.md`)
- [x] Documento de arquitectura (`docs/ARCHITECTURE.md`) y ADRs
- [x] Scaffold del repo (monorepo, lint, CI)
- [x] Graph model y generador de HCL (greenfield)
- [x] Canvas con React Flow (paleta → generar)
- [x] Importador brownfield (visualización read-only, módulos locales) — ver [ADR-0006](docs/adr/0006-local-modules.md)
- [ ] Resolución de módulos remotos (GithubFetcher + runner)
- [ ] Sandbox del Terraform runner
- [ ] MVP self-hosted (Docker Compose)
- [ ] Versión hosteada (auth, multi-tenant, AWS connect)

## Quick start

Requisitos: **Go 1.26+**, **Node 22+** con `pnpm`, y opcionalmente [Task](https://taskfile.dev) (`go install github.com/go-task/task/v3/cmd/task@latest`) y [air](https://github.com/air-verse/air) para hot reload.

```bash
task dev            # web (:5173) + API (:8080), ambos con hot reload
# o, sin Task y air:
cd apps/server && go run ./cmd/server   # API en :8080, referencia de API en /docs
cd apps/web   && pnpm dev               # app en :5173
```

Andá a http://localhost:5173 y apretá **Importar** para cargar un repositorio de Terraform local (selector de carpeta). El importador corre enteramente in-process — sin Docker, sin red, sin `terraform init`.

| Propósito          | Comando                    |
| ------------------ | -------------------------- |
| Todos los tests    | `task test`                |
| Lint + vet         | `task lint`                |
| Compilar binarios  | `task build`               |
| Solo tests web     | `cd apps/web && pnpm test` |
| Solo tests server  | `cd apps/server && go test ./...` |
| Regenerar tipos TS | `cd apps/web && pnpm gen:types` (contra un server corriendo) |

## Estructura del repo

```
calco/
├── apps/
│   ├── server/                     # API Go (hexagonal, motor HCL in-process)
│   │   ├── cmd/server/             # punto de entrada y DI manual
│   │   └── internal/               # config, domain, application, adapters
│   └── web/                        # frontend React (feature-based)
│       └── src/features/           # canvas, generate, import, catalog…
├── docs/
│   ├── adr/                        # registros de decisiones arquitectónicas
│   │   ├── 0001-architecture-pattern.md
│   │   ├── 0002-backend-language.md
│   │   ├── 0003-api-and-web-framework.md
│   │   ├── 0004-data-layer.md
│   │   ├── 0005-nested-blocks.md
│   │   └── 0006-local-modules.md
│   ├── brand/                      # assets del logo + preview
│   ├── screenshots/                # capturas usadas en este README
│   ├── ARCHITECTURE.md
│   └── BRAND.md
├── Taskfile.yml                    # task dev / build / test / lint
├── LICENSE
├── README.md
└── README.es.md
```

## Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitectura del sistema, capas, flujos (en inglés)
- [`docs/BRAND.md`](docs/BRAND.md) — identidad de marca y sistema de diseño
- [`docs/adr/`](docs/adr/) — registros de decisiones arquitectónicas (6 hasta ahora, en inglés)

## Licencia

Apache 2.0. Ver [LICENSE](LICENSE).

El core open source vive en este repositorio. Las features comerciales — hosting administrado, multi-tenancy, integración con cuentas AWS, soporte — viven en un repositorio privado separado y no están cubiertas por esta licencia.

## Autor

Construido por [Joshua Franco](https://github.com/JoshF8).