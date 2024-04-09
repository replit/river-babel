import chalk from "chalk";
import Docker, { type Container } from "dockerode";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import DockerModem from "docker-modem";
import logUpdate from "log-update";
import fs from "fs";
import { exec } from "child_process";
import {
  type Action,
  type Test,
  type ExpectedOutputEntry,
  serializeInvokeAction,
  serializeExpectedOutputEntry,
} from "./driver";
import { PassThrough } from "stream";
import { diffLines } from "diff";
import { KvRpcTest } from "./tests/kv_rpc";
import { KvSubscribeErrorTest, KvSubscribeMultipleTest, KvSubscribeTest } from "./tests/kv_subscribe";

const { client: clientImpl, server: serverImpl } = yargs(hideBin(process.argv))
  .options({
    client: {
      type: "string",
      demandOption: true,
    },
    server: {
      type: "string",
      demandOption: true,
    },
  })
  .parseSync();

const docker = new Docker();
const modem = new DockerModem();

// cleanup in reverse order in case of error
const cleanupFns: (() => Promise<void> | void)[] = [];
async function cleanup() {
  try {
    for (const fn of cleanupFns.reverse()) {
      await fn();
    }
  } catch (err) {
    console.error(chalk.red("cleanup: crash while cleaning up"));
    console.error(err);
    process.exit(1);
  }
}

process
  .on("unhandledRejection", async (reason) => {
    console.error(chalk.red("uh oh, uncaught promise rejection"));
    console.error(reason);
    await cleanup();
    process.exit(1);
  })
  .on("uncaughtException", async (err) => {
    console.error(chalk.red("uh oh, something went wrong!"));
    console.error(err);
    await cleanup();
    process.exit(1);
  });

// build client and server images
async function buildImage(impl: string, type: "client" | "server") {
  const ctxPath = path.join(".", "impls", impl);
  const name = `${type}.dockerfile`;
  const dockerfilePath = path.join(ctxPath, name);

  const prebuild = path.join(ctxPath, "preTest.sh");
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
      src: ["."],
    },
    { t: `river-babel-${impl}-${type}`, dockerfile: name }
  );

  let status = "";
  await new Promise((resolve, reject) => {
    modem.followProgress(
      resp,
      (err, res) => (err ? reject(err) : resolve(res)),
      (progress) => {
        if ("stream" in progress) {
          process.stdout.write(progress.stream);
        } else if ("status" in progress) {
          if (status !== progress.status && status) {
            console.log(progress.status);
          }

          if ("progress" in progress) {
            logUpdate(progress.progress);
          }

          status = progress.status;
        }
      }
    );
  });

  logUpdate.done();
  console.log(chalk.green(`${type} image built\n`));
}

await buildImage(clientImpl, "client");
await buildImage(serverImpl, "server");

// create networks
const NETWORK_NAME = "river-babel";
async function setupNetwork() {
  const networks = await docker.listNetworks({
    filters: { name: [NETWORK_NAME] },
  });
  let networkInfo = networks.find((n) => n.Name === NETWORK_NAME);
  let network = networkInfo ? docker.getNetwork(networkInfo?.Id) : undefined;
  if (!network) {
    console.log(chalk.blue("creating docker network"));
    network = await docker.createNetwork({ Name: NETWORK_NAME, Attachable: true });
    cleanupFns.push(async () => {
      console.log(chalk.blue("cleanup: removing docker network"));
      await docker.getNetwork(NETWORK_NAME).remove();
    });
  }

  return network;
}

const network = await setupNetwork();
console.log(chalk.green("network ok"));

function streamToString(stream: NodeJS.WritableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
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

interface ContainerHandle {
  container: Container;
  cleanup: () => Promise<unknown>;
  stdin: NodeJS.WritableStream;
  stdout: Promise<string>;
  stderr: Promise<string>;
}

async function setupContainer(
  impl: string,
  type: "client" | "server",
  suffix?: string
): Promise<ContainerHandle> {
  const imageName = `river-babel-${impl}-${type}`;
  const containerName = suffix ? `river-${type}-${suffix}` : `river-${type}`;
  const getContainerId = async () => {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });
    return containers.find((c) => c.Image === imageName)?.Id;
  }

  let container: Docker.Container;
  let containerId = await getContainerId();
  if (!containerId) {
    console.log(chalk.blue(`creating ${type} container`));
    container = await docker.createContainer({
      Image: imageName,
      name: containerName,
      ExposedPorts: {
        "8080/tcp": {},
      },
      HostConfig: {
        NetworkMode: NETWORK_NAME,
        AutoRemove: true,
      },
      OpenStdin: true,
      Env: [
        "PORT=8080",
        suffix ? `CLIENT_TRANSPORT_ID=${impl}-${type}-${suffix}` : `CLIENT_TRANSPORT_ID=${impl}-${type}`,
        `SERVER_TRANSPORT_ID=${impl}-server`,
        "HEARTBEAT_MS=1000",
        "HEARTBEATS_TO_DEAD=2",
        "SESSION_DISCONNECT_GRACE_MS=5000",
      ],
    });
    containerId = container.id;
  }

  container ??= docker.getContainer(containerId);
  const [stdin, stdout, stderr] = await containerStreams(container);
  await container.start();

  const removeContainerIfExists = async () => {
    stdout.end();
    stderr.end();
    const id = await getContainerId();
    if (id) {
      console.log(chalk.blue(`cleanup: removing ${type} container`));
      const c = docker.getContainer(id);
      await c.remove({ force: true });
    }
  }

  cleanupFns.push(removeContainerIfExists);

  // warm up the container
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return {
    container,
    stdin,
    stdout: streamToString(stdout),
    stderr: streamToString(stderr),
    cleanup: removeContainerIfExists,
  };
}

type ClientContainer = {
  actions: Action[];
  expectedOutput: ExpectedOutputEntry[];
} & ContainerHandle;

export async function applyAction(
  containerHandle: ClientContainer,
  action: Action
) {
  if (action.type === "invoke") {
    containerHandle.stdin.write(serializeInvokeAction(action) + "\n");
  } else if (action.type === "wait") {
    await new Promise((resolve) => setTimeout(resolve, action.ms));
  } else if (action.type === "kill_container") {
    await containerHandle.container.stop();
  } else if (action.type === "start_container") {
    await containerHandle.container.start();
  } else if (action.type === "connect_network") {
    await network.connect({ Container: containerHandle.container.id });
  } else if (action.type === "disconnect_network") {
    await network.disconnect({ Container: containerHandle.container.id, force: true });
  } else if (action.type === "pause_container") {
    await containerHandle.container.pause();
  } else if (action.type === "unpause_container") {
    await containerHandle.container.unpause();
  }
}

function constructDiffString(expected: string, actual: string): [string, boolean] {
  const diff = diffLines(expected.trim(), actual.trim(), { ignoreWhitespace: true });
  let hasDiff = false;
  return [diff.reduce((acc, part) => {
    if (part.added || part.removed) {
      hasDiff = true;
    }

    return (
      acc +
      (part.added
        ? chalk.green(part.value)
        : part.removed
        ? chalk.red(part.value)
        : part.value)
    );
  }, ""), hasDiff];
}

async function runSuite(tests: Record<string, Test>) {
  console.log('\n' + chalk.black.bgYellow(" TESTS "));
  let numTests = 0;
  let testsFailed = [];

  for (const [name, test] of Object.entries(tests)) {
    console.log(chalk.yellow(`[${name}] setup`));
    const serverContainer = await setupContainer(serverImpl, "server");

    const containers: Record<string, ClientContainer> = {};
    for (const [clientName, { actions, expectedOutput }] of Object.entries(
      test
    )) {
      const container = await setupContainer(clientImpl, "client", clientName);
      containers[clientName] = {
        ...container,
        actions,
        expectedOutput,
      };
    }

    console.log(chalk.yellow(`[${name}] run`));
    await Promise.all(Object.values(containers).map(async (client) => {
      for (const action of client.actions) {
        await applyAction(client, action);
      }
    }));

    // wait a little bit to finish processing
    console.log(chalk.yellow(`[${name}] cleanup`));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await Promise.all(Object.values(containers).map(async (client) => await client.cleanup()));
    await serverContainer.cleanup();

    console.log(chalk.yellow(`[${name}] check`));

    // for each client diff actual output with expected output
    let testFailed = false;
    for (const [clientName, client] of Object.entries(containers)) {
      const expectedOutput = client.expectedOutput
        .map(serializeExpectedOutputEntry)
        .join("\n");
      const actualOutput = await client.stdout;
      const [diff, hasDiff] = constructDiffString(expectedOutput, actualOutput);
      
      if (hasDiff) {
        testFailed = true;
        console.log(chalk.red(`[${name}] ${clientName} `) + chalk.black.bgRed(` FAIL `));
        console.log(diff + "\n");
  
        console.log(chalk.yellow(`[${name}] ${clientName} logs`));
        console.log(await client.stderr);
      } else {
        console.log(chalk.green(`[${name}] ${clientName} `) + chalk.black.bgGreen(` PASS `));
      }
    }

    if (testFailed) {
      console.log(chalk.yellow(`[${name}] server logs`));
      console.log(await serverContainer.stderr);
      testsFailed.push(name);
    }

    numTests++;
    console.log('\n')
  }

  console.log(chalk.black.bgYellow(" SUMMARY "));
  console.log(chalk.green(`passed ${numTests - testsFailed.length}/${numTests}`));
  if (testsFailed.length) {
    console.log(chalk.red(`failed:`));
    testsFailed.forEach((name) => console.log(chalk.red(`- ${name}`)));
  }
  
  console.log();
}

// run the test suite
await runSuite({
  'kv rpc': KvRpcTest,
  'kv subscribe': KvSubscribeTest,
  'kv subscribe error': KvSubscribeErrorTest,
  'kv subscribe multiple clients': KvSubscribeMultipleTest,
})

await cleanup();