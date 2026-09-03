import { z } from 'zod';

const FLY_MACHINES_API = 'https://api.machines.dev/v1';
const REQUEST_TIMEOUT_MS = 10_000;

const eventSchema = z.object({
  type: z.string().nullish(),
  status: z.string().nullish(),
  source: z.string().nullish(),
  timestamp: z.number().nullish(),
});

const machineSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  state: z.string().min(1),
  region: z.string().nullish(),
  instance_id: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  image_ref: z
    .object({
      repository: z.string().nullish(),
      tag: z.string().nullish(),
      digest: z.string().nullish(),
    })
    .nullish(),
  config: z
    .object({
      metadata: z.record(z.string(), z.unknown()).nullish(),
    })
    .passthrough()
    .nullish(),
  events: z.array(z.unknown()).optional(),
});

export interface FlyMachineEvent {
  type: string | null;
  status: string | null;
  source: string | null;
  at: string | null;
}

export interface FlyMachine {
  id: string;
  name: string | null;
  state: string;
  region: string | null;
  processGroup: string | null;
  instanceId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  image: {
    repository: string | null;
    tag: string | null;
    digest: string | null;
  } | null;
  events: FlyMachineEvent[];
}

export class FlyOpsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'FlyOpsHttpError';
  }
}

export interface FlyOpsClient {
  listMachines(
    app: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FlyMachine[]>;
}

export function createFlyOpsClient(input: {
  token: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}): FlyOpsClient {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const baseUrl = (input.baseUrl ?? FLY_MACHINES_API).replace(/\/$/, '');
  const timeoutMs = input.timeoutMs ?? REQUEST_TIMEOUT_MS;

  return {
    async listMachines(app: string, options = {}): Promise<FlyMachine[]> {
      const query = options.includeDeleted ? '?include_deleted=true' : '';
      const response = await fetchImpl(
        `${baseUrl}/apps/${encodeURIComponent(app)}/machines${query}`,
        {
          headers: {
            Authorization: `Bearer ${input.token}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (!response.ok) {
        throw new FlyOpsHttpError(
          `Fly Machines API list for ${app} failed (${response.status})`,
          response.status,
        );
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error(
          `Fly Machines API list for ${app} returned a non-array body`,
        );
      }

      return payload.flatMap((row) => {
        const parsed = machineSchema.safeParse(row);
        return parsed.success ? [toMachine(parsed.data)] : [];
      });
    },
  };
}

function toMachine(machine: z.infer<typeof machineSchema>): FlyMachine {
  const group = machine.config?.metadata?.['fly_process_group'];
  return {
    id: machine.id,
    name: machine.name ?? null,
    state: machine.state,
    region: machine.region ?? null,
    processGroup: typeof group === 'string' && group ? group : null,
    instanceId: machine.instance_id ?? null,
    createdAt: machine.created_at ?? null,
    updatedAt: machine.updated_at ?? null,
    image: machine.image_ref
      ? {
          repository: machine.image_ref.repository ?? null,
          tag: machine.image_ref.tag ?? null,
          digest: machine.image_ref.digest ?? null,
        }
      : null,
    events: (machine.events ?? [])
      .flatMap((row) => {
        const parsed = eventSchema.safeParse(row);
        if (!parsed.success) {
          return [];
        }
        const timestamp = parsed.data.timestamp;
        return [
          {
            type: parsed.data.type ?? null,
            status: parsed.data.status ?? null,
            source: parsed.data.source ?? null,
            at:
              typeof timestamp === 'number'
                ? new Date(timestamp).toISOString()
                : null,
          },
        ];
      })
      .sort((left, right) => (right.at ?? '').localeCompare(left.at ?? '')),
  };
}
