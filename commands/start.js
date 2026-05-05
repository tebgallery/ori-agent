'use strict';

const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const chalk = require('chalk');
const execa = require('execa');
const ado = require('../services/azureDevOps');
const git = require('../services/git');
const { selectFromList, confirm, askInput } = require('../utils/prompt');
const { refreshPat } = require('../utils/config');
const { AuthError, ConfigError } = require('../services/azureDevOps');

const TYPE_PREFIXES = {
  Bug: 'bug',
  Feature: 'feature',
  'User Story': 'feature',
  Task: 'task',
  Hotfix: 'hotfix',
};

function buildBranchName(workItemType, workItemId, title) {
  const prefix = TYPE_PREFIXES[workItemType] ?? 'task';
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
  return `${prefix}/${workItemId}-${slug}`;
}

function ok(msg)   { console.log(chalk.green('✔'), msg); }
function fail(msg) { console.log(chalk.red('✖'), msg); }
function warn(msg) { console.log(chalk.yellow('⚠'), msg); }
function info(msg) { console.log(chalk.cyan('ℹ'), msg); }

const VSWHERE = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
const DEVENV_KNOWN_PATHS = [
  'C:\\Program Files\\Microsoft Visual Studio\\2026\\Professional\\Common7\\IDE\\devenv.exe',
  'C:\\Program Files\\Microsoft Visual Studio\\2026\\Enterprise\\Common7\\IDE\\devenv.exe',
  'C:\\Program Files\\Microsoft Visual Studio\\2026\\Community\\Common7\\IDE\\devenv.exe',
  'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\devenv.exe',
  'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\devenv.exe',
  'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe',
  'C:\\Program Files\\Microsoft Visual Studio\\2019\\Professional\\Common7\\IDE\\devenv.exe',
  'C:\\Program Files\\Microsoft Visual Studio\\2019\\Enterprise\\Common7\\IDE\\devenv.exe',
  'C:\\Program Files\\Microsoft Visual Studio\\2019\\Community\\Common7\\IDE\\devenv.exe',
];

async function findDevenv() {
  try {
    const { stdout } = await execa('where', ['devenv']);
    if (stdout.trim()) return 'devenv';
  } catch {}

  if (fs.existsSync(VSWHERE)) {
    try {
      const { stdout } = await execa(VSWHERE, ['-latest', '-find', 'Common7\\IDE\\devenv.exe']);
      const found = stdout.trim().split('\n')[0].trim();
      if (found && fs.existsSync(found)) return found;
    } catch {}
  }

  for (const p of DEVENV_KNOWN_PATHS) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

async function maybeOpenVisualStudio(repoDir) {
  const slnPath = findSlnFile(repoDir);
  if (!slnPath) return;
  const open = await confirm(`¿Desea abrir la solución en Visual Studio? (${path.basename(slnPath)})`);
  if (!open) return;

  const devenv = await findDevenv();
  if (!devenv) {
    warn('No se encontró Visual Studio instalado en esta máquina.');
    return;
  }

  const child = spawn(devenv, [slnPath], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', (err) => warn(`Error al abrir Visual Studio: ${err.message}`));
  child.unref();
  ok(`Abriendo ${path.basename(slnPath)} con Visual Studio...`);
}

function branchChoices(branchesInfo) {
  return branchesInfo.map((b) => ({
    name: `${b.branch.padEnd(35)} ${chalk.gray(`[${b.date}] ${b.subject}`)}`,
    value: b.branch,
  }));
}

function findSlnFile(dir, depth = 0) {
  if (depth > 2) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() && entry.name.endsWith('.sln')) {
      return path.join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      const found = findSlnFile(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}


function isDirtyTreeError(err) {
  return (
    err.exitCode === 1 &&
    (err.stderr || '').includes('would be overwritten by checkout')
  );
}

async function handleDirtyTree(repoDir) {
  warn('Hay cambios locales que impedirían el checkout.\n');

  const action = await selectFromList('¿Qué hacés con los cambios?', [
    { name: 'Guardar en stash (recuperable con git stash pop)', value: 'stash' },
    { name: 'Guardar cambios en archivo .patch y descartar', value: 'patch' },
    { name: chalk.red('Descartar todo (no recuperable)'), value: 'discard' },
  ]);

  if (action === 'stash') {
    const date = new Date().toISOString().slice(0, 10);
    await git.stashChanges(repoDir, `agente-${date}`);
    ok('Cambios guardados en stash. Recuperar con: git stash pop');
    return;
  }

  if (action === 'patch') {
    const diff = await git.getDiff(repoDir);
    if (!diff.trim()) {
      warn('No hay diff en archivos tracked. Solo hay archivos sin seguimiento — se descartarán.');
    } else {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const patchPath = path.join(repoDir, `cambios-${ts}.patch`);
      fs.writeFileSync(patchPath, diff, 'utf8');
      ok(`Patch guardado en: ${patchPath}`);
      info('Aplicar después con: git apply <archivo.patch>');
      warn('Archivos sin seguimiento (untracked) no se guardan en el patch — se descartarán.');
    }
    await git.discardChanges(repoDir);
    ok('Cambios descartados');
    return;
  }

  if (action === 'discard') {
    const sure = await confirm(
      chalk.red('¿Confirmar? Se perderán todos los cambios locales permanentemente.')
    );
    if (!sure) {
      fail('Operación cancelada por el usuario');
      process.exit(0);
    }
    await git.discardChanges(repoDir);
    ok('Cambios descartados');
  }
}

async function safeCheckoutAndPull(repoDir, branch) {
  try {
    await git.checkoutAndPull(repoDir, branch);
    ok(`Checkout ${branch} — actualizado con origin`);
  } catch (err) {
    if (!isDirtyTreeError(err)) {
      fail(`Error en checkout/pull de ${branch}: ${err.message}`);
      process.exit(1);
    }
    await handleDirtyTree(repoDir);
    try {
      await git.checkoutAndPull(repoDir, branch);
      ok(`Checkout ${branch} — actualizado con origin`);
    } catch (retryErr) {
      fail(`Error al reintentar checkout: ${retryErr.message}`);
      process.exit(1);
    }
  }
}

async function prepareRepo(config, configPath) {
  let repositories;
  try {
    repositories = await ado.getRepositories(config);
  } catch (err) {
    if (err instanceof AuthError) {
      config = await refreshPat(config, configPath);
      repositories = await ado.getRepositories(config);
    } else if (err instanceof ConfigError) {
      fail(err.message);
      process.exit(1);
    } else {
      fail(`No se pudo obtener repositorios: ${err.message}`);
      process.exit(1);
    }
  }

  const repoChoice = await selectFromList(
    'Seleccioná un repositorio:',
    repositories.map((r) => ({ name: r.name, value: r }))
  );

  const localName = (config.repoAliases && config.repoAliases[repoChoice.name]) || repoChoice.name;
  const repoDir = git.repoPath(config.workDir, localName);

  if (git.isCloned(config.workDir, repoChoice.name)) {
    ok(`Repo ya clonado en ${repoDir}`);
  } else {
    info(`Clonando ${repoChoice.name}...`);
    try {
      await git.clone(repoChoice.remoteUrl, config.workDir, repoChoice.name);
      ok(`Repo clonado en ${repoDir}`);
    } catch (err) {
      fail(`Error al clonar repositorio: ${err.message}`);
      process.exit(1);
    }
  }

  try {
    await git.fetchAll(repoDir);
    ok('git fetch --all --prune completado');
  } catch (err) {
    fail(`Error en git fetch: ${err.message}`);
    process.exit(1);
  }

  let branchesInfo;
  try {
    branchesInfo = await git.getRemoteBranchesWithInfo(repoDir);
  } catch (err) {
    fail(`Error al listar ramas remotas: ${err.message}`);
    process.exit(1);
  }

  let newestHeader = null;
  if (branchesInfo.length > 0) {
    const newest = branchesInfo[0];
    newestHeader =
      chalk.cyan('ℹ') + ` La rama con cambios más recientes es: ${chalk.bold(newest.branch)} ` +
      chalk.gray(`[${newest.date}] ${newest.subject}`);
  }

  return { repoChoice, repoDir, branchesInfo, newestHeader, config };
}

async function startWithWorkItem(workItemId, config, configPath) {
  let workItem;
  try {
    workItem = await ado.getWorkItem(config, workItemId);
    ok(`Work Item #${workItem.id}: "${workItem.title}" [${workItem.type}]`);
  } catch (err) {
    if (err instanceof AuthError) {
      config = await refreshPat(config, configPath);
      workItem = await ado.getWorkItem(config, workItemId);
      ok(`Work Item #${workItem.id}: "${workItem.title}" [${workItem.type}]`);
    } else {
      fail(`No se pudo obtener el Work Item #${workItemId}: ${err.message}`);
      process.exit(1);
    }
  }

  const { repoChoice, repoDir, branchesInfo, newestHeader, config: updatedConfig } = await prepareRepo(config, configPath);
  config = updatedConfig;

  const baseBranch = await selectFromList(
    '¿Desde qué rama querés partir?',
    branchChoices(branchesInfo),
    newestHeader
  );

  await safeCheckoutAndPull(repoDir, baseBranch);

  const branchName = buildBranchName(workItem.type, workItem.id, workItem.title);
  console.log(chalk.cyan('\nBranch a crear:'), chalk.bold(branchName));

  let existsRemote;
  try {
    existsRemote = await git.remoteBranchExists(repoDir, branchName);
  } catch (err) {
    fail(`Error al verificar ramas remotas: ${err.message}`);
    process.exit(1);
  }

  try {
    if (existsRemote) {
      warn('Branch ya existe en remoto. Haciendo checkout...');
      await git.checkoutBranch(repoDir, branchName);
    } else {
      await git.createBranch(repoDir, branchName);
    }
    ok(`Branch listo: ${chalk.bold(branchName)}\n`);
  } catch (err) {
    fail(`Error al crear/checkout branch: ${err.message}`);
    process.exit(1);
  }

  console.log(chalk.green.bold('¡Listo para desarrollar!'));
  console.log(chalk.gray(`  Repo:   ${repoDir}`));
  console.log(chalk.gray(`  Branch: ${branchName}`));

  await maybeOpenVisualStudio(repoDir);
}

async function startWithoutWorkItem(config, configPath) {
  warn('Sin Work Item ID — se trabajará en una rama existente\n');

  const { repoChoice, repoDir, branchesInfo, newestHeader } = await prepareRepo(config, configPath);

  const workingBranch = await selectFromList(
    '¿En qué rama tiene los últimos cambios?',
    branchChoices(branchesInfo),
    newestHeader
  );

  await safeCheckoutAndPull(repoDir, workingBranch);

  console.log(chalk.green.bold('\n¡Listo para desarrollar!'));
  console.log(chalk.gray(`  Repo:   ${repoDir}`));
  console.log(chalk.gray(`  Branch: ${workingBranch}`));

  await maybeOpenVisualStudio(repoDir);
}

async function start(workItemId, config, configPath) {
  let resolvedId = workItemId;

  if (!resolvedId) {
    const hasId = await confirm('¿Tenés el ID del Work Item?');
    if (hasId) {
      const input = await askInput('Ingresá el ID del Work Item:');
      if (isNaN(Number(input))) {
        fail('El ID debe ser numérico');
        process.exit(1);
      }
      resolvedId = input;
    }
  }

  if (resolvedId) {
    await startWithWorkItem(resolvedId, config, configPath);
  } else {
    await startWithoutWorkItem(config, configPath);
  }
}

module.exports = { start };
