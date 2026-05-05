#!/usr/bin/env node
'use strict';

const path = require('path');
const chalk = require('chalk');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const [,, command, ...args] = process.argv;

if (!command) {
  console.log(`Uso: ori <comando> [args]`);
  console.log(`  start [workItemId]   Inicia una tarea de desarrollo`);
  process.exit(0);
}

if (command === 'start') {
  const workItemId = args[0] && !isNaN(Number(args[0])) ? args[0] : null;
  const { loadOrCreateConfig, ensureOrgProject, ensurePat, ensureWorkDir } = require('./utils/config');
  const { start } = require('./commands/start');

  const config = loadOrCreateConfig(CONFIG_PATH);

  ensureOrgProject(config, CONFIG_PATH)
    .then((cfg) => ensurePat(cfg, CONFIG_PATH))
    .then((cfg) => ensureWorkDir(cfg, CONFIG_PATH))
    .then((cfg) => start(workItemId, cfg, CONFIG_PATH))
    .catch((err) => {
      console.error(chalk.red('✖'), `Error inesperado: ${err.message}`);
      process.exit(1);
    });
} else {
  console.error(chalk.red('✖'), `Comando desconocido: "${command}"`);
  process.exit(1);
}
