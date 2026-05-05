'use strict';

const path = require('path');
const fs = require('fs');
const execa = require('execa');

function repoPath(workDir, repoName) {
  return path.join(workDir, repoName);
}

function isCloned(workDir, repoName) {
  const gitDir = path.join(workDir, repoName, '.git');
  return fs.existsSync(gitDir);
}

async function clone(remoteUrl, workDir, repoName) {
  await execa('git', ['clone', remoteUrl, repoName], { cwd: workDir });
}

async function fetchAll(repoDir) {
  await execa('git', ['fetch', '--all', '--prune'], { cwd: repoDir });
}

async function getRemoteBranches(repoDir) {
  const { stdout } = await execa('git', ['branch', '-r'], { cwd: repoDir });
  return stdout
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b && !b.includes('HEAD'))
    .map((b) => b.replace(/^origin\//, ''));
}

async function getRemoteBranchesWithInfo(repoDir) {
  const { stdout } = await execa('git', [
    'for-each-ref',
    '--sort=-committerdate',
    'refs/remotes/origin',
    '--format=%(refname:short)|%(committerdate:short)|%(subject)',
  ], { cwd: repoDir });

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.includes('/HEAD'))
    .map((line) => {
      const [ref, date, ...rest] = line.split('|');
      const branch = ref.replace(/^origin\//, '');
      const subject = rest.join('|').slice(0, 60);
      return { branch, date, subject };
    });
}

async function checkoutAndPull(repoDir, branch) {
  await execa('git', ['checkout', branch], { cwd: repoDir });
  await execa('git', ['pull', 'origin', branch], { cwd: repoDir });
}

async function remoteBranchExists(repoDir, branchName) {
  const { stdout } = await execa('git', ['branch', '-r'], { cwd: repoDir });
  return stdout
    .split('\n')
    .map((b) => b.trim())
    .some((b) => b === `origin/${branchName}`);
}

async function createBranch(repoDir, branchName) {
  await execa('git', ['checkout', '-b', branchName], { cwd: repoDir });
}

async function checkoutBranch(repoDir, branchName) {
  await execa('git', ['checkout', branchName], { cwd: repoDir });
}

async function discardChanges(repoDir) {
  await execa('git', ['checkout', '--', '.'], { cwd: repoDir });
  await execa('git', ['clean', '-fd'], { cwd: repoDir });
}

async function stashChanges(repoDir, message) {
  await execa('git', ['stash', 'push', '-u', '-m', message], { cwd: repoDir });
}

async function getDiff(repoDir) {
  const { stdout } = await execa('git', ['diff', 'HEAD'], { cwd: repoDir });
  return stdout;
}

module.exports = {
  repoPath,
  isCloned,
  clone,
  fetchAll,
  getRemoteBranches,
  getRemoteBranchesWithInfo,
  checkoutAndPull,
  remoteBranchExists,
  createBranch,
  checkoutBranch,
  discardChanges,
  stashChanges,
  getDiff,
};
