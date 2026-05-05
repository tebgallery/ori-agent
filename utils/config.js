'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { askInput, confirm } = require('./prompt');

function saveConfig(configPath, config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function loadOrCreateConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    const empty = { organization: '', project: '', pat: '', workDir: '', repoAliases: {} };
    saveConfig(configPath, empty);
    return empty;
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function showPatInstructions(organization) {
  console.log('');
  console.log(chalk.cyan('Para obtener tu PAT de Azure DevOps:'));
  console.log(chalk.gray(`  1. Abrí: https://dev.azure.com/${organization}/_usersSettings/tokens`));
  console.log(chalk.gray('  2. Hacé clic en "+ New Token"'));
  console.log(chalk.gray('  3. Permisos necesarios:'));
  console.log(chalk.gray('       • Code        → Read & Write'));
  console.log(chalk.gray('       • Work Items  → Read'));
  console.log('');
}

async function ensureOrgProject(config, configPath) {
  let changed = false;

  if (!config.organization) {
    console.log(chalk.cyan('ℹ'), 'Configuración inicial de Azure DevOps\n');
    config.organization = await askInput('Ingresá el nombre de la organización (ej: mi-empresa):');
    changed = true;
  }

  if (!config.project) {
    config.project = await askInput('Ingresá el nombre del proyecto (ej: MiProyecto):');
    changed = true;
  }

  if (changed) {
    saveConfig(configPath, config);
    console.log(chalk.green('✔'), 'Organización y proyecto guardados\n');
  }

  return config;
}

async function ensurePat(config, configPath) {
  if (config.pat && config.pat !== 'TU_PAT_AQUI') return config;

  showPatInstructions(config.organization);
  const pat = await askInput('Ingresá tu PAT:');
  config.pat = pat;
  saveConfig(configPath, config);
  console.log(chalk.green('✔'), 'PAT guardado\n');
  return config;
}

async function refreshPat(config, configPath) {
  console.log('');
  console.log(chalk.yellow('⚠'), 'El PAT es inválido o expiró.');
  showPatInstructions(config.organization);
  const pat = await askInput('Ingresá tu nuevo PAT:');
  config.pat = pat;
  saveConfig(configPath, config);
  console.log(chalk.green('✔'), 'PAT actualizado\n');
  return config;
}

async function askWorkDir() {
  const dir = await askInput('Ingresá la ruta donde se clonarán los repositorios:');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(chalk.green('✔'), `Directorio creado: ${dir}`);
  }
  return dir;
}

async function ensureWorkDir(config, configPath) {
  if (!config.workDir) {
    console.log(chalk.cyan('ℹ'), 'No hay ruta configurada para los repositorios.');
    config.workDir = await askWorkDir();
    saveConfig(configPath, config);
    console.log(chalk.green('✔'), `Ruta guardada: ${config.workDir}\n`);
    return config;
  }

  const useCurrent = await confirm(
    `Ruta de repositorios: ${chalk.bold(config.workDir)} — ¿usar esta ruta?`
  );

  if (!useCurrent) {
    config.workDir = await askWorkDir();
    saveConfig(configPath, config);
    console.log(chalk.green('✔'), `Ruta actualizada: ${config.workDir}\n`);
  }

  return config;
}

module.exports = { loadOrCreateConfig, ensureOrgProject, ensurePat, refreshPat, ensureWorkDir, saveConfig };
