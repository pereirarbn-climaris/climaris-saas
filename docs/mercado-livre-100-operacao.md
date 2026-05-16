# Mercado Livre (marketplace) — operação em produção e caminho para “100%”

Este documento consolida **checklist de deploy**, **política de estoque** e **roadmap técnico** (publicação rica, webhooks adicionais). Ajuste o código da integração (`mercado_livre_*`, router `/integrations/mercado-livre`, webhook) quando esses módulos estiverem presentes no repositório.

## 1. Checklist de produção (obrigatório antes de ir ao ar)

| Item | Variável / ação | Notas |
|------|-----------------|--------|
| URL pública da API | `API_PUBLIC_BASE_URL` ou `APP_PUBLIC_URL` HTTPS | O ML precisa alcançar `POST …/webhooks/mercado-livre/notifications` (ou o path que o router expuser). |
| Segredo do webhook (recomendado) | `MERCADO_LIVRE_NOTIFICATIONS_SHARED_SECRET` | Enviar o mesmo valor no header `X-ML-Webhook-Secret` ou query `?secret=` conforme implementação. |
| Redirect OAuth | `MERCADO_LIVRE_REDIRECT_URI` + app ML | Deve coincidir **byte a byte** com o cadastrado no painel do desenvolvedor ML. |
| Client ID / Secret | Por tenant (OAuth app) **ou** `MERCADO_LIVRE_CLIENT_ID` / `MERCADO_LIVRE_CLIENT_SECRET` no servidor | Credenciais por tenant evitam um único app para todos os clientes. |
| Escopos | `MERCADO_LIVRE_OAUTH_SCOPES` (opcional) | Padrão típico: `offline_access read write`. O app ML deve permitir os mesmos escopos. |
| Add-on na loja | Entitlement `mercado_livre` ativo | O `require_mercado_livre_marketplace` bloqueia a API sem isso. |

## 2. Política de estoque (escolha consciente)

| Modo | Variável / fluxo | Risco |
|------|-------------------|--------|
| Só manual | Utilizador chama **sync-stock** (ou equivalente) após mudar o ERP | Estoque no ML pode ficar defasado. |
| Baixa no pedido pago | `MERCADO_LIVRE_WEBHOOK_APPLY_STOCK=true` + webhook `orders_v2` | Implementação deve ler o toggle via `app.mercado_livre_settings.mercado_livre_webhook_apply_stock()` (ou equivalente). Dupla fonte de verdade se também alterarem stock manualmente no ERP sem refletir no ML. |
| Push automático ao guardar produto | `MERCADO_LIVRE_AUTO_PUSH_STOCK_ON_PRODUCT_SAVE=true` (a implementar no fluxo de save de produto) | `mercado_livre_auto_push_stock_on_product_save()` em `app/mercado_livre_settings.py`. Chamadas frequentes à API ML; rate limit e erros transientes precisam fila ou retry. |

**Recomendação:** documentar no runbook do tenant qual modo está ativo e treinar a equipa.

## 3. Publicação “de verdade” na API do ML (roadmap técnico)

O payload mínimo (título, categoria, preço, quantidade, fotos, `buying_mode`, `listing_type_id`, `condition`) **não basta** para muitas categorias MLB.

Código de apoio no repositório: `app/mercado_livre_publish_helpers.py` (`merge_listing_payload`, `shipping_mercado_envios_me2`) e toggles em `app/mercado_livre_settings.py`.

Implementação sugerida (quando existir o router de publish):

1. **Atributos obrigatórios** — `GET /categories/{category_id}/attributes` (ou recurso equivalente na API atual), filtrar por `tags` contendo `required` / `catalog_required` conforme documentação ML; mesclar no corpo do item como array `attributes` com `{ id, value_id | value_name }` e passar por `merge_listing_payload`.
2. **Garantia** — campo `sale_terms` ou atributos de garantia exigidos pela categoria.
3. **Logística** — objeto `shipping` (ex. `free_shipping`, `mode: "me2"` para Mercado Envios quando aplicável); validar com a conta e tipo de listing.
4. **Variações** — se o produto ERP tiver variações, mapear para `variations` do item; caso contrário, manter item simples.

Expor no `PUT/POST` de publicação campos opcionais no body (JSON): `attributes`, `shipping`, `sale_terms`, `variations` (ou sub-objeto `listing_overrides`) para o front ou integrações preencherem após wizard.

## 4. Webhooks — tópicos além dos quatro básicos

Hoje o desenho típico cobre: `questions`, `orders_v2`, `items`, `messages`. **Extensões úteis** (processamento mínimo: gravar payload + opcionalmente GET na API):

| Tópico (exemplos ML) | Ação mínima sugerida |
|----------------------|----------------------|
| `shipments` | Atualizar cache local de tracking / status de envio ligado ao pedido. |
| `payments` | Auditar pagamento; evitar duplicar lógica já em `orders_v2` se redundante. |
| `claims` / reclamações | Notificação interna (e-mail, fila) ou registo só na tabela de eventos para o painel. |
| `messages_post_purchase` (se distinto) | Unificar com handler de `messages` se a URL de recurso for compatível. |

Qualquer tópico sem handler específico deve continuar a **persistir o evento** (idempotente) para auditoria e reprocessamento.

## 5. Fora de escopo do ERP “típico”

Financeiro ML (taxas, repasses), mediações completas, devoluções end-to-end, Full/Flex/Coleta ao detalhe, reputação e campanhas ML — exigem produto próprio ou fase posterior.

## 6. Variáveis de ambiente (referência)

Defina no `.env` da API ou no orquestrador (Docker / systemd):

```bash
# OAuth (fallback global se não houver app por tenant)
MERCADO_LIVRE_CLIENT_ID=
MERCADO_LIVRE_CLIENT_SECRET=
MERCADO_LIVRE_REDIRECT_URI=
# MERCADO_LIVRE_OAUTH_SCOPES=offline_access read write

# Webhook
MERCADO_LIVRE_NOTIFICATIONS_SHARED_SECRET=
# MERCADO_LIVRE_WEBHOOK_APPLY_STOCK=true   # baixa ERP em pedido pago — ver secção 2

# Futuro: push automático ao alterar produto (implementar no serviço de produto)
# MERCADO_LIVRE_AUTO_PUSH_STOCK_ON_PRODUCT_SAVE=false
```

---

**Nota:** Se o clone não incluir ainda `app/mercado_livre_api.py`, `app/mercado_livre_webhook.py` e `app/routers/integrations_mercado_livre.py`, este ficheiro serve de especificação até o código ser integrado.
