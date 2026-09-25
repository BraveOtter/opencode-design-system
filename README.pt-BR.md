# OpenCode Design System

[![versão no npm](https://img.shields.io/npm/v/opencode-design-system)](https://www.npmjs.com/package/opencode-design-system)
[![Licença MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/BraveOtter/opencode-design-system/blob/main/LICENSE)
[![OpenCode v2](https://img.shields.io/badge/OpenCode-v2-6f42c1)](https://opencode.ai/v2/docs/)

**Um plugin colaborativo do OpenCode v2 para criar e evoluir sistemas de design portáveis, independentes de framework e que agentes de IA conseguem seguir de verdade.**

[English](https://github.com/BraveOtter/opencode-design-system/blob/main/README.md) · [Español](https://github.com/BraveOtter/opencode-design-system/blob/main/README.es.md) · [Português (Brasil)](https://github.com/BraveOtter/opencode-design-system/blob/main/README.pt-BR.md)

O sistema de design se torna a memória visual duradoura do projeto: **Markdown e JSON** estruturados para tokens semânticos, preferências explícitas, decisões de design, componentes, padrões e especificações de telas. Uma prévia HTML interativa é gerada a partir dessas fontes; ela nunca é uma segunda fonte de verdade.

## Por que usar este plugin?

- **Comece com uma conversa, não com um questionário.** Esclareça apenas as decisões importantes de identidade que ainda não estão definidas e mantenha explícitas as preferências da pessoa usuária.
- **Documente o que já existe.** Uma análise limitada e somente leitura ajuda a formalizar uma interface existente sem redesenhá-la silenciosamente.
- **Forneça o contexto relevante aos agentes.** O carregamento progressivo entrega tokens, componentes, padrões e orientações pertinentes à tarefa de UI, sem despejar o sistema inteiro em cada prompt.
- **Evolua o sistema de forma coerente.** Registre decisões, dependências de tokens semânticos, componentes e padrões afetados, status e versões do sistema de design.
- **Evite dependência de framework.** O formato oficial é Markdown e JSON, não React, Vue, Tailwind ou uma prévia gerada.
- **Proteja os arquivos do projeto.** Análises e verificações são somente leitura. A criação não substitui um diretório `design-system/` existente e preserva o conteúdo de `AGENTS.md` fora do bloco gerenciado pelo plugin.

## Requisitos

- [OpenCode v2](https://opencode.ai/v2/docs/)
- Node.js **22.19 ou mais recente**

## Instalação

### Instale o pacote publicado no npm

Instale globalmente pela CLI do OpenCode:

```sh
opencode plugin add opencode-design-system
```

Para fixar uma versão específica do npm, substitua `<version>` pela versão desejada:

```sh
opencode plugin add opencode-design-system@<version>
```

Ou configure o plugin para um projeto em `opencode.json` ou `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-design-system"]
}
```

O OpenCode carrega os plugins configurados ao iniciar. Se o plugin não aparecer, reinicie o OpenCode ou o serviço do OpenCode.

### Instale diretamente do GitHub

Para instalar a versão mais recente da branch padrão:

```sh
opencode plugin add github:BraveOtter/opencode-design-system
```

Para fixar uma versão marcada do GitHub, substitua `<tag>` pela tag desejada:

```sh
opencode plugin add github:BraveOtter/opencode-design-system#<tag>
```

### Use um checkout local

Clone o repositório, instale as dependências de desenvolvimento e compile:

```sh
npm install
npm run build
```

Depois, aponte o OpenCode para o diretório do checkout (ajuste o caminho relativo ao seu projeto):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["../opencode-design-system"]
}
```

O repositório também contém um entrypoint local opcional para testes em `plugins/local/index.js`; ele não é carregado automaticamente e não faz parte do pacote npm.

## Comece agora

Crie um sistema a partir de uma direção visual:

```text
/design-system Um espaço de trabalho tranquilo e compacto, com verdes suaves, superfícies nítidas e sem gradientes.
```

Se o projeto já tiver uma interface, peça ao agente para analisá-la primeiro. Ele explicará o que encontrou e perguntará se você quer documentar a identidade existente ou começar do zero antes de criar qualquer arquivo:

```text
/design-system Analise a interface deste app e me ajude a documentar sua linguagem visual atual.
```

Para projetar uma tela sem pedir que o plugin implemente código de UI:

```text
/design-screen Gestão de usuários com busca, filtros, convites e estados vazios.
```

Também é possível pedir uma especificação de tela em linguagem natural, sem usar `/design-screen`. Quando existe um manifest, o plugin direciona o agente para o `AGENTS.md` do projeto e para as orientações relevantes do sistema de design.

## Comandos

| Comando | O que faz |
| --- | --- |
| `/design-system [ideia]` | Criar um sistema em colaboração ou conversar sobre como documentar uma UI existente. |
| `/design-system/update [alteração]` | Aplicar uma mudança semântica versionada e identificar a documentação dependente. |
| `/design-system/preview` | Gerar novamente a prévia interativa a partir dos arquivos estruturados. |
| `/design-system/check` | Fazer uma verificação heurística e somente leitura de possíveis divergências entre os estilos de UI e os tokens documentados. |
| `/design-screen [tela]` | Salvar uma especificação de tela pronta para implementação, sem escrever código de UI do app. |

O plugin também registra as ferramentas `design_system_create`, `design_system_read`, `design_system_analyze`, `design_system_update`, `design_system_preview`, `design_system_check` e `design_system_screen_spec` para o agente usar quando necessário.

## Como funciona

### Um fluxo cuidadoso para produtos existentes

A ferramenta `design_system_analyze` lê possíveis fontes de UI e estilos, configurações reconhecidas de frameworks e dependências declaradas. Ela resume evidências como variáveis CSS, cores, raios, espaçamento, breakpoints responsivos e possíveis componentes. A análise é limitada, ignora diretórios de dependências e build, não segue links simbólicos e não modifica os arquivos lidos. Os resultados são indícios — não provas de que uma diferença seja um erro.

O agente explica as incertezas e pergunta antes de normalizar decisões visuais importantes ou ambíguas. Analisar não significa ter permissão para redesenhar ou editar o código da aplicação.

### Proteção dos arquivos do projeto

Criar um sistema grava um novo diretório `design-system/` e adiciona ou atualiza somente o bloco gerenciado pelo plugin no `AGENTS.md` da raiz. Se `design-system/` já contiver arquivos, a criação se recusa a substituí-los. As atualizações fazem alterações deliberadas nos artefatos do sistema; as ferramentas integradas de análise e verificação nunca editam os arquivos de UI do app.

As instruções gerenciadas do `AGENTS.md` são portáveis: ensinam o OpenCode e outros agentes de programação a encontrar as fontes independentes de framework e carregar apenas o necessário para cada tarefa. O plugin não copia agentes, comandos nem skills para o projeto.

### Uma fonte de verdade portável

O diretório gerado normalmente tem esta estrutura:

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

AGENTS.md  # O conteúdo existente é preservado fora do bloco gerenciado.
```

O manifest indexa temas, versões, arquivos e referências de tokens declaradas por cada componente e padrão. Os sistemas começam em `0.1.0` com a versão de schema `1.0.0`; o status pode ser `draft`, `review` ou `stable`.

Os tokens usam caminhos semânticos e podem definir vários temas:

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

O vocabulário pode crescer para incluir tipografia, layout, elevação, movimento, breakpoints, foco e estados. Componentes descrevem propósito, variantes, tokens, comportamento, acessibilidade, comportamento responsivo e relações. Padrões documentam composições úteis, como formulários, navegação, filtros, tabelas e estados vazios.

### Atualizações significativas e versionadas

`/design-system/update` lê o manifest e os documentos relevantes antes de alterar o sistema. Por padrão, uma atualização de token semântico aplica o caminho a todos os temas; use o prefixo `themes.<name>.` para alterar apenas um tema. A atualização registra a justificativa, encontra os dependentes declarados, atualiza a documentação relevante e gera novamente a prévia.

O impacto na versão do sistema de design segue estas regras:

- **PATCH** — correções compatíveis ou mudanças de documentação.
- **MINOR** — novas adições compatíveis, como um token, componente ou padrão.
- **MAJOR** — mudanças que podem quebrar contratos de design existentes.

Essas versões pertencem ao sistema de design gerado no projeto, não ao pacote npm do plugin. Por padrão, sistemas atualizados voltam para `draft` para que uma pessoa possa revisá-los.

## Prévia interativa

`design-system/preview/index.html` é gerado a partir do manifest, dos tokens e das especificações de componentes e padrões. Ele inclui amostras de tokens, exemplos de componentes, troca de tema quando há mais de um e exemplos interativos. Há foco visível para teclado e suporte a `prefers-reduced-motion`.

Gere novamente no OpenCode com `/design-system/preview` ou, sem o plugin, a partir da raiz do projeto:

```sh
node design-system/tools/generate-preview.mjs
```

O renderer independente não tem dependências externas. Edite os arquivos estruturados em Markdown e JSON — não o HTML gerado — para alterar o sistema.

## Desenvolvimento e testes

```sh
npm install
npm run typecheck
npm test
npm run build
```

Os testes cobrem um fluxo integrado em um projeto temporário, incluindo análise somente leitura, criação e preservação de arquivos do usuário, atualização do bloco gerenciado do `AGENTS.md`, especificações de tela, atualizações de tokens entre temas, prévias, verificações e segurança de caminhos.

## Publicar uma versão

O workflow do GitHub Actions `Publish to npm` publica quando uma tag `vX.Y.Z` é enviada, depois que as verificações passam e a tag corresponde à versão em `package.json`. Antes da primeira publicação, configure o Trusted Publishing no npm para o repositório `BraveOtter/opencode-design-system` e o workflow `publish.yml`, permitindo também a ação direta `npm publish`. O workflow usa OIDC, então não é necessário armazenar um token de publicação do npm no GitHub; além disso, o npm gera automaticamente a atestação de proveniência para este repositório público.

Para atualizar a versão do pacote e enviar o commit e a tag:

```sh
npm version patch # ou minor / major
git push --follow-tags
```

## Documentação

- [Guia de plugins do OpenCode v2](https://opencode.ai/v2/docs/build/plugins)
- [Configuração de plugins do OpenCode](https://opencode.ai/v2/docs/plugins)
- [Comandos do OpenCode](https://opencode.ai/v2/docs/commands)
- [Instruções do OpenCode e `AGENTS.md`](https://opencode.ai/v2/docs/instructions)
- [Referência da API de plugins](https://opencode.ai/v2/docs/api)
- [Pacote npm](https://www.npmjs.com/package/opencode-design-system)
- [Relatar um problema](https://github.com/BraveOtter/opencode-design-system/issues)

## Licença

Este projeto está licenciado sob a [Licença MIT](https://github.com/BraveOtter/opencode-design-system/blob/main/LICENSE).
