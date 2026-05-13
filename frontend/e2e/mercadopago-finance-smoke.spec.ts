import { expect, test } from "@playwright/test";

test.describe("Mercado Pago — rotas financeiras", () => {
  test("rota Wallet sem token leva à tela de login", async ({ page }) => {
    await page.goto("/app/finance/mercadopago-wallet?preference_id=pref_demo_123");
    await page.waitForURL(/\/login(\?|$)/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("rota checkout iframe sem token leva à tela de login", async ({ page }) => {
    const checkoutUrl = encodeURIComponent("https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=demo");
    await page.goto(`/app/finance/mercadopago-checkout?checkout_url=${checkoutUrl}`);
    await page.waitForURL(/\/login(\?|$)/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
