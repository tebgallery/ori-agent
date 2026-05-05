'use strict';

const fs = require('fs');
const chalk = require('chalk');
const { askInput, confirm, selectFromList } = require('./prompt');

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

function maskPat(pat) {
  if (!pat || pat.length < 6) return '(no configurado)';
  return '••••••••••••' + pat.slice(-4);
}

function isFirstRun(config) {
  return !config.organization && !config.project && !config.pat && !config.workDir;
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

async function askWorkDir(current) {
  const dir = await askInput(
    current
      ? `Nueva ruta de repositorios (actual: ${current}):`
      : 'Ingresá la ruta donde se clonarán los repositorios:'
  );
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(chalk.green('✔'), `Directorio creado: ${dir}`);
  }
  return dir;
}

async function runFirstSetup(config, configPath) {
  console.log(chalk.cyan.bold('\n  Configuración inicial de ori\n'));

  config.organization = await askInput('Organización de Azure DevOps (ej: mi-empresa):');
  config.project      = await askInput('Proyecto de Azure DevOps (ej: MiProyecto):');

  showPatInstructions(config.organization);
  config.pat     = await askInput('PAT:');
  config.workDir = await askWorkDir(null);

  saveConfig(configPath, config);
  console.log(chalk.green('\n✔ Configuración guardada\n'));
  return config;
}

async function reviewConfig(config, configPath) {
  console.log('');
  console.log(chalk.cyan('  Configuración actual:'));
  console.log(chalk.gray(`    Organización:  ${config.organization || '(no configurado)'}`));
  console.log(chalk.gray(`    Proyecto:      ${config.project || '(no configurado)'}`));
  console.log(chalk.gray(`    PAT:           ${maskPat(config.pat)}`));
  console.log(chalk.gray(`    Repositorios:  ${config.workDir || '(no configurado)'}`));
  console.log('');

  const modify = await confirm('¿Modificar algún parámetro?');
  if (!modify) return config;

  const field = await selectFromList('¿Qué querés modificar?', [
    { name: 'Organización',       value: 'organization' },
    { name: 'Proyecto',           value: 'project' },
    { name: 'PAT',                value: 'pat' },
    { name: 'Ruta repositorios',  value: 'workDir' },
  ]);

  if (field === 'pat') {
    showPatInstructions(config.organization);
    config.pat = await askInput('Nuevo PAT:');
  } else if (field === 'workDir') {
    config.workDir = await askWorkDir(config.workDir);
  } else {
    config[field] = await askInput(
      `Nuevo valor para ${field === 'organization' ? 'organización' : 'proyecto'}:`
    );
  }

  saveConfig(configPath, config);
  console.log(chalk.green('✔'), 'Parámetro actualizado\n');
  return config;
}

async function setupConfig(config, configPath) {
  if (isFirstRun(config)) {
    return runFirstSetup(config, configPath);
  }
  return reviewConfig(config, configPath);
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

module.exports = { loadOrCreateConfig, setupConfig, refreshPat, saveConfig };
