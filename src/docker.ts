import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import split2 from 'split2';
import { pushable, type Pushable } from 'it-pushable';
import { exec } from 'child_process';
import Docker, { type Container } from 'dockerode';
import DockerModem from 'docker-modem';
import logUpdate from 'log-update';
import { PassThrough } from 'stream';
import {
  serializeInvokeAction,
  type CommonAction,
  type ClientAction,
  type ServerAction,
  type ExpectedOutputEntry,
} from './actions';
import {
  HEARTBEATS_UNTIL_DEAD,
  HEARTBEAT_MS,
  SESSION_DISCONNECT_GRACE,
} from '../tests/constants';

const docker = new Docker();
const modem = new DockerModem();

export interface ContainerHandle {
  name: string;
  container: Container;
  cleanup: () => Promise<unknown>;
  syncBarriers: Record<string, () => Promise<unknown>>;
  responses: Pushable<{ id: string; status: 'ok' | 'err'; payload: string }>;
  stdin: NodeJS.WritableStream;
  stdout: Promise<string>;
  stderr: Promise<string>;
}

export type ClientContainer = {
  actions: ClientAction[];
  expectedOutput: ExpectedOutputEntry[];
} & ContainerHandle;

// cleanup in reverse order in case of error
const cleanupFns: (() => Promise<void> | void)[] = [];
export async function cleanup() {
  try {
    for (const fn of cleanupFns.reverse()) {
      await fn();
    }
  } catch (err) {
    console.error(chalk.red('cleanup: crash while cleaning up'));
    console.error(err);
    process.exit(1);
  }
}

// build client and server images
export async function buildImage(impl: string, type: 'client' | 'server') {
  const ctxPath = path.join('.', 'impls', impl);
  const name = `${type}.dockerfile`;
  const dockerfilePath = path.join(ctxPath, name);

  const prebuild = path.join(ctxPath, 'preTest.sh');
  if (fs.existsSync(prebuild)) {
    console.log(chalk.blue(`running prebuild script for ${type} image`));
    await new Promise<void>((resolve, reject) => {
      exec(`bash ${prebuild}`, (err, stdout, stderr) => {
        if (err) {
          console.error(stderr);
          reject();
        } else {
          console.log(stdout);
          resolve();
        }
      });
    });
  }

  console.log(chalk.blue(`building ${type} image from ${dockerfilePath}`));
  const resp = await docker.buildImage(
    {
      context: ctxPath,
      src: ['.'],
    },
    { t: `river-babel-${impl}-${type}`, dockerfile: name },
  );

  let status = '';
  await new Promise((resolve, reject) => {
    modem.followProgress(
      resp,
      (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        for (const entry of res) {
          if ('error' in entry) {
            reject(entry.errorDetail.message);
            return;
          }
        }
        resolve(res);
      },
      (progress) => {
        if ('stream' in progress) {
          process.stdout.write(progress.stream);
        } else if ('status' in progress) {
          if (status !== progress.status && status) {
            console.log(progress.status);
          }

          if ('progress' in progress) {
            logUpdate(progress.progress);
          }

          status = progress.status;
        }
      },
    );
  });

  logUpdate.done();
  console.log(chalk.green(`${type} image built\n`));
}

// create networks
const NETWORK_NAME = 'river-babel';
export async function setupNetwork() {
  const networks = await docker.listNetworks({
    filters: { name: [NETWORK_NAME] },
  });
  let networkInfo = networks.find((n) => n.Name === NETWORK_NAME);
  let network = networkInfo ? docker.getNetwork(networkInfo?.Id) : undefined;
  if (!network) {
    console.log(chalk.blue('creating docker network'));
    network = await docker.createNetwork({
      Name: NETWORK_NAME,
      Attachable: true,
    });
    cleanupFns.push(async () => {
      console.log(chalk.blue('cleanup: removing docker network'));
      await docker.getNetwork(NETWORK_NAME).remove();
    });
  }

  console.log(chalk.green('network ok'));
  return network;
}

async function containerStreams(container: Container) {
  const serverStream = await container.attach({
    hijack: true,
    stream: true,
    stdin: true,
    stdout: true,
    stderr: true,
  });

  const logStream = new PassThrough();
  const outputStream = new PassThrough();
  modem.demuxStream(serverStream, outputStream, logStream);
  return [serverStream, outputStream, logStream] as const;
}

function stdoutStreamToString(
  stream: PassThrough,
  responses: Pushable<{ id: string; status: 'ok' | 'err'; payload: string }>,
): Promise<string> {
  const lineStream = stream.pipe(split2());
  const lines: string[] = [];
  return new Promise((resolve, reject) => {
    lineStream.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8');
      const match = line.match(/(?<id>\w+) -- (?<status>[^:]+):(?<payload>.+)/);
      if (match && match.groups) {
        responses.push({
          id: match.groups.id,
          status: match.groups.status as 'ok' | 'err',
          payload: match.groups.payload.trim(),
        });
      }
      lines.push(line);
    });
    lineStream.on('error', (err) => reject(err));
    lineStream.on('end', () => resolve(lines.join('\n')));
  });
}

function stderrStreamToString(stream: NodeJS.WritableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

export async function setupContainer(
  testId: string,
  clientImpl: string,
  serverImpl: string,
  type: 'client' | 'server',
  nameOverride?: string,
): Promise<ContainerHandle> {
  const impl = type === 'client' ? clientImpl : serverImpl;
  const imageName = `river-babel-${impl}-${type}`;
  const containerName = nameOverride
    ? `river-${nameOverride}-${testId}`
    : `river-${type}-${testId}`;
  const getContainerId = async () => {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });
    return containers.find((c) => c.Image === imageName)?.Id;
  };

  let container: Docker.Container;
  let containerId = await getContainerId();
  if (containerId) {
    console.log(chalk.yellow(`cleaning up old ${type} container`));
    const oldContainer = docker.getContainer(containerId);
    await oldContainer.remove({ force: true });
  }

  console.log(chalk.blue(`creating ${type} container`));
  container = await docker.createContainer({
    Image: imageName,
    name: containerName,
    ExposedPorts: {
      '8080/tcp': {},
    },
    HostConfig: {
      NetworkMode: NETWORK_NAME,
      AutoRemove: false,
    },
    AttachStdin: true,
    AttachStderr: true,
    AttachStdout: true,
    OpenStdin: true,
    Env: [
      'PORT=8080',
      `RIVER_SERVER=river-server-${testId}`,
      nameOverride
        ? `CLIENT_TRANSPORT_ID=${impl}-${nameOverride}-${testId}`
        : `CLIENT_TRANSPORT_ID=${impl}-${type}-${testId}`,
      `SERVER_TRANSPORT_ID=${serverImpl}-server`,
      `HEARTBEAT_MS=${HEARTBEAT_MS}`,
      `HEARTBEATS_UNTIL_DEAD=${HEARTBEATS_UNTIL_DEAD}`,
      `SESSION_DISCONNECT_GRACE_MS=${SESSION_DISCONNECT_GRACE}`,
    ],
  });
  containerId = container.id;

  container ??= docker.getContainer(containerId);
  await container.start();
  const [stdin, stdout, stderr] = await containerStreams(container);

  const removeContainerIfExists = async () => {
    stdout.end();
    stderr.end();
    console.log(chalk.blue(`cleanup: removing ${type} container`));
    try {
      const c = docker.getContainer(containerId);
      try {
        await c.stop({ t: 5 });
      } catch (err: any) {
        // If the container is already stopped, let it be.
        if ('statusCode' in err && err.statusCode === 304) return;
        throw err;
      }
      try {
        await c.remove({ force: true });
      } catch (err: any) {
        // If the removal is already in progress, let it be.
        if ('statusCode' in err && err.statusCode === 409) return;
        throw err;
      }
    } catch (err: any) {
      // If the container was not found, let it be.
      if ('statusCode' in err && err.statusCode === 404) return;
      throw err;
    }
  };

  cleanupFns.push(removeContainerIfExists);

  // warm up the container. wait 10s until we get at least one good result back.
  if (type === 'server') {
    healthCheck(container);
  }
  const responses: Pushable<{
    id: string;
    status: 'ok' | 'err';
    payload: string;
  }> = pushable({ objectMode: true });
  return {
    name: containerName,
    container,
    responses,
    stdin,
    stdout: stdoutStreamToString(stdout, responses),
    stderr: stderrStreamToString(stderr),
    cleanup: async () => {
      await removeContainerIfExists();
      responses.end();
    },
    syncBarriers: {},
  };
}

async function healthCheck(container: Container) {
  const { NetworkSettings: networkSettings } = await container.inspect();
  const address = `http://${networkSettings.Networks[NETWORK_NAME].IPAddress}:8080/healthz`;
  for (let remaining = 100; remaining >= 0; remaining--) {
    try {
      // We just need for the fetch to give us something that looks like HTTP back.
      await fetch(address, { headers: { Connection: 'close' } });
      break;
    } catch (err) {
      if (remaining === 0) {
        // Last chance, give up.
        throw err;
      }
    }
    await new Promise((accept) => setTimeout(accept, 100));
  }
}

export async function applyActionClient(
  network: Docker.Network,
  containerHandle: ContainerHandle,
  action: ClientAction,
) {
  if (action.type === 'wait_response') {
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
    const timeoutPromise: Promise<{
      done: boolean;
      value?: { id: string; status: 'ok' | 'err'; payload: string };
    }> = new Promise((accept) => {
      const timeoutMs = action.timeout ?? 5000;
      timeoutId = setTimeout(() => {
        console.error(
          chalk.red(
            `wait_response: timeout waiting for ${action.id} after ${timeoutMs}ms`,
          ),
        );
        accept({ done: true, value: undefined });
      }, timeoutMs);
    });
    while (true) {
      const responsePromise = containerHandle.responses.next();
      const { done, value: response } = await Promise.race([
        responsePromise,
        timeoutPromise,
      ]);

      if (done) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        console.error(chalk.red(`wait_response: never saw id ${action.id}`));
        return;
      } else if (
        response &&
        response.id === action.id &&
        (action.status === undefined || response.status == action.status) &&
        (action.payload === undefined || response.payload == action.payload)
      ) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        return;
      }
    }
  } else if (action.type === 'invoke') {
    containerHandle.stdin.write(serializeInvokeAction(action) + '\n');
    return;
  }

  await applyActionCommon(network, containerHandle, action);
}

export async function applyActionServer(
  network: Docker.Network,
  containerHandle: ContainerHandle,
  action: ServerAction,
) {
  await applyActionCommon(network, containerHandle, action);
  if (action.type == 'restart_container') {
    healthCheck(containerHandle.container);
  }
}

async function applyActionCommon(
  network: Docker.Network,
  containerHandle: ContainerHandle,
  action: CommonAction,
) {
  if (action.type === 'sync') {
    if (!(action.label in containerHandle.syncBarriers)) {
      throw new Error(`sync barrier ${action.label} not found`);
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
    const timeoutPromise: Promise<true> = new Promise((resolve) => {
      const timeoutMs = action.timeout ?? 5000;
      timeoutId = setTimeout(() => {
        console.error(
          chalk.red(
            `sync: timeout waiting for ${action.label} after ${timeoutMs}ms`,
          ),
        );
        resolve(true);
      }, timeoutMs);
    });
    const timedOut = await Promise.race([
      containerHandle.syncBarriers[action.label](),
      timeoutPromise,
    ]);
    if (timedOut !== true && timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  } else if (action.type === 'sleep') {
    await new Promise((resolve) => setTimeout(resolve, action.ms));
  } else if (action.type === 'restart_container') {
    await containerHandle.container.stop({ t: 0 });
    await containerHandle.container.start();

    const [stdin, stdout, stderr] = await containerStreams(
      containerHandle.container,
    );
    containerHandle.stdin = stdin;
    containerHandle.stdout = Promise.all([
      containerHandle.stdout,
      stdoutStreamToString(stdout, containerHandle.responses),
    ]).then((outs) => outs.join(''));
    containerHandle.stderr = Promise.all([
      containerHandle.stderr,
      Promise.resolve('=== container restart ===\n'),
      stderrStreamToString(stderr),
    ]).then((outs) => outs.join(''));

    const oldCleanup = containerHandle.cleanup;
    const newCleanup = async () => {
      stdout.end();
      stderr.end();
      await oldCleanup();
    };

    containerHandle.cleanup = newCleanup;
  } else if (action.type === 'connect_network') {
    await network.connect({ Container: containerHandle.container.id });
  } else if (action.type === 'disconnect_network') {
    await network.disconnect({
      Container: containerHandle.container.id,
      force: true,
    });
  } else if (action.type === 'pause_container') {
    await containerHandle.container.pause();
  } else if (action.type === 'unpause_container') {
    await containerHandle.container.unpause();
  }
}
