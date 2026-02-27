#!/usr/bin/env node
import { Command } from 'commander';
import { pair } from './commands/pair';
import { start } from './commands/start';
import { status } from './commands/status';

const program = new Command();

program
    .name('openturn-connector')
    .description('OpenTurn Addon Connector for on-premise equipment bridge')
    .version('1.0.0');

program
    .command('pair')
    .description('Pair the connector with OpenTurn SaaS')
    .action(pair);

program
    .command('start')
    .description('Start the connector service')
    .option('-c, --config <path>', 'path to config file')
    .action(start);

program
    .command('status')
    .description('Check connector status')
    .action(status);

program.parse();
