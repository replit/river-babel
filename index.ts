import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { structuredPatch } from 'diff';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  type Test,
  serializeExpectedOutputEntry,
  type ServerAction,
} from './src/actions';
import {
  buildImage,
  cleanup,
  applyActionClient,
  applyActionServer,
  setupContainer,
  type ClientContainer,
  getNetwork,
} from './src/docker';
import KvRpcTests from './tests/basic/kv';
import EchoTests from './tests/basic/echo';
import UploadTests from './tests/basic/upload';
import NetworkTests from './tests/network';
import DisconnectNotifsTests from './tests/disconnect_notifs';
import VolumeTests from './tests/volume';
import InterleavingTests from './tests/interleaving';
import InstanceMismatchTests from './tests/instance_mismatch';
import v2BackwardsCompat from './tests/v2_backwards_compat_server';
import { PRESET_TIMER, type ListrTask } from 'listr2';
import { Manager } from '@listr2/manager';
import { constants, open } from 'fs/promises';
import assert from 'assert';

const {
  client: clientImpl,
  server: serverImpl,
  name: nameFilters,
  parallel,
  bail,
} = yargs(hideBin(process.argv))
  .options({
    client: {
      type: 'string',
      demandOption: true,
    },
    server: {
      type: 'string',
      demandOption: true,
    },
    name: {
      type: 'array',
      string: true,
      default: [] as string[],
      description: 'only run tests that contain the specified string',
    },
    parallel: {
      type: 'number',
      default: 16,
      description: 'number of tests to run in parallel',
    },
    bail: {
      type: 'boolean',
      default: false,
      description: 'stop running tests after the first failure',
    },
  })
  .parseSync();

process
  .on('unhandledRejection', async (reason) => {
    console.error(chalk.red('uh oh, uncaught promise rejection'));
    console.error(reason);
    await cleanup();
    process.exit(1);
  })
  .on('uncaughtException', async (err) => {
    console.error(chalk.red('uh oh, something went wrong!'));
    console.error(err);
    await cleanup();
    process.exit(1);
  });

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(1);
});

function constructDiffString(
  expected: string,
  actual: string,
  unordered: boolean,
): [string, boolean] {
  if (unordered) {
    const actualLines = actual.split('\n');
    actualLines.sort();
    actual = actualLines.join('\n');
    const expectedLines = expected.split('\n');
    expectedLines.sort();
    expected = expectedLines.join('\n');
  }
  const patch = structuredPatch(
    'expected',
    'actual',
    expected.trimEnd() + '\n',
    actual.trimEnd() + '\n',
  );
  if (patch.hunks.length === 0) {
    return ['', false];
  }

  const diff: string[] = ['diff'];
  for (const hunk of patch.hunks) {
    diff.push('--- expected');
    diff.push('+++ actual');
    diff.push(
      chalk.blue(
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines}`,
      ),
    );
    for (const line of hunk.lines) {
      if (line.startsWith('+')) {
        diff.push(chalk.green(line));
      } else if (line.startsWith('-')) {
        diff.push(chalk.red(line));
      } else {
        diff.push(line);
      }
    }
  }

  return [diff.join('\n'), true];
}

async function runSuite(
  tests: Record<string, Test>,
  ignore: Test[],
): Promise<number> {
  await buildImage(clientImpl, 'client');
  await buildImage(serverImpl, 'server');

  const suiteStart = new Date();

  console.log('Starting Tests');
  console.log('Client:', clientImpl, 'Server:', serverImpl);
  console.log(chalk.reset());

  const testsFailed = new Set<string>();
  const testsFlaked = new Set<string>();

  const logsDir = `./logs/${clientImpl}-${serverImpl}/${Date.now()}/`;
  await mkdir(logsDir, { recursive: true });

  let numTests = 0;
  const tasks = Object.entries(tests)
    .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
    .map(
      ([name, test]): ListrTask => ({
        title: name,
        rendererOptions: {
          outputBar: Infinity,
          persistentOutput: true,
        },
        skip: () => {
          if (
            (nameFilters.length &&
              !nameFilters.some((filter) => name.includes(filter))) ||
            ignore.includes(test)
          ) {
            return true;
          }

          numTests++;
          return false;
        },
        task: async (_ctx, task) => {
          const log = (msg: string) => {
            if (task.task.isCompleted()) {
              return;
            }

            task.output = msg;
          };

          const { network, cleanupNetwork } = await getNetwork(task.title, log);

          log('status: setup');
          const testId = randomBytes(8).toString('hex');
          const serverContainer = await setupContainer(
            testId,
            clientImpl,
            serverImpl,
            'server',
            'server',
            network,
            log,
          );

          const serverActions: ServerAction[] =
            test.server?.serverActions ?? [];
          const clientContainers: Record<string, ClientContainer> = {};
          for (const [clientName, testEntry] of Object.entries(test.clients)) {
            // client case
            const { actions, expectedOutput } = testEntry;
            const container = await setupContainer(
              testId,
              clientImpl,
              serverImpl,
              'client',
              clientName,
              network,
              log,
            );
            clientContainers[clientName] = {
              ...container,
              actions,
              expectedOutput,
            };
          }

          // build the map of syncpoints to promises.
          const syncPromises: Record<
            string,
            Record<
              string,
              { promise: Promise<unknown>; resolve: () => unknown }
            >
          > = {};
          const processSyncAction = (name: string, label: string) => {
            if (!(label in syncPromises)) {
              syncPromises[label] = {};
            }
            let resolve: (() => void) | undefined = undefined;
            const promise = new Promise<void>((_resolve) => {
              resolve = _resolve;
            });
            assert(
              resolve,
              `We're missing the resolve here! ${name}: ${label}`,
            );
            syncPromises[label][name] = {
              resolve,
              promise,
            };
          };
          for (const action of serverActions) {
            if (action.type !== 'sync') continue;
            processSyncAction('server', action.label);
          }
          for (const [clientName, client] of Object.entries(clientContainers)) {
            for (const action of client.actions) {
              if (action.type !== 'sync') continue;
              processSyncAction(clientName, action.label);
            }
          }
          // build the barriers out of the sync promises.
          const syncBarriers: Record<string, Promise<unknown>> = {};
          for (const [label, promises] of Object.entries(syncPromises)) {
            const promiseArray: Promise<unknown>[] = [];
            for (const { promise } of Object.values(promises)) {
              promiseArray.push(promise);
            }
            syncBarriers[label] = Promise.all(promiseArray);
          }
          // install the barriers in all containers.
          for (const action of serverActions) {
            if (action.type !== 'sync') continue;
            if (
              !(action.label in syncBarriers) ||
              !(action.label in syncPromises) ||
              !('server' in syncPromises[action.label])
            ) {
              throw new Error(`sync barrier ${action.label} not found`);
            }
            serverContainer.syncBarriers[action.label] = () => {
              syncPromises[action.label]['server'].resolve();
              return syncBarriers[action.label];
            };
          }
          for (const [clientName, client] of Object.entries(clientContainers)) {
            for (const action of client.actions) {
              if (action.type !== 'sync') continue;
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

          log('status: run');
          await Promise.all([
            (async () => {
              for (const action of serverActions) {
                await applyActionServer(network, serverContainer, action, log);
              }
            })(),
            ...Object.values(clientContainers).map(async (client) => {
              for (const action of client.actions) {
                await applyActionClient(network, client, action, log);
              }
            }),
          ]);

          // wait a little bit to finish processing
          log('status: cleanup');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await Promise.all(
            Object.values(clientContainers).map(
              async (client) => await client.cleanup(),
            ),
          );
          await serverContainer.cleanup();
          await cleanupNetwork();

          log('status: writing results');

          const stderrLogFilePath = `${logsDir}/${name}.log`;
          const logFileHandle = await open(
            stderrLogFilePath,
            constants.O_APPEND | constants.O_WRONLY | constants.O_CREAT,
          );

          for (const [clientName, client] of Object.entries(clientContainers)) {
            const expectedOutput = client.expectedOutput
              .map(serializeExpectedOutputEntry)
              .join('\n');
            const actualOutput = await client.stdout;
            const [diff, hasDiff] = constructDiffString(
              expectedOutput,
              actualOutput,
              test.unordered ?? false,
            );

            let diffMsg = '';
            if (hasDiff) {
              const failMessage = test.flaky
                ? chalk.black.bgYellow(' FLAKED ')
                : chalk.black.bgRed(' FAIL ');
              diffMsg = `
clientName: ${chalk.red(clientName)} ${failMessage}

diff:

${diff}

end diff for ${clientName}, logs will be written to ${stderrLogFilePath}
                `;

              log(diffMsg);

              if (test.flaky) {
                testsFlaked.add(name);
              } else {
                testsFailed.add(name);
              }
            }

            await logFileHandle.appendFile(
              stripAnsi(`
${hasDiff ? diffMsg : 'SUCCESS'}

clientName: ${clientName} logs:
${await client.stderr}
end logs for ${clientName}

server logs:
${await serverContainer.stderr}
end logs for server
              `),
            );
          }

          await logFileHandle.close();

          if (testsFailed.has(name)) {
            throw new Error('test failed');
          } else if (testsFlaked.has(name)) {
            task.skip('flaked');
          }
        },
      }),
    );

  const taskrunner = new Manager({
    concurrent: parallel,
    rendererOptions: {
      collapseSkips: false,
      collapseErrors: false,
      suffixSkips: true,
      suffixRetries: true,
      indentation: 4,
      clearOutput: false,
      removeEmptyLines: false,
      timer: PRESET_TIMER,
    },
    exitOnError: bail,
  });
  taskrunner.add(tasks);
  await taskrunner.runAll();

  // Sometimes task runner can take a bit to flush the output
  // we log and wait for a second
  console.log('');
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // print summary
  const summary = `${chalk.black.bgYellow(' SUMMARY ')}
  total time: ${(new Date().getTime() - suiteStart.getTime()) / 1000} seconds

  passed ${numTests - (testsFailed.size + testsFlaked.size)}/${numTests}

${chalk.magenta(`flaked:`)}
${Array.from(testsFlaked)
  .map((name) => chalk.magenta(`- ${name}`))
  .join('\n')}

${chalk.red(`failed:`)}
${Array.from(testsFailed)
  .map((name) => chalk.red(`- ${name}\n`))
  .join('\n')}
`;

  await writeFile(`${logsDir}/summary.txt`, stripAnsi(summary));
  console.log(summary);
  console.log('logs written to ', logsDir);

  await mkdir('tests/results', { recursive: true });

  return testsFailed.size;
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
    ...v2BackwardsCompat,
  },
  [...(ignoreLists[clientImpl] ?? []), ...(ignoreLists[serverImpl] ?? [])],
);

await cleanup();

process.exit(numFailed > 0 ? 1 : 0);
