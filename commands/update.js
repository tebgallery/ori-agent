'use strict';

const { execSync } = require('child_process');
const chalk = require('chalk');

const PACKAGE_URL = 'https://github.com/tebgallery/ori-agent/archive/refs/heads/release-1.0.tar.gz';

async function update() {
  console.log(chalk.cyan('ℹ'), 'Buscando última versión...\n');

  try {
    execSync(`npm install -g ${PACKAGE_URL}`, { stdio: 'inherit' });
    console.log('');
    console.log(chalk.green('✔'), 'ori actualizado correctamente.');
  } catch (err) {
    console.log('');
    console.error(chalk.red('✖'), `Error al actualizar: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { update };
