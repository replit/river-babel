import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import split2 from 'split2';
import { pushable, type Pushable } from 'it-pushable';
import { exec } from 'child_process';
import Docker, {
  type Container,
  type Network,
  type NetworkInspectInfo,
} from 'dockerode';
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

const NETWORK_NAME_PREFIX = `river-babel-${Date.now()}`;
export async function getNetwork(testName: string, log: (msg: string) => void) {
  const networkName = `${NETWORK_NAME_PREFIX}-${testName}`;

  const networks = await docker.listNetworks({
    filters: { name: [networkName] },
  });

  const networkInfo = networks.find((n) => n.Name === networkName);
  let network = networkInfo ? docker.getNetwork(networkInfo?.Id) : undefined;

  if (!network) {
    log(chalk.blue(`creating ${testName} network`));

    network = await docker.createNetwork({
      Name: networkName,
      Attachable: true,
    });
  }

  log(chalk.blue(`network ok ${networkName}`));

  let didCleanUp = false;
  const cleanupNetwork = async () => {
    if (didCleanUp) {
      return;
    }

    log(chalk.blue(`cleanup: removing docker network ${networkName}`));

    didCleanUp = true;
    await docker.getNetwork(networkName).remove({ force: true });
  };

  cleanupFns.push(cleanupNetwork);

  return {
    network,
    cleanupNetwork,
  };
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
  name: string,
  network: Docker.Network,
  log: (msg: string) => void,
): Promise<ContainerHandle> {
  const impl = type === 'client' ? clientImpl : serverImpl;
  const imageName = `river-babel-${impl}-${type}`;
  const containerName = `river-${name}-${testId}`;
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
    log(chalk.yellow(`cleaning up old ${type} container`));
    const oldContainer = docker.getContainer(containerId);
    await oldContainer.remove({ force: true });
  }

  log(chalk.blue(`creating ${type} container`));
  container = await docker.createContainer({
    Image: imageName,
    name: containerName,
    ExposedPorts: {
      '8080/tcp': {},
    },
    HostConfig: {
      NetworkMode: network.id,
      AutoRemove: false,
    },
    AttachStdin: true,
    AttachStderr: true,
    AttachStdout: true,
    OpenStdin: true,
    Env: [
      'PORT=8080',
      `RIVER_SERVER=river-server-${testId}`,
      `CLIENT_TRANSPORT_ID=${impl}-${name}-${testId}`,
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
    log(chalk.blue(`cleanup: removing ${type} container`));
    try {
      const c = docker.getContainer(containerId);

      try {
        await c.stop({ t: 5 });
      } catch (err) {
        // If the container is already stopped, let it be.
        if (
          !!err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          err.statusCode === 304
        )
          return;
        throw err;
      }
      try {
        await c.remove({ force: true });
      } catch (err) {
        // If the removal is already in progress, let it be.
        if (
          !!err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          err.statusCode === 409
        )
          return;
        throw err;
      }
    } catch (err) {
      // If the container was not found, let it be.
      if (
        !!err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        err.statusCode === 404
      )
        return;
      throw err;
    }
  };

  cleanupFns.push(removeContainerIfExists);

  // warm up the container. wait 10s until we get at least one good result back.
  if (type === 'server') {
    healthCheck(container, network);
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

async function healthCheck(container: Container, network: Network) {
  for (let remaining = 100; remaining >= 0; remaining--) {
    try {
      const networkInfo: NetworkInspectInfo = await network.inspect();

      if (!networkInfo) {
        throw new Error('Network could not be inspected');
      }

      const networkContainer = networkInfo.Containers?.[container.id];

      if (!networkContainer) {
        throw new Error('Container not found in network');
      }

      const ipAddressWithSubnet = networkContainer.IPv4Address;
      const [ip] = ipAddressWithSubnet.split('/');

      const address = `http://${ip}:8080/healthz`;

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
  log: (msg: string) => void,
) {
  if (action.type === 'wait_response') {
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
    const timeoutPromise = new Promise<{
      done: boolean;
      value?: { id: string; status: 'ok' | 'err'; payload: string };
    }>((accept) => {
      const timeoutMs = action.timeout ?? 5000;
      timeoutId = setTimeout(() => {
        log(
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
        log(chalk.red(`wait_response: never saw id ${action.id}`));
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

  await applyActionCommon(network, containerHandle, action, log);
}

export async function applyActionServer(
  network: Docker.Network,
  containerHandle: ContainerHandle,
  action: ServerAction,
  log: (msg: string) => void,
) {
  await applyActionCommon(network, containerHandle, action, log);
  if (action.type == 'restart_container') {
    healthCheck(containerHandle.container, network);
  }
}

async function applyActionCommon(
  network: Docker.Network,
  containerHandle: ContainerHandle,
  action: CommonAction,
  log: (msg: string) => void,
) {
  if (action.type === 'sync') {
    if (!(action.label in containerHandle.syncBarriers)) {
      throw new Error(`sync barrier ${action.label} not found`);
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
    const timeoutPromise = new Promise<true>((resolve) => {
      const timeoutMs = action.timeout ?? 5000;
      timeoutId = setTimeout(() => {
        log(
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
