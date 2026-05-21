# Módulo de Relatório de Estimativa x Reestimativa

## Arquitetura
O módulo segue a arquitetura em camadas visando uma separação clara de responsabilidades:
- **Routes:** Define os endpoints e os mapeia para os métodos do Controller.
- **Middlewares:** Segurança das rotas (validação do token Bearer JWT/PostgreSQL).
- **Controller:** Ponto de entrada das requisições. Recebe e valida o corpo da requisição utilizando `Zod` delegando em seguida o processamento.
- **Service:** Core da regra de negócio. Executa as orquestrações, cálculos (Tonelada = Área * TCH, variação) e direciona as saídas (JSON, Streaming de PDF ou Excel).
- **Repository:** Camada de acesso a dados usando API/PostgreSQL. Retorna os dados em estado "bruto" que serão trabalhados pelo Service.
- **Templates (PDF/Excel):** Geradores visuais separados e modulares (helpers para cabeçalho, tabelas, etc).
- **Utils/Constants:** Formatações e tipagens centrais.

## Endpoints Implementados (Base URL: `/api/relatorios/estimativa`)

1. **`GET /filtros`**: Retorna os filtros disponíveis.
2. **`POST /por-corte`**: Gera relatório em JSON (Padrão) caso `formatoSaida` não seja passado, agrupado por Propriedade -> Corte.
3. **`POST /por-fazenda-talhao`**: Gera relatório analítico (Fazenda -> Talhão) em JSON.
4. **`POST /exportar/pdf`**: Exige o payload com os filtros da tela. Obriga o retorno do sistema como um stream PDF (usando PDFKit). O tipo de relatório é herdado do campo `tipoRelatorio` no body.
5. **`POST /exportar/excel`**: Exige payload. Devolve stream XLSX (via ExcelJS).

## Payload de Exemplo (JSON POST Body)

```json
{
  "safra": "2025/2026",
  "empresaId": 1,
  "tipoPropriedade": ["PROPRIA", "PARCERIA"],
  "fazendaIds": [100, 200],
  "cortes": [1, 2, 3],
  "agruparPor": "CORTE",
  "tipoRelatorio": "POR_CORTE",
  "formatoSaida": "PDF"
}
```

## Setup no Render
1. Este repositório utiliza o `render.yaml` como "Web Service" executando `server.js`.
2. Para o PostgreSQL/JWT e Storage de mapas, revise as variáveis de ambiente no Render:
   - Chave: `DATABASE_URL`
   - Valor: string de conexão do PostgreSQL.
3. O deploy pode ser automatizado pelo Github e a API estará pronta no `/api/relatorios/...`
