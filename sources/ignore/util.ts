import {PortablePath, ppath} from "@yarnpkg/fslib";

export function normalizePattern(pattern: string, {cwd}: { cwd: PortablePath }) {
    const negated = pattern[0] === `!`;

    if (negated)
        pattern = pattern.slice(1);

    if (pattern.match(/\.{0,1}\//))
        pattern = ppath.resolve(cwd, pattern as PortablePath);

    if (negated)
        pattern = `!${pattern}`;

    return pattern;
}

export function addIgnorePattern(target: Array<string>, pattern: string, {cwd}: { cwd: PortablePath }) {
    const trimed = pattern.trim();

    if (trimed === `` || trimed[0] === `#`)
        return;

    target.push(normalizePattern(trimed, {cwd}));
}
