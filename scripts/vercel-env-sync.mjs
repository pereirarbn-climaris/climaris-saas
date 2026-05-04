#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const HELP = `
Sincroniza variaveis do arquivo .env para um projeto Vercel.

Uso:
  node scripts/vercel-env-sync.mjs [--env-file=.env] [--targets=development,preview,production] [--apply] [--update]

Flags:
  --env-file=PATH          Arquivo .env de origem (padrao: .env)
  --targets=LISTA          Ambientes separados por virgula (padrao: development,preview,production)
  --apply                  Aplica alteracoes no Vercel (sem isso roda em dry-run)
  --update                 Atualiza variaveis existentes com valor diferente (delete + create)
  --include=LISTA          Sincroniza apenas as chaves informadas (separadas por virgula)
  --exclude=LISTA          Ignora as chaves informadas (separadas por virgula)
  --prefix=VALOR           Sincroniza apenas chaves com esse prefixo
  --help                   Exibe esta ajuda

Variaveis necessarias no ambiente:
  VERCEL_TOKEN             Token da Vercel
  VERCEL_PROJECT_ID        ID ou nome do projeto

Opcional:
  VERCEL_TEAM_ID           Team ID (para projetos de time)
`;

function parseArg(name, fallback = "") {
  const exact = process.argv.find((arg) => arg === name);
  if (exact) return "true";
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function parseList(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDotEnv(content) {
  const out = new Map();
  const lines = content.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const exportLine = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIdx = exportLine.indexOf("=");
    if (eqIdx <= 0) continue;

    const key = exportLine.slice(0, eqIdx).trim();
    let value = exportLine.slice(eqIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out.set(key, value);
  }
  return out;
}

async function vercelRequest(path, init = {}) {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token) {
    throw new Error("Faltou VERCEL_TOKEN no ambiente.");
  }

  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erro Vercel ${response.status} em ${path}: ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function listProjectEnv(projectId, target) {
  const encodedProject = encodeURIComponent(projectId);
  const payload = await vercelRequest(
    `/v10/projects/${encodedProject}/env?target=${encodeURIComponent(target)}&decrypt=true`
  );
  return payload.envs || [];
}

async function createProjectEnv(projectId, key, value, target) {
  const encodedProject = encodeURIComponent(projectId);
  return vercelRequest(`/v10/projects/${encodedProject}/env`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: [target],
    }),
  });
}

async function removeProjectEnv(projectId, envId) {
  const encodedProject = encodeURIComponent(projectId);
  const encodedEnvId = encodeURIComponent(envId);
  return vercelRequest(`/v10/projects/${encodedProject}/env/${encodedEnvId}`, {
    method: "DELETE",
  });
}

function redactedInfo(value) {
  if (!value) return "(vazio)";
  return `${"*".repeat(Math.min(value.length, 12))} (${value.length} chars)`;
}

async function main() {
  if (parseArg("--help") === "true") {
    console.log(HELP.trim());
    process.exit(0);
  }

  const envFile = parseArg("--env-file", ".env");
  const targets = parseList(parseArg("--targets", "development,preview,production"));
  const doApply = parseArg("--apply") === "true";
  const allowUpdate = parseArg("--update") === "true";
  const includeKeys = new Set(parseList(parseArg("--include", "")));
  const excludeKeys = new Set(parseList(parseArg("--exclude", "")));
  const prefix = parseArg("--prefix", "");
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!projectId) {
    throw new Error("Faltou VERCEL_PROJECT_ID no ambiente.");
  }

  const raw = await readFile(envFile, "utf8");
  const allVars = parseDotEnv(raw);

  const localVars = [...allVars.entries()].filter(([key]) => {
    if (includeKeys.size > 0 && !includeKeys.has(key)) return false;
    if (excludeKeys.has(key)) return false;
    if (prefix && !key.startsWith(prefix)) return false;
    return true;
  });

  if (localVars.length === 0) {
    console.log("Nenhuma variavel elegivel para sincronizar.");
    return;
  }

  console.log(doApply ? "Modo APPLY habilitado." : "Modo DRY-RUN (nenhuma alteracao sera enviada).");
  console.log(`Projeto: ${projectId}`);
  console.log(`Ambientes: ${targets.join(", ")}`);
  console.log(`Variaveis locais candidatas: ${localVars.length}`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const target of targets) {
    const existing = await listProjectEnv(projectId, target);
    const byKey = new Map(existing.map((item) => [item.key, item]));

    console.log(`\n[${target}] existentes: ${existing.length}`);

    for (const [key, value] of localVars) {
      const found = byKey.get(key);
      if (!found) {
        created += 1;
        if (doApply) {
          await createProjectEnv(projectId, key, value, target);
          console.log(` + criado ${key}`);
        } else {
          console.log(` + criaria ${key}`);
        }
        continue;
      }

      const current = typeof found.value === "string" ? found.value : "";
      if (current === value) {
        unchanged += 1;
        continue;
      }

      if (!allowUpdate) {
        skipped += 1;
        console.log(
          ` ~ existente diferente ${key} (atual: ${redactedInfo(current)} | local: ${redactedInfo(value)})`
        );
        continue;
      }

      updated += 1;
      if (doApply) {
        await removeProjectEnv(projectId, found.id);
        await createProjectEnv(projectId, key, value, target);
        console.log(` * atualizado ${key}`);
      } else {
        console.log(` * atualizaria ${key}`);
      }
    }
  }

  console.log("\nResumo:");
  console.log(` - criadas: ${created}`);
  console.log(` - atualizadas: ${updated}`);
  console.log(` - sem alteracao: ${unchanged}`);
  console.log(` - puladas (existente diferente sem --update): ${skipped}`);
}

main().catch((error) => {
  console.error(`Falha: ${error.message}`);
  process.exit(1);
});
