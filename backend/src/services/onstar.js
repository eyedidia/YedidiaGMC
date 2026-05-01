'use strict';

const axios = require('axios');

// ---------------------------------------------------------------------------
// GM / OnStar OAuth2 + command endpoints
// ---------------------------------------------------------------------------
const GM_AUTH_URL = 'https://auth.gm.com/as/token.oauth2';
const GM_API_BASE = 'https://api.gm.com/api/v1';

// How long (ms) to wait before giving up on GM API calls
const REQUEST_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// authenticateGM
// Exchanges username + password for an access/refresh token pair via GM
// OAuth2 Resource Owner Password Credentials grant.
// Returns: { success, accessToken, refreshToken, expiresAt, error }
// ---------------------------------------------------------------------------
async function authenticateGM(username, password) {
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('username', username);
    params.append('password', password);
    params.append('client_id', 'gdc_ios');
    params.append('scope', 'openid profile email vehicle_data remote_commands');

    const response = await axios.post(GM_AUTH_URL, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const { access_token, refresh_token, expires_in } = response.data;

    if (!access_token) {
      return { success: false, error: 'No access token received from GM' };
    }

    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    return {
      success: true,
      accessToken: access_token,
      refreshToken: refresh_token || null,
      expiresAt,
    };
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return { success: false, error: 'GM API unreachable', unreachable: true };
    }
    if (err.response) {
      const status = err.response.status;
      if (status === 400 || status === 401) {
        return { success: false, error: 'Invalid GM credentials' };
      }
      return {
        success: false,
        error: `GM API returned HTTP ${status}`,
      };
    }
    return { success: false, error: err.message || 'Unknown error contacting GM' };
  }
}

// ---------------------------------------------------------------------------
// sendCommand
// Sends a remote command (e.g. LOCK, UNLOCK, START, STOP) to a vehicle.
// Returns: { success, commandId, status, error }
// ---------------------------------------------------------------------------
async function sendCommand(accessToken, vin, command) {
  try {
    const url = `${GM_API_BASE}/vehicles/${vin}/commands/${command.toLowerCase()}`;

    const response = await axios.post(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    );

    const data = response.data || {};
    return {
      success: true,
      commandId: data.commandId || data.id || null,
      status: data.status || 'sent',
    };
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return { success: false, error: 'GM API unreachable', unreachable: true };
    }
    if (err.response) {
      const status = err.response.status;
      if (status === 401) {
        return { success: false, error: 'GM access token expired or invalid' };
      }
      if (status === 404) {
        return { success: false, error: 'Vehicle not found in GM system' };
      }
      return { success: false, error: `GM API returned HTTP ${status}` };
    }
    return { success: false, error: err.message || 'Unknown error sending command' };
  }
}

// ---------------------------------------------------------------------------
// getVehicleStatus
// Fetches current vehicle status / diagnostics from GM API.
// Returns: { success, data, error }
// ---------------------------------------------------------------------------
async function getVehicleStatus(accessToken, vin) {
  try {
    const url = `${GM_API_BASE}/vehicles/${vin}/status`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    return { success: true, data: response.data };
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return { success: false, error: 'GM API unreachable', unreachable: true };
    }
    if (err.response) {
      return {
        success: false,
        error: `GM API returned HTTP ${err.response.status}`,
      };
    }
    return { success: false, error: err.message || 'Unknown error fetching vehicle status' };
  }
}

// ---------------------------------------------------------------------------
// verifyGMCredentials
// Lightweight credential check — attempts to obtain a token and immediately
// discards it.  Returns { valid, message }.
// ---------------------------------------------------------------------------
async function verifyGMCredentials(username, password) {
  if (!username || !password) {
    return { valid: false, message: 'Username and password are required' };
  }

  const result = await authenticateGM(username, password);

  if (result.unreachable) {
    // Cannot reach GM — treat as "saved but unverified"
    return {
      valid: true,
      message: 'Credentials saved (GM API unavailable — will verify when reachable)',
      unverified: true,
    };
  }

  if (result.success) {
    return { valid: true, message: 'GM credentials verified successfully' };
  }

  return { valid: false, message: result.error || 'Invalid GM credentials' };
}

module.exports = {
  authenticateGM,
  sendCommand,
  getVehicleStatus,
  verifyGMCredentials,
};
