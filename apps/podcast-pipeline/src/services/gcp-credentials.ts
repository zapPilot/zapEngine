export interface GcpServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id: string;
}

export type GcpClientOptions =
  | { credentials: GcpServiceAccountCredentials; projectId: string }
  | { keyFilename: string }
  | undefined;

export function resolveGcpClientOptions(): GcpClientOptions {
  const rawCredentials = process.env['GOOGLE_APPLICATION_CREDENTIALS_BASE64'];
  const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS']?.trim();
  if (!rawCredentials) {
    return credentialsPath ? { keyFilename: credentialsPath } : undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(rawCredentials, 'base64').toString('utf8'));
  } catch {
    throw new Error(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: expected base64-encoded service account JSON',
    );
  }

  if (!isServiceAccountCredentials(parsed)) {
    throw new Error(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: service account JSON must include client_email, private_key, and project_id',
    );
  }

  return {
    credentials: parsed,
    projectId: parsed.project_id,
  };
}

function isServiceAccountCredentials(
  value: unknown,
): value is GcpServiceAccountCredentials {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { client_email?: unknown }).client_email === 'string' &&
    typeof (value as { private_key?: unknown }).private_key === 'string' &&
    typeof (value as { project_id?: unknown }).project_id === 'string'
  );
}
