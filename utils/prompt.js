'use strict';

const inquirer = require('inquirer');

function clearScreen() {
  process.stdout.write('\x1Bc');
}

async function selectFromList(message, choices, header = null) {
  clearScreen();
  if (header) console.log(header + '\n');
  const { selection } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selection',
      message,
      choices,
    },
  ]);
  return selection;
}

async function confirm(message) {
  clearScreen();
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: false,
    },
  ]);
  return confirmed;
}

async function askInput(message) {
  clearScreen();
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      validate: (v) => v.trim().length > 0 || 'Ingresá un valor',
    },
  ]);
  return value.trim();
}

module.exports = { selectFromList, confirm, askInput };
