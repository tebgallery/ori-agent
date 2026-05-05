'use strict';

const axios = require('axios');

class AuthError extends Error {
  constructor() {
    super('PAT inválido o expirado');
    this.name = 'AuthError';
  }
}

function createClient(config) {
  const token = Buffer.from(`:${config.pat}`).toString('base64');
  const client = axios.create({
    baseURL: `https://dev.azure.com/${config.organization}/${config.project}/_apis`,
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    },
    params: {
      'api-version': '7.1',
    },
  });

  client.interceptors.response.use(null, (err) => {
    const status = err.response && err.response.status;
    if (status === 401 || status === 203 || status === 403) throw new AuthError();
    throw err;
  });

  return client;
}

async function getWorkItem(config, id) {
  const client = createClient(config);
  const response = await client.get(`/wit/workItems/${id}`);
  const fields = response.data.fields;
  return {
    id,
    title: fields['System.Title'],
    type: fields['System.WorkItemType'],
    state: fields['System.State'],
    description: fields['System.Description'] || '',
  };
}

async function getRepositories(config) {
  const client = createClient(config);
  const response = await client.get('/git/repositories');
  return response.data.value.map((repo) => ({
    id: repo.id,
    name: repo.name,
    remoteUrl: repo.remoteUrl,
  }));
}

module.exports = { getWorkItem, getRepositories, AuthError };
