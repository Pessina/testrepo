import { CompilerConfig } from '@ton/blueprint';
import { join } from 'path';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: [join(__dirname, '../../nominators.fc')],
};
