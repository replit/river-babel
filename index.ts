import { randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { structuredPatch } from "diff";
import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import builder from "junit-report-builder";
import {
  type Test,
  serializeExpectedOutputEntry,
  type ServerAction,
} from "./src/actions";
import {
  buildImage,
  cleanup,
  setupNetwork,
  applyActionClient,
  applyActionServer,
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

const {
  client: clientImpl,
  server: serverImpl,
  name: nameFilter,
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
  unordered: boolean,
): [string, boolean] {
  if (unordered) {
    const actualLines = actual.split("\n");
    actualLines.sort();
    actual = actualLines.join("\n");
    const expectedLines = expected.split("\n");
    expectedLines.sort();
    expected = expectedLines.join("\n");
  }
  const patch = structuredPatch(
    "expected",
    "actual",
    expected.trimEnd() + "\n",
    actual.trimEnd() + "\n",
  );
  if (patch.hunks.length === 0) {
    return ["", false];
  }

  const diff: string[] = ["diff expected actual"];
  for (const hunk of patch.hunks) {
    diff.push("--- expected");
    diff.push("+++ actual");
    diff.push(
      chalk.blue(
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines}`,
      ),
    );
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        diff.push(chalk.green(line));
      } else if (line.startsWith("-")) {
        diff.push(chalk.red(line));
      } else {
        diff.push(line);
      }
    }
  }

  return [diff.join("\n"), true];
}

async function runSuite(
  tests: Record<string, Test>,
  ignore: Test[],
): Promise<number> {
  // setup
  console.log("::group::Setup");
  await buildImage(clientImpl, "client");
  await buildImage(serverImpl, "server");
  const network = await setupNetwork();
  console.log("::endgroup::");

  const suiteStart = new Date();
  const suite = builder
    .testSuite()
    .name(`river-babel (${clientImpl}, ${serverImpl})`);

  console.log("\n" + chalk.black.bgYellow(" TESTS "));
  let numTests = 0;
  let testsFailed = [];
  let testsFlaked = [];

  for (const [name, test] of Object.entries(tests)) {
    if (nameFilter && !name.includes(nameFilter)) {
      suite.testCase().name(name).skipped();
      continue;
    }

    if (ignore.includes(test)) {
      suite.testCase().name(name).skipped();
      console.log(chalk.yellow(`[${name}] skipped`));
      continue;
    }

    const testStart = new Date();
    console.log(chalk.yellow(`[${name}] setup`));
    const testId = randomBytes(8).toString("hex");
    const serverContainer = await setupContainer(
      testId,
      clientImpl,
      serverImpl,
      "server",
    );

    let serverActions: ServerAction[] = test.server?.serverActions ?? [];
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

    // build the map of syncpoints to promises.
    const syncPromises: Record<
      string,
      Record<string, { promise: Promise<void>; resolve: () => void }>
    > = {};
    const processSyncAction = (name: string, label: string) => {
      if (!(label in syncPromises)) {
        syncPromises[label] = {};
      }
      let resolve: () => void;
      const promise = new Promise((_resolve) => {
        resolve = _resolve;
      });
      syncPromises[label][name] = {
        resolve,
        promise,
      };
    };
    for (const action of serverActions) {
      if (action.type !== "sync") continue;
      processSyncAction("server", action.label);
    }
    for (const [clientName, client] of Object.entries(containers)) {
      for (const action of client.actions) {
        if (action.type !== "sync") continue;
        processSyncAction(clientName, action.label);
      }
    }
    // build the barriers out of the sync promises.
    const syncBarriers: Record<string, Promise<void>> = {};
    for (const [label, promises] of Object.entries(syncPromises)) {
      const promiseArray: Array<Promise<void>> = [];
      for (const { promise } of Object.values(promises)) {
        promiseArray.push(promise);
      }
      syncBarriers[label] = Promise.all(promiseArray);
    }
    // install the barriers in all containers.
    for (const action of serverActions) {
      if (action.type !== "sync") continue;
      if (
        !(action.label in syncBarriers) ||
        !(action.label in syncPromises) ||
        !("server" in syncPromises[action.label])
      ) {
        throw new Error(`sync barrier ${action.label} not found`);
      }
      serverContainer.syncBarriers[action.label] = () => {
        syncPromises[action.label]["server"].resolve();
        return syncBarriers[action.label];
      };
    }
    for (const [clientName, client] of Object.entries(containers)) {
      for (const action of client.actions) {
        if (action.type !== "sync") continue;
        if (
          !(action.label in syncBarriers) ||
          !(action.label in syncPromises) ||
          !(clientName in syncPromises[action.label])
        ) {
          throw new Error(`sync barrier ${action.label} not found`);
        }
        client.syncBarriers[action.label] = () => {
          syncPromises[action.label][clientName].resolve();
          return syncBarriers[action.label];
        };
      }
    }

    console.log(chalk.yellow(`[${name}] run`));
    await Promise.all([
      (async () => {
        for (const action of serverActions) {
          await applyActionServer(network, serverContainer, action);
        }
      })(),
      ...Object.entries(containers).map(async ([_clientName, client]) => {
        for (const action of client.actions) {
          await applyActionClient(network, client, action);
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

    console.log(chalk.yellow(`[${name}] check`));

    // for each client diff actual output with expected output
    let testFailed = false;
    const diffs = [];
    for (const [clientName, client] of Object.entries(containers)) {
      const expectedOutput = client.expectedOutput
        .map(serializeExpectedOutputEntry)
        .join("\n");
      const actualOutput = await client.stdout;
      const [diff, hasDiff] = constructDiffString(
        expectedOutput,
        actualOutput,
        test.unordered ?? false,
      );

      if (hasDiff) {
        testFailed = true;
        diffs.push(`[${name}] ${clientName}\n` + diff);
        if (test.flaky) {
          console.log(
            "::group::" +
              chalk.red(`[${name}] ${clientName} `) +
              chalk.black.bgMagenta(` FLAKE `),
          );
        } else {
          console.log(
            "::group::" +
              chalk.red(`[${name}] ${clientName} `) +
              chalk.black.bgRed(` FAIL `),
          );
        }
        console.log(diff + "\n");

        console.log("::group::" + chalk.yellow(`[${name}] ${clientName} logs`));
        console.log(await client.stderr);
        console.log("::endgroup::");
        console.log("::endgroup::");
      } else {
        console.log(
          chalk.green(`[${name}] ${clientName} `) +
            chalk.black.bgGreen(` PASS `),
        );
      }
    }

    if (testFailed) {
      console.log("::group::" + chalk.yellow(`[${name}] server logs`));
      console.log(await serverContainer.stderr);
      console.log("::endgroup::");

      if (test.flaky) {
        // This test is marked as passing, but still add the output.
        suite
          .testCase()
          .name(name)
          .time((new Date().getTime() - suiteStart.getTime()) / 1000)
          .standardError(diffs.join("\n"));
        testsFlaked.push(name);
      } else {
        const testCase = suite
          .testCase()
          .name(name)
          .time((new Date().getTime() - suiteStart.getTime()) / 1000);
        for (const diff of diffs) {
          testCase.failure(diff);
        }
        testsFailed.push(name);
      }
    } else {
      suite
        .testCase()
        .name(name)
        .time((new Date().getTime() - suiteStart.getTime()) / 1000);
    }

    numTests++;
    console.log("\n");
  }

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

  suite.time((new Date().getTime() - suiteStart.getTime()) / 1000);

  await mkdir("tests/results", { recursive: true });
  builder.writeTo(`tests/results/${clientImpl}-${serverImpl}.xml`);

  return testsFailed.length;
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
