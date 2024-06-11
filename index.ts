import { randomBytes } from "crypto";
import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  type Test,
  serializeExpectedOutputEntry,
  type Action,
  type InvokeActions,
} from "./src/actions";
import {
  buildImage,
  cleanup,
  setupNetwork,
  applyAction,
  setupContainer,
  type ClientContainer,
} from "./src/docker";
import KvRpcTests from "./tests/basic/kv";
import EchoTests from "./tests/basic/echo";
import UploadTests from "./tests/basic/upload";
import NetworkTests from "./tests/network";
import DisconnectNotifsTests from "./tests/disconnect_notifs";
import VolumeTests from "./tests/volume";
import InterleavingTests from "./tests/interleaving";
import InstanceMismatchTests from "./tests/instance_mismatch";
import type { Network } from "dockerode";
import { PromisePool } from "@supercharge/promise-pool";

const {
  client: clientImpl,
  server: serverImpl,
  name: nameFilter,
  parallel,
} = yargs(hideBin(process.argv))
  .options({
    client: {
      type: "string",
      demandOption: true,
    },
    server: {
      type: "string",
      demandOption: true,
    },
    name: {
      type: "string",
      description: "only run tests that contain the specified string",
    },
    parallel: {
      type: "number",
      default: 16,
      description: "number of tests to run in parallel",
    },
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

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(1);
});

function constructDiffString(
  expected: string,
  actual: string,
): [string, boolean] {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const maxLength = Math.max(expectedLines.length, actualLines.length);

  const maxLineLength = Math.max(
    ...expectedLines.map((line) => line.length),
    ...actualLines.map((line) => line.length),
  );

  const tabCount = maxLineLength + 4;

  let hasDiff = false;
  const diff: string[] = [`expected${" ".repeat(tabCount - 8)}actual`];

  for (let i = 0; i < maxLength; i++) {
    const expectedLine = expectedLines[i] || "";
    const actualLine = actualLines[i] || "";

    const padding = " ".repeat(tabCount - expectedLine.length);
    if (expectedLine === actualLine) {
      diff.push(`${expectedLine}${padding}${actualLine}`);
    } else {
      hasDiff = true;
      diff.push(
        `${chalk.red(expectedLine)}${padding}${chalk.green(actualLine)}`,
      );
    }
  }

  return [diff.join("\n"), hasDiff];
}

async function runSuite(
  tests: Record<string, Test>,
  ignore: Test[],
): Promise<number> {
  // setup
  await buildImage(clientImpl, "client");
  await buildImage(serverImpl, "server");
  const network = await setupNetwork();

  console.log("\n" + chalk.black.bgYellow(" TESTS "));
  let numTests = 0;
  let testsFailed: Array<string> = [];
  let testsFlaked: Array<string> = [];

  await PromisePool.withConcurrency(parallel)
    .for(Object.entries(tests))
    .process(async ([name, test]) => {
      if (nameFilter && !name.includes(nameFilter)) {
        return;
      }

      if (ignore.includes(test)) {
        console.log(chalk.yellow(`[${name}] skipped`));
        return;
      }

      try {
        const result = await runTest(name, test, network);
        printTestResults(name, test, result);

        if (!result.ok) {
          if (test.flaky) {
            testsFlaked.push(name);
          } else {
            testsFailed.push(name);
          }
        }

        numTests++;
      } catch (e) {
        testsFailed.push(name);
      }
    });

  testsFailed.sort();
  console.log(chalk.black.bgYellow(" SUMMARY "));
  console.log(
    chalk.green(
      `passed ${numTests - (testsFailed.length + testsFlaked.length)}/${numTests}`,
    ),
  );
  if (testsFlaked.length) {
    console.log(chalk.magenta(`flaked:`));
    testsFlaked.forEach((name) => console.log(chalk.red(`- ${name}`)));
  }
  if (testsFailed.length) {
    console.log(chalk.red(`failed:`));
    testsFailed.forEach((name) => console.log(chalk.red(`- ${name}`)));
  }

  return testsFailed.length;
}

interface TestResult {
  ok: boolean;
  serverLogs: string;
  clientResults: Record<string, ClientResult>;
}

type ClientResult = { ok: true } | { ok: false; diff: string; logs: string };

async function runTest(
  name: string,
  test: Test,
  network: Network,
): Promise<TestResult> {
  console.log(chalk.yellow(`[${name}] setup`));
  const testId = randomBytes(8).toString("hex");
  const serverContainer = await setupContainer(
    testId,
    clientImpl,
    serverImpl,
    "server",
  );

  const containers: Record<string, ClientContainer> = {};
  for (const [clientName, testEntry] of Object.entries(test.clients)) {
    // client case
    const { actions, expectedOutput } = testEntry;
    const container = await setupContainer(
      testId,
      clientImpl,
      serverImpl,
      "client",
      clientName,
    );
    containers[clientName] = {
      ...container,
      actions,
      expectedOutput,
    };
  }

  console.log(chalk.yellow(`[${name}] run`));
  await Promise.all([
    (async () => {
      for (const action of test.server?.serverActions ?? []) {
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
  await Promise.all(
    Object.values(containers).map(async (client) => await client.cleanup()),
  );
  await serverContainer.cleanup();

  // for each client diff actual output with expected output
  let testFailed = false;
  const clientResults: TestResult["clientResults"] = {};
  for (const [clientName, client] of Object.entries(containers)) {
    const expectedOutput = client.expectedOutput
      .map(serializeExpectedOutputEntry)
      .join("\n");
    const actualOutput = await client.stdout;
    const [diff, hasDiff] = constructDiffString(expectedOutput, actualOutput);

    if (hasDiff) {
      testFailed = true;
      clientResults[clientName] = {
        ok: false,
        diff,
        logs: await client.stderr,
      };
    } else {
      clientResults[clientName] = { ok: true };
    }
  }

  return {
    ok: !testFailed,
    serverLogs: await serverContainer.stderr,
    clientResults,
  };
}

function printTestResults(name: string, test: Test, result: TestResult) {
  console.log(chalk.yellow(`[${name}] check`));
  for (const [clientName, clientResult] of Object.entries(
    result.clientResults,
  )) {
    if (clientResult.ok) {
      console.log(
        chalk.green(`[${name}] ${clientName} `) + chalk.black.bgGreen(` PASS `),
      );
    } else {
      if (test.flaky) {
        console.log(
          chalk.red(`[${name}] ${clientName} `) +
            chalk.black.bgMagenta(` FLAKE `),
        );
      } else {
        console.log(
          chalk.red(`[${name}] ${clientName} `) + chalk.black.bgRed(` FAIL `),
        );
      }
      console.log(clientResult.diff + "\n");

      console.log(chalk.yellow(`[${name}] ${clientName} logs`));
      console.log(clientResult.logs);
    }
  }

  if (!result.ok) {
    console.log(chalk.yellow(`[${name}] server logs`));
    console.log(result.serverLogs);
  }
}

// run the test suite with specific ignore lists
const ignoreLists: Record<string, Test[]> = {
  python: [EchoTests.RepeatEchoPrefixTest],
};

const numFailed = await runSuite(
  {
    ...KvRpcTests,
    ...EchoTests,
    ...UploadTests,
    ...InterleavingTests,
    ...NetworkTests,
    ...DisconnectNotifsTests,
    ...VolumeTests,
    ...InstanceMismatchTests,
  },
  [...(ignoreLists[clientImpl] ?? []), ...(ignoreLists[serverImpl] ?? [])],
);

await cleanup();

process.exit(numFailed);
