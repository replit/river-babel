import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  type Test,
  serializeExpectedOutputEntry,
} from "./src/actions";
import { diffLines } from "diff";
import { KvRpcTest } from "./tests/kv_rpc";
import { KvSubscribeErrorTest, KvSubscribeMultipleTest, KvSubscribeTest } from "./tests/kv_subscribe";
import { buildImage, cleanup, setupNetwork, type ContainerHandle, applyAction, setupContainer, type ClientContainer } from "./src/docker";
import { RepeatEchoPrefixTest, RepeatEchoTest } from "./tests/repeat_stream";
import { UploadSendTest } from "./tests/send_upload";

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
  // setup
  await buildImage(clientImpl, "client");
  await buildImage(serverImpl, "server");
  const network = await setupNetwork();

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
        await applyAction(network, client, action);
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
  // 'kv subscribe error': KvSubscribeErrorTest,
  // 'kv subscribe multiple clients': KvSubscribeMultipleTest,
  // 'echo stream': RepeatEchoTest,
  // 'echo stream with prefix': RepeatEchoPrefixTest,
  'upload': UploadSendTest,
})

await cleanup();