function env(name, fallback = '') {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function repoBase() {
  const owner = env('GITHUB_OWNER');
  const repo = env('GITHUB_REPO');
  return `https://api.github.com/repos/${owner}/${repo}`;
}

async function gh(path, options = {}) {
  const res = await fetch(`${repoBase()}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env('GITHUB_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  if (res.status === 404) return {notFound: true, status: 404};
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error(body?.message || `GitHub API error ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

function branch() { return process.env.GITHUB_BRANCH || 'main'; }
function encodePath(path) { return path.split('/').map(encodeURIComponent).join('/'); }

async function getContent(path) {
  const body = await gh(`/contents/${encodePath(path)}?ref=${encodeURIComponent(branch())}`);
  if (body?.notFound) return null;
  const content = Buffer.from(body.content || '', 'base64').toString('utf8');
  return {content, sha: body.sha};
}

async function getJson(path, fallback = null) {
  const file = await getContent(path);
  if (!file) return {data: fallback, sha: null, exists: false};
  return {data: JSON.parse(file.content), sha: file.sha, exists: true};
}

async function putContent(path, content, message, sha = null) {
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: branch()
  };
  if (sha) body.sha = sha;
  return gh(`/contents/${encodePath(path)}`, {method: 'PUT', body: JSON.stringify(body)});
}

async function putJson(path, data, message, sha = null) {
  return putContent(path, JSON.stringify(data, null, 2), message, sha);
}

async function upsertJson(path, data, message, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const current = await getJson(path, null);
      return await putJson(path, data, message, current.sha);
    } catch (e) {
      lastError = e;
      if (e.status !== 409 && e.status !== 422) break;
      await new Promise(r => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastError;
}

async function updateJsonWithShaRetry(path, fallback, updater, message, maxRetries = 5) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const current = await getJson(path, fallback);
      const next = await updater(current.data || fallback);
      return await putJson(path, next, message, current.sha);
    } catch (e) {
      lastError = e;
      if (e.status !== 409 && e.status !== 422) break;
      await new Promise(r => setTimeout(r, 180 * (i + 1)));
    }
  }
  throw lastError;
}

async function deleteContent(path, message) {
  const current = await getContent(path);
  if (!current) return null;
  return gh(`/contents/${encodePath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({message, sha: current.sha, branch: branch()})
  });
}

async function appendAdminLog(event) {
  try {
    await updateJsonWithShaRetry('admin/logs.json', [], logs => {
      const arr = Array.isArray(logs) ? logs : [];
      arr.push({time: new Date().toISOString(), ...event});
      return arr.slice(-500);
    }, `admin log: ${event.type || 'event'}`, 3);
  } catch (e) {
    console.warn('admin log failed', e.message);
  }
}

module.exports = { getJson, putJson, upsertJson, updateJsonWithShaRetry, deleteContent, appendAdminLog };
