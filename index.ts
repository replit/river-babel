import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  type Test,
  serializeExpectedOutputEntry,
  type Action,
  type InvokeActions,
} from "./src/actions";
import { buildImage, cleanup, setupNetwork, applyAction, setupContainer, type ClientContainer } from "./src/docker";
import KvRpcTests from "./tests/basic/kv";
import EchoTests from "./tests/basic/echo";
import UploadTests from "./tests/basic/upload";
import NetworkTests from "./tests/network";
import DisconnectNotifsTests from "./tests/disconnect_notifs";
import VolumeTests from "./tests/volume";
import InterleavingTests from "./tests/interleaving";
import InstanceMismatchTests from "./tests/instance_mismatch";

const { client: clientImpl, server: serverImpl } = yargs(hideBin(process.argv))
  .options({
    client: {
      type: "string",
      demandOption: true,
    },
    server: {
      type: "string",
      demandOption: true,
    }
  })
  .parseSync();

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

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(1);
});

function constructDiffString(expected: string, actual: string): [string, boolean] {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const maxLength = Math.max(expectedLines.length, actualLines.length);

  const maxLineLength = Math.max(
    ...expectedLines.map(line => line.length),
    ...actualLines.map(line => line.length)
  );

  const tabCount = maxLineLength + 4;

  let hasDiff = false;
  const diff: string[] = [`expected${' '.repeat(tabCount - 8)}actual`];

  for (let i = 0; i < maxLength; i++) {
    const expectedLine = expectedLines[i] || '';
    const actualLine = actualLines[i] || '';

    const padding = ' '.repeat(tabCount - expectedLine.length);
    if (expectedLine === actualLine) {
      diff.push(`${expectedLine}${padding}${actualLine}`);
    } else {
      hasDiff = true;
      diff.push(`${chalk.red(expectedLine)}${padding}${chalk.green(actualLine)}`);
    }
  }

  return [diff.join('\n'), hasDiff];
}

async function runSuite(tests: Record<string, Test>, ignore: Test[]): Promise<number> {
  // setup
  await buildImage(clientImpl, "client");
  await buildImage(serverImpl, "server");
  const network = await setupNetwork();

  console.log('\n' + chalk.black.bgYellow(" TESTS "));
  let numTests = 0;
  let testsFailed = [];

  for (const [name, test] of Object.entries(tests)) {
    if (ignore.includes(test)) {
      console.log(chalk.yellow(`[${name}] skipped`));
      continue;
    }

    console.log(chalk.yellow(`[${name}] setup`));
    const serverContainer = await setupContainer(clientImpl, serverImpl, "server");
    let serverActions: Exclude<Action, InvokeActions>[] = [];

    const containers: Record<string, ClientContainer> = {};
    for (const [clientName, testEntry] of Object.entries(
      test
    )) {
      if ('serverActions' in testEntry) {
        serverActions = testEntry.serverActions;
      } else {
        // client case
        const { actions, expectedOutput } = testEntry;
        const container = await setupContainer(clientImpl, serverImpl, "client", clientName);
        containers[clientName] = {
          ...container,
          actions,
          expectedOutput,
        };
      }
    }

    console.log(chalk.yellow(`[${name}] run`));
    await Promise.all([
      (async () => {
        for (const action of serverActions ?? []) {
          await applyAction(network, serverContainer, action);
        }
      })(),
      ...Object.entries(containers).map(async ([_clientName, client]) => {
        for (const action of client.actions) {
          await applyAction(network, client, action);
        }
      }),
    ]);

    // wait a little bit to finish processing
    console.log(chalk.yellow(`[${name}] cleanup`));
    await new Promise((resolve) => setTimeout(resolve, 2000));
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

  return testsFailed.length;
}

// run the test suite with specific ignore lists
const ignoreLists: Record<string, Test[]> = {
  python: [EchoTests.RepeatEchoPrefixTest]
}

const numFailed = await runSuite({
  ...KvRpcTests,
  ...EchoTests,
  ...UploadTests,
  ...InterleavingTests,
  ...NetworkTests,
  ...DisconnectNotifsTests,
  ...VolumeTests,
  ...InstanceMismatchTests,
}, [...(ignoreLists[clientImpl] ?? []), ...(ignoreLists[serverImpl] ?? [])])

await cleanup();

process.exit(numFailed)
